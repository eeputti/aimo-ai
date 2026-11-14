import { config } from './config.mjs';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';
const settings = config();
const store = openStore(settings.db);
store.records.prune();
const { app } = createApp(store, settings);
const server = app.listen(settings.port, settings.host, () => console.log(`Team MCP: ${new URL('/mcp', settings.url).href}\nLocal bind: ${settings.host}:${settings.port}`));
const cleanup = setInterval(() => store.records.prune(), 60_000); cleanup.unref();
async function shutdown() { clearInterval(cleanup); server.close(() => { store.close(); }); server.closeIdleConnections(); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
