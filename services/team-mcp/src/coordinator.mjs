import crypto from 'node:crypto';
import { slug } from './store.mjs';
import { runOpenAIAgent } from './openai-agent.mjs';

export function coordinatorConfig(env = process.env) {
  const mode = env.TEAM_COORDINATOR_MODE || 'observe';
  const project = env.TEAM_COORDINATOR_PROJECT || 'aimo-ai';
  const actor = env.TEAM_COORDINATOR_ID || 'team-coordinator';
  const port = Number(env.TEAM_COORDINATOR_PORT || 4752);
  const maxPerHour = Number(env.TEAM_COORDINATOR_MAX_RUNS_PER_HOUR || 12);
  if (!['observe', 'openai'].includes(mode) || !slug(project) || !slug(actor)) throw new Error('Invalid coordinator mode, project or member id');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(maxPerHour) || maxPerHour < 1 || maxPerHour > 1000) throw new Error('Invalid coordinator port or hourly run limit');
  if (mode === 'openai' && (!env.OPENAI_API_KEY || !env.TEAM_COORDINATOR_MODEL)) throw new Error('OpenAI mode requires OPENAI_API_KEY and TEAM_COORDINATOR_MODEL in the private environment');
  return { mode, project, actor, port, maxPerHour, apiKey: env.OPENAI_API_KEY, model: env.TEAM_COORDINATOR_MODEL };
}

export function createCoordinator(store, settings, { agent = runOpenAIAgent, log = console.log } = {}) {
  const worker = crypto.randomUUID();
  store.tx(() => {
    const existing = store.db.prepare('SELECT id FROM members WHERE id=?').get(settings.actor);
    if (!existing) {
      store.addMember(settings.actor, 'Team coordinator / OpenAI', [settings.project]); // service identity; discard its HTTP key
      store.db.prepare('INSERT INTO coord_services VALUES(?)').run(settings.actor);
    } else if (!store.db.prepare('SELECT member FROM coord_services WHERE member=?').get(settings.actor)) {
      throw new Error('Coordinator id belongs to an existing human member; choose a new service id');
    }
  });
  store.access(settings.actor, settings.project); // never revive or expand an existing identity
  let active = false;
  async function tick(signal) {
    if (active || signal?.aborted) return;
    active = true;
    try {
      const events = store.coordination.ingest(settings);
      for (const e of events) log(JSON.stringify({ event: e.seq, member: e.actor, type: e.type, at: e.created }));
      if (settings.mode !== 'openai' || signal?.aborted) return;
      const job = store.coordination.claim({ ...settings, worker });
      if (!job) return;
      log(`Agent job ${job.id}: running`);
      const revoked = new AbortController();
      const heartbeat = setInterval(() => { try { store.coordination.heartbeat(settings); } catch { revoked.abort(); } }, 2000); heartbeat.unref();
      try {
        const state = store.state(settings.actor, { project: settings.project });
        const context = {
          project: settings.project, board: state.board.summary.slice(0, 4000),
          tasks: state.tasks.slice(0, 40).map((t) => ({ id: t.id, title: t.title, owner: t.owner, status: t.status, note: t.note.slice(0, 800), commit: t.commit_sha, leaseExpired: t.leaseExpired })),
        };
        const timed = AbortSignal.timeout(45000);
        const result = await agent({ apiKey: settings.apiKey, model: settings.model, job, context, signal: AbortSignal.any([...(signal ? [signal] : []), timed, revoked.signal]) });
        store.coordination.complete(job, worker, result);
        log(`Agent job ${job.id}: succeeded`);
      } catch (err) {
        const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(err.code || '') ? err.code : 'AGENT_FAILED';
        try { store.coordination.fail(job, worker, code, Boolean(err.retryable), err.retryAfterMs || 0); }
        catch (failure) { if (failure.code !== 'JOB_LEASE_LOST') throw failure; }
        log(`Agent job ${job.id}: ${code}`);
      } finally { clearInterval(heartbeat); }
    } finally { active = false; }
  }
  return {
    tick,
    async run(signal) {
      while (!signal.aborted) {
        await tick(signal);
        if (signal.aborted) break;
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, 2000); signal.addEventListener('abort', done, { once: true });
          if (signal.aborted) done();
        });
      }
    },
  };
}
