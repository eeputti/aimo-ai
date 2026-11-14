// 100 persoonan itsekeskustelun deterministiset tarkistukset. Ei mallikutsuja, ei verkkoa.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PERSONAS, REGRESSIONS, inspectPersona, parseOptions } from '../eval/whatsapp-personas.mjs';
import { inspectConversation } from '../eval/whatsapp-selfplay-cases.mjs';
import { costUsd, modelOf, restoreTurns, summarize } from '../scripts/whatsapp-selfplay-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');

test('100 yksilöllistä persoonaa runSelfplayn case-skeemassa, 20 polkua ja keittiöiden kirjo', () => {
  assert.equal(PERSONAS.length, 100);
  assert.equal(new Set(PERSONAS.map((p) => p.id)).size, 100);
  assert.equal(new Set(PERSONAS.map((p) => p.first)).size, 100, 'ensimmäiset viestit eivät toistu');
  const routes = {}; for (const p of PERSONAS) routes[p.route] = (routes[p.route] || 0) + 1;
  assert.equal(Object.keys(routes).length, 20); assert.ok(Object.values(routes).every((n) => n === 5));
  assert.ok(new Set(PERSONAS.map((p) => p.kitchen)).size >= 12);
  assert.ok(new Set(PERSONAS.map((p) => p.style)).size === 6);
  for (const p of PERSONAS) {
    assert.match(p.id, /^S\d{3}$/u);
    assert.ok(p.first.length > 5 && p.first.length < 300, p.id);
    assert.ok(p.brief.includes('pyydä linkki ostoskoriin'), p.id);
    assert.match(p.date, /^2026-11-(16|17|18|19|20)$/u, p.id);
    assert.ok(p.maxTurns >= 5 && p.maxTurns <= 10, p.id);
    assert.ok(Object.keys(p.expected).length >= 1, p.id);
    for (const [key, q] of Object.entries(p.expected)) {
      assert.ok(Number.isFinite(q.value) && q.value > 0, `${p.id} ${key}`);
      assert.ok(['L', 'KG', 'PCS'].includes(q.unit), `${p.id} ${key}`);
      // Avain ei saa osua saman persoonan toiseen riviin (esim. kahvi vs. kahvikerma ilman not-sääntöä).
      for (const [other, oq] of Object.entries(p.expected)) if (other !== key) assert.ok(!other.includes(key) || (q.not || []).some((n) => other.includes(n)), `${p.id}: ${key} osuu riviin ${other}`);
    }
  }
});

test('uudet polut ovat mukana: päivä puuttuu, 4 = lisää vaihtoehtoja, numerovalinta, annoslasku, olematon tuote', () => {
  assert.ok(PERSONAS.filter((p) => !p.dateInFirst).length >= 25);
  assert.equal(PERSONAS.filter((p) => p.wantsMore).length, 10);
  assert.equal(PERSONAS.filter((p) => p.pickNumber === 2).length, 5);
  assert.equal(PERSONAS.filter((p) => p.unavailable).length, 10);
  const portions = PERSONAS.filter((p) => p.route === 'portions');
  assert.deepEqual(portions.map((p) => Object.values(p.expected)[0].value), [18, 10, 20, 18, 12]);
  assert.ok(PERSONAS.some((p) => p.requiredAllergen === 'AM') && PERSONAS.some((p) => p.requiredClaim === 'FREE_FROM_GLUTEN'));
  assert.deepEqual(PERSONAS.filter((p) => p.route === 'unit-correction').map((p) => Object.values(p.expected)[0].value), [0.5, 0.5, 20, 0.25, 3]);
});

