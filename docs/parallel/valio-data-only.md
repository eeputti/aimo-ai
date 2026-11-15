# Tuotetiedot vain Valion datasta (Claude Code, valio-data-only, 15.11.2026)

**Käyttäjän pyyntö (Eelis klo 17.50):** "kaiken datan tuotteista pitäs tulla tuolt valion datasta". Tarkistettu jokainen tuotekenttä, jonka asiakas näkee WhatsApp-vastauksissa, WhatsAppin korisivulla (`/whatsapp/cart`) sekä kassa- ja demomaksusivulla. Malli saa vain muotoilla.

Valion data tässä raportissa:

- **Katalogi** `data/catalog.json` (17 546 tuotetta), rakennettu challenge-aineiston `product_data.json`:sta sekä toimitusvarmuus- ja hiilijalanjälki-CSV:istä (`scripts/build-catalog.mjs`).
- **Valion API** (`VALIO_API_BASE`, avain `.env`:ssä): hinta, alv, vertailuhinta, saatavuus, toimituspäivä, tilausaika.
- **Valion julkaisemat tuotekuvat** valioaimo.fi:n ja valio.fi:n tuotesivuilta.

## Inventaario

| Kenttä | Missä asiakas näkee | Lähde koodissa | Tila |
|---|---|---|---|
| Tuotenimi, merkki | WhatsApp, korisivu, maksusivu | katalogi `name`, `brand` (`storefront.mjs`, `gateway/service.mjs` `lineOf`) | ✅ |
| Tuotenumero | korisivu, tuotekysymys | katalogi `id` | ✅ |
| Kuva | korisivu | `data/img` välimuisti (`storefront-cart.mjs`) | ❌ → ✅ korjattu |
| Yksikköhinta, rivin hinta | WhatsApp, korisivu | API `catalogPrice` (`valioApi.mjs` `normPrice`) | ✅ |
| Alv | korisivu | API `tax.taxRate`; varalla 13,5 % (`lineOf`), ei laukea: 905/905 API-hintaa sisälsi alv:n | ✅ |
| Vertailuhinta | korisivu | sivu laski `hinta / pakkauskoko` | ⚠️ → ✅ API `comparisonPrice` |
| Myyntierä, sisältö (l, kg, kpl) | WhatsApp, korisivu | katalogi `salesUnit`, `kg`, `litres`; ristiriidassa API:n vertailuhinnasta (`gateway/quantity.mjs`) | ✅ |
| Saatavuus, toimituspäivä, tilausaika | WhatsApp | API `availability` (`scheduleLines`, `closingTime`) | ✅ |
| Saldo | WhatsApp | API `availableAmount` (999999 = tuntematon) | ✅ |
| Allergeenit, voi sisältää | WhatsApp-vaihtoehdot (rajaus), tuotekysymys | katalogi `contains`, `mayContain`, `hasAllergenData` | rajaus ✅, tuotekysymys ❌ → ✅ |
| Ainesosat | tuotekysymys | katalogi `ingredients` (pääainesosat, lyhennetty 220 merkkiin) | ❌ → ✅ |
| Alkuperämaa | tuotekysymys | katalogi `country` | ❌ → ✅ |
| Säilytys | tuotekysymys | katalogi `temp` (vain lämpötilaluokka, ei säilytysohjetta) | ❌ → ✅ |
| Merkinnät (laktoositon, luomu ym.) | WhatsApp-vaihtoehdot, tuotekysymys | katalogi `labels` | vaihtoehdot ✅, tuotekysymys ❌ → ✅ |
| CO2, toimitusvarmuus | WhatsApp-vertailu | katalogi `co2`, `reliability` (Valion CSV:t) | ✅ |
| Käyttövinkit | WhatsApp | malli (yleinen ruoanlaittovinkki), ei tuotefaktoja | ⚠️ → ✅ faktaväitteet pudotetaan |
| Toimitusmaksu | korisivu | kiinteä "0,00 €" sivulla | ⚠️ → ✅ "Ei tiedossa" |
| Kassa ja demomaksu | maksusivu | tilauksen rivit (nimi, määrä, yksikkö) ja summa gatewayn tilauksesta | ✅ |

