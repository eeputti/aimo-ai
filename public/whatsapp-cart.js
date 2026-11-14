const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
// The fragment survives reloads without reaching HTTP access logs or link previews.
const storageKey = `aimo.whatsapp-cart.pending.${token.slice(-24)}`;
let list; let busy = false; let reviewed = false; let pending = null;
try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* Read-only browsing still works. */ }
const claims = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu' };
const allergens = { AM: 'maidoton', AW: 'ei gluteeniviljoja', AE: 'munaton', AN: 'pähkinätön', AP: 'ei maapähkinää', AF: 'kalaton', AY: 'soijaton' };
const diet = (value) => [...(value.claims || []).map((c) => claims[c] || c), ...(value.excludeAllergens || []).map((c) => allergens[c] || c)].join(', ');
function controls() {
  for (const element of document.querySelectorAll('button, input')) element.disabled = busy || !list || !!pending;
  $('retry').hidden = !pending;
  $('retry').disabled = busy;
  $('confirm').hidden = !reviewed || !list || !!pending;
}
async function request(path = '', input) {
  const response = await fetch(`/whatsapp/cart/api${path}`, {
    headers: { authorization: `Bearer ${token}`, ...(input ? { 'content-type': 'application/json' } : {}) },
    ...(input ? { method: 'POST', body: JSON.stringify(input) } : {}), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Ostoskoria ei voitu avata.'), { status: response.status });
  return data;
}
function render(value) {
  list = value;
  $('basket').hidden = !list;
  if (!list) { controls(); return; }
  $('company').textContent = list.companyName;
  $('delivery').textContent = list.deliveryDate ? new Intl.DateTimeFormat('fi-FI', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${list.deliveryDate}T12:00:00Z`)) : 'Valitse toimituspäivä';
  $('diet').textContent = list.diet.known ? `Ruokavaliot: ${diet(list.diet) || 'ei yleisiä erityisvaatimuksia'}` : 'Kerro mahdolliset ruokavaliot ennen tilaamista.';
  $('lines').replaceChildren(...list.lines.map((line) => {
    const row = document.createElement('li'); const details = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = line.selectedName || line.productTerm; details.append(name);
    const note = document.createElement('small'); note.textContent = [!line.selectedProductId ? 'Tarkka tuote valitaan ennen vahvistamista' : '', diet(line)].filter(Boolean).join(', '); details.append(note);
    const quantity = document.createElement('span'); quantity.className = 'quantity';
    const q = line.quantity;
    quantity.textContent = q ? `${String(q.value).replace('.', ',')} ${q.unit === 'L' ? 'l' : q.unit === 'KG' ? 'kg' : q.basis === 'sales' ? 'myyntipakkausta' : 'kpl'}` : 'Määrä puuttuu';
    row.append(details, quantity); return row;
  }));
  controls();
}
async function load() {
  reviewed = false;
  const data = await request(); render(data.shoppingList);
  $('status').textContent = pending ? 'Aiemman pyynnön tulos on vielä tarkistettava. Yritä samaa pyyntöä uudelleen.' : 'WhatsAppissa kokoamasi ostoskori on ajan tasalla.';
}
async function send(text, review = false) {
  if (busy || (!list && !pending)) return;
  if (!pending) {
    pending = { text, messageId: crypto.randomUUID(), expectedList: { id: list.id, revision: list.revision }, review };
    try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
    catch { pending = null; $('status').textContent = 'Salli selaimen istuntotallennus ennen tilauksen muuttamista tai vahvistamista.'; return; }
  }
  busy = true; reviewed = false; controls(); $('status').textContent = 'Tarkistetaan tilausta…';
  try {
    const wasReview = pending.review;
    const data = await request('/chat', pending);
    pending = null; sessionStorage.removeItem(storageKey);
    render(data.shoppingList);
    $('reply').textContent = data.status === 'ready'
      ? data.text.replace(/(?:Vahvista(?: valmis)?(?: tilaus)? vastaamalla|vastaa)\s+\*?TILAA\*?(?:,\s*kun haluat tilata)?[.!]?/giu, 'Vahvista tilaus alla olevasta painikkeesta.')
      : data.text;
    $('review-panel').hidden = false;
    reviewed = wasReview && data.status === 'ready' && !!list;
    if (['confirmed', 'pending_approval'].includes(data.status)) {
      $('edit-form').hidden = true; $('review').hidden = true;
      $('status').textContent = data.text;
    } else $('status').textContent = reviewed ? 'Tarkista alla oleva yhteenveto. Vahvista vasta, kun kaikki on oikein.' : 'Täydennä puuttuvat tiedot ja tarkista tilaus uudelleen.';
    $('message').value = '';
  } catch (error) {
    if ([400, 403, 409, 410, 413, 415].includes(error.status)) {
      pending = null; sessionStorage.removeItem(storageKey);
      if (error.status === 409) {
        try { await load(); } catch { render(null); }
        $('review-panel').hidden = true;
      } else if ([403, 410].includes(error.status)) render(null);
    }
    $('status').textContent = error.message;
  } finally { busy = false; controls(); }
}
$('review').addEventListener('click', () => { void send('näytä', true); });
$('confirm').addEventListener('click', () => { if (reviewed) void send('TILAA'); });
$('retry').addEventListener('click', () => { if (pending) void send(pending.text, pending.review); });
$('edit-form').addEventListener('submit', (event) => { event.preventDefault(); const text = $('message').value.trim(); if (text && !pending) void send(text); });
if (token) load().catch((error) => {
  $('status').textContent = pending ? 'Aiemman pyynnön vastaus jäi saamatta. Tarkista sen tulos yrittämällä samaa pyyntöä uudelleen.' : error.message;
  render(null);
});
else { $('status').textContent = 'Avaa ostoskori WhatsApp-apurin lähettämästä linkistä.'; render(null); }
