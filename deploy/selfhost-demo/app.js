const $ = (id) => document.getElementById(id);
let busy = false; let pending = null;
function bubble(text, role) { const p = document.createElement('p'); p.className = role; for (const part of text.split(/(\*[^*\n]+\*)/g)) { const node = part.startsWith('*') && part.endsWith('*') ? document.createElement('strong') : document.createTextNode(part); if (node.nodeType === 1) node.textContent = part.slice(1, -1); p.append(node); } $('log').append(p); p.scrollIntoView({ block: 'nearest' }); }
function render(cart) {
  $('cart').replaceChildren();
  for (const line of cart?.lines || []) {
    const li = document.createElement('li');
    li.textContent = `${line.selectedName || line.productTerm} · ${line.quantity ? `${line.quantity.value} ${line.quantity.unit.toLowerCase()}` : 'määrä puuttuu'}`;
    $('cart').append(li);
  }
  $('date').textContent = cart?.deliveryDate ? `Toimituspäivä ${cart.deliveryDate}` : 'Toimituspäivää ei ole vielä valittu.';
  const labels = { needs_details: 'Täydennä puuttuvat tiedot keskustelussa.', needs_product_selection: 'Valitse tuote vastaamalla vaihtoehdon numerolla.', review: 'Ostoslista on koottu. Voit vielä muuttaa sitä.' };
  $('cart-state').textContent = labels[cart?.status] || 'Ostoslista on tyhjä.';
}
async function status() {
  try {
    const res = await fetch('/api/status'); const data = await res.json();
    $('model').textContent = `${data.model} · ${data.message}`;
    $('products').replaceChildren(...(data.products || []).map((name) => { const li = document.createElement('li'); li.textContent = name; return li; }));
  } catch { $('model').textContent = 'Demopalvelimeen ei saatu yhteyttä.'; }
}
async function send(retry = false) {
  if (busy) return;
  if (!retry) { const text = $('text').value.trim(); if (!text) return; pending = { id: crypto.randomUUID(), text }; bubble(text, 'user'); $('text').value = ''; }
  busy = true; $('send').disabled = true; $('retry').hidden = true; $('feedback').textContent = 'Malli käsittelee viestiä…';
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Viestin käsittely epäonnistui.');
    bubble(data.text, 'assistant'); render(data.cart); $('feedback').textContent = `${(data.ms / 1000).toFixed(1)} s · ${data.model}`; pending = null;
  } catch (err) { $('feedback').textContent = err.message; $('retry').hidden = false; }
  finally { busy = false; $('send').disabled = false; }
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); send(); });
$('retry').addEventListener('click', () => send(true));
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => { if (!busy) { $('text').value = button.dataset.example; $('text').focus(); } });
status(); fetch('/api/cart').then((r) => r.json()).then((data) => render(data.cart)).catch(() => {});
