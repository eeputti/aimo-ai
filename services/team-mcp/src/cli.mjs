// Local mode: agents that share this machine and project folder (Codex, Claude Code) use the same
// coordination store directly, without a running server or a connector. Identity is the --as value:
// anyone with access to the database file is trusted, exactly like the admin CLI. Remote assistants
// still need the authenticated HTTP server.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { openStore, TeamError } from './store.mjs';

const HELP = `Käyttö: npm run team -- <komento> --as <tunniste> [valinnat]

  join     --id <tunniste> --name "Nimi"        luo paikallinen avustajatunniste
  start    --as X                               työn alku: GitHub-tilanne, taulu ja lukemattomat viestit
  sync                                          vain GitHub-tilanne (git fetch, ero etähaaraan, uusin loki)
  status   --as X                               tehtävät, varaukset, esteet ja luovutukset
  inbox    --as X [--ack] [--all]               viestit; --ack kuittaa luetut
  send     --as X [--to Y] --subject S --body B viesti jäsenelle tai koko projektille
  claim    --as X --title T --files a,b [--desc D] [--minutes 30]   varaa työ ja tiedostot
  renew    --as X --task ID --note N [--minutes 30]                 jatka varausta
  block    --as X --task ID --note N [--on Y]   ilmoita este (viesti Y:lle tai kaikille)
  handoff  --as X --task ID --to Y --note N [--commit SHA|HEAD] [--allow-unpushed]
  accept   --as X --task ID [--files a,b]       ota luovutettu tai vanhentunut tehtävä itselle
  done     --as X --task ID --note N [--commit SHA|HEAD] [--allow-unpushed]
  release  --as X --task ID --note N            vapauta varaus kesken jääneestä työstä
  board    --as X --set "yhteenveto"            korvaa projektin yhteenveto

Tehtävän ID:stä riittää alku (vähintään 6 merkkiä). --json tulostaa raakadatan.
Ympäristö: TEAM_AGENT (oletus --as), TEAM_PROJECT (oletus aimo-ai), TEAM_MCP_DB (kannan polku).`;

