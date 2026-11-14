// Tilausapuri: keskustelu Danielin ostosagentin kanssa (POST /api/assistant/chat, vastaus SSE-striiminä).
(() => {
  const $ = (s) => document.querySelector(s);
  const log = $('#ta-log'); const form = $('#ta-form'); const input = $('#ta-input'); const sendBtn = $('#ta-send');
  const notice = $('#ta-notice'); const examples = $('#ta-examples');
  const history = []; // {role, content} – vain teksti, palvelin lisää työkalukutsut itse
  let busy = false;
  let shoppingConversation = null;
  let assistantAvailable = true;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const isSep = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());

  /** Kevyt Markdown: taulukot, luettelot, lihavointi. Kaikki teksti escapoidaan ensin. */
  function md(text) {
    const lines = String(text).split('\n'); const out = []; let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { if (!isSep(lines[i])) rows.push(cells(lines[i])); i++; }
        const [head, ...body] = rows;
        out.push(`<div class="ta-tablewrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
          body.map((r) => `<tr>${r.map((c, k) => `<td data-label="${esc(head[k] || '')}">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*[-*] /.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*] /.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*[-*] /, ''))}</li>`); i++; }
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      i++;
    }
    return out.join('');
  }

  function bubble(role, html) {
    const el = document.createElement('div');
    el.className = `ta-msg ta-${role}`;
    el.innerHTML = html;
    log.append(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return el;
  }

  function setBusy(on) {
    busy = on; sendBtn.disabled = on || (!assistantAvailable && !shoppingConversation); input.disabled = sendBtn.disabled;
    sendBtn.textContent = on ? 'Odota…' : 'Lähetä';
    if (!on) input.focus();
  }

  /** Lukee fetch-vastauksen SSE-tapahtumat ("event: x\ndata: {...}\n\n"). */
  async function readSse(response, onEvent) {
    const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
        let event = 'message'; let data = '';
        for (const l of frame.split('\n')) { if (l.startsWith('event:')) event = l.slice(6).trim(); else if (l.startsWith('data:')) data += l.slice(5).trim(); }
        if (data) onEvent(event, JSON.parse(data));
      }
    }
  }

  async function ask(text) {
    if (busy || !text.trim()) return;
    examples.hidden = true;
    history.push({ role: 'user', content: text.trim() });
    bubble('user', `<p>${esc(text.trim())}</p>`);
    input.value = '';
    setBusy(true);
    const reply = bubble('bot', '<p class="ta-status"><span class="ta-dot"></span><span>Yhdistetään</span></p>');
    const status = (t) => { const s = reply.querySelector('.ta-status span:last-child'); if (s) s.textContent = t; };
    let answer = ''; let failed = false;
    try {
      if (shoppingConversation) {
        const result = await shoppingConversation.say(text.trim());
        answer = result.text; reply.innerHTML = md(answer) || '<p>Ei vastausta.</p>';
      } else {
        const r = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history }) });
        if (!r.ok || !r.headers.get('content-type')?.includes('text/event-stream')) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        await readSse(r, (event, d) => {
          if (event === 'status' || event === 'tool') status(d.text);
          else if (event === 'text') { answer += d.t; reply.innerHTML = md(answer) + '<p class="ta-status"><span class="ta-dot"></span><span>Kirjoitetaan</span></p>'; }
          else if (event === 'error') { failed = true; reply.innerHTML = `<p class="ta-error">${esc(d.text)}</p>`; }
          else if (event === 'done') reply.innerHTML = md(answer) || '<p>Ei vastausta.</p>';
        });
      }
    } catch (err) {
      failed = true;
      reply.innerHTML = `<p class="ta-error">Yhteys epäonnistui: ${esc(err.message || err)}</p>`;
    }
    if (failed) input.value = text;
    if (failed || !answer) history.pop(); // epäonnistunut kysymys ei jää historiaan; käyttäjä voi lähettää uudelleen
    else history.push({ role: 'assistant', content: answer });
    reply.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setBusy(false);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  examples.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

  if (document.querySelector('meta[name="aimo-local-shop"]')) {
    import('/whatsapp-shopping-list.js').then(({ mountWhatsAppList }) => mountWhatsAppList({ before: notice,
      onOpen(conversation) {
        if (busy) return;
        shoppingConversation = conversation;
        history.length = 0; log.replaceChildren(); examples.hidden = true; notice.hidden = true;
        bubble('bot', md(conversation.text));
        input.value = ''; setBusy(false);
        void ask('näytä');
      },
    })).catch(() => { notice.hidden = false; notice.textContent = 'WhatsApp-listan avaaminen ei onnistunut. Päivitä sivu.'; });
  }

  fetch('/api/assistant/status').then((r) => r.json()).then((s) => {
    assistantAvailable = s.enabled;
    if (s.enabled || shoppingConversation) return;
    notice.hidden = false;
    notice.textContent = 'Tilausapuri ei ole käytössä tällä palvelimella: ANTHROPIC_API_KEY tai ASSISTANT_MCP_URL puuttuu .env-tiedostosta.';
    setBusy(false); sendBtn.textContent = 'Ei käytössä';
  }).catch(() => {});
})();
