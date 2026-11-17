const $ = (id) => document.getElementById(id);
let busy = false; let pending = null;
try { pending = JSON.parse(sessionStorage.getItem('aimo-live-pending') || 'null'); } catch {}
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
  if (!retry) { const text = $('text').value.trim(); if (!text) return; pending = { id: crypto.randomUUID(), text }; sessionStorage.setItem('aimo-live-pending', JSON.stringify(pending)); bubble(text, 'user'); $('text').value = ''; }
  busy = true; $('send').disabled = true; $('retry').hidden = true; $('feedback').textContent = 'Malli käsittelee viestiä…';
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
    let data = await res.json(); if (!res.ok) throw new Error(data.error || 'Viestin käsittely epäonnistui.');
    const began = Date.now();
    if (res.status === 202) {
      const id = data.id;
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const poll = await fetch('/api/jobs/' + encodeURIComponent(id)); const job = await poll.json();
        if (!poll.ok) throw new Error(job.error || 'Vastausta ei saatu.');
        if (job.done) { data = job.result; break; }
        $('feedback').textContent = `Malli käsittelee viestiä… ${Math.round((Date.now() - began) / 1000)} s. Voit odottaa tällä sivulla.`;
      }
    }
    bubble(data.text, 'assistant'); render(data.cart); $('feedback').textContent = `${(data.ms / 1000).toFixed(1)} s · ${data.model}`; pending = null; sessionStorage.removeItem('aimo-live-pending');
  } catch (err) { $('feedback').textContent = err.message; $('retry').hidden = false; }
  finally { busy = false; $('send').disabled = false; }
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); send(); });
$('retry').addEventListener('click', () => send(true));
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => { if (!busy) { $('text').value = button.dataset.example; $('text').focus(); } });
async function init() {
  await status();
  try {
    const [cart, history] = await Promise.all([fetch('/api/cart').then(r => r.json()), fetch('/api/history').then(r => r.json())]);
    render(cart.cart);
    for (const m of history.messages || []) { bubble(m.input, 'user'); bubble(m.text, 'assistant'); }
    if (pending) { bubble(pending.text, 'user'); send(true); }
  } catch { $('feedback').textContent = 'Palvelun tietojen lataus ei onnistunut. Päivitä sivu.'; }
}
init(); setInterval(status, 20000);
