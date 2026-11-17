// Manual real-model check. Never sends to a paid provider or touches carts/orders.
import assert from 'node:assert/strict';
import { config } from '../server/config.mjs';
import { askAgent } from '../server/aimoAgent.mjs';
if (config.llmProvider !== 'ollama') throw new Error('Valitse ensin AIMO_MODEL_PROVIDER=ollama.');
const schema = { type: 'object', additionalProperties: false, required: ['product', 'litres', 'lactoseFree'], properties: {
  product: { type: 'string' }, litres: { type: 'number' }, lactoseFree: { type: 'boolean' },
} };
const system = 'Muunna suomenkielinen viesti JSON-ostoriviksi. product on tuotteen pääsana perusmuodossa. litres on viimeisin pyydetty kokonaismäärä litroina, ei lisäys. lactoseFree on tosi vain kun pyydetään laktoositonta. Säilytä aiemmin ilmoitettu vaatimus määrän muuttuessa.';
for (const [user, expected] of [
  ['Tarvitsen 20 litraa laktoositonta maitoa.', { product: 'maito', litres: 20, lactoseFree: true }],
  ['Aiempi tilaus: 20 litraa laktoositonta maitoa. Muuta maitomäärä 30 litraan.', { product: 'maito', litres: 30, lactoseFree: true }],
  ['Tilaa 5 litraa tavallista maitoa. Ei ruokavaliorajoituksia.', { product: 'maito', litres: 5, lactoseFree: false }],
]) {
  const result = await askAgent({ purpose: 'ollama_smoke', system, user, schema, maxTokens: 256, timeoutMs: 120000 });
  assert.deepEqual(result.json, expected);
  console.log(JSON.stringify({ ok: true, model: result.model, ms: result.ms, usage: result.usage }));
}
console.log('3/3 perustulkintaa läpi. Tämä ei korvaa koko WhatsApp-ketjun laatutestiä.');
