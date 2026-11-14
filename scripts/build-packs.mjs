// Laatikkokoot tuotedatasta: montako myyntiyksikköä on yhdessä laatikossa (esim. kuohukerma 1,75 l: 12 kpl / ltk).
// Katalogi (data/catalog.json) pitää vain myyntiyksikön, joten laatikkokoko luetaan tähän omaan pieneen tiedostoonsa.
// Aja: npm run catalog (ajaa tämän build-catalogin perään) tai node scripts/build-packs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'data', 'raw', 'product_data.json'), 'utf8'));

// OLETUS: laatikoksi kelpaavat nämä yksikkökoodit. Lava (PAL) ja lavakerros (KRS) eivät ole keittiön tilauskokoja.
const CASE_UNITS = new Set(['KI', 'CS', 'KRT', 'PAK']);
const out = {};
for (const p of products) {
  if (p.deleted) continue;
  const sales = (p.units || []).find((u) => u.unitId === p.salesUnit)?.sizeInBaseUnits;
  if (!sales) continue;
  // Pienin laatikko, joka on myyntiyksikön tasakerrannainen (vähintään 2).
  const cases = (p.units || []).filter((u) => CASE_UNITS.has(u.unitId) && u.sizeInBaseUnits > sales && Number.isInteger(u.sizeInBaseUnits / sales)).sort((a, b) => a.sizeInBaseUnits - b.sizeInBaseUnits);
  if (cases.length) out[p.id] = { unit: cases[0].unitId, size: cases[0].sizeInBaseUnits / sales };
}
fs.writeFileSync(path.join(root, 'data', 'packs.json'), JSON.stringify(out));
console.log(`${Object.keys(out).length} tuotteella on laatikkokoko → data/packs.json`);
