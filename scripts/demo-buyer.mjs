// Koko ketju yhdellä komennolla ulkopuolisen ostoagentin silmin: haku → allekirjoitettu tarjous → tilaus → hyväksyntä → audit trail.
// Käyttö: npm run demo            (portti käynnissä osoitteessa http://localhost:4747)
//         npm run demo -- http://localhost:4848 "200 kg lohifileetä maanantaiksi"
import { runBuyerAgent } from '../server/gateway/buyerAgent.mjs';

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => /^https?:\/\//.test(a)) || `http://localhost:${process.env.PORT || 4747}`).replace(/\/$/, '');
const custom = args.find((a) => !/^https?:\/\//.test(a));
const console_ = async (path, body) => (await fetch(`${baseUrl}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const line = (s = '') => console.log(s);

async function scenario(title, opts) {
  line(`\n━━ ${title}`);
  line(`   Pyyntö: "${opts.text}"${opts.tamper ? '  (tarjousta muokataan matkalla)' : ''}`);
  const r = await runBuyerAgent({ baseUrl, ...opts });
  for (const s of r.steps) line(`   ${String(s.ms).padStart(7)} ms  ${s.request.padEnd(34)} ${s.status}  ${s.note || ''}`);
  line(`   → ${r.summary}  (yhteensä ${r.totalMs} ms)`);
  if (r.order) for (const l of r.order.lines || []) line(`     - ${l.productId} ${l.name} × ${l.quantity} ${l.salesUnitLabel} = ${l.lineNet.toFixed(2)} €${l.substituteFor ? `  (korvaa ${l.substituteFor})` : ''}`);
  return r;
}

if (custom) { await scenario('Oma pyyntö (Nordic Hotels)', { apiKey: 'demo-nordic-hotels', text: custom }); process.exit(0); }

await console_('/console/reset', {});
const a = await scenario('1. Briefin lause sellaisenaan → eurokatto ylittyy → ihmisen hyväksyntä', { apiKey: 'demo-nordic-hotels', text: 'I need 1,000 litres of lactose-free milk by Monday.' });
if (a.order?.status === 'pending_approval') {
  const approved = await console_(`/console/orders/${a.order.orderId}/approve`, { by: 'Hankintapäällikkö' });
  line(`   Ihminen hyväksyi yhdellä napilla → ${approved.status}`);
}
const b = await scenario('2. Osittainen saatavuus → agentti täydentää korvaajalla sääntöjen sisällä', { apiKey: 'demo-nordic-hotels', text: '100 litraa Arlan rasvatonta laktoositonta maitojuomaa maanantaiksi' });
await scenario('3. Toimitusrajoite → sunnuntaiksi ei ehdi, kysytään päivän siirrosta', { apiKey: 'demo-nordic-hotels', text: '200 litres of lactose-free milk by Sunday' });
await scenario('4. Muokattu tarjous hylätään (allekirjoitus ei täsmää)', { apiKey: 'demo-nordic-hotels', text: '50 litres of lactose-free milk by Monday', tamper: true });
await scenario('5. Uusi asiakas oletusmandaatilla → jokainen tilaus kuitataan', { apiKey: 'demo-kahvila-aalto', text: '20 litraa laktoositonta maitoa maanantaiksi' });

if (b.order?.status === 'confirmed') await scenario('6. "Ainii, unohtui kerma" → lisäys vahvistettuun tilaukseen, sääntöjen sisällä', { apiKey: 'demo-nordic-hotels', text: 'Ainii, unohtui kerma: 10 litraa kuohukermaa samaan tilaukseen', addToOrderId: b.order.orderId });
if (a.order?.status === 'pending_approval' || a.order) {
  const c = await scenario('7. Sama lisäys isoon tilaukseen → eurokatto ylittyy → lisäys kysytään, tilaus pysyy', { apiKey: 'demo-nordic-hotels', text: 'Ainii, unohtui kerma: 10 litraa kuohukermaa samaan tilaukseen', addToOrderId: a.order.orderId });
  if (c.order?.pendingAddition) {
    const d = await console_(`/console/orders/${a.order.orderId}/approve`, { by: 'Hankintapäällikkö' });
    line(`   Ihminen hyväksyi lisäyksen yhdellä napilla → ${d.addition?.status}, uusi summa ${d.totals?.net?.toFixed(2)} €`);
  }
}

// 9. Taustavahti: kaksi tavallista tilausta muodostaa ostajan historian, kolmas on moninkertainen. Se mahtuisi eurokattoon
// (Ravintola Kulma: 6 000 € / tilaus, kuittaus vain poikkeuksissa), mutta vahti siirtää sen ihmiselle.
line('\n━━ 8. Taustavahti: määrä poikkeaa ostajan omasta historiasta → ihmiselle, vaikka mandaatti riittäisi');
for (const text of ['20 litraa laktoositonta maitoa maanantaiksi', '30 litraa laktoositonta maitoa maanantaiksi']) {
  const r = await runBuyerAgent({ baseUrl, apiKey: 'demo-ravintola-kulma', text });
  line(`   Historia: "${text}" → ${r.order ? `${r.order.status}, ${r.order.totals.net.toFixed(2)} €` : r.summary}`);
}
const w = await scenario('   Sama ostaja, sama tuote, poikkeava määrä', { apiKey: 'demo-ravintola-kulma', text: '1500 litraa laktoositonta maitoa maanantaiksi' });
for (const r of (w.order?.reasons || []).filter((x) => ['UNUSUAL_QUANTITY', 'ORDER_SPLIT_UNDER_CAP'].includes(x.code))) line(`   Vahti: ${r.message}`);

// 9. "Unohtuiko tämä?": kahdessa tilauksessa on ollut maitoa ja kermaa, kolmannessa vain maitoa. Portti huomaa puuttuvan kerman
// ostajan omasta historiasta ja tarjoaa sen valmiina tuotteena ja määränä. Ihminen lisää sen yhdellä napilla, sama ketju kuin add_to_order.
line('\n━━ 9. "Unohtuiko tämä?": portti huomaa, mitä ostajan tavallisesta tilauksesta puuttuu');
for (const text of ['20 litraa laktoositonta maitoa ja 10 litraa kuohukermaa maanantaiksi', '30 litraa laktoositonta maitoa ja 10 litraa kuohukermaa maanantaiksi']) {
  const r = await runBuyerAgent({ baseUrl, apiKey: 'demo-ravintola-kulma', text });
  line(`   Historia: "${text}" → ${r.order ? `${r.order.status}, ${r.order.totals.net.toFixed(2)} €` : r.summary}`);
}
const f = await scenario('   Sama ostaja tilaa tällä kertaa vain maitoa', { apiKey: 'demo-ravintola-kulma', text: '25 litraa laktoositonta maitoa maanantaiksi' });
for (const s of f.order?.suggestions || []) line(`   Portti ehdottaa: ${s.message}`);
if (f.order?.suggestions?.length) {
  const g = await console_(`/console/orders/${f.order.orderId}/suggestions/${f.order.suggestions[0].productId}`, { by: 'Keittiöpäällikkö' });
  line(`   Ihminen lisäsi yhdellä napilla → ${g.addition?.status || g.error?.message}, uusi summa ${g.totals?.net?.toFixed(2)} €`);
}

// 10. Reseptistä ostoskori: annokset × resepti → raaka-ainerivit, jokainen kiinnitetty yhteen tuotteeseen. Ilman annosmäärää ei tilata mitään.
await scenario('10. Reseptistä ostoskori: annokset × resepti, tuotteet kiinnitetty, ei korvaajia', { apiKey: 'demo-ravintola-kulma', text: 'Lohikeitto 100 annosta maanantaiksi' });
await scenario('    Sama ilman annosmäärää → ei arvata, ei tilata', { apiKey: 'demo-ravintola-kulma', text: 'lohikeitto maanantaiksi' });

if (a.order) {
  const trail = await (await fetch(`${baseUrl}/v1/orders/${a.order.orderId}/audit`, { headers: { authorization: 'Bearer demo-nordic-hotels' } })).json();
  line(`\n━━ Audit trail tilaukselle ${a.order.orderId}: ketju ${trail.chain.valid ? 'EHJÄ' : 'RIKKI'} (${trail.chain.entries} riviä)`);
  for (const e of trail.entries) line(`   #${String(e.seq).padStart(3)} ${new Date(e.ts).toLocaleTimeString('fi-FI', { timeZone: 'Europe/Helsinki' })}  ${e.actor.padEnd(26)} ${e.type.padEnd(24)} ${e.hash.slice(0, 10)}…`);
}
