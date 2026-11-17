import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { modelSettings } from '../server/model-settings.mjs';
import { askOllama } from '../server/ollama-agent.mjs';
const settings = modelSettings({ AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_MODEL: 'qwen3:8b' });
const success = (text = '{"qty":30}') => ({ done: true, done_reason: 'stop', message: { content: text }, prompt_eval_count: 12, eval_count: 4, model: 'qwen3:8b' });
const ask = (reply, extra = {}) => askOllama({ settings, model: settings.ollamaModel, system: 'Ostoslista', user: '30 litraa maitoa', maxTokens: 100,
  fetchImpl: async () => Response.json(reply), ...extra });

test('explicit model settings reject bad providers and endpoints without leaking secrets', () => {
  assert.deepEqual(modelSettings({}), { llmProvider: 'anthropic' });
  assert.throws(() => modelSettings({ AIMO_MODEL_PROVIDER: 'other' }), /AIMO_MODEL_PROVIDER/);
  for (const url of ['', 'file:///tmp', 'http://user:private@example.com', 'http://localhost/?key=private']) {
    assert.throws(() => modelSettings({ AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: url }), (err) => !err.message.includes('private'));
  }
  assert.throws(() => modelSettings({ AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: settings.ollamaUrl }), /OLLAMA_MODEL/);
});

test('structured Finnish list, context, auth and token accounting use native Ollama protocol', async () => {
  let request; const schema = { type: 'object', properties: { qty: { type: 'number' } }, required: ['qty'], additionalProperties: false };
  const chunks = [];
  const result = await ask(success(), { schema, turns: ['Aiempi viesti', { type: 'text', text: '20 litraa' }],
    settings: { ...settings, ollamaToken: 'private' }, onToken: (text) => chunks.push(text),
    fetchImpl: async (url, opts) => { request = { url, ...opts, body: JSON.parse(opts.body) }; return Response.json(success()); } });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.headers.authorization, 'Bearer private');
  assert.equal(request.redirect, 'error');
  assert.equal(request.body.think, false); assert.equal(request.body.stream, false);
  assert.deepEqual(request.body.format, schema);
  assert.equal(request.body.options.num_predict, 100);
  assert.match(request.body.messages[1].content, /Aiempi viesti\n\n20 litraa\n\n30 litraa/);
  assert.equal(result.usage.input_tokens, 12);
  assert.deepEqual(chunks, ['{"qty":30}']);
});

test('truncation, invalid JSON, unexpected tools, empty output and image inputs fail', async () => {
  for (const reply of [{ ...success(), done: false }, { ...success(), done_reason: 'length' },
    { ...success(), message: { content: 'ok', tool_calls: [{}] } }, success('')]) await assert.rejects(ask(reply));
  await assert.rejects(ask(success('not JSON'), { schema: { type: 'object' } }), /JSON/);
  await assert.rejects(ask(success(), { user: [{ type: 'image', source: { data: 'fake' } }] }), /vain tekstiä/);
});

test('HTTP errors and timeouts do not expose upstream bodies or credentials', async () => {
  await assert.rejects(ask(success(), { fetchImpl: async () => new Response('private secret', { status: 503 }) }), /^Error: Ollama palautti HTTP 503\.$/);
  await assert.rejects(ask(success(), { fetchImpl: async () => { throw new Error('private secret'); } }), (err) => !err.message.includes('private'));
  await assert.rejects(ask(success(), { timeoutMs: 5, fetchImpl: async (_, opts) => {
    await new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true }));
  } }), /aikakatkaistiin/);
});

test('real askAgent routes to own HTTP server despite paid key, counts results, blocks paid MCP fallback', async () => {
  const requests = []; let fail = false;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    requests.push(JSON.parse(raw));
    res.writeHead(fail ? 503 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(fail ? { error: 'no model' } : success()));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const run = promisify(execFile);
    const code = `
      import assert from 'node:assert/strict';
      import { askAgent, agentEnabled, agentStats, modelFor, warmAgent, chatWithMcp } from './server/aimoAgent.mjs';
      assert.equal(agentEnabled(), true); assert.equal(modelFor(), 'qwen3:8b');
      await warmAgent();
      await assert.rejects(chatWithMcp({}), /Etä-MCP/);
      const r = await askAgent({purpose:'list', system:'Ostoslista', user:'Muuta maito 30 litraan',schema:{type:'object'},maxTokens:100});
      assert.equal(r.json.qty,30); assert.equal(agentStats.calls,1); assert.equal(agentStats.inputTokens,12);
    `;
    const env = { ...process.env, AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      OLLAMA_MODEL: 'qwen3:8b', ANTHROPIC_API_KEY: 'unused-personal-key', FAST_MODEL: 'paid-model' };
    await run(process.execPath, ['--input-type=module', '-e', code], { env, timeout: 10000 });
    assert.equal(requests.length, 1); assert.equal(requests[0].model, 'qwen3:8b');
    fail = true;
    await run(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { askAgent,agentStats } from './server/aimoAgent.mjs';
      await assert.rejects(askAgent({purpose:'list',system:'test',user:'test'}),/HTTP 503/);
      assert.equal(agentStats.failed,1); assert.equal(agentStats.calls,0);
    `], { env, timeout: 10000 });
    assert.equal(requests.length, 2);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('schema-invalid but syntactically valid JSON never reaches the consumer', async () => {
  const schema = { type: 'object', additionalProperties: false, required: ['qty'], properties: { qty: { type: 'number', minimum: 0 } } };
  for (const content of ['null', '[]', '{}', '{"qty":"30"}', '{"qty":-1}', '{"qty":30,"price":0}']) {
    const emitted = [];
    await assert.rejects(ask(success(content), { schema, onToken: (t) => emitted.push(t) }), /skeema/);
    assert.deepEqual(emitted, [], content);
  }
});

test('malformed envelopes, body errors and oversized replies fail without emitting text', async () => {
  for (const body of ['null', '[]', '{', '{"done":true,"done_reason":"stop"}']) {
    await assert.rejects(ask(success(), { fetchImpl: async () => new Response(body) }));
  }
  const emitted = [];
  await assert.rejects(ask(success(), { onToken: (t) => emitted.push(t), fetchImpl: async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)) }), /kokorajan/);
  await assert.rejects(ask(success(), { fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('private upstream error')); } })) }), /katkesi/);
  assert.deepEqual(emitted, []);
});

test('a real redirect never forwards the model request or its bearer credential', async () => {
  let destinationCalls = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/chat') { res.writeHead(307, { location: '/collect' }); res.end(); }
    else { destinationCalls++; res.end('should not arrive'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await assert.rejects(ask(success(), { settings: { ...settings, ollamaUrl: `http://127.0.0.1:${server.address().port}`, ollamaToken: 'private' }, fetchImpl: fetch }), /yhteys/);
    assert.equal(destinationCalls, 0);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
