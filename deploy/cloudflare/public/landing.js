// Landing page sign-up: post the number, then follow this browser's own sign-up until WhatsApp opens.
const KEY = 'aimo.signup.v1';
const $ = id => document.getElementById(id);
const saved = {
  get() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && /^[0-9a-f-]{36}$/.test(v.id) && /^[A-Za-z0-9_-]{43}$/.test(v.token) ? v : null; } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* the page still works for this visit */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } },
};

const TEXT = {
  pending: ['Lisätään numeroasi apuriin', 'Tämä kestää yleensä muutaman sekunnin.'],
  slow: ['Lisätään numeroasi apuriin', 'Demopalvelin ei vastannut vielä. Sivu yrittää uudelleen itsestään, voit jättää sen auki.'],
  linked: ['Vahvista numerosi', 'Numerosi on lisätty apuriin. Seuraavaksi saat WhatsAppiin Metalta vahvistuskoodin. Kirjoita koodi tähän.'],
  codeSent: ['Koodi lähetetty', 'Aimo-tiimi syöttää koodin WhatsAppiin. Tämä sivu päivittyy itsestään, kun numerosi on hyväksytty.'],
  ready: ['Valmista! Avaa WhatsApp', 'Lähetä apurille viesti ja kerro, mitä keittiöösi tarvitaan. Apuri vastaa samassa keskustelussa.'],
  failed: ['Numeroa ei voitu lisätä', 'Tarkista numero ja yritä uudelleen.'],
};
const TRACK = {
  pending: { received: 'done', linked: 'current' },
  linked: { received: 'done', linked: 'done', approved: 'waiting' },
  ready: { received: 'done', linked: 'done', approved: 'done', ready: 'done' },
  failed: { received: 'done', linked: 'failed' },
};

let timer = 0, startedAt = 0, current = null, last = 'pending', inflight = false;

function show(status, chatUrl, codeSent = false) {
  last = status;
  $('signup-form').hidden = true;
  $('status').hidden = false;
  const slow = status === 'pending' && Date.now() - startedAt > 45000;
  const [title, detail] = TEXT[slow ? 'slow' : status === 'linked' && codeSent ? 'codeSent' : status] || TEXT.pending;
  $('code-form').hidden = status !== 'linked';
  $('code-submit').textContent = codeSent ? 'Lähetä uudelleen' : 'Lähetä';
  $('status-title').textContent = title;
  $('status-detail').textContent = detail;
  for (const li of document.querySelectorAll('.track li')) li.className = TRACK[status]?.[li.dataset.step] || '';
  const open = $('open-whatsapp');
  // The link comes from the server and is checked there; it is still only used when it opens WhatsApp.
  const safe = status === 'ready' && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(chatUrl || '');
  open.hidden = !safe;
  if (safe) open.href = chatUrl;
}

function showForm() {
  clearTimeout(timer); current = null;
  $('status').hidden = true;
  $('signup-form').hidden = false;
  $('submit').disabled = false;
}

async function poll() {
  if (!current || inflight) return;
  clearTimeout(timer);
  inflight = true;
  try {
    const response = await fetch(`/api/signups/${current.id}`, { headers: { authorization: `Bearer ${current.token}` }, cache: 'no-store' });
    if (response.status === 404) { saved.clear(); showForm(); return; }
    if (response.ok) {
      const body = await response.json();
      if (!(body.status === 'linked' && document.activeElement === $('code'))) show(body.status, body.chatUrl, body.codeSent);
      if (body.status === 'ready' || body.status === 'failed') return;
    } else show(last);
  } catch { show(last); }
  finally { inflight = false; }
  if (!current) return;
  // Every 3 s while someone is waiting; slower after a quarter of an hour or when the tab is hidden.
  const delay = document.hidden || Date.now() - startedAt > 15 * 60000 ? 15000 : 3000;
  timer = setTimeout(poll, delay);
}

function follow(signup, delay = 1500) {
  current = signup; startedAt = Date.now();
  clearTimeout(timer);
  show(signup.status || 'pending', signup.chatUrl);
  if (signup.status !== 'ready') timer = setTimeout(poll, delay);
}

function fieldError(field, message) {
  const error = $('form-error');
  error.textContent = message; error.hidden = false;
  for (const name of ['phone', 'name']) $(name).removeAttribute('aria-invalid');
  if (field && $(field)) { $(field).setAttribute('aria-invalid', 'true'); $(field).focus(); }
}

$('signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('form-error').hidden = true;
  const phone = $('phone').value.trim(), name = $('name').value.trim();
  if (!phone) return fieldError('phone', 'Anna puhelinnumerosi.');
  if (!name) return fieldError('name', 'Kerro nimesi.');
  if (!$('consent').checked) return fieldError('consent', 'Hyväksy numerosi käyttö tässä demossa.');
  $('submit').disabled = true;
  $('submit').textContent = 'Lähetetään…';
  try {
    const response = await fetch('/api/signups', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, name, consent: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fieldError(body.field, body.error || 'Ilmoittautuminen ei onnistunut. Yritä uudelleen.');
    const signup = { id: body.id, token: body.token, status: body.status, chatUrl: body.chatUrl };
    saved.set({ id: signup.id, token: signup.token });
    follow(signup);
  } catch {
    fieldError(null, 'Yhteys katkesi. Tarkista verkko ja yritä uudelleen.');
  } finally {
    $('submit').disabled = false;
    $('submit').textContent = 'Aloita WhatsAppissa';
  }
});

$('code-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('code-error');
  error.hidden = true;
  const code = $('code').value.replace(/[\s-]/g, '');
  if (!/^\d{4,8}$/.test(code)) { error.textContent = 'Kirjoita WhatsAppiin tullut numerokoodi.'; error.hidden = false; return; }
  if (!current) return;
  $('code-submit').disabled = true;
  try {
    const response = await fetch(`/api/signups/${current.id}/code`, {
      method: 'POST', headers: { authorization: `Bearer ${current.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { error.textContent = body.error || 'Koodin lähetys ei onnistunut.'; error.hidden = false; if (response.status === 409) poll(); return; }
    $('code').value = '';
    $('code').blur();
    show(body.status, body.chatUrl, body.codeSent);
  } catch {
    error.textContent = 'Yhteys katkesi. Yritä uudelleen.'; error.hidden = false;
  } finally { $('code-submit').disabled = false; }
});

$('restart').addEventListener('click', () => { saved.clear(); showForm(); $('phone').focus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && current && last !== 'ready' && last !== 'failed') poll(); });

const previous = saved.get();
if (previous) follow({ ...previous, status: 'pending' }, 0);
