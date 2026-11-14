// Tila-arvaus keittiönäkymän yläreunassa. Oma tiedostonsa: ei riipu app.js:stä, vaikuttaa näkymään vain body[data-mode]-attribuutin ja mode.css:n kautta.
// Palvelin arvaa tilan säännöillä (kello, tilaushistoria, tilausaikaraja). Tässä se näytetään perusteluineen ja kysytään vahvistus.
const root = document.getElementById('ordermode');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const S = { m: null, why: false, picking: false };

async function call(body) {
  const res = await fetch('/api/mode', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json().catch(() => ({}));
  if (res.ok) { S.m = json.mode; render(); }
}

function render() {
  const m = S.m;
  if (!m) { root.hidden = true; delete document.body.dataset.mode; return; }
  root.hidden = false;
  // Näkymä muuttuu vasta, kun ostaja on vahvistanut tilan: arvaus yksin ei piilota mitään.
  if (m.confirmed) document.body.dataset.mode = m.mode; else delete document.body.dataset.mode;
  const others = m.modes.filter((x) => x.id !== m.mode);
  const why = S.why ? `<ul class="mode-why">${m.evidence.map((e) => `<li>${esc(e.text)}</li>`).join('')}<li class="basis">${esc(m.basis)} Suomen aika ${esc(m.clock.label)}${m.clock.simulated ? ' (simuloitu)' : ''}.</li></ul>` : '';
  if (m.confirmed && !S.picking) {
    root.innerHTML = `<div class="mode-row"><span class="mode-tag">Tila: ${esc(m.label)}</span><span class="mode-effect">${esc(m.effect)}</span>
      <button class="mode-link" data-mode-act="pick">Vaihda</button><button class="mode-link" data-mode-act="why" aria-expanded="${S.why}">${S.why ? 'Piilota perusteet' : 'Miksi?'}</button></div>${why}`;
    return;
  }
  root.innerHTML = `<div class="mode-row"><span class="mode-tag">Tila-arvaus</span><b class="mode-say">${esc(m.sentence)}</b><span class="mode-ask">${esc(S.picking ? 'Valitse tila:' : m.question)}</span></div>
    <div class="mode-row">
      ${m.confidence === 'high' || S.picking ? `<button class="mode-yes" data-mode-act="set" data-mode="${esc(m.mode)}">${S.picking ? esc(m.label) : `Kyllä, ${esc(m.label.toLowerCase())}`}</button>` : `<button class="mode-alt" data-mode-act="set" data-mode="${esc(m.mode)}" title="${esc(m.modes.find((x) => x.id === m.mode).hint)}">${esc(m.label)}</button>`}
      ${others.map((x) => `<button class="mode-alt" data-mode-act="set" data-mode="${esc(x.id)}" title="${esc(x.hint)}">${esc(x.label)}</button>`).join('')}
      <button class="mode-link" data-mode-act="why" aria-expanded="${S.why}">${S.why ? 'Piilota perusteet' : 'Miksi?'}</button>
    </div>${why}`;
}

root.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mode-act]'); if (!b) return;
  const act = b.dataset.modeAct;
  if (act === 'why') { S.why = !S.why; render(); } else if (act === 'pick') { S.picking = true; render(); } else if (act === 'set') { S.picking = false; call({ mode: b.dataset.mode }); }
});

// Uusi ehdotus (syväajo valmis) tai lähetetty tilaus → arvaus lasketaan uudelleen.
const es = new EventSource('/api/events');
es.addEventListener('deep', (e) => { const ev = JSON.parse(e.data); if (ev.phase !== 'start' && ev.phase !== 'step') call(); });
es.addEventListener('audit', (e) => { if (/Tilaus .* vahvistettu|Demodata alustettu/.test(JSON.parse(e.data).action || '')) call(); });
call();
