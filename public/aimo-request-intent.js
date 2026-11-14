// Sama reititys kirjoitetulle ja sanelulle tarpeelle. Moduuli ei lisää tuotteita eikä tee tilauksia.
const NUMBER = { yksi: 1, kaksi: 2, kolme: 3, neljä: 4, viisi: 5, kuusi: 6, seitsemän: 7, kahdeksan: 8, yhdeksän: 9, kymmenen: 10, kaksikymmentä: 20, viisikymmentä: 50, sata: 100, sadalle: 100, tuhat: 1000 };
const N = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER).join('|')})`;
const PORTIONS = new RegExp(`\\b(${N})\\s*(?:annos[\\p{L}]*|henge[\\p{L}]*|henkilö[\\p{L}]*|hlö|portions?|servings?)`, 'iu');
const WHEN = /\b(?:maanantai|tiistai|keskiviik|torstai|perjantai|lauantai|sunnuntai|huomis|ylihuomis)[\p{L}]*|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\d{1,2}\.(?:\d{4})?/iu;
const DISH = /\b(?:lohikeit[\p{L}]*|lohisop[\p{L}]*|mustikkarahk[\p{L}]*|kanacurry[\p{L}]*|broilericurry[\p{L}]*|riisipuur[\p{L}]*|joulupuur[\p{L}]*)/iu;
const cleanProducts = (s) => s.replace(/(?:\s*[,;]\s*|\s+\b(?:ja|sekä|lisäksi)\b\s*|\s+\b(?:tarvitsen|tarvitsemme|haluan|haluaisin|hae|vielä|myös|esim|esimerkiksi|tämmösen|tällaisen|sellaisen|jonkun)\b\s*)+$/giu, '').trim();
const cleanQuery = (s) => s.replace(/^[\s,;:]+|[\s,;:.!?]+$/g, '').replace(/^(?:(?:tarvitsen|haluan|haluaisin|hae|etsi|näytä|minulle|mulle|meille|resepti[\p{L}]*|ruoalle|ruokaan|nimeltä)\s+)+/iu, '')
  .replace(/\blohikeit(?:toa|toon|on|to)\b/giu, 'lohikeitto').replace(/\briisipuuro(?:a|on|n)?\b/giu, 'riisipuuro').replace(/\s+/g, ' ').trim();

export function routeRequest(value) {
  const text = String(value || '').trim();
  const cue = /\bresepti[\p{L}]*/iu.exec(text);
  const dish = DISH.exec(text);
  if (!cue && !(dish && PORTIONS.test(text))) return { productText: text, recipe: null };
  let productText = ''; let recipeText;
  if (cue) {
    productText = cleanProducts(text.slice(0, cue.index)); recipeText = text.slice(cue.index + cue[0].length).trim();
    // "Tarvitsen lohikeiton reseptin" on kokonaan reseptipyyntö.
    if (!recipeText) { recipeText = productText; productText = ''; }
    if (/^(?:tarvitsen|tarvitsemme|haluan|haluaisin|hae|etsi|näytä)?$/iu.test(productText)) productText = '';
  } else {
    const before = text.slice(0, dish.index); const amountBefore = PORTIONS.exec(before);
    productText = cleanProducts(before.replace(PORTIONS, '')); recipeText = [amountBefore?.[0], text.slice(dish.index)].filter(Boolean).join(' ');
    if (/^(?:tarvitsen|haluan|haluaisin|hae|etsi|näytä)?$/iu.test(productText)) productText = '';
  }
  // Reseptin jälkeenkin voi luetella ostettavaa: "resepti lohikeittoon ja 5 kg voita".
  const tail = new RegExp(`\\s+(?:ja|sekä|lisäksi)\\s+(?:vielä\\s+|tarvitsen\\s+|lisää\\s+)?(${N})\\s+(?!annos|henge|henkilö|hlö)`, 'iu').exec(recipeText);
  if (tail) { productText = [productText, recipeText.slice(tail.index).replace(/^\s*(?:ja|sekä|lisäksi)\s+/iu, '')].filter(Boolean).join(', '); recipeText = recipeText.slice(0, tail.index); }
  const amount = PORTIONS.exec(recipeText);
  const portions = amount ? (/^\d/.test(amount[1]) ? Number(amount[1].replace(',', '.')) : NUMBER[amount[1].toLowerCase()]) : null;
  const when = WHEN.exec(recipeText)?.[0] || '';
  const query = cleanQuery(recipeText.replace(PORTIONS, '').replace(WHEN, ''));
  return { productText: cleanProducts(productText), recipe: { query, portions, deliveryText: when } };
}

// Tuote- ja reseptitulokset haetaan erikseen, jotta reseptin laajennus ei pudota muuta ostoslistaa pois.
export function combineSearchResults(products, recipe) {
  if (!products) return recipe;
  if (!recipe) return products;
  if (products.error || recipe.error) return { error: products.error || recipe.error };
  if (products.deliveryDate !== recipe.deliveryDate) throw new Error('Tuotteilla ja reseptillä on eri toimituspäivät. Valitse niille sama päivä tai kokoa korit erikseen.');
  const items = [...(products.understood?.items || []), ...(recipe.understood?.items || [])];
  const offset = products.understood?.items?.length || 0;
  const assumptions = [...(products.understood?.assumptions || []), ...(recipe.understood?.assumptions || []).map((note) => Number.isInteger(note.item) ? { ...note, item: note.item + offset } : note)];
  return { ...recipe,
    understood: { ...recipe.understood, items, assumptions, unparsed: [...(products.understood?.unparsed || []), ...(recipe.understood?.unparsed || [])] },
    cards: [...(products.cards || []), ...(recipe.cards || [])].map((card, item) => ({ ...card, item })),
    handoff: products.handoff || recipe.handoff,
    trace: { ...recipe.trace, confidence: Math.min(products.trace?.confidence ?? 1, recipe.trace?.confidence ?? 1) },
  };
}
