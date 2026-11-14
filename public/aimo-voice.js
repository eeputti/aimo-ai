// Sanelu on hakukentän syöttötapa. Vain valmis teksti siirtyy tavalliseen tuotehakuun.
const join = (...parts) => parts.map((s) => s.trim()).filter(Boolean).join(' ');
const errors = {
  'not-allowed': 'Salli mikrofonin ja puheentunnistuksen käyttö selaimen sivustoasetuksista.',
  'service-not-allowed': 'Selain ei salli puheentunnistusta. Voit jatkaa kirjoittamalla.',
  'audio-capture': 'Mikrofonia ei löytynyt. Tarkista, että se on käytössä.',
  network: 'Puheentunnistukseen ei saatu yhteyttä. Tarkista verkkoyhteys ja yritä uudelleen.',
  'language-not-supported': 'Selain ei tue suomenkielistä sanelua. Voit jatkaa kirjoittamalla.',
  'no-speech': 'En kuullut puhetta. Kokeile uudelleen tai kirjoita mitä tarvitset.',
  'too-long': 'Ostoslista on liian pitkä. Lyhennä kentän teksti enintään 600 merkkiin tai sanele tilaus osissa.',
};

// Selainriippuvuudet annetaan erikseen, jotta elinkaari voidaan testata ilman oikeaa mikrofonia.
export function createVoiceSession({ env = window, onState, onText, onLevel, onCommit }) {
  const Recognition = env.SpeechRecognition || env.webkitSpeechRecognition;
  let state = 'idle'; let token = 0; let recognition = null; let wanted = false;
  let committed = ''; let final = ''; let interim = ''; let emptyEnds = 0;
  let stream = null; let audio = null; let frame; let stopTimer; let restartTimer; let limitTimer;
  const text = () => join(committed, final, interim);
  const setState = (next, message = '') => { state = next; onState(next, message); };
  function releaseMeter() {
    env.cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    if (audio) { audio.close().catch(() => {}); audio = null; }
    onLevel(0);
  }
  function clearTimers() { env.clearTimeout(stopTimer); env.clearTimeout(restartTimer); env.clearTimeout(limitTimer); }
  function detach() {
    const old = recognition; recognition = null;
    if (old) { old.onstart = old.onresult = old.onerror = old.onend = null; try { old.abort(); } catch { /* jo päättynyt */ } }
  }
  function fail(code) {
    wanted = false; clearTimers(); releaseMeter(); detach();
    setState('error', errors[code] || 'Sanelu keskeytyi. Voit yrittää uudelleen tai jatkaa kirjoittamalla.');
  }
  async function meter(mine) {
    const Audio = env.AudioContext || env.webkitAudioContext;
    if (!Audio || !env.navigator.mediaDevices?.getUserMedia) return;
    let incoming;
    try {
      incoming = await env.navigator.mediaDevices.getUserMedia({ audio: true });
      if (mine !== token || !wanted) { incoming.getTracks().forEach((track) => track.stop()); return; }
      stream = incoming;
      audio = new Audio();
      const analyser = audio.createAnalyser(); analyser.fftSize = 256;
      audio.createMediaStreamSource(stream).connect(analyser);
      await audio.resume();
      if (mine !== token || !wanted) return;
      const samples = new Uint8Array(analyser.fftSize); let level = 0;
      const tick = () => {
        if (mine !== token || !wanted) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length);
        level += (Math.min(1, rms * 7) - level) * .25;
        onLevel(level); frame = env.requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Äänimittari on valinnainen: sen virhe ei katkaise selaimen omaa puheentunnistusta.
      if (mine === token) releaseMeter();
      else incoming?.getTracks().forEach((track) => track.stop());
    }
  }
  async function finish(mine) {
    if (mine !== token || !['starting', 'listening', 'stopping'].includes(state)) return;
    wanted = false; clearTimers(); releaseMeter(); detach();
    const value = text();
    if (!value) { fail('no-speech'); return; }
    if (value.length > 600) { fail('too-long'); return; }
    setState('processing');
    try {
      const ok = await onCommit(value);
      if (mine === token) setState(ok === false ? 'error' : 'done', ok === false ? 'Tuotehaku ei onnistunut. Saneltu teksti on kentässä, voit yrittää uudelleen.' : 'Tarkista tuotteet, määrät ja toimituspäivä ennen koriin lisäämistä.');
    } catch { if (mine === token) setState('error', 'Tuotehaku ei onnistunut. Voit jatkaa kirjoittamalla.'); }
  }
  function listen(mine) {
    if (mine !== token || !wanted) return;
    let rec;
    try { rec = new Recognition(); } catch { fail('start'); return; }
    recognition = rec;
    rec.lang = 'fi-FI'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    const current = () => mine === token && recognition === rec;
    rec.onstart = () => { if (current() && wanted) setState('listening'); };
    rec.onresult = (event) => {
      if (!current()) return;
      final = ''; interim = '';
      // result-lista sisältää myös aiemmat lopulliset osat. Sitä ei liitetä uudelleen tekstin perään.
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final = join(final, result[0].transcript);
        else interim = join(interim, result[0].transcript);
      }
      onText(text());
    };
    rec.onerror = (event) => {
      if (!current()) return;
      if (event.error === 'no-speech' || (event.error === 'aborted' && !wanted)) return;
      fail(event.error);
    };
    rec.onend = () => {
      if (!current()) return;
      if (!wanted) { finish(mine); return; }
      // Selain saa päättää yksittäisen tunnistusjakson. Lyhyt tauko ei päätä koko sanelua.
      emptyEnds = final ? 0 : emptyEnds + 1;
      if (emptyEnds >= 3) { finish(mine); return; }
      committed = join(committed, final); final = ''; interim = '';
      recognition = null; setState('starting');
      restartTimer = env.setTimeout(() => listen(mine), 250);
    };
    try { rec.start(); } catch { fail('start'); }
  }
  return {
    get state() { return state; },
    start() {
      if (['starting', 'listening', 'stopping', 'processing'].includes(state)) return;
      if (!env.isSecureContext) { setState('error', 'Sanelu tarvitsee suojatun HTTPS-yhteyden tai localhost-osoitteen. Voit jatkaa kirjoittamalla.'); return; }
      if (!Recognition) { setState('error', 'Tämä selain ei tue sanelua. Kokeile Chromea tai Safaria, tai jatka kirjoittamalla.'); return; }
      const mine = ++token;
      committed = ''; final = ''; interim = ''; emptyEnds = 0; wanted = true;
      setState('starting'); listen(mine);
      if (wanted) { meter(mine); limitTimer = env.setTimeout(() => this.stop(), 120000); }
    },
    stop() {
      if (!['starting', 'listening'].includes(state)) return;
      wanted = false; releaseMeter(); env.clearTimeout(restartTimer); env.clearTimeout(limitTimer);
      setState('stopping');
      const mine = token;
      stopTimer = env.setTimeout(() => finish(mine), 1500);
      try { if (recognition) recognition.stop(); else finish(mine); } catch { finish(mine); }
    },
    cancel() { token++; wanted = false; clearTimers(); releaseMeter(); detach(); setState('idle'); },
  };
}

