// Määrän yksikkö seuraa tuotetta ja hakutulosten pakkaustietoja.
export function quantityChoices(item, products = []) {
  const term = item.productTerm || '';
  const packs = { unit: 'PCS', basis: 'sales', label: 'pakkausta' };
  if (item.productType === 'eggs' || /kananmun|\beggs?\b/i.test(term)) {
    return { options: [{ unit: 'PCS', basis: 'items', label: 'kpl' }, packs] };
  }
  const litres = products.filter((p) => p.litres > 0).length;
  const kilos = products.filter((p) => p.kg > 0).length;
  const unit = /jauho|sokeri|suola|riisi|voi\b/i.test(term) ? 'KG'
    : ['milk', 'cream'].includes(item.productType) || litres > 0 && litres >= kilos ? 'L'
      : kilos > 0 ? 'KG' : null;
  if (unit) return {
    options: [{ unit, label: unit === 'L' ? 'l' : 'kg' }, packs],
  };
  return { options: [packs, { unit: 'KG', label: 'kg' }, { unit: 'L', label: 'l' }] };
}

export function quantityLabel(quantity) {
  return quantity.unit === 'PCS' ? quantity.basis === 'items' ? 'kpl' : 'pakkausta' : quantity.unit === 'L' ? 'l' : 'kg';
}
