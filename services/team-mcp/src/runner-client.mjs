import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function connectRunner(settings) {
  const client = new Client({ name: 'aimo-local-runner', version: '0.1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(settings.url, {
      requestInit: { headers: { authorization: `Bearer ${settings.key}` } },
      fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }),
    }));
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 20000 });
      const data = r.structuredContent || JSON.parse(r.content.find((v) => v.type === 'text').text);
      if (r.isError) throw Object.assign(new Error(data.error?.code || 'MCP_TOOL_FAILED'), { code: data.error?.code || 'MCP_TOOL_FAILED' });
      return data;
    };
    const identity = await call('whoami', {});
    if (identity.id !== settings.member) throw Object.assign(new Error('RUNNER_IDENTITY_MISMATCH'), { code: 'RUNNER_IDENTITY_MISMATCH' });
    const listed = await client.listTools();
    for (const name of ['runner_claim_task', 'runner_heartbeat', 'runner_finish']) {
      if (!listed.tools.some((t) => t.name === name)) throw Object.assign(new Error('SERVER_UPDATE_REQUIRED'), { code: 'SERVER_UPDATE_REQUIRED' });
    }
    return { call, close: () => client.close() };
  } catch (err) { await client.close(); throw err; }
}
