import { tokenize, stems } from '../../server/catalog.mjs';
// Invented fixtures only: no copied Valio prices, product claims or customer data.
export const PRODUCTS = [
  ['demo-milk', 'Maito 6 × 1 l', 'maito', 6, 'L', 12, [], ['AM']],
  ['demo-milk-lf', 'Laktoositon maito 6 × 1 l', 'maito', 6, 'L', 15, ['FREE_FROM_LACTOSE'], ['AM']],
  ['demo-cream', 'Laktoositon kerma 1 l', 'kerma', 1, 'L', 5, ['FREE_FROM_LACTOSE'], ['AM']],
  ['demo-butter', 'Voi 500 g', 'voi', 0.5, 'KG', 4, [], ['AM']],
  ['demo-eggs', 'Kananmuna 30 kpl', 'kananmuna', 30, 'PCS', 8, [], ['AE']],
  ['demo-potato', 'Peruna 5 kg', 'peruna', 5, 'KG', 6, ['VEGAN','FREE_FROM_GLUTEN','FREE_FROM_LACTOSE'], []],
  ['demo-oat', 'Kaurajuoma 6 × 1 l', 'kaurajuoma', 6, 'L', 13, ['VEGAN','FREE_FROM_LACTOSE'], ['AW']],
].map(([id, name, term, size, measure, price, labels, contains]) => ({ id, name, term, size, measure, price, labels, contains,
  category: 'demo-food', brand: 'Demotuote', hasAllergenData: true, mayContain: [], salesUnit: 'PAK',
  ...(measure === 'L' ? { litres: size } : measure === 'KG' ? { kg: size } : {}) }));
export function demoTools(now = Date.now) {
  const matches = (p, line) => tokenize(line.productTerm || '').some((word) => stems(word).includes(p.term));
  const suitable = (p, line, draft) => [...(draft.diet?.claims || []), ...(line.claims || [])].every((c) => p.labels.includes(c))
    && [...(draft.diet?.excludeAllergens || []), ...(line.excludeAllergens || [])].every((a) => !p.contains.includes(a));
  const option = (p, line, draft) => {
    const sales = line.quantity?.unit === 'PCS' && line.quantity?.basis === 'sales';
    if (!line.quantity || (line.quantity.unit !== p.measure && !sales)) return null;
    const packs = Math.ceil(sales ? line.quantity.value : line.quantity.value / p.size);
    return { productId: p.id, name: p.name, salesUnits: packs, salesUnitLabel: 'pkt', covers: { value: packs * p.size, unit: p.measure },
      unitPriceNet: p.price, lineNet: packs * p.price, labels: p.labels, deliveryDate: draft.deliveryDate, cutoff: null, stock: null };
  };
  return {
    async suggest({ draft, exclude = {} }) { return { issues: [], lines: draft.lines.map((line) => ({ ref: line.ref,
      options: PRODUCTS.filter((p) => matches(p, line) && suitable(p, line, draft) && !exclude[line.ref]?.includes(p.id)).map((p) => option(p, line, draft)).filter(Boolean) })) }; },
    async quote({ draft }) {
      const lines = []; const issues = [];
      for (const line of draft.lines) {
        const p = PRODUCTS.find((p) => p.id === line.selectedProductId);
        const o = p && suitable(p, line, draft) && option(p, line, draft);
        if (!o) issues.push({ ref: line.ref, code: 'DEMO_UNAVAILABLE', message: 'Valitse demovalikoimasta määrään ja rajauksiin sopiva tuote.' });
        else lines.push({ ref: line.ref, ...o });
      }
      return { quoteId: `demo-${draft.id}-${draft.revision}`, draftId: draft.id, revision: draft.revision,
        expiresAt: new Date(now() + 900000).toISOString(), issues, lines, totals: { net: lines.reduce((sum, l) => sum + l.lineNet, 0) } };
    },
    async submit() { throw new Error('Tässä demossa ei lähetetä tilauksia.'); },
  };
}
