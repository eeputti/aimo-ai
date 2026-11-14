// Hakee tuotekuvat etukäteen levylle (data/img), ettei demon ensimmäinen lataus odota niitä.
// Aja: npm run images                → nykyisen ehdotuksen tuotteet + korvaajat
//      npm run images -- 464306 10400 → lisäksi annetut tuotenumerot ja kokonaiset kategoriat (esim. 10400 = maidot)
import { loadCatalog } from '../server/catalog.mjs';
import { proposals } from '../server/db.mjs';
import { resolveImage } from '../server/images.mjs';

const cat = loadCatalog();
const ids = new Set();
const p = proposals.current();
for (const l of p?.lines || []) { ids.add(l.productId); for (const o of l.options || []) ids.add(o.productId); }
for (const s of p?.skipped || []) ids.add(s.productId);
for (const arg of process.argv.slice(2)) {
  if (cat.get(arg)) ids.add(arg);
  else for (const prod of cat.products) if (prod.category === arg) ids.add(prod.id);
}
ids.delete(undefined);

const counts = {};
let done = 0;
await Promise.all([...ids].map(async (id) => {
  const img = await resolveImage(id).catch(() => null);
  const key = img ? img.source : 'ei kuvaa';
  counts[key] = (counts[key] || 0) + 1;
  if (++done % 25 === 0) console.log(`  ${done}/${ids.size}`);
}));
console.log(`${ids.size} tuotetta:`, counts);
// Metatiedosto kirjoitetaan viiveellä; annetaan sille hetki ennen kuin prosessi päättyy.
await new Promise((r) => setTimeout(r, 400));
