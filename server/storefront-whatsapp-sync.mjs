// Projection of the WhatsApp draft and its current quote for the signed cart page.
export function storefrontCartProjection(list, quote) {
  const base = { source: `whatsapp:${list.buyerId}`, id: list.id, revision: list.revision, companyName: list.companyName, deliveryDate: list.deliveryDate };
  if (list.status !== 'review' || !quote || quote.issues.length) return { ...base, state: 'waiting', lines: [], message: 'Täydennä tuotteen valinta, määrä ja toimitustiedot WhatsAppissa.' };
  return { ...base, state: 'ready', lines: quote.lines.map((line) => ({ id: line.productId, name: line.name, qty: line.salesUnits,
    price: line.unitPriceNet, vat: line.vatRate ?? null, taxUnknown: line.vatRate == null, unit: line.salesUnitLabel,
    requested: line.covers, image: `/img/${encodeURIComponent(line.productId)}`,
    // Vertailuhinta vain Valion hintarajapinnasta (alv 0 %); ilman sitä sarake jää tyhjäksi eikä arvoa lasketa itse.
    comparison: line.comparisonPrice > 0 && ['L', 'KG', 'PCS'].includes(line.comparisonUnit) ? { value: line.comparisonPrice, unit: line.comparisonUnit } : null })) };
}
