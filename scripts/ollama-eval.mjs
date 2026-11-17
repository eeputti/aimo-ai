// Manual real-model evaluation of the production interpreter. No Meta, Valio or databases.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CASES, inspect } from '../eval/ollama-interpret-cases.mjs';
export async function evaluate(interpret, { cases = CASES, repeat = 1 } = {}) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) throw new Error('repeat: 1–5');
  const results = [];
  for (let round = 1; round <= repeat; round++) for (const c of cases) {
    const start = performance.now(); let actual; let failures;
    try {
      actual = await interpret({ text: c.text, draft: structuredClone(c.draft), today: '2026-11-17', now: Date.parse('2026-11-17T10:00:00+02:00') });
      failures = inspect(c, actual);
    } catch { failures = ['model_error']; }
    results.push({ id: c.id, round, passed: failures.length === 0, failures, ms: Math.round(performance.now() - start), actual });
  }
  return { total: results.length, passed: results.filter((r) => r.passed).length, results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import('../server/config.mjs');
  if (config.llmProvider !== 'ollama') throw new Error('Tämä arviointi tarvitsee AIMO_MODEL_PROVIDER=ollama. Maksullista API:a ei kutsuta.');
  const { askAgent } = await import('../server/aimoAgent.mjs');
  const { createModelInterpreter } = await import('../server/order-conversation/interpret.mjs');
  const interpret = createModelInterpreter({ ask: askAgent, fallback: () => { throw new Error('Ei mallivastausta'); } });
  const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
  const report = { model: config.ollamaDeepModel, ...await evaluate(interpret, { repeat: Number(arg('--repeat', 1)) }) };
  const out = arg('--out', null);
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  for (const r of report.results) console.log(`${r.passed ? 'OK' : 'FAIL'} ${r.id} (${r.ms} ms) ${r.failures.join(', ')}`);
  console.log(`${report.passed}/${report.total} tulkintaa oikein; ei koko WhatsApp-ketjun laatutodistus.`);
  process.exitCode = report.passed === report.total ? 0 : 1;
}
