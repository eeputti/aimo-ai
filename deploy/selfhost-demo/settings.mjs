import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelSettings } from '../../server/model-settings.mjs';
export const DEFAULT_STATE = fileURLToPath(new URL('.state/', import.meta.url));
const MARKER = '.selfhost-demo.json';
export function demoSettings(env = process.env) {
  const model = modelSettings({ AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: env.DEMO_OLLAMA_URL || 'http://127.0.0.1:11434',
    OLLAMA_MODEL: env.DEMO_MODEL || 'qwen3:14b', OLLAMA_CONTEXT_TOKENS: env.DEMO_CONTEXT_TOKENS || '8192', OLLAMA_AUTH_TOKEN: env.DEMO_OLLAMA_TOKEN });
  if (/cloud/i.test(model.ollamaModel)) throw new Error('Demoon tarvitaan paikallinen malli.');
  const port = Number(env.DEMO_PORT || 4765); const timeout = Number(env.DEMO_TIMEOUT_MS || 180000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('DEMO_PORT: 1024–65535.');
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 300000) throw new Error('DEMO_TIMEOUT_MS: 1000–300000.');
  return { ...model, port, timeout, stateDir: path.resolve(env.DEMO_STATE_DIR || DEFAULT_STATE), container: env.DEMO_CONTAINER === 'true' };
}
export function ownState(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const marker = path.join(dir, MARKER);
  if (!fs.existsSync(marker)) {
    if (fs.readdirSync(dir).length) throw new Error('Demolle tarvitaan tyhjä oma hakemisto; olemassa olevia tietoja ei oteta käyttöön.');
    fs.writeFileSync(marker, JSON.stringify({ kind: 'aimo-selfhost-demo', version: 1 }), { mode: 0o600, flag: 'wx' });
  }
  const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (value.kind !== 'aimo-selfhost-demo' || value.version !== 1) throw new Error('Hakemisto ei kuulu tälle demolle.');
}
// The child receives no inherited API keys, production paths, NODE_OPTIONS or .env settings.
export function demoEnvironment(input = process.env) {
  const cfg = demoSettings(input);
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'].filter((k) => input[k]).map((k) => [k, input[k]]));
  return { ...env, TZ: 'Europe/Helsinki', DEMO_CHILD: 'true', DEMO_PORT: String(cfg.port), DEMO_STATE_DIR: cfg.stateDir,
    DEMO_MODEL: cfg.ollamaModel, DEMO_OLLAMA_URL: cfg.ollamaUrl, DEMO_OLLAMA_TOKEN: cfg.ollamaToken,
    DEMO_CONTEXT_TOKENS: String(cfg.ollamaContext), DEMO_TIMEOUT_MS: String(cfg.timeout), DEMO_CONTAINER: String(cfg.container),
    AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: cfg.ollamaUrl, OLLAMA_MODEL: cfg.ollamaModel, OLLAMA_CONTEXT_TOKENS: String(cfg.ollamaContext),
    OLLAMA_AUTH_TOKEN: cfg.ollamaToken, AIMO_CATALOG: path.join(cfg.stateDir, 'catalog.json'), AIMO_LEARNED: path.join(cfg.stateDir, 'learned.json'),
    AIMO_DB: path.join(cfg.stateDir, 'prices.db'), GATEWAY_DB: path.join(cfg.stateDir, 'gateway.db'),
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', VALIO_API_KEY: '', WHATSAPP_TRANSCRIBE: 'none' };
}
