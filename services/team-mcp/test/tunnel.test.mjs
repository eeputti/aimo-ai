import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { runTunnel } from '../src/tunnel.mjs';

async function freePort() {
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
function fakeTunnel() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  child.kill = (signal) => { child.signalCode = signal; child.stdout.end(); child.stderr.end(); child.emit('close', null); return true; };
  return child;
}
test('quick tunnel configures public OAuth discovery, keeps MCP protected and closes its local server', async (t) => {
  const port = await freePort(); const child = fakeTunnel(); const controller = new AbortController();
  let ready; const started = new Promise((resolve) => { ready = resolve; });
  const running = runTunnel({
    env: { TEAM_MCP_PORT: String(port), TEAM_MCP_DB: ':memory:', TEAM_MCP_HOST: '0.0.0.0', TEAM_MCP_PUBLIC_URL: 'https://old.example' },
    signal: controller.signal,
    spawnTunnel: (bin, args, options) => {
      assert.equal(bin, 'cloudflared'); assert.ok(args.includes(`http://127.0.0.1:${port}`));
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      setImmediate(() => {
        child.stderr.write('| https://wrong.trycloudflare.com.attacker.example |\n');
        child.stderr.write('| https://team-test-123.trycloudflare.com |\n');
      }); return child;
    },
    log: (line) => { if (line.startsWith('\nMCP-osoite:')) ready(); },
  });
  t.after(async () => { controller.abort(); await running; });
  await Promise.race([started, running.then(() => assert.fail('Exited before ready'))]);
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(base + '/healthz'); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  const oauth = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
  assert.equal(oauth.issuer, 'https://team-test-123.trycloudflare.com/');
  assert.equal(oauth.token_endpoint, 'https://team-test-123.trycloudflare.com/token');
  const resource = await (await fetch(base + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(resource.resource, 'https://team-test-123.trycloudflare.com/mcp');
  const denied = await fetch(base + '/mcp', { method: 'POST' }); assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /team-test-123\.trycloudflare\.com/);
  controller.abort(); await running; assert.equal(child.signalCode, 'SIGTERM');
  await assert.rejects(fetch(base + '/healthz'));
});
test('an occupied port is rejected before cloudflared can expose another service', async (t) => {
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(runTunnel({ env: { TEAM_MCP_PORT: String(server.address().port), TEAM_MCP_DB: ':memory:' }, spawnTunnel: () => assert.fail('Must not start tunnel'), log() {} }), { code: 'EADDRINUSE' });
});
test('missing binary, early exit and discovery timeout close the listener', async () => {
  for (const failure of ['missing', 'exit', 'timeout']) {
    const port = await freePort(); const child = fakeTunnel();
    let announced = false;
    await assert.rejects(runTunnel({ env: { TEAM_MCP_PORT: String(port), TEAM_MCP_DB: ':memory:' }, timeoutMs: 25, log: (line) => { if (line.startsWith('\nMCP-osoite:')) announced = true; }, spawnTunnel: () => {
      if (failure === 'missing') setImmediate(() => child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' })));
      if (failure === 'exit') setImmediate(() => {
        child.stderr.write('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": connection refused\n');
        child.exitCode = 1; child.emit('close', 1);
      });
      return child;
    } }), failure === 'missing' ? /cloudflared puuttuu/ : failure === 'exit' ? /exit 1/ : /Cloudflare-osoitetta ei saatu/);
    assert.equal(announced, false, 'API error URLs must not be advertised as a tunnel');
    await assert.rejects(fetch(`http://127.0.0.1:${port}/healthz`));
  }
});
test('a running tunnel failure stops the MCP server', async () => {
  const port = await freePort(); const child = fakeTunnel();
  await assert.rejects(runTunnel({ env: { TEAM_MCP_PORT: String(port), TEAM_MCP_DB: ':memory:' }, spawnTunnel: () => {
    setImmediate(() => child.stdout.write('| https://test.trycloudflare.com |\n')); return child;
  }, log: (line) => { if (line.startsWith('\nMCP-osoite:')) setImmediate(() => { child.exitCode = 2; child.emit('close', 2); }); } }), /exit 2/);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/healthz`));
});
