// Read-only publisher. It never imports or starts the WhatsApp worker or gateway runtime.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MAX_LINES, MAX_ORDERS, parseSnapshot } from './src/protocol.ts';

const WEB_DEMO_PHONE = '358000000001';
const GENESIS = '0'.repeat(64);
export function readSnapshot({ gatewayFile, whatsappFile, phone, includeBrowserDemo = false, now = Date.now() }) {
  if (!gatewayFile || !whatsappFile || !/^[1-9]\d{6,14}$/.test(String(phone || '').replace(/^\+/, ''))) throw new Error('WhatsApp-demon omat kantapolut ja testinumero vaaditaan.');
  const members = new DatabaseSync(whatsappFile, { readOnly: true });
  const channels = new Map();
  try {
    const selected = String(phone).replace(/^\+/, '');
    for (const number of [selected, ...(includeBrowserDemo ? [WEB_DEMO_PHONE] : [])]) {
      const member = members.prepare('SELECT binding FROM members WHERE phone=?').get(number);
      if (member) channels.set(`whatsapp-demo-${member.binding}`, number === WEB_DEMO_PHONE ? 'browser-demo' : 'whatsapp');
    }
  } finally { members.close(); }
  const db = new DatabaseSync(gatewayFile, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=3000; BEGIN');
    let head = GENESIS;
    for (const row of db.prepare('SELECT * FROM ledger ORDER BY seq').iterate()) {
      const input = `${head}|${row.ts}|${row.actor}|${row.type}|${row.buyer_id || ''}|${row.order_id || ''}|${row.quote_id || ''}|${row.payload}`;
      const expected = crypto.createHash('sha256').update(input).digest('hex');
      if (row.prev_hash !== head || row.hash !== expected) throw new Error('Tilauskannan päätösketjun tarkistus epäonnistui.');
      head = expected;
    }
    const orders = []; let totalOrders = 0;
    for (const row of db.prepare('SELECT buyer_id,json FROM orders ORDER BY created_at DESC,id DESC').iterate()) {
      const channel = channels.get(row.buyer_id);
      if (!channel) continue;
      totalOrders++;
      if (orders.length >= MAX_ORDERS) continue;
      const o = JSON.parse(row.json);
      // An allowlist projection: names, phone numbers, references, tokens, conversation and mandates never leave this process.
      const lines = (o.lines || []).slice(0, MAX_LINES).map(l => ({ productId: String(l.productId), name: String(l.name || l.productId).slice(0, 180), quantity: l.quantity,
        unit: String(l.salesUnitLabel || l.salesUnit || 'kpl').slice(0, 24), net: l.lineNet }));
      orders.push({ orderId: o.orderId, channel, status: o.status, createdAt: o.createdAt, deliveryDate: o.deliveryDate || null,
        net: o.totals?.net ?? null, lineCount: (o.lines || []).length, lines });
    }
    db.exec('COMMIT');
    return parseSnapshot({ version: 1, observedAt: now, totalOrders, ledgerHead: head, orders }, now);
  } finally { db.close(); }
}

export async function publishOnce({ url, token, snapshot, fetcher = fetch, allowLocal = false }) {
  const endpoint = new URL('/api/sync', url);
  if (endpoint.protocol !== 'https:' && !(allowLocal && endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Julkaisu vaatii HTTPS-osoitteen.');
  if (!token || token.length < 32) throw new Error('Julkaisuavain puuttuu.');
  const body = JSON.stringify(snapshot);
  const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }, body });
  if (!response.ok) throw new Error(`Julkaisu epäonnistui (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.ok !== true) throw new Error('Julkaisua ei vahvistettu.');
  return result;
}

async function main() {
  const env = process.env, watch = process.argv.includes('--watch');
  let stop = false, wake;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop = true; wake?.(); });
  do {
    try {
      const snapshot = readSnapshot({ gatewayFile: env.GATEWAY_DB, whatsappFile: env.WHATSAPP_DB, phone: env.WHATSAPP_DEMO_PHONE,
        includeBrowserDemo: process.argv.includes('--include-browser-demo') });
      await publishOnce({ url: env.CLOUDFLARE_DEMO_URL, token: env.CLOUDFLARE_DEMO_SYNC_TOKEN, snapshot });
      console.log(JSON.stringify({ event: 'demo_published', orders: snapshot.orders.length, at: new Date().toISOString() }));
    } catch (error) {
      // Do not log upstream responses, tokens, database paths, or customer records.
      console.error(JSON.stringify({ event: 'demo_publish_failed', error: error.message?.startsWith('Julkaisu') || error.message?.startsWith('Tilauskannan') ? error.message : 'Tarkista julkaisun asetukset ja kannat.' }));
      if (!watch) { process.exitCode = 1; return; }
    }
    if (watch && !stop) await new Promise(resolve => { const timer = setTimeout(resolve, 5000); wake = () => { clearTimeout(timer); resolve(); }; });
  } while (watch && !stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
