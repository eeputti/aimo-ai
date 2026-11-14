// PÄÄSTÄ PÄÄHÄN -TESTISETTI: pyyntö vapaana tekstinä → oikea tilaus portin läpi.
// Jokaiselle pyynnölle on kirjattu käsin, MITÄ ostaja tarkoittaa (tuoteryhmä, väittämät, nimen ehdot, määrä, päivä, lopputila).
// Oikean tuotteen ja hinnan laskee riippumaton oraakkeli (scripts/eval.mjs) suoraan Aimon rajapinnasta ja tuotedatasta,
// ei portin koodilla. Testi menee läpi vain, jos tilaus täyttää ehdot, kattaa määrän ilman ylitilausta ja on yhtä halpa kuin oraakkelin halvin.
const L = (v) => ({ value: v, unit: 'L' }); const KG = (v) => ({ value: v, unit: 'KG' });
const MILK_NOT = /kahvi|caf[eéè]|latte|piimä|annos|kaakao|vanilja|kondens|jauhe/i;
const LF = 'FREE_FROM_LACTOSE';

export const CASES = [
  // --- Briefin esimerkki ja sen muunnelmat ---
  { id: 'brief-en', text: 'I need 1,000 litres of lactose-free milk by Monday.', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(1000) }] },
  { id: 'brief-fi', text: 'Tarvitsen 1 000 litraa laktoositonta maitoa maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(1000) }] },
  { id: 'brief-cap', text: 'I need 1,000 litres of lactose-free milk by Monday.', mandate: { maxOrderNet: 1000 }, date: '2026-11-16', status: 'pending_approval', reasons: ['SPEND_CAP_ORDER'], needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(1000) }] },
  { id: 'milk-short', text: '1.000 l laktoositonta maitoa ma', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(1000) }] },
  // --- Määrä ja yksikkö ---
  { id: 'milk-plain', text: '300 litraa maitoa maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10400'], not: MILK_NOT, qty: L(300) }] },
  { id: 'milk-whole', text: 'a hundred litres of whole milk on Monday', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10400'], must: /täysmaito/i, not: MILK_NOT, qty: L(100) }] },
  { id: 'milk-organic', text: 'luomu kevytmaitoa 40 litraa maanantaiksi', noOrder: true, why: 'Luomumaidot ovat Terminal-tuotteita, joiden tilausaika meni to 12.11. Ei-luomua ei saa tilata tilalle.' },
  { id: 'cream-en', text: '30 l whipping cream by Monday', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10401'], must: /kuohukerma|vispikerma/i, qty: L(30) }] },
  { id: 'cream-lf', text: '20 litraa laktoositonta kuohukermaa maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10401'], claims: [LF], must: /kuohukerma/i, qty: L(20) }] },
  { id: 'butter-kg', text: '20 kg voita maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10500'], not: /kirkastettu/i, qty: KG(20) }] },
  { id: 'butter-lf', text: '10 kg laktoositonta voita maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10500'], claims: [LF], not: /kirkastettu/i, qty: KG(10) }] },
  // --- Usea tuote samassa pyynnössä ---
  { id: 'multi-fi', text: '20 kg voita ja 50 l kuohukermaa maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10500'], not: /kirkastettu/i, qty: KG(20) }, { cat: ['10401'], must: /kuohukerma/i, qty: L(50) }] },
  { id: 'multi-oat', text: '60 l kaurajuomaa ja 10 kg sokeria maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['10402'], must: /kaurajuoma/i, qty: L(60) }, { cat: ['22100'], must: /sokeri/i, qty: KG(10) }] },
  // --- Muut tuoteryhmät (ei kuratoitua tyyppiä) ---
  { id: 'rice', text: '25 kg basmatiriisiä maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['21340'], must: /basmati/i, qty: KG(25) }] },
  { id: 'pasta-gf', text: '10 kg gluteenitonta pastaa maanantaiksi', date: '2026-11-16', status: 'confirmed', needs: [{ cat: ['21380'], claims: ['FREE_FROM_GLUTEN'], qty: KG(10) }] },
  { id: 'salmon', text: '50 kg lohifileetä maanantaiksi', noOrder: true, why: 'Kaikki 41 lohifileetä ovat Terminal-tuotteita, joiden tilausaika meni to 12.11. (oraakkeli vahvistaa). Oikea vastaus on pysähtyä.' },
  // --- Poikkeukset ---
  { id: 'date-shift', text: '200 litres of lactose-free milk by Sunday', date: '2026-11-16', status: 'pending_approval', reasons: ['DELIVERY_DATE_SHIFT'], needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(200) }] },
  { id: 'partial-arla', text: '100 litraa Arlan rasvatonta laktoositonta maitojuomaa maanantaiksi', date: '2026-11-16', status: 'confirmed', reasons: ['SUBSTITUTION_WITHIN_POLICY'], split: { first: '462775', firstQty: 51 }, needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(100), anyPrice: true }] },
  { id: 'default-mandate', text: '20 litraa laktoositonta maitoa maanantaiksi', buyer: 'demo-kahvila-aalto', date: '2026-11-16', status: 'pending_approval', reasons: ['APPROVAL_ALWAYS'], needs: [{ cat: ['10400'], claims: [LF], not: MILK_NOT, qty: L(20) }] },
  // --- Ei saa arvata ---
  { id: 'nonsense', text: '2 kg unicorn meat', noOrder: true },
];
