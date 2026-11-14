// Every shopping entry point uses this fresh review + atomic basket update.
export async function addReviewedProducts(cart, entries, date, { fetchImpl = fetch, beforeCommit = () => {} } = {}) {
  await cart.ready;
  const grouped = new Map();
  for (const p of entries) {
    if (!p?.id || !Number.isFinite(p.qty) || p.qty <= 0) throw new Error('Tarkista tuote ja määrä.');
    const previous = grouped.get(p.id);
    grouped.set(p.id, { ...p, qty: p.qty + (previous?.qty || 0) });
  }
  const rows = [...grouped.values()];
  if (!rows.length || rows.length > 80) throw new Error('Valitse 1–80 tuotetta.');
  const existing = cart.lines(date);
  const fingerprint = JSON.stringify(existing);
  const res = await fetchImpl('/api/storefront/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deliveryDate: date, lines: rows.map((p) => ({ id: p.id, qty: p.qty + (existing.find((e) => e.id === p.id)?.qty || 0) })) }) });
  let review;
  try { review = await res.json(); } catch { throw new Error('Ostoskoripalveluun ei saatu yhteyttä. Päivitä sivu ja yritä uudelleen.'); }
  if (date !== cart.get().selectedDate) throw new Error('Toimituspäivä muuttui. Tarkista uudet hakutulokset.');
  if (fingerprint !== JSON.stringify(cart.lines(date))) throw new Error('Ostoskori muuttui tarkistuksen aikana. Paina lisäystä uudelleen.');
  if (!res.ok || !review.ok) throw new Error(typeof review.error === 'string' ? review.error : 'Saatavuus muuttui. Hae tuotteet uudelleen.');
  const additions = rows.map((p) => {
    const line = review.lines?.find((l) => l.id === p.id);
    const checked = line?.product;
    if (!line?.ok || !checked || checked.id !== p.id) throw new Error('Tuotteen tarkistus jäi kesken. Hae tuotteet uudelleen.');
    return { product: { ...p, ...checked, unit: checked.unitLabel, image: `/img/${encodeURIComponent(p.id)}`, availableFrom: date, taxUnknown: checked.vat == null, quantityExplanation: p.quantityExplanation || checked.quantityExplanation }, qty: p.qty };
  });
  beforeCommit();
  await cart.addMany(additions, date, { lines: fingerprint });
}