const mic = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3.5M8.5 21.5h7"/></svg>';
function micButton(extra = '') {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `ask-mic ${extra}`; button.innerHTML = mic;
  button.setAttribute('aria-label', 'Sanele ostoslista'); button.title = 'Sanele ostoslista';
  return button;
}

export function attachVoice({ root, input, onBegin, onCancel, onCommit }) {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/aimo-voice.css'; document.head.append(css);
  const bar = root.querySelector('.ask-bar'); const button = micButton();
  button.setAttribute('aria-controls', 'ask-voice'); button.setAttribute('aria-expanded', 'false');
  bar.insertBefore(button, root.querySelector('.ask-x'));
  const panel = document.createElement('div'); panel.className = 'ask-voice'; panel.id = 'ask-voice'; panel.hidden = true;
  panel.innerHTML = `<div class="ask-voice-visual"><i class="ask-voice-ring" aria-hidden="true"></i><i class="ask-voice-ring second" aria-hidden="true"></i><button type="button" class="ask-voice-orb" aria-label="Lopeta sanelu" aria-describedby="ask-voice-hint">${mic}<span class="ask-voice-thinking" aria-hidden="true"><i></i><i></i><i></i></span></button></div>
    <div class="ask-voice-copy"><b class="ask-voice-title" role="status" aria-live="polite"></b><p class="ask-voice-hint" id="ask-voice-hint"></p></div>
    <div class="ask-voice-actions"><button type="button" class="ask-voice-done">Yritä uudelleen</button><button type="button" class="ask-voice-cancel">Peruuta</button></div>`;
  bar.after(panel);
  const title = panel.querySelector('.ask-voice-title'); const hint = panel.querySelector('.ask-voice-hint');
  const orb = panel.querySelector('.ask-voice-orb'); const done = panel.querySelector('.ask-voice-done'); const cancel = panel.querySelector('.ask-voice-cancel');
  let original = ''; let draft = ''; const originalLabel = input.getAttribute('aria-label');
  const busy = () => ['starting', 'listening', 'stopping', 'processing'].includes(session.state);
  const session = createVoiceSession({
    onState(state, message) {
      const active = ['starting', 'listening', 'stopping', 'processing'].includes(state);
      panel.hidden = state === 'idle'; panel.dataset.state = state;
      root.classList.toggle('ask-voice-active', active);
      input.readOnly = active; input.setAttribute('aria-label', originalLabel);
      button.setAttribute('aria-expanded', String(!panel.hidden)); button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Lopeta sanelu' : 'Sanele ostoslista');
      button.title = active ? 'Lopeta sanelu' : 'Sanele ostoslista';
      const processing = state === 'stopping' || state === 'processing';
      orb.disabled = processing; orb.setAttribute('aria-label', processing ? 'Sanelua käsitellään' : 'Lopeta sanelu');
      title.textContent = { starting: 'Avataan mikrofonia…', listening: 'Kuuntelen…', stopping: 'Hetki, käsittelen sanelua…', processing: 'Kokoan ostoslistaa…', done: 'Ostoslista kuultu', error: 'Sanelu ei onnistunut' }[state] || '';
      hint.textContent = message || (processing ? 'Etsin sopivat tuotteet ja toimituspäivän.' : 'Lopeta sanelu painamalla mikrofonia.');
      done.hidden = state !== 'error';
      cancel.textContent = active ? 'Peruuta' : 'Jatka kirjoittamalla';
      if (state === 'error') { input.value = draft || original; done.focus({ preventScroll: true }); }
      if (state === 'done') cancel.focus({ preventScroll: true });
    },
    // Puhe pysyy muistissa kuuntelun ajan. Teksti näytetään vasta lopetuksen jälkeen.
    onText(text) { draft = text; },
    onLevel(level) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.style.setProperty('--voice-level', reduced ? 0 : level.toFixed(3));
    },
    onCommit: (text) => onCommit(text),
  });
  function start() {
    if (busy()) { session.stop(); return; }
    original = input.value; draft = ''; onBegin(); input.blur(); session.start();
    if (busy()) orb.focus({ preventScroll: true });
  }
  function dismiss(restore) {
    const active = busy(); session.cancel();
    if (active) { onCancel(); if (restore) input.value = original; }
  }
  button.addEventListener('click', start);
  orb.addEventListener('click', () => session.stop());
  done.addEventListener('click', start);
  cancel.addEventListener('click', () => { dismiss(true); input.focus({ preventScroll: true }); });
  // Enter päättää kuuntelun ennen hakulomakkeen omaa tilaussiirtymää.
  bar.addEventListener('submit', (event) => { if (busy()) { event.preventDefault(); event.stopImmediatePropagation(); session.stop(); } }, true);
  input.addEventListener('input', () => { if (!busy() && !panel.hidden) dismiss(false); });
  // Toisen hakutoiminnon valinta lopettaa keskeneräisen sanelun ennen sen käsittelyä.
  root.addEventListener('click', (event) => {
    if (busy() && event.target.closest('.ask-body')) dismiss(true);
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dismiss(true); });
  window.addEventListener('pagehide', () => dismiss(true));
  return {
    cancel: () => dismiss(true),
    addTrigger(box, open) {
      const trigger = micButton('ask-mic-trigger');
      trigger.setAttribute('aria-haspopup', 'dialog');
      box.append(trigger);
      trigger.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); open(); start(); });
    },
  };
}
