// Static homepage reference, captured from Toimitustukku on 14 November 2026.
// Prices and stock labels are presentation data. Basket additions do not place orders.
const cardProducts = new Map();
const icon = (name) => `<span class="icon" aria-hidden="true" style="--icon:url('/storefront-assets/icons/${name}.svg')"></span>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (value) => value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function product(p) {
  cardProducts.set(String(p.id), { ...p });
  const tags = [p.novelty ? '<span class="product-tag novelty">Uutuus</span>' : '', p.oldPrice ? '<span class="product-tag">Tarjous</span>' : '', p.seasonal ? '<span class="product-tag seasonal">Kausituote</span>' : ''].join('');
  return `<article class="product-card" data-cart-product="${esc(p.id)}">
    ${tags ? `<div class="product-tags">${tags}</div>` : ''}
    <div class="card-actions"><button type="button" class="round-icon" aria-label="Lisää tilauspohjalle">${icon('file-plus')}</button><button type="button" class="round-icon" aria-label="Lisää suosikiksi">${icon('star')}</button></div>
    <div class="product-picture">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="176" height="132">` : ''}</div>
    <div class="product-name" title="${esc(p.name)}">${esc(p.name)}</div>
    <div class="product-code">${p.frozen ? icon('snow-flake') : ''}${esc(p.id)}${p.pack ? ` ${esc(p.pack)}` : ''}</div>
    <div class="active-price${p.oldPrice ? ' sale' : ''}"><strong>${eur(p.price)}</strong><small>/ ${esc(p.unit)}</small>${p.oldPrice ? `<del>${eur(p.oldPrice)}</del>` : ''}</div>
    <div class="price-bottom"><div class="comparison">${p.comparison != null ? `${eur(p.comparison)} / ${p.comparisonUnit || 'kg'}<br>` : ''}${eur(p.price * (1 + (p.vat || 13.5) / 100))} / ${esc(p.unit)} (alv ${p.vat || 13.5} %)</div><button type="button" class="cart-button${p.unavailable ? ' notify' : ''}" aria-label="${p.unavailable ? 'Tilaa saatavuusilmoitus' : 'Lisää ostoskoriin tuote'} ${esc(p.name)}">${icon(p.unavailable ? 'bell' : 'shopping-cart')}</button></div>
    <div class="stock-area"><div class="stock"><span class="stock-dot${p.unavailable ? ' unavailable' : ''}"></span><span>${esc(p.stock)}</span>${p.substitutes ? '' : icon('clock')}</div>${p.substitutes ? `<button type="button" class="substitutes">${icon('clock')}Katso korvaavat</button>` : ''}</div>
  </article>`;
}

function rail(title, products, { link = 'Katso kaikki', hero = '', id = '' } = {}) {
  return `<section class="product-section"${id ? ` id="${id}"` : ''}><div class="container">
    <div class="section-heading"><h2>${title}</h2><button type="button" class="text-link">${link}</button></div>
    <div class="rail-wrap"><div class="product-rail">${hero}${products.map(product).join('')}</div><span class="rail-fade"></span><button type="button" class="rail-next" aria-label="Seuraava tuote">${icon('caret-right')}</button></div>
  </div></section>`;
}

const christmas = `<div class="hero-banner"><img src="/storefront-assets/christmas.jpg" alt="Joulun jälkiruokia" width="440" height="440"><div class="hero-copy"><h1>Herkut pikkujoulukauteen</h1><p>Nappaa jälkiruokapöytään piparit, konvehdit &amp; muut sesongin herkut!🍬</p><button type="button" class="solid-button">Katso joulun tuotevalikoima</button></div></div>`;
const november = `<div class="hero-banner"><img src="/storefront-assets/november.jpg" alt="Marraskuun sesongin hedelmät ja vihannekset" width="440" height="440" loading="lazy"></div>`;

function feature(image, title, text, button, classes = '') {
  return `<section class="feature-section"><div class="container"><div class="feature ${classes}"><div class="feature-copy"><h2>${title}</h2><p>${text}</p><button type="button" class="solid-button">${button}</button></div><img src="/storefront-assets/${image}.jpg" alt="" loading="lazy" width="672" height="360"></div></div></section>`;
}

const promos = [
  ['campaign', 'Tukustu-kampanjatuotteet', 'Tarjoamme marraskuussa paljon herkullisia kampanjatuotteita. Tutustu tuotteisiin ja tilaa suosikkisi!', 'Osta tuotteita'],
  ['seasons', 'Sesonkikohtaiset valikoimat', 'Hyödynnä eri sesonkeja, tapahtumia ja teemapäiviä vuosisuunnittelussa!', 'Ajankohtaiset valikoimat'],
  ['minun-aimo', 'Minun Aimo apuna arjessa', '<strong>Minun Aimo</strong> kokoaa ostot, hinnat ja katteet kätevästi samaan paikkaan.', 'Avaa Minun Aimo'],
];

