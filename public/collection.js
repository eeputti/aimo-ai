import { COLLECTIONS, collectionLink } from './aimo-collections.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const params = new URLSearchParams(location.search);
const id = params.get('group');
const group = Object.hasOwn(COLLECTIONS, id) ? COLLECTIONS[id] : null;
const from = params.get('from') === '/cart.html' ? '/cart.html' : '/';
const original = (params.get('q') || '').slice(0, 1000);
const $ = (selector) => document.querySelector(selector);
$('#collection-back').href = original ? `${from}?ask=${encodeURIComponent(original)}` : from;
const link = (key, label) => {
  const c = collectionLink(key);
  return `<a href="${esc(c.href)}&q=${encodeURIComponent(original)}&from=${encodeURIComponent(from)}">${esc(label || c.name)} →</a>`;
};

let products = []; let shown = 24;
function render() {
  const term = $('#collection-find').value.trim().toLocaleLowerCase('fi-FI');
  const matched = products.filter((p) => `${p.name} ${p.id}`.toLocaleLowerCase('fi-FI').includes(term));
  $('#collection-count').textContent = `${matched.length} tuotetta${term ? ` hakusanalla ”${$('#collection-find').value.trim()}”` : ''}`;
  $('#collection-products').innerHTML = matched.slice(0, shown).map((p) => `<li><span class="collection-product-mark" aria-hidden="true">${esc(p.name.slice(0, 1))}</span><div><b>${esc(p.name)}</b><span>Tuotenumero ${esc(p.id)} · Myyntiyksikkö ${esc(p.unit)}</span></div><button type="button" class="solid-button" data-shop-product="${esc(p.id)}">Valitse tuote</button></li>`).join('');
  $('#collection-more').hidden = shown >= matched.length;
  if (matched.length > shown) $('#collection-more').textContent = `Näytä lisää (${Math.min(24, matched.length - shown)} tuotetta)`;
}

if (!group) {
  $('#collection-title').textContent = 'Tuoteryhmää ei löytynyt';
  $('#collection-find').hidden = true;
  $('#collection-error').hidden = false;
  $('#collection-error').textContent = 'Palaa hakuun ja valitse toinen tuoteryhmä.';
} else {
  document.title = `${group.name} | Valio Aimo® toimitustukku`;
  $('#collection-title').textContent = group.name;
  $('#collection-breadcrumb').innerHTML = `<a href="/">Etusivu</a><span aria-hidden="true">/</span>${group.parent ? `${link(group.parent)}<span aria-hidden="true">/</span>` : ''}<span aria-current="page">${esc(group.name)}</span>`;
  const related = Object.keys(COLLECTIONS).filter((key) => COLLECTIONS[key].parent === id);
  $('#collection-related').innerHTML = [...(group.parent ? [link(group.parent, COLLECTIONS[group.parent].allLabel)] : []), ...related.map((key) => link(key))].join('');
  const query = { 'maidot-ja-piimat': 'maito', kermat: 'kerma', jogurtit: 'jogurtti', 'kasvipohjaiset-juomat': 'kauramaito', 'broileri-ja-kana': 'broileri', 'broilerin-rintafileet': 'broilerin rintafilee', 'broileri-pakasteet': 'broileri pakaste', kananmunat: 'kananmunat', voi: 'voi' }[id];
  if (query) {
    $('#collection-search').hidden = false;
    $('#collection-search').addEventListener('click', () => window.aimoAsk.open(query));
  }
  $('#collection-find').addEventListener('input', () => { shown = 24; render(); });
  $('#collection-more').addEventListener('click', () => { shown += 24; render(); });
  try {
    const response = await fetch('/storefront-collections.json');
    if (!response.ok) throw new Error();
    const data = await response.json();
    const ids = new Set(data.groups[id]);
    products = data.products.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'fi'));
    render();
  } catch {
    $('#collection-error').hidden = false;
    $('#collection-error').textContent = 'Tuoteryhmää ei saatu ladattua. Kokeile sivun päivitystä.';
  }
}

document.querySelector('#collection-products')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-shop-product]');
  if (button) window.aimoAsk.open(button.dataset.shopProduct);
});
