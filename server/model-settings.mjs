// Shared by the runtime and offline preflight; never include environment values in errors.
export function modelSettings(env = process.env) {
  const provider = (env.AIMO_MODEL_PROVIDER || 'anthropic').trim();
  if (!['anthropic', 'ollama'].includes(provider)) throw new Error('AIMO_MODEL_PROVIDER: käytä anthropic tai ollama.');
  if (provider === 'anthropic') return { llmProvider: provider };
  let url;
  try {
    url = new URL(env.OLLAMA_BASE_URL || '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
  } catch { throw new Error('OLLAMA_BASE_URL tarvitsee HTTP(S)-alkuperän ilman polkua tai tunnuksia.'); }
  const model = env.OLLAMA_MODEL?.trim();
  if (!model || model.length > 200 || /\s/.test(model)) throw new Error('OLLAMA_MODEL tarvitsee ladatun mallin nimen.');
  const deep = env.OLLAMA_DEEP_MODEL?.trim() || model;
  if (deep.length > 200 || /\s/.test(deep)) throw new Error('OLLAMA_DEEP_MODEL tarvitsee ladatun mallin nimen.');
  const context = Number(env.OLLAMA_CONTEXT_TOKENS || 32768);
  if (!Number.isInteger(context) || context < 2048 || context > 262144) throw new Error('OLLAMA_CONTEXT_TOKENS: kokonaisluku 2048–262144.');
  return { llmProvider: provider, ollamaUrl: url.origin, ollamaModel: model, ollamaDeepModel: deep,
    ollamaToken: env.OLLAMA_AUTH_TOKEN?.trim() || '', ollamaContext: context };
}