async function render() {
  const response = await fetch('/storefront-data.json');
  if (!response.ok) throw new Error('Etusivun sisältöä ei saatu ladattua');
  const d = await response.json();
  document.querySelector('#storefront-content').innerHTML = `
    ${rail('Joulun jälkiruoat', d.desserts, { link: 'Koko joulun tuotevalikoima', hero: christmas, id: 'joulu' })}
    <section class="category-section"><div class="container"><h2>Selaa tuoteryhmiä</h2><div class="category-list">${d.categories.map(([name, count]) => `<button type="button">${esc(name)} <span>${count}</span></button>`).join('')}</div>
      <div class="welcome"><h2>Hei uusi käyttäjä! 👋 Tutustu verkkokaupan käyttövinkkeihin ja hyödynnä kaikki ominaisuudet helposti ✅</h2><button type="button" class="solid-button">Katso vinkit</button></div>
    </div></section>
    <div class="campaign-section">${rail('Tarjouksessa juuri nyt', d.campaign, { link: 'Katso kaikki tarjoustuotteet' })}</div>
    <section class="banner-section"><div class="container"><div class="banner-rail">${promos.map(([image, title, text, button]) => `<article class="promo"><img src="/storefront-assets/${image}.jpg" alt="" loading="lazy" width="432" height="220"><div class="promo-copy"><h2>${title}</h2><p>${text}</p><button type="button" class="solid-button">${button}</button></div></article>`).join('')}</div></div></section>
    ${rail('Tutustu uutuuksiin ✨', d.novelty)}
    ${feature('feelia', 'Erottaudu brunssilla!', 'Tee brunssista herkullinen ja helppo. <strong>Feelian puurot</strong> tuovat aamiaiseen makua ja vaihtelua kustannustehokkaasti.', 'Osta tuotteita')}
    ${rail('Sesongin hedelmät ja vihannekset🍂', d.seasonal, { hero: november })}
    ${feature('hkfoods', 'Porsaan uudet leikkuut', 'Tutustu <strong>HKFoodsin</strong> uusiin porsaan leikkuisiin! Murea viljaporsaan kassler sekä mehevä viljaporsaan kylki tuovat makua ja mehevyyttä ruokalistalle.', 'Osta tuotteita', 'autumn reverse')}
    ${rail('Herkullisimmat burgerituotteet 🍔', d.burgers, { link: 'Finger food -herkut 🍟' })}
    <section class="news-section"><div class="container"><div class="section-heading"><h2>Tiedotteet</h2><button type="button" class="text-link">Katso kaikki tiedotteet</button></div><div class="news-grid">
      <article class="news-card"><div class="news-meta"><span>Poikkeamat</span><time>29.10.2026</time></div><h3>Huomioitavaa loppuvuoden toimituksista</h3><p>Pyhäinpäivä 31.10. on normaali toimituspäivä niille asiakkaille, joille lauantai on toimituspäivä…</p><button type="button">Lue lisää</button></article>
      <article class="news-card"><div class="news-meta"><span>Vinkki</span><time>2.2.2026</time></div><h3>Löydä yhteensopivia tuotteita</h3><p>Mistä löydät kupille sopivan kannen?</p><button type="button">Lue lisää</button></article>
      <article class="news-card"><div class="news-meta"><span>Vinkki</span><time>16.1.2026</time></div><h3>Vertaile tuotteita</h3><p>Tiesitkö, että meillä voit vertailla tuotteita helposti?</p><button type="button">Lue lisää</button></article>
    </div></div></section>
    ${feature('recipes', 'Tuo reseptisi Minun Aimoon', 'Ihastu katelaskuriin ja tilaa tuotteet helposti!', 'Kokeile heti', 'summer reverse')}`;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.product-card .cart-button');
  if (button) {
    const p = cardProducts.get(button.closest('[data-cart-product]').dataset.cartProduct);
    let status = button.closest('.product-card').querySelector('[data-cart-feedback]');
    if (!status) {
      status = document.createElement('p');
      status.dataset.cartFeedback = '';
      status.setAttribute('role', 'status');
      button.closest('.product-card').append(status);
    }
    if (p?.unavailable) { status.textContent = 'Tuote ei ole saatavilla. Valitse toinen tuote.'; return; }
    button.disabled = true;
    try {
      if (!window.aimoCart || !p) throw new Error('Ostoskori ei ole käytettävissä. Lataa sivu uudelleen.');
      await window.aimoCart.ready;
      await window.aimoCart.add(p, p.step || 1, window.aimoCart.get().selectedDate);
      status.textContent = 'Lisätty ostoskoriin.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
  const next = event.target.closest('.rail-next');
  if (next) { const rail = next.parentElement.querySelector('.product-rail'); rail.scrollBy({ left: 280, behavior: 'smooth' }); }
  if (event.target.closest('.close-chat')) document.querySelector('.chat-intro').hidden = true;
  if (event.target.closest('.chat-launch')) { const intro = document.querySelector('.chat-intro'); intro.hidden = !intro.hidden; }
});

export { product, rail };
if (document.querySelector('#storefront-content')) render().catch((error) => { document.querySelector('#storefront-content').innerHTML = `<div class="container"><p>${esc(error.message)}</p></div>`; });
