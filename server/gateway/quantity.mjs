// Sama myyntierän muunnos haussa ja sitovassa tarjouksessa.
import { itemsPerSalesUnit } from '../itemQuantities.mjs';

export function unitSizeFor(p, price, unit, basis = 'sales') {
  if (!['items', 'sales'].includes(basis) || (basis === 'items' && unit !== 'PCS')) return null;
  if (unit === 'PCS' && basis === 'items') return itemsPerSalesUnit(p);
  if (unit === 'PCS') return { value: 1, source: 'sales-unit' };
  const fromPrice = price?.comparison > 0 && price.comparisonUnit === unit ? +(price.net / price.comparison).toFixed(2) : null;
  const fromData = unit === 'L' ? p.litres : p.kg;
  // Nettohinta ja vertailuhinta kuvaavat myyntiyksikköä; katalogin koko voi olla koko laatikon koko.
  if (fromData && fromPrice && Math.abs(fromData - fromPrice) / fromPrice > 0.1) return { value: fromPrice, source: 'comparison-price', check: fromData, mismatch: true };
  if (fromData) return { value: fromData, source: p.sizeApprox ? 'product-name' : 'product-data', check: fromPrice };
  if (fromPrice) return { value: fromPrice, source: 'comparison-price' };
  return null;
}
