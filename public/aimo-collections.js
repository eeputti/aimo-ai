// Demon tuoteryhmät. Tuotannossa href kytketään kaupan omaan kategoriahierarkiaan.
// Kohde päätellään pyydetystä tuotteesta, ei samalta kuulostavista hakutulosnimistä.
export const COLLECTIONS = {
  maitotaloustuotteet: { name: 'Maitotaloustuotteet', allLabel: 'Kaikki maitotaloustuotteet', categories: ['10400', '10401', '10404', '10405', '10411', '10412', '10419', '10430', '10431', '10432'] },
  'maidot-ja-piimat': { name: 'Maidot ja piimät', parent: 'maitotaloustuotteet', categories: ['10400'] },
  kermat: { name: 'Kermat', parent: 'maitotaloustuotteet', categories: ['10401'] },
  jogurtit: { name: 'Jogurtit', parent: 'maitotaloustuotteet', categories: ['10412'] },
  'kasvipohjaiset-juomat': { name: 'Kasvipohjaiset maidot ja juomat', categories: ['10402'] },
  'broileri-ja-kana': { name: 'Broileri ja kana', allLabel: 'Kaikki broileri- ja kanatuotteet', categories: ['18750', '41710', '41712'], namePattern: 'broiler|kananpo|\\bkana(?:n|a)?\\b|chicken' },
  'broilerin-rintafileet': { name: 'Broilerin rintafileet', parent: 'broileri-ja-kana', categories: ['18750', '41710', '41712'], namePattern: 'rintafile|rinta[ -]?file|chicken breast' },
  'broileri-pakasteet': { name: 'Broileri- ja kanapakasteet', parent: 'broileri-ja-kana', categories: ['41710', '41712'] },
  kananmunat: { name: 'Kananmunat', categories: ['10590'] },
  voi: { name: 'Voit', categories: ['10500', '10501', '10502'] },
};

export function collectionLink(id) {
  const c = Object.hasOwn(COLLECTIONS, id) ? COLLECTIONS[id] : null;
  return c ? { id, name: c.name, allLabel: c.allLabel || c.name, href: `/collection.html?group=${encodeURIComponent(id)}` } : null;
}

export function belongsToCollection(product, id) {
  const c = Object.hasOwn(COLLECTIONS, id) ? COLLECTIONS[id] : null;
  return !!c && (!c.parent || belongsToCollection(product, c.parent)) && c.categories.includes(product.category) && (!c.namePattern || new RegExp(c.namePattern, 'i').test(`${product.name} ${product.nameEn || ''}`));
}

const words = (text) => String(text || '').toLocaleLowerCase('fi-FI').match(/[\p{L}]+/gu) || [];
export function collectionLinksFor(item = {}) {
  // productTerm sisältää tulkinnan korjaukset (maitoo → maito, kana → broileri).
  const term = words(item.productTerm || item.label || item.raw);
  const has = (re) => term.some((word) => re.test(word));
  let id;
  if (item.productType === 'eggs' || has(/^(?:kananmun(?:a|at|ia|aa|an|ien|ii)?|kanamun(?:a|at|ia|aa|an)?|mun(?:a|at|ia|aa|an)|eggs?)$/)) id = 'kananmunat';
  else if (has(/^(?:kaura|soija|manteli|kookos|riisi|herne)(?:maito|juom)/) || has(/^(?:oat|soy|soya|almond|coconut|rice|pea)$/) && has(/^(?:milk|drink)$/) || item.productType === 'milk' && item.claims?.includes('VEGAN')) id = 'kasvipohjaiset-juomat';
  else if (has(/^(?:broiler|kana$|kanaa$|kanan$|kananpo|chicken|siipikar)/)) {
    id = has(/^rintafile|^breast/) ? 'broilerin-rintafileet'
      : item.attributes?.state === 'frozen' || has(/^pakast|^frozen/) ? 'broileri-pakasteet' : 'broileri-ja-kana';
  } else if (item.productType === 'milk' || has(/^(?:maito(?:a|o|ja|jen|juom[\p{L}]*)?|maido[\p{L}]*|kevytmaito[\p{L}]*|täysmaito[\p{L}]*|piim[\p{L}]*|milk)$/u)) id = 'maidot-ja-piimat';
  else if (item.productType === 'cream' || has(/^(?:kerma(?:a|t|n)?|kuohukerm[\p{L}]*|vispikerm[\p{L}]*|ruokakerm[\p{L}]*|cream)$/u)) id = 'kermat';
  else if (has(/^(?:jogur|jugur|jukur|yog[hu]urt)/)) id = 'jogurtit';
  else if (has(/^(?:maitotuot|maitotalous|dairy)/)) id = 'maitotaloustuotteet';
  else if (item.productType === 'butter' || has(/^(?:voi|voita|voin|butter)$/)) id = 'voi';
  if (!id) return [];
  return [id, COLLECTIONS[id].parent].filter(Boolean).map(collectionLink);
}

// Laaja tuoteryhmä on selauspyyntö: sitä ei arvailla yksittäiseksi raaka-aineeksi.
export function collectionBrowseRequest(text) {
  return /^(?:(?:näytä|selaa|hae|etsi)\s+)?(?:kaikki\s+)?(?:maitotuotte[\p{L}]*|maitotaloustuot[\p{L}]*|dairy(?:\s+products)?)[.!?]?$/iu.test(String(text || '').trim());
}
