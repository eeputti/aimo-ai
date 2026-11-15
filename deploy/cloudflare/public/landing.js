// Landing page sign-up: post the number, then follow this browser's own sign-up until WhatsApp opens.
const KEY = 'aimo.signup.v1';
const $ = id => document.getElementById(id);
const saved = {
  get() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && /^[0-9a-f-]{36}$/.test(v.id) && /^[A-Za-z0-9_-]{43}$/.test(v.token) ? v : null; } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* the page still works for this visit */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } },
};

const TEXT = {
  pending: ['Lisätään numeroasi apuriin', 'Ilmoittautumisesi on vastaanotettu. Sen jälkeen Aimo-tiimi hyväksyy numerosi WhatsApp-demoon.'],
  slow: ['Lisätään numeroasi apuriin', 'Demopalvelin ei vastannut vielä. Sivu yrittää uudelleen itsestään, voit jättää sen auki.'],
  linked: ['Odottaa Aimo-tiimin hyväksyntää', 'Demo vaatii numerosi lisäämisen Metan testivastaanottajaksi. Aimo-tiimin pitää käynnistää vahvistus erikseen: tämä lomake ei lähetä koodia. Jos koodia ei tule, pyydä demon esittelijää aloittamaan vahvistus.'],
  codeSent: ['Koodi toimitettu Aimo-tiimille', 'Koodi odottaa vielä vahvistamista Metassa. Sivulle kirjoittaminen ei yksin hyväksy numeroa. Tämä sivu päivittyy, kun Aimo-tiimi on vahvistanut numerosi.'],
  ready: ['Valmista! Avaa WhatsApp', 'Lähetä apurille viesti ja kerro, mitä keittiöösi tarvitaan. Apuri vastaa samassa keskustelussa.'],
  failed: ['Numeroa ei voitu lisätä', 'Tarkista numero ja yritä uudelleen.'],
  call: ['Soita tai laita viesti Eelikselle', 'Eelis hyväksyttää numerosi WhatsAppiin. Saat WhatsAppiin viisinumeroisen koodin: kerro se Eelikselle. Sen jälkeen tämä sivu avaa WhatsAppin.'],
};
// The person sees four steps: the number is received, they call or message the presenter, Meta approval, ready.
const TRACK = {
  pending: { received: 'done', call: 'current' },
  linked: { received: 'done', call: 'current' },
  ready: { received: 'done', call: 'done', approved: 'done', ready: 'done' },
  failed: { received: 'done', call: 'failed' },
};

let timer = 0, startedAt = 0, current = null, last = 'pending';

// The presenter's number comes from the server; it is used only as a plain international number.
function callLink(call) {
  return call && /^\+[1-9]\d{6,14}$/.test(call.tel || '') && /^\+[\d ]{7,20}$/.test(call.display || '') ? call : null;
}

function show(status, chatUrl, codeSent = false) {
  last = status;
  if (current) Object.assign(current, { status, chatUrl, codeSent });
  $('signup-form').hidden = true;
  $('status').hidden = false;
  // A short call replaces waiting: it is offered until the number has been approved.
  const call = status === 'pending' || status === 'linked' ? callLink(current?.call) : null;
  const callButton = $('call');
  callButton.hidden = !call;
  if (call) { callButton.href = 'tel:' + call.tel; $('call-number').textContent = call.display; }
  // A WhatsApp message to the presenter with the name already written, for those who would rather not call.
  const message = $('message');
  message.hidden = !call;
  if (call) {
    const name = current?.name ? ` nimellä ${current.name}` : '';
    message.href = `https://wa.me/${call.tel.slice(1)}?text=${encodeURIComponent(`Hei Eelis! Lisäsin numeroni Aimon WhatsApp-tilausapuriin${name}. Voitko hyväksyä sen?`)}`;
  }
  const slow = status === 'pending' && Date.now() - startedAt > 45000;
  const [title, detail] = TEXT[status === 'linked' && codeSent ? 'codeSent' : call ? 'call' : slow ? 'slow' : status] || TEXT.pending;
  $('code-form').hidden = status !== 'linked';
  $('code-submit').textContent = codeSent ? 'Toimita uusi koodi' : 'Toimita koodi';
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
  $('code').value = '';
  $('code-error').hidden = true;
  $('form-error').hidden = true;
}

async function poll() {
  const signup = current;
  if (!signup || signup.polling) return;
  clearTimeout(timer);
  signup.polling = true;
  try {
    const response = await fetch(`/api/signups/${signup.id}`, { headers: { authorization: `Bearer ${signup.token}` }, cache: 'no-store' });
    if (current !== signup) return;
    if (response.status === 404) { saved.clear(); showForm(); return; }
    if (response.ok) {
      const body = await response.json();
      if (current !== signup) return;
      signup.call = body.call || null;
      if (!(body.status === 'linked' && document.activeElement === $('code'))) show(body.status, body.chatUrl, body.codeSent);
      if (body.status === 'ready' || body.status === 'failed') return;
    } else show(last, signup.chatUrl, signup.codeSent);
  } catch { if (current === signup) show(last, signup.chatUrl, signup.codeSent); }
  finally { signup.polling = false; }
  if (current !== signup) return;
  // Every 3 s while someone is waiting; slower after a quarter of an hour or when the tab is hidden.
  const delay = document.hidden || Date.now() - startedAt > 15 * 60000 ? 15000 : 3000;
  timer = setTimeout(poll, delay);
}

function follow(signup, delay = 1500) {
  current = signup; startedAt = Date.now();
  clearTimeout(timer);
  show(signup.status || 'pending', signup.chatUrl, signup.codeSent);
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
    const signup = { id: body.id, token: body.token, status: body.status, chatUrl: body.chatUrl, call: body.call || null, name };
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
  const signup = current;
  $('code-submit').disabled = true;
  try {
    const response = await fetch(`/api/signups/${signup.id}/code`, {
      method: 'POST', headers: { authorization: `Bearer ${signup.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => ({}));
    if (current !== signup) return;
    if (!response.ok) { error.textContent = body.error || 'Koodin lähetys ei onnistunut.'; error.hidden = false; if (response.status === 409) poll(); return; }
    $('code').value = '';
    $('code').blur();
    signup.call = body.call || null;
    show(body.status, body.chatUrl, body.codeSent);
  } catch {
    if (current === signup) { error.textContent = 'Yhteys katkesi. Yritä uudelleen.'; error.hidden = false; }
  } finally { $('code-submit').disabled = false; }
});

$('restart').addEventListener('click', () => { saved.clear(); showForm(); $('phone').focus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && current && last !== 'ready' && last !== 'failed') poll(); });

const previous = saved.get();
if (previous) follow({ ...previous, status: 'pending' }, 0);
