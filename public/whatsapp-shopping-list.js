// Local storefront UI. The backend owns list parsing, customer binding and order confirmation.
const ROUTE = '/api/assistant/whatsapp-list';
const CLAIMS = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu' };
const ALLERGENS = { AM: 'maidoton', AW: 'ei gluteeniviljoja', AE: 'munaton', AN: 'pähkinätön', AP: 'ei maapähkinää', AF: 'kalaton', AY: 'soijaton' };
const diet = (value) => [...(value.claims || []).map((c) => CLAIMS[c] || c), ...(value.excludeAllergens || []).map((a) => ALLERGENS[a] || `ei allergeenia ${a}`)].join(', ');
export function describeShoppingList(list) {
  const lines = list.lines.map((line) => {
    const q = line.quantity;
    const quantity = q ? `${String(q.value).replace('.', ',')} ${q.unit === 'L' ? 'l' : q.unit === 'KG' ? 'kg' : q.basis === 'sales' ? 'myyntipakkausta' : 'kpl'}` : 'määrä puuttuu';
    return `- ${line.productTerm}: ${quantity}${diet(line) ? ` (${diet(line)})` : ''}${line.selectedName ? ` — ${line.selectedName}` : ''}`;
  });
  return [`WhatsApp-ostoslista — ${list.companyName}`, `Toimitus: ${list.deliveryDate || 'päivä puuttuu'}`,
    `Ruokavaliot: ${list.diet.known ? diet(list.diet) || 'ei yleisiä erityisvaatimuksia' : 'tarkennettava'}`, ...lines,
    '', 'Voit täydentää listaa tässä tai WhatsAppissa. Tilaus vaatii erillisen yhteenvedon ja TILAA-vahvistuksen.'].join('\n');
}
async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ostoslistaa ei voitu hakea.');
  return data;
}
export async function mountWhatsAppList({ before, onOpen }) {
  const panel = document.createElement('section'); panel.className = 'ta-head';
  panel.setAttribute('aria-label', 'WhatsApp-ostoslista');
  const heading = document.createElement('h2'); heading.textContent = 'WhatsApp-ostoslista';
  const label = document.createElement('label'); label.style.display = 'block'; label.style.marginBottom = '.75rem'; label.textContent = 'Testiasiakas ';
  const select = document.createElement('select'); label.append(select);
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Päivitä lista';
  const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Jatka listaa ostosapurissa'; open.disabled = true;
  const preview = document.createElement('p'); preview.style.whiteSpace = 'pre-wrap'; preview.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.flexWrap = 'wrap'; actions.style.gap = '.75rem'; actions.append(refresh, open);
  panel.append(heading, label, actions, preview); before.before(panel);
  let current; let generation = 0;
  const load = async (buyerId) => {
    const version = ++generation; open.disabled = true; refresh.disabled = true;
    try {
      const data = await request(ROUTE + (buyerId ? `?buyerId=${encodeURIComponent(buyerId)}` : ''));
      if (version !== generation) return;
      current = data;
      select.replaceChildren(...data.accounts.map((account) => {
        const option = document.createElement('option'); option.value = account.buyerId;
        option.textContent = `${account.companyName}${account.personName ? ` / ${account.personName}` : ''}`; return option;
      }));
      select.value = data.buyerId || '';
      preview.textContent = data.shoppingList ? describeShoppingList(data.shoppingList)
        : 'Ei avointa ostoslistaa. Lähetä tuotteet ja määrät WhatsApp-apurille, ja päivitä lista.';
      open.disabled = !data.shoppingList;
    } catch (error) {
      if (version !== generation) return;
      current = null; preview.textContent = error.message;
    } finally { if (version === generation) refresh.disabled = false; }
  };
  select.addEventListener('change', () => { void load(select.value); });
  refresh.addEventListener('click', () => { void load(select.value); });
  open.addEventListener('click', () => {
    if (!current?.shoppingList) return;
    const buyerId = current.buyerId; let list = current.shoppingList; let pending;
    onOpen({ text: describeShoppingList(list),
      async say(text) {
        // Keep the request identity after a network failure; a retry cannot apply the turn twice.
        if (!pending || pending.text !== text) pending = { buyerId, text, messageId: crypto.randomUUID(),
          expectedList: list ? { id: list.id, revision: list.revision } : null };
        const data = await request(`${ROUTE}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
        pending = null; list = data.shoppingList;
        if (select.value === buyerId) await load(buyerId);
        return data;
      },
    });
  });
  await load();
}
