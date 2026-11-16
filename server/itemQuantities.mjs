// Tuotteen kappaleet ja tilattavat myyntipakkaukset ovat eri suureita.
// Lukumäärä luetaan ilmoitetusta pakkaustiedosta, ei tuotteen painosta.
const positiveInteger = (n) => Number.isSafeInteger(n) && n > 0;
// Kananmuna: myös "Vapaan kanan muna M10" ja munaosasto (10590), muuten Vapaan kanan munia ei koskaan ehdotettu munamäärälle
// (katselmus 15.11. #22). Munakoiso, munkki ja muut muna-alkuiset sanat eivät ole munia.
const EGG_CATEGORY = '10590';
const egg = (p) => /kananmun|kanan\s+mun(a|at|ia|ien)?\b|\beggs?\b/i.test(p.productTerm || p.name || '') || p.productType === 'eggs' || p.category === EGG_CATEGORY;
/** Munakenno on 30 munaa (6 × 5). Kenno on kananmunien määrän sana, ei myyntipakkaus. */
export const EGGS_PER_TRAY = 30;

export function itemsPerSalesUnit(p) {
  if (!p || p.salesUnit === 'KG') return null;
  if (positiveInteger(p.itemsPerSalesUnit)) return { value: p.itemsPerSalesUnit, source: 'product-data' };
  const name = p.name || '';
  const multi = name.match(/\b(\d+)\s*[x×]\s*(\d+)\s*(?:kpl|pcs|kappaletta|pieces)\b/i);
  const single = name.match(/\b(\d+)\s*(?:kpl|pcs|kappaletta|pieces)\b/i);
  // Kananmunien tuotenimissä M6/M10/M90 tarkoittaa kokoluokkaa ja ilmoitettua lukumäärää.
  const eggPack = egg(p) && !/keitet|kuorit|massa|valkuai|keltuai|jauhe|pasta/i.test(name)
    ? name.match(/\b(?:XS|XL|[SML])(?:\s*\/\s*(?:XS|XL|[SML]))?\s*(\d{1,3})\b/i) : null;
  const namedCount = multi ? Number(multi[1]) * Number(multi[2]) : Number(single?.[1] || eggPack?.[1]);
  if (!positiveInteger(namedCount)) return null;
  const factor = p.baseUnit && p.salesUnit && p.baseUnit !== p.salesUnit ? p.perSales : 1;
  // Nimen monipakkaus ja erillinen yksikkömuunnos voivat kuvata samaa kertolaskua. Epäselvää tietoa ei kerrota kahdesti.
  if (!positiveInteger(factor) || (multi && factor !== 1)) return null;
  const count = namedCount * factor;
  return positiveInteger(count) ? { value: count, source: factor === 1 ? 'product-name' : 'product-name-and-unit-conversion' } : null;
}

// Myyntiyksikkö on vanhan PCS-rajapinnan oletus. Vain selkeästi muniksi sanottu määrä vaihdetaan kappaleiksi.
export function quantityBasisFor(item, unitWord) {
  if (item.quantity?.unit !== 'PCS') return undefined;
  if (item.quantity.basis === 'sales' || item.quantity.basis === 'items') return item.quantity.basis;
  if (!egg(item) || item.attributes?.pack) return 'sales';
  return !unitWord || /^(?:kpl|kappale\w*|pcs|pc|pieces?)$/i.test(unitWord) ? 'items' : 'sales';
}

export function explainItemQuantity(p, quantity, salesUnits) {
  if (quantity?.unit !== 'PCS' || quantity.basis !== 'items') return null;
  const count = itemsPerSalesUnit(p);
  if (!count || !(salesUnits > 0)) return null;
  const providedItems = salesUnits * count.value;
  const fmt = (n) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: 3 });
  const noun = egg(p) ? 'munaa' : 'kpl';
  return {
    itemsPerSalesUnit: count.value, requestedItems: quantity.value, providedItems,
    excessItems: +(providedItems - quantity.value).toFixed(6), salesUnits, source: count.source,
    text: `${fmt(salesUnits)} ${p.salesUnit === 'RAS' ? 'rasiaa' : p.salesUnit === 'KI' ? 'laatikkoa' : 'pakkausta'} × ${fmt(count.value)} ${noun} = ${fmt(providedItems)} ${noun}${providedItems > quantity.value ? ` (tarve ${fmt(quantity.value)})` : ''}`,
  };
}
