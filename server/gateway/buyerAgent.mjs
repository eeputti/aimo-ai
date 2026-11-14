// VIITEASIAKAS: ostajan puolen agentti, joka asioi portin kanssa vain julkisen REST-sopimuksen kautta (oikeita HTTP-kutsuja).
// Tämä EI ole tuote, vaan todiste siitä, että portti toimii ulkopuoliselle agentille: se ei käytä mitään portin sisäistä koodia.
// Tulkinta on tarkoituksella sääntöpohjainen (nopea, toistettava). Kielimalliasiakas voi käyttää samaa sopimusta MCP:n kautta (/mcp).
import crypto from 'node:crypto';

const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunnuntai: 0, maanantai: 1, tiistai: 2, keskiviikko: 3, torstai: 4, perjantai: 5, lauantai: 6 };
const UNITS = [[/^(l|litres?|liters?|litraa?|litra)$/i, 'L'], [/^(kg|kilos?|kiloa|kilogram\w*)$/i, 'KG'], [/^(pcs|pieces?|kpl|kappaletta|units?)$/i, 'PCS']];
const FILLER = /\b(i|we|need|needs|want|would|like|please|order|of|for|by|on|the|a|an|some|to|tarvitsen|tarvitsemme|tarvitaan|tilaa|haluan|ole|hyvä|kiitos|ainii|hei|unohtui|unohdin|samaan|tilaukseen)\b/gi;

/** "I need 1,000 litres of lactose-free milk by Monday." → {quantity, query, weekday} */
export function parseRequest(text) {
  const out = { original: text, assumptions: [] };
  let rest = ` ${text} `;
  const m = rest.match(/(\d[\d\s.,]*\d|\d)\s*([a-zåäö]+)/i);
  if (m) {
    const unit = UNITS.find(([re]) => re.test(m[2]));
    if (unit) {
      const raw = m[1].trim();
      const value = /^\d{1,3}([,\s.]\d{3})+$/.test(raw) ? Number(raw.replace(/[,\s.]/g, '')) : Number(raw.replace(/\s/g, '').replace(',', '.'));
      out.quantity = { value, unit: unit[1] };
      rest = rest.replace(m[0], ' ');
    }
  }
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    const re = new RegExp(`\\b(by|on|for)?\\s*${name}(ksi|na|hin|iksi)?\\b`, 'i');
    if (re.test(rest)) { out.weekday = dow; out.weekdayName = name; rest = rest.replace(re, ' '); break; }
  }
  out.query = rest.replace(FILLER, ' ').replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

