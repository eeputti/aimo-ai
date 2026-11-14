import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openStore } from '../src/store.mjs';
import { createApp } from '../src/app.mjs';
import { coordinatorConfig, createCoordinator } from '../src/coordinator.mjs';
import { runOpenAIAgent } from '../src/openai-agent.mjs';
async function fixture(t) {
  const store = openStore(':memory:');
  const alice = store.addMember('alice-gpt', 'Alice GPT', ['aimo-ai']);
  const bob = store.addMember('bob-claude', 'Bob Claude', ['aimo-ai']);
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const settings = { host: '127.0.0.1', url: new URL(base), redirectOrigins: ['https://chatgpt.com', 'https://claude.ai'] };
  const { app } = createApp(store, settings); server.on('request', app);
  const clients = [];
  t.after(async () => { for (const client of clients) await client.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); store.close(); });
  async function connect(key) {
    const client = new Client({ name: 'test-agent', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
    clients.push(client); return client;
  }
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });
  return { store, alice, bob, base, connect, post };
}
const data = (r) => { assert.equal(r.isError, undefined, JSON.stringify(r)); return r.structuredContent; };
test('reported SDK activity triggers a bounded OpenAI job and replies through the existing mailbox', async (t) => {
  const f = await fixture(t); let calls = 0;
  const api = http.createServer(async (req, res) => {
    assert.equal(req.url, '/v1/responses'); assert.equal(req.headers.authorization, 'Bearer test-openai-key');
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(JSON.parse(body).input); assert.equal(input.request.subject, 'Review');
    assert.ok(input.projectContext.tasks.some((task) => task.note === 'Rajapinta valmis, testaan.'));
    calls++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Testaus kesken', reply: 'Aja kirjautumistesti ennen luovutusta.' }) }] }] }));
  });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  t.after(async () => { api.closeAllConnections(); await new Promise((resolve) => api.close(resolve)); });
  const coordinator = createCoordinator(f.store, { ...coordinatorConfig({}), mode: 'openai', apiKey: 'test-openai-key', model: 'test-model' }, {
    log() {}, agent: (args) => runOpenAIAgent({ ...args, fetchImpl: (_url, init) => fetch(`http://127.0.0.1:${api.address().port}/v1/responses`, init) }),
  });
  const a = await f.connect(f.alice); const b = await f.connect(f.bob);
  const task = data(await a.callTool({ name: 'claim_task', arguments: { project: 'aimo-ai', title: 'Login', resources: ['public/login.js'] } }));
  data(await a.callTool({ name: 'report_progress', arguments: { project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, note: 'Rajapinta valmis, testaan.' } }));
  const activity = data(await b.callTool({ name: 'get_agent_activity', arguments: { project: 'aimo-ai' } }));
  const alice = activity.agents.find((m) => m.id === 'alice-gpt');
  assert.equal(alice.lastSeen.last_tool, 'report_progress'); assert.ok(alice.lastReport); assert.equal(alice.tasks[0].note, 'Rajapinta valmis, testaan.');
  data(await a.callTool({ name: 'send_message', arguments: { project: 'aimo-ai', recipient: 'team-coordinator', subject: 'Review', body: 'Mitä seuraavaksi?', requestKey: 'coordinator-e2e-1' } }));
  await coordinator.tick(); await coordinator.tick(); assert.equal(calls, 1);
  const inbox = data(await a.callTool({ name: 'read_messages', arguments: { project: 'aimo-ai' } }));
  assert.match(inbox.messages.find((m) => m.sender === 'team-coordinator').body, /Aja kirjautumistesti/);
  assert.equal(data(await a.callTool({ name: 'get_agent_activity', arguments: { project: 'aimo-ai' } })).jobs[0].status, 'succeeded');
  assert.equal(data(await b.callTool({ name: 'get_agent_activity', arguments: { project: 'aimo-ai' } })).jobs.length, 0);
});
test('two real SDK clients discover tools and coordinate via authenticated Streamable HTTP', async (t) => {
  const f = await fixture(t); const a = await f.connect(f.alice); const b = await f.connect(f.bob);
  assert.equal((await a.listTools()).tools.length, 13);
  assert.equal(data(await a.callTool({ name: 'whoami', arguments: {} })).id, 'alice-gpt');
  data(await a.callTool({ name: 'send_message', arguments: { project: 'aimo-ai', recipient: 'bob-claude', subject: 'Checkout API', body: 'Please read commit abcdef123', requestKey: 'http-message-1', sender: 'pretend' } }));
  const inbox = data(await b.callTool({ name: 'read_messages', arguments: { project: 'aimo-ai' } }));
  assert.equal(inbox.messages[0].sender, 'alice-gpt');
  const task = data(await a.callTool({ name: 'claim_task', arguments: { project: 'aimo-ai', title: 'Cart', resources: ['public/cart.js'] } }));
  const conflict = await b.callTool({ name: 'claim_task', arguments: { project: 'aimo-ai', title: 'Same file', resources: ['public/cart.js'] } });
  assert.equal(conflict.isError, true); assert.match(conflict.content[0].text, /FILE_BUSY/);
  data(await a.callTool({ name: 'report_progress', arguments: { project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, status: 'done', note: 'Fixed', commitSha: 'abcdef123' } }));
  assert.equal(data(await b.callTool({ name: 'get_project_state', arguments: { project: 'aimo-ai' } })).tasks[0].commit_sha, 'abcdef123');
  const denied = await b.callTool({ name: 'get_project_state', arguments: { project: 'private' } }); assert.equal(denied.isError, true);
});
test('two SDK clients run the whole cooperation: reserve, report a blocker, hand off, accept and finish', async (t) => {
  const f = await fixture(t); const a = await f.connect(f.alice); const b = await f.connect(f.bob); const p = 'aimo-ai';
  const call = async (c, name, args) => data(await c.callTool({ name, arguments: { project: p, ...args } }));
  const task = await call(a, 'claim_task', { title: 'Ordering wiring', resources: ['server/whatsapp'] });
  // Blocker: the member who can unblock gets it in the inbox, nobody else's reservation changes.
  const blocked = await call(a, 'report_progress', { taskId: task.id, expectedRevision: task.revision, status: 'blocked', note: 'Need the restart window', blockedOn: 'bob-claude' });
  assert.equal(blocked.status, 'blocked'); assert.equal(blocked.resources.length, 1);
  let inbox = await call(b, 'read_messages', {});
  assert.equal(inbox.messages.length, 1); assert.match(inbox.messages[0].subject, /^Este: Ordering wiring/); assert.equal(inbox.messages[0].recipient, 'bob-claude');
  await call(b, 'ack_messages', { through: inbox.nextCursor });
  assert.equal((await call(b, 'get_project_state', {})).tasks[0].status, 'blocked');
  const stillBusy = await b.callTool({ name: 'claim_task', arguments: { project: p, title: 'Overlap', resources: ['server/whatsapp/channel.mjs'] } });
  assert.match(stillBusy.content[0].text, /FILE_BUSY/);
  // Handoff: ownership and the commit move, files are freed, the recipient is told.
  const notMine = await b.callTool({ name: 'handoff_task', arguments: { project: p, taskId: task.id, expectedRevision: blocked.revision, to: 'alice-gpt', note: 'x' } });
  assert.match(notMine.content[0].text, /FORBIDDEN/);
  const handed = await call(a, 'handoff_task', { taskId: task.id, expectedRevision: blocked.revision, to: 'bob-claude', note: 'Wiring done, 20/20 tests. Restart remains.', commitSha: 'abcdef1234' });
  assert.equal(handed.owner, 'bob-claude'); assert.equal(handed.status, 'handed_off'); assert.deepEqual(handed.resources, []);
  inbox = await call(b, 'read_messages', {});
  assert.equal(inbox.messages.length, 1); assert.match(inbox.messages[0].body, /abcdef1234/); assert.match(inbox.messages[0].body, new RegExp(task.id));
  const late = await a.callTool({ name: 'report_progress', arguments: { project: p, taskId: task.id, expectedRevision: handed.revision, note: 'Still mine?' } });
  assert.match(late.content[0].text, /FORBIDDEN/);
  const early = await b.callTool({ name: 'report_progress', arguments: { project: p, taskId: task.id, expectedRevision: handed.revision, status: 'done', note: 'Skip accept' } });
  assert.match(early.content[0].text, /NOT_ACCEPTED/);
  const accepted = await call(b, 'claim_task', { taskId: task.id });
  assert.equal(accepted.status, 'in_progress'); assert.equal(accepted.resources[0].path, 'server/whatsapp'); assert.equal(accepted.commit_sha, 'abcdef1234');
  const done = await call(b, 'report_progress', { taskId: task.id, expectedRevision: accepted.revision, status: 'done', note: 'Restarted and verified', commitSha: '1234567abc' });
  const state = await call(a, 'get_project_state', {});
  assert.equal(state.tasks[0].status, 'done'); assert.equal(state.tasks[0].commit_sha, '1234567abc'); assert.equal(done.resources.length, 0);
  assert.deepEqual(state.events.map((e) => e.type).reverse(), ['task_claimed', 'task_updated', 'task_handed_off', 'task_claimed', 'task_updated']);
});
test('anonymous callers see OAuth discovery, not tools or member data; host and origin are enforced', async (t) => {
  const f = await fixture(t);
  const denied = await fetch(f.base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 401); assert.match(denied.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/);
  const resource = await (await fetch(f.base + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(resource.resource, f.base + '/mcp');
  const metadata = await (await fetch(f.base + '/.well-known/oauth-authorization-server')).json();
  assert.equal(metadata.registration_endpoint, f.base + '/register'); assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal((await fetch(f.base + '/healthz')).status, 200);
  assert.equal((await fetch(f.base + '/healthz', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal(await new Promise((resolve, reject) => { http.get(f.base + '/healthz', { headers: { host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject); }), 403);
  f.store.revokeMember('alice-gpt'); await assert.rejects(f.connect(f.alice));
});
async function oauthFlow(f, { scope = 'team.read team.write' } = {}) {
  const registration = await f.post('/register', { client_name: 'ChatGPT test', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
  assert.equal(registration.status, 201); const client = await registration.json();
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope, state: 'unchanged-state', resource: f.base + '/mcp' });
  const authorize = await fetch(f.base + '/authorize?' + params, { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  const cookie = authorize.headers.get('set-cookie').split(';')[0];
  const consentUrl = authorize.headers.get('location');
  const page = await fetch(f.base + consentUrl, { headers: { cookie } }); assert.equal(page.status, 200);
  const html = await page.text(); assert.match(html, /ChatGPT test/); assert.doesNotMatch(html, new RegExp(f.alice));
  const request = new URL(consentUrl, f.base).searchParams.get('request');
  const body = new URLSearchParams({ request, key: f.alice, decision: 'allow' });
  const result = await fetch(f.base + '/consent', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: f.base }, body, redirect: 'manual' });
  assert.equal(result.status, 302); const redirect = new URL(result.headers.get('location'));
  assert.equal(redirect.origin, 'https://chatgpt.com'); assert.equal(redirect.searchParams.get('state'), 'unchanged-state');
  const code = redirect.searchParams.get('code');
  const exchange = (override = {}) => fetch(f.base + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: f.base + '/mcp', ...override }) });
  return { client, code, exchange, verifier };
}
test('OAuth discovery, PKCE, consent, one-use code, refresh rotation and key revocation work end to end', async (t) => {
  const f = await fixture(t); const flow = await oauthFlow(f);
  assert.equal((await flow.exchange({ code_verifier: 'wrong' })).status, 400);
  const response = await flow.exchange(); assert.equal(response.status, 200); const tokens = await response.json();
  assert.ok(tokens.access_token); assert.ok(tokens.refresh_token);
  assert.equal((await flow.exchange()).status, 400);
  const client = await f.connect(tokens.access_token); assert.equal(data(await client.callTool({ name: 'whoami', arguments: {} })).id, 'alice-gpt');
  const refresh = () => fetch(f.base + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: flow.client.client_id, refresh_token: tokens.refresh_token, resource: f.base + '/mcp' }) });
  const rotated = await refresh(); assert.equal(rotated.status, 200); const next = await rotated.json(); assert.equal((await refresh()).status, 400);
  assert.notEqual(next.refresh_token, tokens.refresh_token);
  f.store.rotateMember('alice-gpt'); await assert.rejects(f.connect(next.access_token)); await assert.rejects(f.connect(tokens.access_token));
});
test('OAuth read-only scope cannot send messages and untrusted redirects are rejected', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post('/register', { redirect_uris: ['https://evil.example/callback'], token_endpoint_auth_method: 'none' })).status, 400);
  const flow = await oauthFlow(f, { scope: 'team.read' }); const tokens = await (await flow.exchange()).json();
  const client = await f.connect(tokens.access_token);
  assert.equal(data(await client.callTool({ name: 'whoami', arguments: {} })).id, 'alice-gpt');
  const result = await client.callTool({ name: 'send_message', arguments: { project: 'aimo-ai', subject: 'No', body: 'No', requestKey: 'not-allowed-1' } });
  assert.equal(result.isError, true); assert.match(result.content[0].text, /INSUFFICIENT_SCOPE/);
});

