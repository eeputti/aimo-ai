import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { config } from './config.mjs';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';

// One foreground command owns both processes. No public URL is written to .env:
// each new quick tunnel has a different OAuth issuer and resource.
export async function runTunnel({ env = process.env, signal, spawnTunnel = spawn, log = console.log, timeoutMs = 60_000 } = {}) {
  const settings = config({ ...env, TEAM_MCP_HOST: '127.0.0.1', TEAM_MCP_PUBLIC_URL: 'http://127.0.0.1' });
  let handler, child, store, cleanup, timer;
  const readers = [];
  const server = http.createServer((req, res) => {
    if (handler) return handler(req, res);
    res.writeHead(503, { 'cache-control': 'no-store' }); res.end('Tunnel starting');
  });
  let abort;
  const stopped = new Promise((resolve) => { abort = resolve; });
  const onAbort = () => abort({ stopped: true });
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) return;
    // Bind first so an existing service on this port is never exposed by mistake.
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(settings.port, settings.host, () => { server.off('error', reject); resolve(); });
    });
    child = spawnTunnel(env.CLOUDFLARED_BIN || 'cloudflared', [
      'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${settings.port}`,
    ], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let exitResolve;
    const exited = new Promise((resolve) => { exitResolve = resolve; });
    child.once('error', (err) => exitResolve({ error: new Error(err.code === 'ENOENT'
      ? 'cloudflared puuttuu. Asenna se ohjeen mukaan tai aseta CLOUDFLARED_BIN.' : err.message) }));
    child.once('close', (code) => exitResolve({ error: new Error(`cloudflared pysähtyi (exit ${code}). Tarkista yllä oleva tunnelin virhe.`) }));
    const discovered = new Promise((resolve) => {
      for (const output of [child.stdout, child.stderr]) {
        const reader = createInterface({ input: output }); readers.push(reader);
        reader.on('line', (line) => {
          log(line);
          // Only the success banner carries the public URL. Error lines also
          // contain api.trycloudflare.com; that is never a usable tunnel.
          const match = /\|\s+(https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com)\s+\|/i.exec(line);
          if (match && new URL(match[1]).hostname !== 'api.trycloudflare.com') resolve({ url: new URL(match[1]) });
        });
      }
    });
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ error: new Error('Cloudflare-osoitetta ei saatu 60 sekunnissa. Tarkista verkkoyhteys ja cloudflaredin asetukset.') }), timeoutMs); });
    const result = await Promise.race([discovered, exited, stopped, timeout]);
    clearTimeout(timer);
    if (result.stopped) return;
    if (result.error) throw result.error;
    settings.url = result.url;
    store = openStore(settings.db); store.records.prune();
    handler = createApp(store, settings).app;
    cleanup = setInterval(() => store.records.prune(), 60_000); cleanup.unref();
    log(`\nMCP-osoite: ${new URL('/mcp', settings.url).href}\nTerveystarkistus: ${new URL('/healthz', settings.url).href}\nValitse liittimessä OAuth ja käytä omaa tiimiavaintasi.\nPidä tämä terminaali auki. Ctrl+C sulkee palvelimen ja tunnelin.\n`);
    const end = await Promise.race([exited, stopped]);
    if (end.error) throw end.error;
  } finally {
    clearTimeout(timer); clearInterval(cleanup);
    signal?.removeEventListener('abort', onAbort);
    for (const reader of readers) reader.close();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    // Close active sockets as well; the stateless transport has no sessions to preserve.
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { await runTunnel({ signal: controller.signal }); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