test('jokaiselle tavoitetuotteelle löytyy tilattava vaihtoehto ja olemattomille ei (simuloitu haku)', { skip: !fs.existsSync(CATALOG) && 'data/catalog.json puuttuu' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-personas-test-'));
  Object.assign(process.env, { VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-15T09:00:00+02:00', GATEWAY_DB: path.join(dir, 'g.db'), AIMO_DB: path.join(dir, 'k.db'),
    AIMO_LEARNED: path.join(dir, 'learned.json'), AIMO_CATALOG: CATALOG, GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const { createOrderingTools } = await import('../server/order-tools/index.mjs');
  const tools = createOrderingTools();
  const customer = { customerId: 'c1', buyerId: 'demo-nordic', bindingVersion: 1, permissions: { readProducts: true } };
  const suggest = async (term, quantity, date) => (await tools.suggest({ customer, draft: { id: 'd', deliveryDate: date, diet: { known: true, claims: [], excludeAllergens: [] },
    lines: [{ ref: 'L1', productTerm: term, quantity, claims: [], excludeAllergens: [] }] } })).lines[0]?.options || [];
  const seen = new Set();
  for (const p of PERSONAS) for (const [key, q] of Object.entries(p.expected)) {
    const term = q.label; const id = `${term}|${p.date}`; if (seen.has(id)) continue; seen.add(id);
    assert.ok((await suggest(term, { value: q.value, unit: q.unit }, p.date)).length > 0, `${p.id}: ${term} ${p.date}`);
  }
  for (const term of ['kaviaari', 'ananas', 'appelsiinituoremehu']) assert.equal((await suggest(term, { value: 1, unit: 'KG' }, '2026-11-17')).length, 0, term);
});

// Synteettinen keskustelu nykyisen ytimen vastausmuodossa (server/order-conversation/index.mjs).
const list = (date, lines) => ({ deliveryDate: date, diet: { known: true, claims: [], excludeAllergens: [] }, lines });
const line = (term, value, unit, extra = {}) => ({ ref: `L-${term}`, productTerm: term, quantity: { value, unit }, claims: [], excludeAllergens: [], selectedProductId: null, ...extra });
const OPTIONS_A = '*Broilerin rintafilee 10 kg*\n1. Seara Broilerin rintafilee 2kg pakaste: 5 pkt (10 kg), 47,20 €\n2. Happy Chef rintafileeviipale 2,5kg: 4 pkt (10 kg), 51,00 €\n3. Atria broilerin rintafilee 1 kg: 10 pkt (10 kg), 89,00 €\n\nVastaa numerolla. Kirjoita 4, niin näytän lisää vaihtoehtoja samalle päivälle.';
const OPTIONS_B = '*Broilerin rintafilee 10 kg*\n1. Kariniemen rintafilee 1 kg: 10 pkt (10 kg), 95,00 €\n2. HK rintafilee 2 kg: 5 pkt (10 kg), 99,00 €\n\nVastaa numerolla.';

test('hyvä keskustelu: päivä ensin, numeroidut vaihtoehdot määrin ja hinnoin, 4 tuo uudet vaihtoehdot', () => {
  const persona = { ...PERSONAS.find((p) => p.route === 'date-missing-more-options'), expected: { rintafilee: { value: 10, unit: 'KG', aliases: ['broiler'] } }, date: '2026-11-16' };
  const turns = [
    { user: 'moi, 10 kg broilerin rintafileetä', assistant: 'Luonnoksessa nyt:\n- broilerin rintafilee 10 kg\n\nMille päivälle toimitus?', list: list(null, [line('broilerin rintafilee', 10, 'KG')]) },
    { user: 'maanantaiksi', assistant: OPTIONS_A, list: list('2026-11-16', [line('broilerin rintafilee', 10, 'KG')]) },
    { user: '4', assistant: OPTIONS_B, list: list('2026-11-16', [line('broilerin rintafilee', 10, 'KG')]) },
    { user: '1', assistant: 'Tilausluonnos, toimitus ma 16.11.\n1. Kariniemen rintafilee 1 kg: 10 pkt, 95,00 €\nYhteensä 95,00 € (alv 0 %)\nVoit avata korin: [ostoskorilinkki]', list: list('2026-11-16', [line('broilerin rintafilee', 10, 'KG', { selectedProductId: 'p9' })]) },
  ];
  const r = inspectPersona(persona, turns, turns.at(-1).list);
  assert.deepEqual(r.failures, []);
  // OPTIONS_B ei tarjoa enää 4:ää: vaatimus koskee jokaista vaihtoehtolistaa.
  assert.deepEqual(r.newRequirement, ['options_no_more_hint']);
  assert.equal(r.metrics.moreRequests, 1); assert.equal(r.metrics.optionReplies, 2); assert.equal(r.metrics.linkTurn, 4); assert.equal(r.metrics.allSelected, true);
  assert.deepEqual(parseOptions(OPTIONS_A)[0].map((o) => [o.number, o.hasPrice, o.hasQuantity]), [[1, true, true], [2, true, true], [3, true, true]]);
  assert.equal(parseOptions(OPTIONS_A)[0].heading, 'Broilerin rintafilee 10 kg');
  assert.deepEqual(parseOptions(turns.at(-1).assistant), [], 'yhteenveto ei ole vaihtoehtolista');
});

test('huono keskustelu: jokainen virheluokka tunnistetaan', () => {
  const persona = { ...PERSONAS.find((p) => p.route === 'date-missing-more-options'), expected: { kananmuna: { value: 60, unit: 'PCS', not: ['strutsi'] } }, date: '2026-11-16', noIrrelevantDiet: true, unavailable: 'strutsi', absent: ['strutsi'] };
  const many = '*Strutsinmuna 6 kpl*\n1. Kieku Ulkokananmuna M10: 6 ras, 63,20 €\n2. Viiriäisen munia: 6 pkt, 12,90 €\n3. Kieku M6: 10 ras, 26,00 €\n4. Kieku M90: 1 ltk, 240,00 €\n5. Muna jotain\n';
  const turns = [
    { user: '60 kananmunaa ja 6 strutsinmunaa', assistant: many, list: list(null, [line('kananmuna', 60, 'PCS'), line('strutsinmuna', 6, 'PCS')]) },
    { user: '4', assistant: 'Haluatko laktoositonta vai käykö tavallinen?', list: list('2026-11-17', [line('kananmuna', 4, 'PCS'), line('strutsinmuna', 6, 'PCS')]) },
    { user: 'ok', assistant: 'Tilaus on vahvistettu, tilausnumero AGW-20261116-0001.', list: list('2026-11-17', [line('kananmuna', 4, 'PCS'), line('strutsinmuna', 6, 'PCS')]) },
  ];
  const r = inspectPersona(persona, turns, turns.at(-1).list);
  for (const f of ['date_not_asked_first', 'options_before_date', 'options_more_than_3', 'options_no_more_hint', 'more_options_not_shown', 'four_read_as_quantity']) assert.ok(r.newRequirement.includes(f), f);
  for (const f of ['diet_question_irrelevant', 'quantity:kananmuna', 'unexpected:strutsinmuna', 'unremoved:strutsi', 'delivery_date', 'cart_link_missing', 'unselected:kananmuna', 'unrelated_substitute_offered', 'unavailable_not_explained', 'order_claimed']) assert.ok(r.failures.includes(f), f);
  assert.ok(!r.failures.includes('missing:kananmuna'), 'strutsinmuna ei kelpaa kananmunaksi, mutta kananmunarivi löytyy');
  const honest = inspectPersona(persona, [{ user: 'x', assistant: 'Tarkkaa osumaa ei löytynyt: strutsinmuna. Lähimmät tilattavat vaihtoehdot:\n*Strutsinmuna 6 kpl:*\n1) Kieku M6, 1 rasia (6 kpl), 2,60 €', list: list('2026-11-16', [line('kananmuna', 60, 'PCS')]) }], list('2026-11-16', [line('kananmuna', 60, 'PCS')]));
  assert.ok(!honest.failures.includes('unrelated_substitute_offered') && !honest.failures.includes('unavailable_not_explained'), 'avoimesti merkitty lähin osuma ei ole hiljainen korvike');
  const sip = inspectPersona(persona, [{ user: 'x', assistant: 'Selvä, päivitin ostoskorin.\n*Sipuli 2 kg*\n1. SIPULI NIPPU SUOMI: 2 kpl, 1,78 €\n2. SIPULI 1KG PUSSI: 2 kpl (2 kg), 1,94 €', list: list('2026-11-16', [line('sipuli', 2, 'KG')]) }], null);
  assert.deepEqual(sip.observations.sort(), ['cart_claim_before_selection', 'option_without_need_cover']);
});

test('Codexin inspectConversation hyväksyy persoonat sellaisenaan (sama case-skeema)', () => {
  const p = PERSONAS.find((x) => x.route === 'neutral-no-diet');
  const lines = Object.entries(p.expected).map(([key, q]) => line(q.label, q.value, q.unit));
  const turns = [{ user: p.first, assistant: 'Valmis: [ostoskorilinkki]', list: list(p.date, lines) }];
  assert.deepEqual(inspectConversation(p, turns, list(p.date, lines)), []);
  assert.deepEqual(inspectPersona(p, turns, list(p.date, lines)).failures, []);
});

test('aliakset eivät osu toisiin tuotteisiin (porkkana ei ole kana, strutsinmuna ei ole kananmuna)', () => {
  const p = PERSONAS.find((x) => x.route === 'many-items-typos' && x.expected.rintafilee && x.expected.porkkana);
  assert.ok(p, 'testipersoona löytyy');
  const lines = Object.entries(p.expected).map(([, q]) => line(q.label === 'rintafilee' ? 'broilerin rintafilee' : q.label, q.value, q.unit, { selectedProductId: 'x' }));
  const r = inspectPersona(p, [{ user: p.first, assistant: '[ostoskorilinkki]', list: list(p.date, lines) }], list(p.date, lines));
  assert.deepEqual(r.failures, []);
});

test('regressiosarja: väärä tuotetyyppi, pelkät laktoosittomat ja kattamaton vaihtoehto tunnistetaan', () => {
  assert.deepEqual(REGRESSIONS.map((r) => r.id), ['R01', 'R02', 'R03', 'R04', 'R05', 'R06']);
  assert.equal(new Set([...PERSONAS, ...REGRESSIONS].map((p) => p.id)).size, 106);
  const r03 = REGRESSIONS.find((r) => r.id === 'R03');
  const bad = [line('keltasipuli', 3, 'KG', { selectedProductId: 'a', selectedName: 'PUNASIPULI NIPPU SUOMI' }), line('mozzarella', 5, 'KG', { selectedProductId: 'b', selectedName: 'Salomon mozzarella-sipulirengas 6x1kg' })];
  const reply = '*Keltasipuli 3 kg*\n1. PUNASIPULI NIPPU SUOMI: 3 kpl, 4,59 €\n2. SIPULI 1KG PUSSI: 3 kpl (3 kg), 2,91 €\n\nVastaa numerolla.';
  const r = inspectPersona(r03, [{ user: r03.first, assistant: reply, list: list(r03.date, bad) }, { user: 'ok', assistant: '[ostoskorilinkki]', list: list(r03.date, bad) }], list(r03.date, bad));
  for (const f of ['wrong_product:sipuli', 'wrong_product:mozzarella', 'option_without_need_cover']) assert.ok(r.failures.includes(f), f);
  const r05 = REGRESSIONS.find((r) => r.id === 'R05');
  const milk = '*Maito 30 l*\n1. Valio kevytmaito 2,5 dl laktoositon UHT: 8 ltk (30 l), 158,08 €\n2. Valio Eila kevytmaitojuoma laktoositon: 8 ltk (30 l), 201,92 €';
  assert.ok(inspectPersona(r05, [{ user: r05.first, assistant: milk, list: list(r05.date, [line('maito', 30, 'L')]) }], list(r05.date, [line('maito', 30, 'L')])).failures.includes('only_lactose_free_offered:maito'));
});

test('uudelleentarkistus palauttaa tallennetut vuorot inspectPersonan muotoon', () => {
  const stored = { turns: [{ user: 'u', assistant: 'a', ms: 1, deliveryDate: '2026-11-16', lines: [{ term: 'maito', quantity: { value: 20, unit: 'L' }, claims: [], excludeAllergens: [], selected: 'Valio maito' }] }],
    finalList: { deliveryDate: '2026-11-16', diet: { known: true, claims: ['FREE_FROM_LACTOSE'], excludeAllergens: [] }, lines: [] } };
  const [t] = restoreTurns(stored);
  assert.equal(t.list.deliveryDate, '2026-11-16'); assert.equal(t.list.lines[0].productTerm, 'maito'); assert.equal(t.list.lines[0].selectedProductId, 'Valio maito');
  assert.deepEqual(t.list.diet.claims, ['FREE_FROM_LACTOSE']);
});

test('kustannusarvio käyttää mallikohtaisia hintoja ja yhteenveto listaa virheluokat', () => {
  assert.equal(modelOf('whatsapp_optional_addition'), 'claude-haiku-5-5'); assert.equal(modelOf('whatsapp_order_turn'), 'claude-opus-5-5');
  assert.equal(costUsd({ input: 1_000_000, cacheRead: 0, output: 1_000_000 }, 'claude-opus-5-5'), 24);
  assert.equal(costUsd({ input: 1_000_000, cacheRead: 1_000_000, output: 0 }, 'claude-opus-5-5'), 0.2);
  const results = [{ id: 'S001', route: 'r', failures: ['missing:maito'], newRequirement: ['options_no_more_hint'], codexFailures: [], judgment: { score: 3, problems: ['p'] }, turns: [{ user: 'u', assistant: 'a https://x.invalid/y' }] }];
  const md = summarize(results, { calls: 10, failed: 0, input: 100, output: 50, cacheRead: 0, orders: 0, ms: 60000, personaMs: 60000, assistantMs: 30000, byPurpose: { whatsapp_order_turn: { calls: 10, input: 100, output: 50, cacheRead: 0 } } },
    { created: 'x', commit: 'abc', dirty: [], snapshotHash: '0'.repeat(64), deepModel: 'claude-opus-5-5', fastModel: 'claude-haiku-5-5' });
  assert.match(md, /missing: 1/u); assert.match(md, /options_no_more_hint: 1/u); assert.doesNotMatch(md, /https:/u); assert.doesNotMatch(md, /\u00b7/u);
});
