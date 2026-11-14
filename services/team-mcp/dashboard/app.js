const $ = (id) => document.getElementById(id);
let credential = '', project = '', timer, epoch = 0, pending;
const date = (ms) => ms ? new Date(ms).toLocaleString('fi-FI') : 'Ei havaintoa';
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function render(data) {
  $('content').hidden = false;
  const c = data.coordinator;
  $('connection').textContent = c?.online ? `Koordinaattori käynnissä · ${c.mode === 'openai' ? 'OpenAI-agentti käytössä' : 'Seurantatila, API-työt odottavat'} · ${date(data.serverTime)}` : 'Koordinaattorilta ei tuoretta elonmerkkiä';
  $('agents').replaceChildren(...data.agents.map((agent) => {
    const card = el('article', undefined, 'card'); card.append(el('h3', agent.name), el('div', agent.id, 'muted'));
    card.append(el('span', agent.tasks.length ? `${agent.tasks.length} ilmoitettua tehtävää` : 'Ei avointa työraporttia', 'badge'));
    card.append(el('p', `Viimeisin MCP-yhteys: ${date(agent.lastSeen?.last_seen)}`, 'muted'), el('p', `Viimeisin työraportti: ${date(agent.lastReport)}`, 'muted'));
    for (const task of agent.tasks) {
      const block = el('div', undefined, 'task'); block.append(el('strong', task.title), el('p', task.status + (task.leaseExpired ? ' · varaus vanhentunut' : '')), el('p', task.note || 'Etenemistä ei ole vielä raportoitu.'));
      if (task.requestedResources.length) block.append(el('p', task.requestedResources.join(', '), 'muted'));
      card.append(block);
    }
    return card;
  }));
  $('jobs').replaceChildren(...(data.jobs.length ? data.jobs.map((job) => {
    const card = el('article', undefined, 'card'); card.append(el('strong', `${job.status} · yrityksiä ${job.attempts}`), el('p', date(job.updated), 'muted'));
    if (job.summary) card.append(el('p', job.summary));
    if (job.reply) card.append(el('p', job.reply, 'reply'));
    if (job.error_code) card.append(el('p', job.error_code, 'muted'));
    return card;
  }) : [el('p', 'Ei omia API-työpyyntöjä.', 'muted')]));
  $('events').replaceChildren(...(data.events.length ? data.events.map((event) => {
    const card = el('div', undefined, 'card'); card.append(el('strong', `${event.actor} · ${event.type}`), el('p', date(event.created), 'muted')); return card;
  }) : [el('p', 'Ei vielä työraportteja.', 'muted')]));
}
async function poll(myEpoch) {
  if (myEpoch !== epoch || !credential) return;
  pending = new AbortController();
  try {
    const response = await fetch('/snapshot?project=' + encodeURIComponent(project), { headers: { authorization: 'Bearer ' + credential }, signal: pending.signal });
    if (myEpoch !== epoch) return;
    if (!response.ok) { if ([401, 403].includes(response.status)) { credential = ''; $('content').hidden = true; } throw new Error(response.status === 401 ? 'Tiimiavain ei kelpaa tai se on vanhentunut.' : 'Yhteyttä tai projektin käyttöoikeutta ei saatu.'); }
    const data = await response.json(); if (myEpoch !== epoch) return;
    render(data); notice('Yhteys toimii. Tilanne päivittyy kahden sekunnin välein.');
  } catch (err) { if (myEpoch === epoch) notice(err.name === 'AbortError' ? 'Yhteyspyyntö keskeytyi.' : err.message, true); }
  finally { if (myEpoch === epoch && credential) timer = setTimeout(() => poll(myEpoch), 2000); }
}
$('login').addEventListener('submit', (event) => {
  event.preventDefault(); clearTimeout(timer); pending?.abort(); epoch++;
  credential = $('key').value.trim(); project = $('project').value.trim(); $('key').value = ''; $('content').hidden = true;
  void poll(epoch);
});
$('logout').addEventListener('click', () => { clearTimeout(timer); epoch++; pending?.abort(); credential = ''; $('content').hidden = true; notice('Yhteys katkaistu.'); });