test('consent needs the browser cookie and origin, and authorization rejects the wrong resource', async (t) => {
  const f = await fixture(t);
  const reg = await (await f.post('/register', { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: '<unsafe>', token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })).json();
  const verifier = crypto.randomBytes(48).toString('base64url');
  const params = new URLSearchParams({ client_id: reg.client_id, redirect_uri: reg.redirect_uris[0], response_type: 'code', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', scope: 'team.read', resource: 'https://other.example/mcp' });
  const badResource = await fetch(f.base + '/authorize?' + params, { redirect: 'manual' });
  assert.equal(badResource.status, 302);
  assert.equal(new URL(badResource.headers.get('location')).searchParams.get('error'), 'invalid_request');
  params.set('resource', f.base + '/mcp');
  const auth = await fetch(f.base + '/authorize?' + params, { redirect: 'manual' });
  const cookie = auth.headers.get('set-cookie').split(';')[0]; const pageUrl = auth.headers.get('location');
  const request = new URL(pageUrl, f.base).searchParams.get('request');
  const page = await (await fetch(f.base + pageUrl, { headers: { cookie } })).text(); assert.match(page, /&lt;unsafe&gt;/); assert.doesNotMatch(page, /<unsafe>/);
  const body = new URLSearchParams({ request, key: f.alice, decision: 'allow' });
  assert.equal((await fetch(f.base + '/consent', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: f.base }, body, redirect: 'manual' })).status, 400);
  assert.equal((await fetch(f.base + '/consent', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: 'https://evil.example' }, body, redirect: 'manual' })).status, 403);
  const deny = new URLSearchParams({ request, decision: 'deny' });
  const denied = await fetch(f.base + '/consent', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: f.base }, body: deny, redirect: 'manual' });
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'), 'access_denied');
  assert.equal((await fetch(f.base + pageUrl, { headers: { cookie } })).status, 400);
});

