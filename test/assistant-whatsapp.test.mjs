import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.mjs';
import { replyToAssistant } from '../server/assistant.mjs';

// Exercise the real SDK serialization/stream parser, with zero external API calls.
test('read-only WhatsApp fallback always restricts MCP tools, including default and streamed calls', async (t) => {
  const original = { ...config }; t.after(() => Object.assign(config, original));
  Object.assign(config, { anthropicKey: 'test-key', assistantMcpUrl: 'https://example.com/mcp', assistantMcpToken: 'test-mcp' });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/healthz')) return new Response('ok');
    assert.match(String(url), /api\.anthropic\.com\/v1\/messages/);
    requests.push(JSON.parse(options.body));
    const message = { id: 'msg_test', type: 'message', role: 'assistant', model: config.deepModel, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } };
    const events = [
      { type: 'message_start', message },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Munat: hinta ja toimitus.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } },
      { type: 'message_stop' },
    ];
    return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  });
  const messages = [{ role: 'user', content: 'Munia maanantaiksi' }];
  const wa = await replyToAssistant({ messages, channel: 'whatsapp' });
  assert.equal(wa.text, 'Munat: hinta ja toimitus.');
  assert.equal(requests[0].tools[0].default_config.enabled, false);
  assert.equal(requests[0].tools[0].configs.quote.enabled, true);
  assert.equal(requests[0].tools[0].configs.place_order, undefined);
  assert.match(requests[0].system[0].text, /Et voi tehdä tilauksia/);
  assert.equal(requests[0].mcp_servers[0].authorization_token, 'test-mcp');
  let streamed = '';
  await replyToAssistant({ messages, onText: (text) => { streamed += text; } });
  assert.equal(streamed, wa.text);
  assert.equal(requests[1].tools[0].default_config.enabled, false);
  assert.equal(requests[1].tools[0].configs.place_order, undefined);
  assert.match(requests[1].system[0].text, /Et voi tehdä tilauksia/);
});