Korikuittaus (`cart-presentation.mjs`) on rajattu jo aiemmin: malli kirjoittaa vain lyhyen kuittauksen ilman tuotenimiä tai faktoja. Linkkineuvoja (`link-advice.mjs`) valitsee vain katalogin tuotteita.

## Löydökset ja korjaukset

### 1. Kuvat: toisen tuotteen kuva ja Open Food Facts

Kuvapalvelu haki tarkan kuvan lisäksi "lähin vastaava" -kuvan (toisen tuotteen sivu sanojen päällekkäisyydellä) ja Open Food Factsin kuvan GTIN:llä. Korisivu näytti kaikki.

| Välimuistin 401 kuvaa | Määrä | Nyt |
|---|---:|---|
| valioaimo.fi, tuotenimen täsmäosuma | 292 | ✅ näkyy |
| valio.fi, tuotenimen täsmäosuma | 43 | ✅ näkyy |
| valio.fi, lähin vastaava | 29 | ⬜ paikkamerkki |
| valioaimo.fi, lähin vastaava | 19 | ⬜ paikkamerkki |
| Open Food Facts | 18 | ⬜ paikkamerkki |

**66 katalogituotteen kuvaa poistuu näkyvistä, 335 jää.** Lisäksi kopioidun vertailukorin yksi S-kauppojen kuva (`9999298`, ei katalogituote) ei enää näy. Välimuistia ei poistettu; kuvatiedostot ja `_meta.json` säilyvät.

- `server/image-cache.mjs`: yhteinen sääntö `isValioProductImage` (lähde `valioaimo.fi` tai `valio.fi`) ja `isValioAsset` (vertailukorin kuva Valion palvelimelta).
- `server/images.mjs`: haetaan vain tarkka Valion tuotesivu. Lähin vastaava- ja Open Food Facts -haku poistettu. Välimuistin vanha ei-Valion kuva palauttaa 404 eikä käynnistä uutta hakua.
- `server/whatsapp/storefront-cart.mjs`: korisivun kuvareitti käyttää samaa sääntöä.
- Huomio: valio.fi-täsmäosuma ohittaa pakkauskoon nimessä (sama tuote, kuva voi olla eri pakkauksesta).

### 2. Tuotekysymykset: malli kirjoitti faktat itse

Tuotekysymykseen (esim. "onko laktoositonta, mistä maasta") malli sai katalogin tiedot ja kirjoitti vastauksen vapaasti. Mikään ei estänyt sitä lisäämästä omaa tietoa (alkuperä, säilyvyys, gluteenittomuus).

- Uusi `server/whatsapp/product-facts.mjs`: tunnistaa kysytyt tiedot (allergeenit, ainesosat, alkuperä, säilytys, merkinnät) ja kirjoittaa ne koodilla katalogin kentistä. Puuttuva tieto: "ei Valion tuotetiedoissa". Kysytty tuote on ensin ostoskorin valittu tuote, sitten katalogihaun osumat (enintään 2).
- `server/whatsapp/dialogue.mjs`: tuotekysymyksen vastaus = mallin yleinen vinkki + Valion tietorivit. Mallin tekstistä pudotetaan tuotefaktaväitteet (myös oikealta kuulostavat). Neuvontamalli saa enää vain tuotteiden nimet. Jos tuotetta ei löydy: "En löytänyt Valion tuotetiedoista tuotetta haulla ..." eikä mallin arviota.

### 3. Korisivun vertailuhinta

Sivu laski vertailuhinnan itse (`rivin hinta / sisältö`). Gatewayn kokokorjauksen jälkeen 456/462 tuotetta täsmäsi Valion `comparisonPrice`:en, 6 poikkesi 0,5 to 3 %. Nyt `comparisonPrice` kulkee gatewayn riviltä (`lineOf`) tarjoukseen (`order-tools` `quote`), korin vientiin (`storefront-whatsapp-sync.mjs`) ja sivulle sellaisenaan. Ilman Valion arvoa sarake on tyhjä.

