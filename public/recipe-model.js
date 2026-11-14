// Sama annoslaskenta selaimessa ja palvelimella. Tuonti ei koskaan muuta ostoskoria.
export const UNITS = { KG: 'kg', L: 'l', PCS: 'kpl' };
export const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
export const portionsOK = (n) => Number.isInteger(n) && n >= 1 && n <= 2000;
export function recipeRequirements(recipes) {
  if (!Array.isArray(recipes) || !recipes.length || recipes.length > 35) throw new Error('Lisää 1–35 ruokaa.');
  const needs = new Map();
  for (const r of recipes) {
    if (!r.name?.trim() || !portionsOK(r.basePortions) || !portionsOK(r.portions)) throw new Error('Tarkista jokaisen ruoan alkuperäinen ja valmistettava annosmäärä (1–2000).');
    if (!Array.isArray(r.ingredients) || !r.ingredients.length || r.ingredients.length > 40) throw new Error(`${r.name}: tarkista raaka-aineet (1–40).`);
    for (const g of r.ingredients) {
      if (!g.name?.trim() || g.name.length > 100 || !positive(g.amount) || g.amount > 999999 || !UNITS[g.unit]) throw new Error(`${r.name}: tarkista raaka-aineen nimi, määrä ja yksikkö.`);
      const amount = g.amount * r.portions / r.basePortions;
      const key = `${g.name.trim().toLocaleLowerCase('fi-FI')}|${g.unit}`;
      const n = needs.get(key) || { name: g.name.trim(), amount: 0, unit: g.unit, recipes: [] };
      n.amount += amount; n.recipes.push({ name: r.name, portions: r.portions, amount }); needs.set(key, n);
    }
  }
  if (needs.size > 60) throw new Error('Käsittele enintään 60 eri raaka-ainetta kerralla. Jaa menu pienempiin osiin.');
  return [...needs.values()].map((n) => {
    if (!positive(n.amount) || n.amount > 999999) throw new Error(`${n.name}: määrä on liian suuri.`);
    // Pyöristys tapahtuu vasta myyntipakkaukseen, pieniä maustemääriä ei pudoteta nollaan.
    return { ...n, amount: Number(n.amount.toPrecision(12)) };
  });
}
export function selectedRows(cards, selections) {
  const rows = new Map();
  cards.forEach((card, i) => {
    if (selections[i] === 'pantry') return;
    const p = card.list.find((p) => p.id === selections[i]);
    if (!p) throw new Error('Valitse tuote tai merkitse raaka-aine keittiöstä löytyväksi jokaiselle riville.');
    const row = rows.get(p.id) || { ...p, qty: 0 };
    row.qty += p.qty; rows.set(p.id, row);
  });
  return [...rows.values()].map((p) => ({ ...p, qty: Number(p.qty.toFixed(6)) }));
}
