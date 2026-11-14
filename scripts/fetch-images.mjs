// Hakee tuotekuvat etukäteen levylle (data/img), ettei demon ensimmäinen lataus odota niitä.
// Aja: npm run images                → nykyinen ehdotus, korvaajat ja tavalliset demohaut
//      npm run images -- 464306 10400 → lisäksi annetut tuotenumerot ja kokonaiset kategoriat (esim. 10400 = maidot)
//      npm run images -- --query "laktoositon kerma" → oman haun ensimmäiset 12 tuotetta
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadCatalog, ROOT } from '../server/catalog.mjs';
import { interpret } from '../server/aimo/index.mjs';
import { resolveImage } from '../server/images.mjs';

const cat = loadCatalog();
const ids = new Set();
// Read only: preparing photos must never initialize or reset the user's demo database.
let p = null;
const dbFile = process.env.AIMO_DB || path.join(ROOT, 'data', 'aimo.db');
if (fs.existsSync(dbFile)) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const id = JSON.parse(db.prepare('SELECT value FROM kv WHERE key = ?').get('currentProposal')?.value || 'null');
    if (id) p = JSON.parse(db.prepare('SELECT json FROM proposals WHERE id = ?').get(id)?.json || 'null');
  }
  finally { db.close(); }
}
for (const l of p?.lines || []) { ids.add(l.productId); for (const o of l.options || []) ids.add(o.productId); }
for (const s of p?.skipped || []) ids.add(s.productId);
const args = process.argv.slice(2);
const queries = args.length === 0 || args.includes('--demo')
  ? ['maito', 'laktoositon maito', 'kerma', 'laktoositon kerma', 'voi', 'peruna', 'lohi', 'mustikka', 'jogurtti', 'tilli', 'kookosmaito', 'kananmunat', 'broileri'] : [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--demo') continue;
  if (arg === '--query') {
    if (!args[i + 1]) throw new Error('Anna hakuteksti --query-valinnan jälkeen.');
    queries.push(args[++i]); continue;
  }
  if (cat.get(arg)) ids.add(arg);
  else for (const prod of cat.products) if (prod.category === arg) ids.add(prod.id);
}
for (const text of queries) {
  const result = await interpret(text, { llm: false, limit: 12 });
  for (const card of result.cards) for (const product of card.list) ids.add(product.id);
}
ids.delete(undefined);
console.log(`Valmistellaan ${ids.size} tuotteen kuvat, ${queries.length} hakua. Ei hinta- tai kielimallikutsuja.`);

const counts = {};
let done = 0;
await Promise.all([...ids].map(async (id) => {
  const img = await resolveImage(id).catch(() => null);
  const key = img ? img.source : 'ei kuvaa';
  counts[key] = (counts[key] || 0) + 1;
  if (++done % 25 === 0) console.log(`  ${done}/${ids.size}`);
}));
console.log(`${ids.size} tuotetta:`, counts);