const FLAGS = new Set(['ack', 'all', 'json', 'allow-unpushed', 'help']);
function parse(argv) {
  const [command, ...rest] = argv; const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (!rest[i].startsWith('--')) throw new TeamError('USAGE', `Tuntematon argumentti: ${rest[i]}`);
    if (FLAGS.has(key)) opts[key] = true;
    else { if (rest[i + 1] === undefined) throw new TeamError('USAGE', `--${key} tarvitsee arvon`); opts[key] = rest[++i]; }
  }
  return { command, opts };
}
const need = (opts, key) => opts[key] ?? (() => { throw new TeamError('USAGE', `Puuttuu --${key}`); })();
const repo = path.dirname(fileURLToPath(import.meta.url));
function git(args, { optional = false } = {}) {
  try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd(); }
  catch (err) { if (optional) return null; throw new TeamError('GIT', `git ${args[0]} epäonnistui: ${String(err.stderr || err.message).trim().split('\n')[0]}`); }
}
// "Done" and "handoff" may cite only a commit that the others can actually fetch.
export function pushedCommit(ref, allowUnpushed, run = git) {
  if (!ref) return {};
  const sha = run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { optional: true });
  if (!sha) throw new TeamError('UNKNOWN_COMMIT', `Commitia ${ref} ei löydy tästä repositoriosta`);
  const remotes = (run(['branch', '-r', '--contains', sha], { optional: true }) || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.includes('->'));
  if (!remotes.length && !allowUnpushed) throw new TeamError('NOT_PUSHED', `Commit ${sha.slice(0, 9)} ei ole yhdessäkään etähaarassa. Pushaa ensin tai käytä --allow-unpushed, jolloin merkintään tulee "EI GITHUBISSA".`);
  return { sha, pushed: remotes.length > 0, remotes };
}
function syncReport() {
  const lines = [];
  const fetched = git(['fetch', '--quiet', 'origin'], { optional: true }) !== null;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { optional: true });
  const upstream = git(['rev-parse', '--abbrev-ref', '@{u}'], { optional: true });
  lines.push(`GitHub: ${fetched ? 'haettu juuri' : 'HAKU EPÄONNISTUI, alla oleva etätieto voi olla vanhaa'}; haara ${branch}${upstream ? ` → ${upstream}` : ' (ei etähaaraa)'}`);
  if (upstream) {
    const [ahead, behind] = git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]).split(/\s+/).map(Number);
    lines.push(behind ? `  JÄLJESSÄ ${behind} commitia: lue ne ennen työtä (puhdas työpuu: git pull --ff-only)` : '  ajan tasalla etähaaran kanssa');
    if (ahead) lines.push(`  ${ahead} paikallista commitia pushaamatta`);
    if (behind) lines.push(...git(['log', '--format=  uusi: %h %an: %s', `HEAD..${upstream}`]).split('\n').slice(0, 10));
  }
  const dirty = (git(['status', '--porcelain'], { optional: true }) || '').split('\n').filter(Boolean);
  if (dirty.length) lines.push(`  commitoimatta ${dirty.length} tiedostoa (voivat olla toisen avustajan): ${dirty.slice(0, 8).map((l) => l.slice(3)).join(', ')}${dirty.length > 8 ? ', …' : ''}`);
  const log = git(['grep', '-m1', '-h', '^## ', upstream || 'HEAD', '--', ':/TYOLOKI.md'], { optional: true });
  if (log) lines.push(`  uusin TYOLOKI.md GitHubissa: ${log.replace(/^## /, '')}`);
  return lines.join('\n');
}
const time = (ms) => new Date(ms).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
const short = (id) => id.slice(0, 8);
function statusReport(state, me) {
  const out = [];
  if (state.board.summary) out.push(`Yhteenveto (rev ${state.board.revision}, ${state.board.actor}):\n${state.board.summary}\n`);
  const open = state.tasks.filter((t) => !['done', 'released'].includes(t.status));
  const row = (t) => `  ${short(t.id)} ${t.owner}: ${t.title}${t.resources.length ? ` [${t.resources.map((r) => r.path).join(', ')}]` : ''}${t.leaseExpired ? ' (VARAUS VANHENTUNUT, saa ottaa: accept)' : t.status === 'handed_off' ? '' : `, varaus ${time(t.lease_until)} asti`}${t.commit_sha ? `, commit ${t.commit_sha.slice(0, 9)}` : ''}${t.note ? `\n           ${t.note.split('\n')[0]}` : ''}`;
  const group = (title, list) => { if (list.length) out.push(title, ...list.map(row)); };
  group('ESTEET:', open.filter((t) => t.status === 'blocked'));
  group(`LUOVUTETTU, odottaa vastaanottoa (accept):`, open.filter((t) => t.status === 'handed_off'));
  group('Työn alla:', open.filter((t) => t.status === 'in_progress'));
  if (!open.length) out.push('Ei avoimia tehtäviä tai varauksia.');
  const closed = state.tasks.filter((t) => t.status === 'done').slice(0, 5);
  if (closed.length) out.push('Viimeksi valmistuneet:', ...closed.map((t) => `  ${short(t.id)} ${t.owner}: ${t.title}${t.commit_sha ? `, commit ${t.commit_sha.slice(0, 9)}` : ', ei commitia'}`));
  out.push(`Jäsenet: ${state.members.map((m) => m.id + (m.id === me ? ' (sinä)' : '')).join(', ')}`);
  return out.join('\n');
}
function inboxReport(page, me) {
  const incoming = page.messages.filter((m) => m.sender !== me);
  if (!incoming.length) return 'Ei uusia viestejä.';
  return incoming.map((m) => `#${m.seq} ${time(m.created)} ${m.sender} → ${m.recipient || 'kaikille'}: ${m.subject}\n${m.body.split('\n').map((l) => '    ' + l).join('\n')}`).join('\n') + (page.hasMore ? '\n(lisää viestejä: aja inbox uudelleen kuittauksen jälkeen)' : '');
}

