import { addReviewedProducts } from './storefront-cart-actions.js';
import { recipeRequirements, selectedRows, UNITS, portionsOK } from './recipe-model.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: 5 });
const money = (n) => `${Number(n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateLabel = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
const DRAFT = 'aimo.recipe.draft.v1';
const cart = window.aimoCart;
const drop = $('#recipe-drop'); const fileInput = $('#recipe-file'); const dateInput = $('#recipe-date');
let recipes = []; let result = null; let selections = {}; let active = 0; let patches = []; let revision = 0;
let observedDate;
let controller = null; let busy = false; let imageURL = null; let extractedText = ''; let warnings = []; let extraText = '';

async function api(url, body, signal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  let data;
  try { data = await res.json(); } catch { throw new Error('Reseptipalveluun ei saatu yhteyttä. Yritä uudelleen.'); }
  if (!res.ok) throw new Error(data.error || 'Pyyntö epäonnistui.');
  return data;
}
function message(text = '', success = false) {
  const el = $('#recipe-message'); el.textContent = text; el.hidden = !text; el.classList.toggle('success', success);
}
function save() {
  try { sessionStorage.setItem(DRAFT, JSON.stringify({ recipes, date: dateInput.value, extractedText, warnings, extraText })); }
  catch { /* Käytettävissä oleva lomake säilyy; tallennus ei estä käyttöä. */ }
}
function invalidate() {
  revision++; result = null; selections = {}; $('#recipe-results').hidden = true; save();
}
function step(n) { document.querySelectorAll('.recipe-steps li').forEach((el, i) => el.classList.toggle('current', i === n)); }
function setBusy(value) {
  busy = value; drop.setAttribute('aria-busy', String(value));
  drop.querySelector('.drop-idle').hidden = value; drop.querySelector('.drop-working').hidden = !value;
  for (const el of document.querySelectorAll('#recipe-analyze, #recipe-manual, #recipe-add, #recipe-products, [data-example], #recipe-list input, #recipe-list select, #recipe-list button')) el.disabled = value;
  if (value) step(0);
}
function ingredientTotal(r, g) {
  return portionsOK(r.portions) && portionsOK(r.basePortions) && g.amount > 0 && UNITS[g.unit] ? `${num(g.amount * r.portions / r.basePortions)} ${UNITS[g.unit]} yhteensä` : 'Täydennä määrä';
}
function renderRecipes() {
  $('#recipe-review').hidden = !recipes.length;
  $('#recipe-list').innerHTML = recipes.map((r, i) => `<article class="recipe-dish" data-recipe="${i}">
    <div class="recipe-dish-top"><div class="recipe-dish-info"><span class="recipe-basis ${r.basis === 'source' ? 'source' : ''}">${r.basis === 'source' ? 'OMA RESEPTI, TARKISTA TULKINTA' : 'RESEPTIEHDOTUS, TARKISTA MÄÄRÄT'}</span><input class="recipe-dish-name" data-field="name" value="${esc(r.name)}" aria-label="Ruoan ${i + 1} nimi" maxlength="150"><p>${esc(r.note)}</p></div><label class="recipe-portion">Valmistettava annosmäärä<input type="number" data-field="portions" min="1" max="2000" step="1" value="${r.portions || ''}" placeholder="Annosta" required aria-label="${esc(r.name)}: valmistettava annosmäärä"></label><button type="button" class="recipe-remove" data-remove="${i}" aria-label="Poista ${esc(r.name)}">×</button></div>
    <details ${r.basePortions == null || r.ingredients.some((g) => !g.amount || !UNITS[g.unit]) ? 'open' : ''}><summary>Raaka-aineet ja määrät, ${r.ingredients.length} raaka-ainetta</summary><label class="recipe-base">Alla olevat määrät ovat <input type="number" data-field="basePortions" value="${r.basePortions || ''}" min="1" max="2000" step="1" required aria-label="${esc(r.name)}: alkuperäinen annosmäärä"> annokselle</label>
    <div class="recipe-ingredient recipe-ingredient-head"><span>Raaka-aine</span><span>Määrä</span><span>Yksikkö</span><span class="ingredient-total">Valmistettava määrä</span></div>
    ${r.ingredients.map((g, j) => `<div class="recipe-ingredient" data-ingredient="${j}"><input data-field="ingredient-name" value="${esc(g.name)}" maxlength="100" aria-label="Raaka-aine ${j + 1}"><input data-field="amount" type="number" min="0.000001" max="999999" step="any" value="${g.amount ?? ''}" aria-label="${esc(g.name || 'Raaka-aine')}: määrä"><select data-field="unit" aria-label="${esc(g.name || 'Raaka-aine')}: yksikkö"><option value="UNKNOWN" ${!UNITS[g.unit] ? 'selected' : ''}>Valitse</option>${Object.entries(UNITS).map(([v, label]) => `<option value="${v}" ${g.unit === v ? 'selected' : ''}>${label}</option>`).join('')}</select><span class="ingredient-total">${ingredientTotal(r, g)}</span><button type="button" data-remove-ingredient="${j}" aria-label="Poista raaka-aine ${esc(g.name)}">×</button></div>`).join('')}
    <button type="button" data-add-ingredient="${i}" class="recipe-text-button">＋ Lisää raaka-aine</button></details></article>`).join('');
  $('#recipe-warnings').innerHTML = warnings.map((w) => `<p>${esc(w)}</p>`).join('');
  if (extraText) $('#recipe-warnings').insertAdjacentHTML('beforeend', `<p>Mukana säilyvät myös muut pyytämäsi tuotteet: <b>${esc(extraText)}</b></p>`);
  $('#recipe-source').hidden = !extractedText; $('#recipe-source pre').textContent = extractedText;
  if (recipes.length) step(1);
}
function blankRecipe() {
  recipes.push({ name: 'Oma resepti', note: 'Kirjoita raaka-aineet ja alkuperäinen annosmäärä. Valmistettava annosmäärä skaalaa tarpeen.', basis: 'source', basePortions: null, portions: null, ingredients: [{ name: '', amount: null, unit: 'KG' }] });
  invalidate(); renderRecipes(); $('#recipe-list').lastElementChild.querySelector('input').focus();
}
async function analyze(input, file) {
  if (busy) return;
  message(); controller = new AbortController(); const task = controller;
  if (imageURL) URL.revokeObjectURL(imageURL); imageURL = null;
  const img = $('#scan-image'); img.hidden = true; img.removeAttribute('src');
  if (file?.type.startsWith('image/')) { imageURL = URL.createObjectURL(file); img.src = imageURL; img.hidden = false; }
  drop.querySelector('.scan-document').hidden = !img.hidden;
  $('#scan-detail').textContent = file ? `Luen tiedostoa ${file.name}. Tunnistan ruoat, annokset ja raaka-aineet.` : 'Luen koko tekstin ja kokoan raaka-aineet.';
  setBusy(true);
  try {
    if (file) {
      if (file.size > 5 * 1024 * 1024) throw new Error('Tiedoston enimmäiskoko on 5 Mt.');
      if (!/\.(png|jpe?g|webp|xlsx|csv|tsv|txt)$/i.test(file.name)) throw new Error('Valitse PNG-, JPG-, WebP-, XLSX-, CSV-, TSV- tai TXT-tiedosto.');
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Tiedostoa ei voitu lukea.')); reader.readAsDataURL(file); });
      input = { ...input, file: { name: file.name, data } };
    }
    if (task.signal.aborted) return;
    const data = await api('/api/recipes/analyze', input, task.signal);
    if (task !== controller) return;
    if (recipes.length + data.recipes.length > 35) throw new Error('Menussa voi olla enintään 35 ruokaa. Poista ruokia tai käsittele pienempi osa kerrallaan.');
    recipes.push(...data.recipes); extractedText = [extractedText, data.extractedText].filter(Boolean).join('\n\n'); warnings.push(...(data.warnings || []));
    invalidate(); renderRecipes(); message(`Luettu ${data.recipes.length} ${data.recipes.length === 1 ? 'ruoka' : 'ruokaa'}. Tarkista annosmäärät ja raaka-aineet.`, true);
    $('#recipe-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { if (err.name !== 'AbortError') message(err.message || 'Lukeminen epäonnistui.'); }
  finally { if (task === controller) { controller = null; setBusy(false); if (recipes.length) step(1); } fileInput.value = ''; }
}

function renderShelf() {
  if (!result) return;
  $('#recipe-results').hidden = false; step(2);
  const { needs, cards } = result;
  $('#recipe-result-summary').textContent = `${needs.length} raaka-ainetta, toimitus ${dateLabel(result.deliveryDate)} Valitse sopivat tuotteet ja tarkista pakkausmäärät.${result.mode === 'sim' ? ' Hinnat ja saatavuus ovat simuloituja.' : ''}`;
  $('#ingredient-tabs').innerHTML = needs.map((n, i) => `<button type="button" data-tab="${i}" class="${i === active ? 'on' : ''}" aria-pressed="${i === active}"><span>${esc(n.name)}<small>${num(n.amount)} ${UNITS[n.unit]}${selections[i] === 'pantry' ? ', keittiössä' : ''}</small></span><span class="ingredient-mark" aria-label="${selections[i] ? 'Käsitelty' : 'Valitsematta'}">${selections[i] ? '✓' : '○'}</span></button>`).join('');
  const n = needs[active]; const card = cards[active];
  $('#ingredient-heading').innerHTML = `<div class="ingredient-heading-top"><div><h3>${esc(n.name)}</h3><p>Tarve ${num(n.amount)} ${UNITS[n.unit]}${n.recipes?.length ? `, ${n.recipes.map((r) => `${esc(r.name)} ${r.portions ? `(${r.portions} ann.)` : ''}`).join(', ')}` : ''}<br>${card.list.length} vaihtoehtoa toimituspäivälle ${dateLabel(result.deliveryDate)}</p></div><label><input type="checkbox" id="ingredient-pantry" ${selections[active] === 'pantry' ? 'checked' : ''}>Löytyy jo keittiöstä</label></div>`;
  const applied = patches.filter((p) => p.item === active);
  $('#ingredient-filters').innerHTML = `${applied.map((p) => `<button type="button" class="on" data-unfilter="${patches.indexOf(p)}">${esc(p.label)} ×</button>`).join('')}${(card.chips || []).filter((c) => !applied.some((p) => p.label === c.label)).map((c, i) => `<button type="button" data-filter="${i}">${esc(c.label)} ＋</button>`).join('')}`;
  // Bind filters by label rather than position after removing already applied chips.
  $('#ingredient-filters').querySelectorAll('[data-filter]').forEach((b) => { b.dataset.label = b.textContent.replace(/ ＋$/, ''); });
  $('#recipe-product-grid').innerHTML = card.list.length ? card.list.map((p) => {
    const per = p.quantityExplanation;
    const coverage = p.coverage ? `${num(p.coverage.provided)} ${UNITS[p.coverage.unit]} toimitetaan, tarve ${num(p.coverage.required)} ${UNITS[p.coverage.unit]}` : per?.requestedItems ? `${num(per.providedItems)} kpl, tarve ${num(per.requestedItems)} kpl` : null;
    return `<article class="recipe-product ${selections[active] === p.id ? 'selected' : ''}"><div class="recipe-product-image"><img src="/img/${encodeURIComponent(p.id)}" alt="" loading="lazy"></div><span class="product-brand">${esc(p.brand || 'Aimo valikoima')}</span><h4>${esc(p.name)}</h4><p class="product-fit">✓ Toimitus ${dateLabel(p.availability.deliveryDate)}${p.availability.stock == null ? '<br>Saldon tarkka määrä ei tiedossa' : ''}</p><p class="product-quantity">${num(p.qty)} ${esc(p.unitLabel)}<small>${coverage ? esc(coverage) : `Pakkausmäärä kattaa ${num(n.amount)} ${UNITS[n.unit]} tarpeen`}</small>${p.substituteFor ? `<small>Korvaava vaihtoehto: tarkista soveltuvuus reseptiin.</small>` : ''}${p.warnings?.length ? `<small>${esc(p.warnings.join(', '))}</small>` : ''}</p><p class="product-price">${money(p.price * p.qty)}<small>${money(p.price)} / ${esc(p.unitLabel)}, alv 0 %</small></p><button type="button" data-product="${esc(p.id)}" aria-pressed="${selections[active] === p.id}">${selections[active] === p.id ? '✓ Valittu' : 'Valitse tuote'}</button></article>`;
  }).join('') : '<p class="recipe-no-products">Ei tilattavia tuotteita tälle päivälle ja määrälle. Muokkaa toimituspäivää, raaka-ainetta tai annosmäärää. Jos tuote löytyy keittiöstä, voit merkitä sen yllä.</p>';
  $('#recipe-product-grid').querySelectorAll('img').forEach((img) => img.addEventListener('error', () => { img.parentElement.classList.add('no-image'); img.remove(); }, { once: true }));
  const complete = needs.every((_, i) => selections[i]); const selected = Object.values(selections).filter((p) => p !== 'pantry').length;
  const sum = cards.reduce((sum, c, i) => sum + (c.list.find((p) => p.id === selections[i])?.price || 0) * (c.list.find((p) => p.id === selections[i])?.qty || 0), 0);
  $('#recipe-selection-count').textContent = `${Object.keys(selections).length} / ${needs.length} raaka-ainetta käsitelty`;
  $('#recipe-selection-total').textContent = `${money(sum)}, alv 0 %`;
  $('#recipe-to-cart').disabled = !complete || !selected || busy;
}

async function products({ filter = false } = {}) {
  if (busy) return;
  try { recipeRequirements(recipes); } catch (err) { message(err.message); return; }
  if (!dateInput.value) { message('Valitse toimituspäivä.'); dateInput.focus(); return; }
  const mine = ++revision; const requestedDate = dateInput.value;
  controller = new AbortController(); const task = controller;
  message('Etsin raaka-aineille tuotteet ja tarkistan toimituspäivän…'); setBusy(true); $('#recipe-to-cart').disabled = true;
  $('#scan-title').textContent = 'Etsin sopivat tuotteet…'; $('#scan-detail').textContent = 'Tarkistan hinnat, pakkauskoot ja toimituspäivän.';
  try {
    const data = await api('/api/recipes/products', { recipes, deliveryDate: requestedDate, patches }, task.signal);
    if (extraText) {
      const extra = await api('/api/storefront/search', { text: extraText, deliveryDate: requestedDate, llm: true }, task.signal);
      if (extra.handoff || extra.understood.unparsed?.length || !extra.understood.items.length || extra.understood.items.some((it) => !it.quantity)) throw new Error('Muu tuotelista jäi epäselväksi. Tarkista se tuotehaussa ennen jatkamista.');
      if (extra.deliveryDate !== data.deliveryDate) throw new Error('Muulla tuotelistalla on eri toimituspäivä. Valitse sama toimituspäivä.');
      data.needs.push(...extra.understood.items.map((it) => ({ name: it.productTerm, amount: it.quantity.value, unit: it.quantity.unit, recipes: [] })));
      data.cards.push(...extra.cards);
    }
    if (mine !== revision || requestedDate !== dateInput.value) return;
    const old = selections; result = data; selections = {}; active = Math.min(active, data.needs.length - 1);
    if (filter) data.cards.forEach((c, i) => { if (old[i] === 'pantry' || c.list.some((p) => p.id === old[i])) selections[i] = old[i]; });
    message(); renderShelf(); $('#recipe-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { if (mine === revision) { result = null; $('#recipe-results').hidden = true; message(err.name === 'AbortError' ? 'Tuotehaku peruutettiin. Reseptit säilyivät.' : err.message); } }
  finally { if (controller === task) controller = null; setBusy(false); $('#scan-title').textContent = 'Luen menuasi…'; if (result) renderShelf(); }
}

async function addToCart() {
  if (!result || busy) return;
  const snapshot = result; const mine = revision; const date = result.deliveryDate;
  try {
    const rows = selectedRows(result.cards, selections);
    if (!rows.length) throw new Error('Kaikki raaka-aineet löytyvät jo keittiöstä. Koriin ei lisätty tuotteita.');
    busy = true; $('#recipe-to-cart').disabled = true;
    await addReviewedProducts(cart, rows, date, { beforeCommit: () => {
      if (mine !== revision || snapshot !== result || dateInput.value !== date) throw new Error('Resepti tai toimituspäivä muuttui. Hae tuotteet uudelleen.');
    } });
    location.href = '/cart.html#tarkista';
  } catch (err) { message(err.message); busy = false; renderShelf(); }
}

drop.addEventListener('click', (ev) => { if (!busy && ev.target !== fileInput) fileInput.click(); });
drop.addEventListener('keydown', (ev) => { if (ev.target === drop && ['Enter', ' '].includes(ev.key)) { ev.preventDefault(); if (!busy) fileInput.click(); } });
drop.addEventListener('dragover', (ev) => { ev.preventDefault(); if (!busy) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', (ev) => { if (!drop.contains(ev.relatedTarget)) drop.classList.remove('dragging'); });
drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('dragging'); if (busy) return; const files = [...(ev.dataTransfer.files || [])]; if (files.length > 1) { message('Tuo yksi tiedosto kerrallaan. Voit lisätä seuraavan samaan menuun.'); return; } if (files[0]) analyze({}, files[0]); else if (ev.dataTransfer.getData('text/plain')) analyze({ text: ev.dataTransfer.getData('text/plain') }); });
// Estä selainta avaamasta sivun ulkopuolelle pudotettua tiedostoa ja hävittämästä lomaketta.
window.addEventListener('dragover', (ev) => ev.preventDefault()); window.addEventListener('drop', (ev) => ev.preventDefault());
document.addEventListener('paste', (ev) => { const files = [...(ev.clipboardData?.files || [])]; if (files.length && !busy) { ev.preventDefault(); if (files.length > 1) message('Liitä yksi kuva kerrallaan.'); else analyze({}, files[0]); } });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) analyze({}, fileInput.files[0]); });
$('#recipe-cancel').addEventListener('click', (ev) => { ev.stopPropagation(); controller?.abort(); });
$('#recipe-analyze').addEventListener('click', () => { const text = $('#recipe-text').value.trim(); if (text) analyze({ text }); else { message('Kerro mitä valmistat tai liitä menu.'); $('#recipe-text').focus(); } });
$('#recipe-manual').addEventListener('click', blankRecipe); $('#recipe-add').addEventListener('click', blankRecipe);
document.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => analyze({ recipeId: b.dataset.example })));
$('#recipe-products').addEventListener('click', () => { patches = []; products(); });
$('#recipe-to-cart').addEventListener('click', addToCart);
dateInput.addEventListener('change', () => {
  if (!dateInput.value) { dateInput.value = cart.get().selectedDate; return; }
  try { observedDate = dateInput.value; cart.select(dateInput.value); invalidate(); message('Toimituspäivä vaihtui. Etsi tuotteet uudelleen uudelle päivälle.'); }
  catch { dateInput.value = observedDate = cart.get().selectedDate; message('Tarkista toimituspäivä.'); }
});
window.addEventListener('aimo:cart-change', () => {
  const date = cart.get().selectedDate;
  if (observedDate == null || date === observedDate) return;
  observedDate = date; dateInput.value = date; invalidate(); message('Toimituspäivä vaihtui. Etsi tuotteet uudelleen uudelle päivälle.');
});
$('#recipe-list').addEventListener('input', (ev) => {
  const box = ev.target.closest('[data-recipe]'); if (!box) return;
  const r = recipes[+box.dataset.recipe]; const g = r.ingredients[+ev.target.closest('[data-ingredient]')?.dataset.ingredient];
  const field = ev.target.dataset.field;
  if (field === 'name') r.name = ev.target.value;
  if (field === 'portions' || field === 'basePortions') r[field] = ev.target.value ? Number(ev.target.value) : null;
  if (g && field === 'ingredient-name') g.name = ev.target.value;
  if (g && field === 'amount') g.amount = ev.target.value ? Number(ev.target.value) : null;
  if (g && field === 'unit') g.unit = ev.target.value;
  box.querySelectorAll('[data-ingredient]').forEach((row, i) => { row.querySelector('.ingredient-total').textContent = ingredientTotal(r, r.ingredients[i]); });
  invalidate();
});
$('#recipe-list').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  const r = recipes[+b.closest('[data-recipe]').dataset.recipe];
  if (b.hasAttribute('data-remove')) recipes.splice(+b.dataset.remove, 1);
  else if (b.hasAttribute('data-remove-ingredient')) r.ingredients.splice(+b.dataset.removeIngredient, 1);
  else if (b.hasAttribute('data-add-ingredient')) r.ingredients.push({ name: '', amount: null, unit: 'KG' });
  invalidate(); renderRecipes();
});
$('#ingredient-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b && !busy) { active = +b.dataset.tab; renderShelf(); } });
$('#ingredient-heading').addEventListener('change', (ev) => { if (ev.target.id === 'ingredient-pantry' && !busy) { if (ev.target.checked) selections[active] = 'pantry'; else delete selections[active]; renderShelf(); } });
$('#recipe-product-grid').addEventListener('click', (ev) => { const b = ev.target.closest('[data-product]'); if (!b || busy) return; if (selections[active] === b.dataset.product) delete selections[active]; else selections[active] = b.dataset.product; renderShelf(); });
$('#ingredient-filters').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b || busy) return;
  if (b.hasAttribute('data-unfilter')) patches.splice(+b.dataset.unfilter, 1);
  else { const chip = result.cards[active].chips.find((c) => c.label === b.dataset.label); if (!chip) return; patches.push({ item: active, patch: chip.patch, label: chip.label }); }
  products({ filter: true });
});

await cart.ready;
dateInput.min = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' }); dateInput.value = observedDate = cart.get().selectedDate;
try {
  const draft = JSON.parse(sessionStorage.getItem(DRAFT));
  if (draft && Array.isArray(draft.recipes) && draft.recipes.length <= 35) { recipes = draft.recipes; extractedText = draft.extractedText || ''; warnings = draft.warnings || []; extraText = draft.extraText || ''; renderRecipes(); }
} catch { /* Uusi sivu toimii ilman tallennustilaa. */ }
const headerSearch = document.querySelector('.main-header .search');
window.aimoAsk?.attach({ box: headerSearch, input: headerSearch.querySelector('input'), icon: headerSearch.querySelector('.icon') });
const params = new URLSearchParams(location.search);
if (params.get('q')) {
  const q = params.get('q').slice(0, 600); const p = Number(params.get('portions')); extraText = (params.get('extra') || '').slice(0, 600);
  $('#recipe-text').value = `${q}${portionsOK(p) ? ` ${p} annosta` : ''}`;
  if (params.get('when')) {
    try { const parsed = await api('/api/aimo/interpret', { text: `1 l maitoa ${params.get('when').slice(0, 80)}`, llm: false }); if (parsed.understood.deliveryDate) { dateInput.value = observedDate = parsed.understood.deliveryDate; cart.select(observedDate); } } catch { message('Tarkista pyynnön toimituspäivä.'); }
  }
  history.replaceState(null, '', '/recipes.html');
  await analyze({ text: $('#recipe-text').value });
}
