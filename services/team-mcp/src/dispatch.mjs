import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const paths = z.array(z.string().min(1).max(240)).min(1).max(20);
const assignments = z.array(z.object({ to: id, title: z.string().min(1).max(200), description: z.string().min(1).max(4000), resources: paths }).strict()).max(3);
const bad = () => { throw Object.assign(new Error('INVALID_ASSIGNMENT'), { code: 'INVALID_ASSIGNMENT' }); };
export function dispatchPolicy(env = process.env) {
  const workers = (env.TEAM_COORDINATOR_WORKERS || '').split(',').map((v) => v.trim()).filter(Boolean);
  const senders = (env.TEAM_COORDINATOR_DISPATCH_SENDERS || '').split(',').map((v) => v.trim()).filter(Boolean);
  const roots = (env.TEAM_COORDINATOR_DISPATCH_PATHS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (workers.length > 20 || senders.length > 20 || ![...workers, ...senders].every((v) => id.safeParse(v).success) || roots.some((p) => !validPath(p))) throw new Error('Invalid coordinator dispatch policy');
  return { workers, senders, paths: roots, enabled: Boolean(workers.length && senders.length && roots.length) };
}
export function validPath(value) {
  return typeof value === 'string' && value.length <= 240 && !/[\\:*?\x00-\x1f]/.test(value) && !value.startsWith('/') && value.split('/').every((s) => s && !['.', '..', '.git', '.claude', '.codex'].includes(s) && !s.startsWith('.env'));
}
export function mayDispatch(job, policy) {
  return Boolean(policy?.enabled && policy.senders.includes(job.requester) && job.input.subject.startsWith('[DELEGATE]'));
}
export function dispatchAssignments(store, job, result, policy) {
  if (!result.assignments?.length) return [];
  if (!mayDispatch(job, policy)) bad();
  const parsed = assignments.safeParse(result.assignments); if (!parsed.success) bad();
  const tasks = [];
  const reserved = store.state(job.actor, { project: job.project }).tasks.filter((t) => !['done', 'released'].includes(t.status)).flatMap((t) => t.requestedResources);
  for (const item of parsed.data) {
    if (!policy.workers.includes(item.to) || item.to === job.actor || item.resources.some((p) => !validPath(p) || !policy.paths.some((root) => p === root || p.startsWith(root + '/')))) bad();
    if (item.resources.some((p) => reserved.some((r) => p === r || p.startsWith(r + '/') || r.startsWith(p + '/')))) bad();
    reserved.push(...item.resources);
    store.access(item.to, job.project);
    const task = store.claim(job.actor, { project: job.project, title: item.title, description: item.description, resources: item.resources });
    const handed = store.handoff(job.actor, { project: job.project, taskId: task.id, expectedRevision: task.revision, to: item.to, note: `Koordinaattorin työnjako pyynnöstä ${job.id}. ${item.description}` });
    tasks.push({ id: handed.id, owner: handed.owner, title: handed.title });
  }
  return tasks;
}
