// Riippumattoman tarkistuksen regressiot (aleksi-claude, tehtävä 2e683d3d). Raportti docs/parallel/coordinator-aleksi-claude.md.
// L1/L2 korjattu heräteajurin integraatiossa; molemmat regressiot ovat nyt pakollisia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.mjs';
import { createCoordinator, coordinatorConfig } from '../src/coordinator.mjs';
import { runOpenAIAgent } from '../src/openai-agent.mjs';

const settings = { ...coordinatorConfig({}), apiKey: 'test-only-key', model: 'test-model' };
function fixture(t) {
  let clock = 1800000000000;
  const store = openStore(':memory:', () => clock);
  store.addMember('alice', 'Alice', ['aimo-ai']); store.addMember('bob', 'Bob', ['aimo-ai']);
  createCoordinator(store, settings, { log() {} });
  t.after(() => store.close());
  const message = (sender = 'alice') => store.sendMessage(sender, { project: 'aimo-ai', recipient: settings.actor, subject: 'Pyyntö', body: 'Mitä seuraavaksi?', requestKey: crypto.randomUUID() });
  return { store, message, ingest: () => store.coordination.ingest(settings), claim: (worker = 'one') => store.coordination.claim({ ...settings, worker }), advance: (ms) => { clock += ms; } };
}
const notices = (store, member) => store.readMessages(member, { project: 'aimo-ai' }).messages.filter((m) => m.sender === settings.actor);

// Nykyinen käytös, joka on kunnossa: varmistetaan, ettei korjaus riko sitä.
test('review: coordinator replies never become new jobs and other members cannot read the private reply', async (t) => {
  const f = fixture(t);
  const c = createCoordinator(f.store, { ...settings, mode: 'openai' }, { log() {}, agent: async () => ({ summary: 's', reply: 'YKSITYINEN VASTAUS' }) });
  f.message(); await c.tick(); await c.tick(); await c.tick();
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM coord_jobs').get().n, 1);
  assert.equal(notices(f.store, 'alice').length, 1);
  assert.equal(f.store.readMessages('bob', { project: 'aimo-ai' }).messages.some((m) => /YKSITYINEN/.test(m.body)), false);
  assert.equal(f.store.coordination.snapshot('bob', 'aimo-ai').jobs.length, 0);
});

// L1: Retry-After / uusintaviive ilman ylärajaa. OpenAI:n (tai välityspalvelimen) suuri Retry-After tai kaukainen HTTP-päivä
// siirtää työn due-ajan vuosien päähän. Työ jää tilaan queued, vie jonopaikan eikä pyytäjä saa koskaan vastausta tai virhekuittausta.
test('review L1: an unbounded Retry-After from the API cannot park a job forever without notifying the requester', async (t) => {
  const agentError = await runOpenAIAgent({ apiKey: 'k', model: 'm', job: { input: { subject: 's', body: 'b' } }, context: {},
    fetchImpl: async () => new Response('limited', { status: 429, headers: { 'retry-after': 'Fri, 01 Jan 2100 00:00:00 GMT' } }) }).catch((e) => e);
  assert.ok(agentError.retryable);
  const f = fixture(t); f.message(); f.ingest(); const job = f.claim();
  f.store.coordination.fail(job, 'one', agentError.code, true, agentError.retryAfterMs);
  f.advance(24 * 3600000);
  const handled = f.claim() !== null || notices(f.store, 'alice').length === 1;
  assert.ok(handled, 'vuorokauden jälkeen työtä ei yritetä uudelleen eikä pyytäjälle ole kerrottu mitään');
});

// L2: jonoraja 100 on yhteinen koko projektille eikä pyytäjäkohtainen. Yksi jäsen (tai virheellisesti silmukoiva agentti)
// täyttää jonon, ja tuntirajalla 12 jonon purku kestää noin 8 tuntia; muiden pyynnöt saavat sillä välin QUEUE_FULL.
test('review L2: one requester cannot fill the shared queue and lock out other members', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 100; i++) f.message('alice');
  f.message('bob'); f.ingest();
  const bob = f.store.db.prepare("SELECT status,error_code FROM coord_jobs WHERE requester='bob'").get();
  assert.equal(bob.status, 'queued', `bobin pyyntö sai ${bob.error_code}`);
});