const nextWeekday = (fromIso, dow) => { const d = new Date(`${fromIso}T12:00:00Z`); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/**
 * Ajaa koko ketjun: löydä portti → lue mandaatti → hae → pyydä tarjous → tilaa.
 * @param {{baseUrl: string, apiKey: string, text: string, tamper?: boolean}} opts
 * @returns {Promise<{steps: Array, order: object|null, summary: string}>}
 */
export async function runBuyerAgent({ baseUrl, apiKey, text, tamper = false, patches, addToOrderId }) {
  const steps = [];
  const call = async (name, method, path, body) => {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json();
    const step = { name, request: `${method} ${path}`, status: res.status, ms: +(performance.now() - t0).toFixed(1), body, response: json };
    steps.push(step);
    return { res, json, step };
  };
  const finish = (summary, order = null) => ({ steps: steps.map(({ response, body, ...s }) => ({ ...s, sent: body ? brief(body) : undefined })), order, summary, totalMs: +steps.reduce((s, x) => s + x.ms, 0).toFixed(1) });

  // Lisäyksessä viestin alku ("Ainii, unohtui kerma:") ja loppu ("samaan tilaukseen") kertovat vain, että kyse on lisäyksestä; tuote ja määrä tulkitaan lopusta.
  const ask = addToOrderId ? text.replace(/^.*\bunoh\w+[^:]*:\s*/i, '').replace(/\s*(samaan|maanantain|siihen)\s+tilaukseen\b/i, '').trim() : text;
  const need = parseRequest(ask);
  const disc = await call('Löydä portti', 'GET', '/.well-known/agent-gateway.json');
  disc.step.note = `${disc.json.name} ${disc.json.version}: ${disc.json.operations.length} operaatiota, kello ${disc.json.clock.simulated ? 'simuloitu' : 'oikea'}`;
  const mandate = await call('Lue oma mandaatti', 'GET', '/v1/mandate');
  mandate.step.note = mandate.json.summary?.fi;
  const today = disc.json.clock.now.slice(0, 10);
  // Lisäys jo tehtyyn tilaukseen ("unohtui kerma"): toimituspäivä otetaan tilaukselta eikä kysytä uudestaan.
  let target = null;
  if (addToOrderId) {
    const t = await call('Lue tilaus, johon lisätään', 'GET', `/v1/orders/${addToOrderId}`);
    if (!t.res.ok) { t.step.note = t.json.error?.message; return finish(`Tilausta ${addToOrderId} ei löytynyt.`); }
    target = t.json;
    t.step.note = `${target.orderId}: ${target.status}, ${target.totals.net.toFixed(2)} €, toimitus ${target.deliveryDate}, tilausaika sulkeutuu ${target.cutoffLabel || '–'}`;
  }
  /** Tilaa tai lisää: sama allekirjoitettu tarjous kelpaa kumpaankin. */
  const commit = async (offers, idempotencyKey) => {
    const step = await call(target ? 'Lisää tilaukseen' : tamper ? 'Tilaa muokatulla tarjouksella' : 'Tilaa', 'POST', target ? `/v1/orders/${target.orderId}/lines` : '/v1/orders', { offers, idempotencyKey, requestedBy: text });
    const o = step.json; const a = o.addition;
    if (o.error) { step.step.note = o.error.message; return finish(o.error.message); }
    if (a) {
      step.step.note = `${a.additionId}: ${a.status}${a.reasons?.length ? ` (${a.reasons.map((r) => r.code).join(', ')})` : ''}`;
      const what = a.lines.map((l) => `${l.name} × ${l.quantity} ${l.salesUnitLabel}`).join(', ');
      return finish(a.status === 'applied' ? `Lisätty tilaukseen ${o.orderId}: ${what}. Uusi summa ${o.totals.net.toFixed(2)} € (alv 0 %).`
        : a.status === 'pending_approval' ? `Lisäys odottaa ihmisen hyväksyntää (${a.reasons.filter((r) => r.severity === 'approval').map((r) => r.message).join('; ')}). Tilaus ${o.orderId} pysyy ennallaan: ${o.totals.net.toFixed(2)} €.`
        : `Lisäystä ei tehty: ${a.reasons.map((r) => r.message).join('; ')}. Tilaus ${o.orderId} pysyy ennallaan.`, o);
    }
    step.step.note = `${o.orderId}: ${o.status}${o.reasons?.length ? ` (${o.reasons.map((r) => r.code).join(', ')})` : ''}`;
    return finish(o.status === 'confirmed' ? `Tilaus ${o.orderId} vahvistettu: ${o.totals.net.toFixed(2)} € (alv 0 %), toimitus ${o.deliveryDate}.`
      : o.status === 'pending_approval' ? `Tilaus ${o.orderId} odottaa ihmisen hyväksyntää: ${o.reasons.filter((r) => r.severity === 'approval').map((r) => r.message).join('; ')}.`
      : `Tilaus hylättiin: ${o.reasons.map((r) => r.message).join('; ')}.`, o);
  };

  // Aimo-malli tulkitsee pyynnön (HTTP-kutsu kuten muutkin): monta tuotetta, väittämät, allergeenit, merkki, päivä.
  // Jos se ei ymmärrä riittävän varmasti tai ei ole käytössä, jatketaan alla olevalla yksinkertaisella jäsentimellä.
  const aimo = await call('Tulkitse pyyntö (Aimo-malli)', 'POST', '/api/aimo/interpret', { text: ask, patches }).catch(() => null);
  const rq = aimo?.res.ok && !aimo.json.handoff ? aimo.json.gateway?.requestQuote : null;
  if (aimo) aimo.step.note = rq ? `${aimo.json.summary}, ${aimo.json.trace.via}, ${aimo.json.trace.llmCalls} mallikutsua, ${aimo.json.trace.ms} ms${aimo.json.understood.assumptions.length ? `, oletukset: ${aimo.json.understood.assumptions.map((a) => a.fi).join('; ')}` : ''}` : `ei käytetty: ${aimo.json.handoff?.fi || aimo.json.gateway?.blocked?.map((b) => b.code).join(', ') || aimo.json.error || 'ei tulkintaa'}`;
  // Aimo-malli vastasi, mutta ei ymmärtänyt tai jotain puuttuu: pysähdytään eikä arvata. Varajäsennin on vain sitä varten, ettei reittiä ole.
  if (aimo?.res.ok && aimo.json.handoff) return finish(`${aimo.json.handoff.fi}${aimo.json.understood.unparsed.length ? ` (tuntematon: ${aimo.json.understood.unparsed.join(', ')})` : ''}.`);
  if (aimo?.res.ok && aimo.json.gateway.blocked.length) return finish(aimo.json.gateway.blocked.some((b) => b.code === 'QUANTITY_MISSING') ? 'Pyynnöstä puuttuu määrä (esim. "1 000 litres" tai "50 kg"), joten tilausta ei tehty.' : 'Aimon valikoimasta ei löytynyt pyydettyä tuotetta, joten tilausta ei tehty.');
  if (rq && !aimo.json.gateway.blocked.length) {
    const quote = await call('Pyydä tarjous', 'POST', '/v1/quotes', { ...rq, deliveryDate: target?.deliveryDate || rq.deliveryDate || today });
    const needs = quote.json.needs || [];
    const open = needs.filter((n) => !n.options?.length);
    if (!quote.res.ok || !needs.length || open.length) { quote.step.note = quote.json.error?.message || `ei tarjottavaa: ${open.map((n) => `${n.ref} ${JSON.stringify(n.excludedSummary || {})}`).join(', ')}`; return finish(open.length ? `Koria ei tilattu vajaana. Ei saatavilla pyydetylle päivälle: ${open.map((n) => `${aimo.json.understood.items[+n.ref.split('-')[1] - 1]?.productTerm || n.ref} (${Object.keys(n.excludedSummary || {}).join(', ') || 'ei tarjousta'})`).join('; ')}.` : 'Portti ei voinut tarjota pyydettyä määrää kaikille riveille.'); }
    quote.step.note = needs.map((n) => `${n.ref}: ${n.options.length} allekirjoitettua vaihtoehtoa, halvin ${n.options[0].totals.net.toFixed(2)} € (${n.options[0].lines.map((l) => `${l.productId} × ${l.quantity}`).join(' + ')})`).join(', ');
    let offers = needs.map((n) => n.options[0].offer);
    if (tamper) { // demotaan allekirjoituksen todennus: muutetaan hintaa ensimmäisen tarjouksen sisällä
      const [h, p, s] = offers[0].split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      payload.lines[0].unitPriceNet = +(payload.lines[0].unitPriceNet * 0.5).toFixed(2);
      payload.totals.net = +(payload.totals.net * 0.5).toFixed(2);
      offers = [`${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`, ...offers.slice(1)];
    }
    const idempotencyKey = crypto.createHash('sha256').update(`${text}|${JSON.stringify(patches || [])}|${rq.deliveryDate}|${tamper}|${addToOrderId || ''}|${quote.json.quoteId}`).digest('hex').slice(0, 24);
    return commit(offers, idempotencyKey);
  }

  if (!need.quantity) return finish('En löytänyt pyynnöstä määrää ja yksikköä (esim. "1 000 litres" tai "50 kg").');
  const deliveryDate = target?.deliveryDate || (need.weekday != null ? nextWeekday(today, need.weekday) : today);

  const search = await call('Hae tuotteet', 'POST', '/v1/products/search', { query: need.query, limit: 40 });
  if (!search.res.ok || !search.json.items?.length) { search.step.note = search.json.error?.message || 'ei osumia'; return finish(`Haku "${need.query}" ei tuottanut tuotteita.`); }
  const it = search.json.interpretedAs;
  // Tarkenne (merkki, rasvapitoisuus) = ostaja tarkoittaa tiettyä tuotetta → parhaat osumat. Muuten mikä tahansa tyypin tuote kelpaa.
  const specific = !!it.textQuery;
  const best = search.json.items[0].matchScore;
  const candidates = (specific ? search.json.items.filter((x) => x.matchScore >= best - 0.08).slice(0, 4) : search.json.items).map((x) => x.productId);
  search.step.note = `${search.json.total} tuotetta staattisesta datasta (${[it.productType && `tyyppi ${it.productType}`, ...it.claims].filter(Boolean).join(', ') || 'nimihaku'}) → ${candidates.length} ehdokasta tarjouspyyntöön`;

  const quote = await call('Pyydä tarjous', 'POST', '/v1/quotes', { deliveryDate, needs: [{ ref: 'need-1', candidates, quantity: need.quantity, rank: 'price' }], maxOptions: 3 });
  const n = quote.json.needs?.[0];
  if (!quote.res.ok || !n?.options.length) { quote.step.note = quote.json.error?.message || `ei tarjottavaa: ${JSON.stringify(n?.excludedSummary || {})}`; return finish('Portti ei voinut tarjota pyydettyä määrää.'); }
  const opt = n.options[0];
  quote.step.note = `${n.options.length} allekirjoitettua vaihtoehtoa, halvin ${opt.totals.net.toFixed(2)} € (${opt.lines.map((l) => `${l.productId} × ${l.quantity}`).join(' + ')})` + (Object.keys(n.excludedSummary).length ? `, pois jäi: ${Object.entries(n.excludedSummary).map(([c, k]) => `${k} × ${c}`).join(', ')}` : '');

  let offer = opt.offer;
  if (tamper) { // demotaan allekirjoituksen todennus: muutetaan hintaa tarjouksen sisällä
    const [h, p, s] = offer.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.lines[0].unitPriceNet = +(payload.lines[0].unitPriceNet * 0.5).toFixed(2);
    payload.totals.net = +(payload.totals.net * 0.5).toFixed(2);
    offer = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
  }
  const idempotencyKey = crypto.createHash('sha256').update(`${text}|${deliveryDate}|${tamper}|${addToOrderId || ''}|${quote.json.quoteId}`).digest('hex').slice(0, 24);
  return commit([offer], idempotencyKey);
}

const brief = (body) => { const s = JSON.stringify(body); return s.length > 260 ? `${s.slice(0, 257)}…` : s; };