export function run(argv, env = process.env) {
  const { command, opts } = parse(argv);
  if (!command || opts.help || command === 'help') return HELP;
  if (command === 'sync') return syncReport();
  const project = opts.project || env.TEAM_PROJECT || 'aimo-ai';
  const store = openStore(config(env).db);
  try {
    if (command === 'join') {
      const id = need(opts, 'id');
      store.addMember(id, opts.name || id, [project]); // the HTTP key is discarded; rotate-key issues one when needed
      return `Tunniste ${id} luotu projektiin ${project}. Käytä: --as ${id}`;
    }
    const me = opts.as || env.TEAM_AGENT || (() => { throw new TeamError('USAGE', 'Puuttuu --as <tunniste> (tai TEAM_AGENT)'); })();
    if (!store.member(me)) throw new TeamError('UNKNOWN_MEMBER', `Tunnistetta ${me} ei ole. Luo se: npm run team -- join --id ${me} --name "…"`);
    const json = (data, text) => (opts.json ? JSON.stringify(data, null, 2) : text);
    const task = () => {
      const prefix = need(opts, 'task');
      if (prefix.length < 6) throw new TeamError('USAGE', 'Anna tehtävän ID:stä vähintään 6 merkkiä');
      const found = store.state(me, { project }).tasks.filter((t) => t.id.startsWith(prefix));
      if (found.length !== 1) throw new TeamError('NOT_FOUND', found.length ? 'ID:n alku sopii useaan tehtävään' : `Tehtävää ${prefix} ei löydy`);
      return found[0];
    };
    const files = () => (opts.files ? opts.files.split(',').map((f) => f.trim()).filter(Boolean) : []);
    const minutes = opts.minutes ? Number(opts.minutes) : 30;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new TeamError('USAGE', '--minutes on 1–120');
    const commit = () => { const c = pushedCommit(opts.commit, opts['allow-unpushed']); return { commitSha: c.sha, tag: c.sha && !c.pushed ? '[EI GITHUBISSA] ' : '' }; };
    switch (command) {
      case 'start': { const page = store.readMessages(me, { project }); return [syncReport(), '', `Olet ${me}, projekti ${project}.`, statusReport(store.state(me, { project }), me), '', inboxReport(page, me)].join('\n'); }
      case 'status': { const s = store.state(me, { project }); return json(s, statusReport(s, me)); }
      case 'inbox': {
        const page = store.readMessages(me, { project, after: opts.all ? 0 : undefined });
        if (opts.ack && page.messages.length) store.ack(me, { project, through: page.nextCursor });
        return json(page, inboxReport(page, me) + (opts.ack && page.messages.length ? `\nKuitattu viestiin #${page.nextCursor} asti.` : ''));
      }
      case 'send': { const m = store.sendMessage(me, { project, recipient: opts.to, subject: need(opts, 'subject'), body: need(opts, 'body'), requestKey: opts.key || crypto.randomUUID() }); return json(m, `Viesti #${m.seq} lähetetty: ${opts.to || 'kaikille'}`); }
      case 'claim': { const t = store.claim(me, { project, title: need(opts, 'title'), description: opts.desc || '', resources: files(), leaseMinutes: minutes }); return json(t, `Varattu ${short(t.id)}: ${t.title}${t.resources.length ? ` [${t.resources.map((r) => r.path).join(', ')}]` : ''}, ${time(t.lease_until)} asti. Jatka varausta: renew --task ${short(t.id)}`); }
      case 'accept': { const t = store.claim(me, { project, taskId: task().id, resources: files(), leaseMinutes: minutes }); return json(t, `Tehtävä ${short(t.id)} on nyt sinulla: ${t.title}${t.commit_sha ? `, lähtötilanne commit ${t.commit_sha.slice(0, 9)}` : ''}\n${t.note}`); }
      case 'renew': { const old = task(); const t = store.progress(me, { project, taskId: old.id, expectedRevision: old.revision, note: need(opts, 'note'), leaseMinutes: minutes }); return json(t, `Varaus ${short(t.id)} jatkuu ${time(t.lease_until)} asti.`); }
      case 'block': { const old = task(); const t = store.progress(me, { project, taskId: old.id, expectedRevision: old.revision, status: 'blocked', note: need(opts, 'note'), blockedOn: opts.on, leaseMinutes: minutes }); return json(t, `Este kirjattu tehtävälle ${short(t.id)} ja ilmoitettu: ${opts.on || 'kaikille'}. Varaus säilyy ${time(t.lease_until)} asti; vapauta tiedostot komennolla release, jos et itse jatka.`); }
      case 'handoff': { const old = task(); const c = commit(); const t = store.handoff(me, { project, taskId: old.id, expectedRevision: old.revision, to: need(opts, 'to'), note: c.tag + need(opts, 'note'), commitSha: c.commitSha }); return json(t, `Tehtävä ${short(t.id)} luovutettu: ${t.owner}${c.commitSha ? `, commit ${c.commitSha.slice(0, 9)}` : ', ILMAN commitia'}. Tiedostovaraukset vapautettu ja vastaanottajalle lähti viesti.`); }
      case 'done': { const old = task(); const c = commit(); const t = store.progress(me, { project, taskId: old.id, expectedRevision: old.revision, status: 'done', note: c.tag + need(opts, 'note'), commitSha: c.commitSha }); return json(t, `Tehtävä ${short(t.id)} valmis${c.commitSha ? `, commit ${c.commitSha.slice(0, 9)}` : ', ei commitia'}. Varaukset vapautettu.`); }
      case 'release': { const old = task(); const t = store.progress(me, { project, taskId: old.id, expectedRevision: old.revision, status: 'released', note: need(opts, 'note') }); return json(t, `Tehtävä ${short(t.id)} vapautettu.`); }
      case 'board': { const b = store.updateBoard(me, { project, expectedRevision: store.state(me, { project }).board.revision, summary: need(opts, 'set') }); return json(b, `Yhteenveto päivitetty (rev ${b.revision}).`); }
      default: throw new TeamError('USAGE', `Tuntematon komento: ${command}\n\n${HELP}`);
    }
  } finally { store.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(run(process.argv.slice(2))); }
  catch (err) { console.error(err instanceof TeamError ? `${err.code}: ${err.message}` : err.stack); process.exitCode = 1; }
}
