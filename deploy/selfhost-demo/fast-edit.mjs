// Conservative demo-only edits. Never infer a product, unit, diet or delivery date.
const FORMS = {
  maito: ['maito', 'maitoa', 'maidon'], kerma: ['kerma', 'kermaa', 'kerman'],
  voi: ['voi', 'voita', 'voin'], kananmuna: ['kananmuna', 'kananmunaa', 'kananmunat', 'kananmunia', 'kananmunien'],
  peruna: ['peruna', 'perunaa', 'perunat', 'perunoita', 'perunoiden'],
  kaurajuoma: ['kaurajuoma', 'kaurajuomaa', 'kaurajuoman', 'kauramaito', 'kauramaitoa', 'kauramaidon'],
};
const termOf = (value) => {
  const words = String(value || '').toLocaleLowerCase('fi-FI').split(/\s+/);
  const allowed = new Set([...Object.values(FORMS).flat(), 'laktoositon', 'laktoositonta', 'tavallinen', 'tavallista', 'gluteeniton', 'gluteenitonta', 'luomu', 'vegaaninen']);
  if (words.some((w) => !allowed.has(w))) return null;
  const hits = Object.entries(FORMS).filter(([, forms]) => words.some((w) => forms.includes(w))).map(([term]) => term);
  return hits.length === 1 ? hits[0] : null;
};
const terms = Object.values(FORMS).flat().sort((a,b)=>b.length-a.length).join('|');
const number = '(\\d+(?:[.,]\\d+)?)';
const units = '(l|litra|litraa|litraan|kg|kilo|kiloa|kiloon|g|gramma|grammaa|grammaan|dl|desi|desiä|desilitraa|desilitraan|cl|senttilitraa|ml|millilitraa|millilitraan|kpl|kappaletta)';
const edit = new RegExp(`^(?:(?:muuta|vaihda|päivitä)\\s+)?(${terms})\\s+(?:määrä\\s+)?${number}\\s*${units}[.!]?$`, 'u');
const correction = new RegExp(`^(?:eikun|sittenkin)\\s+${number}\\s*${units}[.!]?$`, 'u');
const removal = new RegExp(`^poista\\s+(${terms})[.!]?$`, 'u');
const scaleOf = (unit) => /^(l|litra)/u.test(unit) ? [1,'L'] : /^(dl|desi)/u.test(unit) ? [0.1,'L']
  : /^(cl|sentti)/u.test(unit) ? [0.01,'L'] : /^(ml|milli)/u.test(unit) ? [0.001,'L']
    : /^(kg|kilo)/u.test(unit) ? [1,'KG'] : /^(g|gramma)/u.test(unit) ? [0.001,'KG'] : [1,'PCS'];
export function fastEdit({ text, draft }) {
  if (!Array.isArray(draft?.lines) || !draft.lines.length) return null;
  const t = String(text || '').trim().toLocaleLowerCase('fi-FI').replace(/\s+/g,' ');
  const remove = t.match(removal); const update = t.match(edit); const bare = t.match(correction);
  if (!remove && !update && !bare) return null;
  const term = (remove || update)?.[1];
  const lines = term ? draft.lines.filter((l) => termOf(l.productTerm) === termOf(term)) : draft.lines;
  if (lines.length !== 1 || !lines[0].ref) return null;
  const line = lines[0];
  if (remove) return { intent:'order', deliveryDate:null, via:'fast-edit', ops:[{op:'remove',ref:line.ref}] };
  const [value, unit] = update ? [update[2],update[3]] : [bare[1],bare[2]];
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(value)) return null; // Ambiguous thousands separator.
  const [scale, standard] = scaleOf(unit); const amount = Number((Number(value.replace(',','.')) * scale).toPrecision(12));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || line.quantity?.unit !== standard) return null;
  if (standard === 'PCS' && (line.quantity.basis === 'sales' || !Number.isInteger(amount))) return null;
  return { intent:'order', deliveryDate:null, via:'fast-edit', ops:[{op:'update',ref:line.ref,
    quantity:{value:amount,unit:standard,...(standard==='PCS'?{basis:'items'}:{})}}] };
}