### 4. Hinnat ja saatavuus tulevat oikeasta API:sta

- `.env`:ssä `VALIO_API_KEY` on asetettu, `.env.whatsapp` ei ohita sitä. Käynnissä olevan 4749-palvelimen hintavälimuisti (`whatsapp-kitchen.db`, luettu vain luku -tilassa): **1 810/1 810 riviä `live`, 0 simuloitua**, viimeisin 15.11. klo 16.55.
- 66d23b2 (toinen chatti) lisäsi varan `VALIO_FALLBACK=last-known`: se käyttää vain botin jo saamia oikeita Valion vastauksia, ei keksi hintaa kysymättömälle tuotteelle. Sopii tähän linjaan.

## Tarkistukset

- Uusi `test/valio-data-only.test.mjs` (8 testiä): tuotekysymyksen tunnistus, faktarivit kentistä ja puuttuvan tiedon teksti, korin valittu tuote ensin, mallin väitteiden pudotus, dialogi ei päästä mallin faktaväitettä läpi eikä anna mallille allergeenitietoja, puuttuva tuote, korin vientirivit vain tarjouksen kentistä, kuvasääntö.
- Päivitetty `test/images.test.mjs` (lähin vastaava ja Open Food Facts eivät näy, välimuisti säilyy) ja `test/whatsapp-storefront-cart.test.mjs` (kuvareitti, korin vientirivin nimi katalogista ja vertailuhinta hintatiedosta).
- `npm test` omassa worktreessä origin/mainin päällä: **295/295**.
- **Oikean mallin koe** (`node --env-file=.env`, oikea malli ja oikea Valion API, väliaikaiset kannat, `DEMO_NOW` 15.11. klo 9, ei Metaa, TILAA-sanaa ei lähetetty): 3 keskustelua, 6 asiakasviestiä, **9 mallikutsua, 0 virhettä, 4 Valion API-kutsua (86 tuotetta), 0 tilausta**.

| Keskustelu | Tulos |
|---|---|
| "Sisältääkö Valion Oltermanni laktoosia ja mistä maasta se on?" | ✅ Valion tiedoista: Oltermanni (476969), allergeenit maito, merkinnät laktoositon, alkuperämaa Suomi. Mallin oma tuoteväite pudotettiin. |
| "Miten Oltermannia säilytetään?" | ✅ Lämpötilaluokka kylmä, "tarkempaa säilytysohjetta ei ole Valion tuotetiedoissa". |
| "Mitä allergeeneja tuoreessa kurkussa on ja mistä maasta se tulee?" | ✅ Allergeenit ja alkuperä: "ei Valion tuotetiedoissa". Malli ei täydentänyt. |
| 20 l laktoositonta maitoa + 5 kg voita, valinnat 1 ja 1 | ✅ Kori valmis. Korisivun rivit: nimi katalogista, hinta ja alv API:sta (1,40 € ja 3,30 €, alv 13,5 %), vertailuhinta API:sta (1,40 €/l, 6,60 €/kg), kuvat 200 Valion valio.fi-tuotesivulta. |

## Rajat ja jatko

- 4749-palvelinta ei käynnistetty uudelleen; käyttäjän kantoja tai `.env`-tiedostoja ei muutettu. Koordinaattorisessio käynnistää palvelimen tämän commitin jälkeen.
- Ainesosateksti on katalogissa lyhennetty 220 merkkiin; vastaus merkitsee sen "(lyhennetty)". Täyttä ainesosaluetteloa tai säilytysohjetta ei ole katalogissa.
- Tilausmoottorin omat vastaukset (vaihtoehdot, yhteenveto) tulivat jo työkalujen datasta; order-reitin mallivastausta (kysymykseen samalla korimuutoksella) ei suodateta tuotefaktasanoista, koska siinä on usein asiakkaan oma ruokavaliotoive.
