// Pieni, hinnaton kataloginäkymä demon collection-sivuille. Ei API- tai mallikutsuja.
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, ROOT, unitLabel } from '../server/catalog.mjs';
import { COLLECTIONS, belongsToCollection } from '../public/aimo-collections.js';

const products = loadCatalog().products;
const groups = Object.fromEntries(Object.keys(COLLECTIONS).map((id) => [id, products.filter((p) => belongsToCollection(p, id)).map((p) => p.id)]));
const included = new Set(Object.values(groups).flat());
const items = products.filter((p) => included.has(p.id)).map((p) => ({ id: p.id, name: p.name, unit: unitLabel(p.salesUnit) }));
fs.writeFileSync(path.join(ROOT, 'public', 'storefront-collections.json'), `${JSON.stringify({ source: 'data/catalog.json', groups, products: items })}\n`);
console.log(`${Object.keys(groups).length} tuoteryhmää, ${items.length} tuotetta. Ei hintoja tai saatavuusväitteitä.`);
