import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpenAIAgent } from '../src/openai-agent.mjs';
const args = { apiKey: 'unit-test-key', model: 'unit-test-model', job: { input: { subject: 'Arvio', body: 'Mitä seuraavaksi?' } }, context: { project: 'aimo-ai' } };
const responseData = (value, status = 'completed') => ({ status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
test('Responses request is bounded, does not store output and preserves streamed Finnish text', async () => {
  const expected = { summary: 'Työ käynnissä', reply: 'Tarkista käyttöoikeus.' };
  const bytes = new TextEncoder().encode(JSON.stringify(responseData(expected)));
  const result = await runOpenAIAgent({ ...args, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.authorization, 'Bearer unit-test-key');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.model, 'unit-test-model');
    assert.ok(body.max_output_tokens <= 2200); assert.equal(body.text.format.strict, true); assert.equal(body.tools, undefined);
    return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  } });
  assert.deepEqual(result, expected);
});
test('errors are redacted, transient HTTP failures are retryable and malformed/refused output is rejected', async () => {
  for (const status of [401, 429, 503]) {
    await assert.rejects(runOpenAIAgent({ ...args, fetchImpl: async () => new Response('SECRET RESPONSE', { status }) }), (e) => e.code === `OPENAI_HTTP_${status}` && e.retryable === (status !== 401) && !e.message.includes('SECRET'));
  }
  for (const data of [responseData({ reply: 'missing summary' }), responseData({ summary: 'x', reply: '' }), responseData({ summary: 'x', reply: 'ok', command: 'run shell' }), responseData({ summary: 'x', reply: 'ok' }, 'incomplete'), { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }]) {
    await assert.rejects(runOpenAIAgent({ ...args, fetchImpl: async () => Response.json(data) }), { code: 'INVALID_AGENT_OUTPUT' });
  }
  await assert.rejects(runOpenAIAgent({ ...args, fetchImpl: async () => { throw new Error('SECRET'); } }), { code: 'OPENAI_NETWORK' });
  await assert.rejects(runOpenAIAgent({ ...args, fetchImpl: async () => new Response('limited', { status: 429, headers: { 'retry-after': '120' } }) }), (e) => e.retryAfterMs === 120000 && e.retryable);
});