test('confidential OAuth client can exchange codes with client_secret_post', async (t) => {
  const f = await fixture(t);
  const reg = await (await f.post('/register', { redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })).json();
  assert.ok(reg.client_secret);
  const verifier = crypto.randomBytes(48).toString('base64url');
  const params = new URLSearchParams({ client_id: reg.client_id, redirect_uri: reg.redirect_uris[0], response_type: 'code', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: f.base + '/mcp' });
  const auth = await fetch(f.base + '/authorize?' + params, { redirect: 'manual' });
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const request = new URL(auth.headers.get('location'), f.base).searchParams.get('request');
  const approval = await fetch(f.base + '/consent', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: f.base }, body: new URLSearchParams({ request, key: f.bob, decision: 'allow' }), redirect: 'manual' });
  const code = new URL(approval.headers.get('location')).searchParams.get('code');
  const response = await fetch(f.base + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: reg.client_id, client_secret: reg.client_secret, redirect_uri: reg.redirect_uris[0], code, code_verifier: verifier, resource: f.base + '/mcp' }) });
  assert.equal(response.status, 200); const tokens = await response.json();
  const client = await f.connect(tokens.access_token);
  assert.equal(data(await client.callTool({ name: 'whoami', arguments: {} })).id, 'bob-claude');
});
