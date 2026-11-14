# WhatsAppista samaan ostoskoriin — korilinkkichatti

Käyttäjä pyysi WhatsApp-vastaukseen linkin juuri keskustelussa koottuun ostoskoriin ja tilauksen tarkistamiseen/maksamiseen. Nykyisessä demossa ei ole maksupalvelua: selain vahvistaa demotilauksen, ei oikeaa maksua tai Valio-tilausta.

## Toteutus

- `server/whatsapp/cart-link.mjs`: määräaikainen, HMAC-allekirjoitettu 24 tunnin linkki yhdelle asiakassidokselle ja yhdelle luonnokselle. Käyttää samaa `ordering.getShoppingList` / `ordering.chat` -siltaa, ei kopiota selainkoriin. Saman korin uudet määrät ja päivä näkyvät linkistä. Uusi kori, numeron uudelleenyhdistäminen, revokointi ja linkin vanheneminen estävät vanhan linkin käytön.
- `server/whatsapp/runtime.mjs`: valinnainen korilinkkikytkentä vain tilaustilassa. OK-korilinkkichatin `cart-handoff.mjs`-apuri käsittelee ajantasaiseen ready-yhteenvetoon annetun ok/okei/joo-vastauksen ja suoran avaa kori/TILAA-pyynnön ennen tilauskoneen kutsumista. Näistä ei synny tilausta. WhatsApp-yhteenvedon ohjeeksi vaihdetaan ok → korilinkki; keskeneräisiin kysymyksiin ei lisätä linkkiä automaattisesti. Odottavan lisätuotteen hyväksyntää ei kaapata linkiksi.
- `public/whatsapp-cart.{html,js,css}`: mobiilissa avautuva kori, tarkat tallennetut määrät/ruokavaliot/toimituspäivä, täydennysviesti, tuotevalinnat, erillinen tarkistus ja demovahvistus. Vahvistuspainike näkyy vasta selaimessa pyydetyn ready-yhteenvedon jälkeen. Muutos piilottaa vahvistuksen. Sivun avaaminen ei tee hinta-/malli-/tilauskutsua.
- Sivun ja API:n rajattu reitti on `/whatsapp/cart`. Koko storefront, paikallinen testiasiakasvalitsin, ostaja-avaimet ja muut yksityiset reitit pysyvät nykyisten rajojen takana. Token on URL-fragmentissa ja API:n Authorization-otsakkeessa, ei HTTP-polussa/queryssa tai linkin esikatselussa. Ei kolmansien osapuolten resursseja. No-store, no-referrer ja CSP. Linkin haltija voi asioida kyseisessä demokorissa sen voimassaoloaikana.
- Selain lähettää nykyisen draftId/revision-parin ja pysyvän messageId:n samaan sarjallistettuun/idempotenttiin siltaan. Samanaikainen WhatsApp-muutos palauttaa 409, päivittää korin ja vaatii uuden tarkistuksen. Verkkovirheen jälkeen sama pyyntö voidaan uusia; pending-pyyntö säilyy tabin sessionStoragessa myös reloadissa. 10 kirjoituspyyntöä/min/asiakassidos; lukeminen pysyy käytettävissä.

## Tarkistettu

- `node --test test/whatsapp-cart-link.test.mjs test/whatsapp-cart-handoff.test.mjs test/shopping-list-handoff.test.mjs test/whatsapp.test.mjs`: **43/43 läpi**, 0 virheitä/ohituksia. Näistä linkin omia testejä 7. Käytössä tilapäiset kannat, synteettinen katalogi ja simuloidut ulkoiset palvelut. Ensimmäinen sandbox-ajo estyi paikallisen listen-oikeuden puuttumiseen; sallituilla eristetyillä HTTP-porteilla uusittu ajo läpäisi.
- Oikea kanavan webhook → tallennettu kori → WhatsApp-korilinkki → HTTP-luku/muutos → selainvahvistus testattu simuloidulla Meta-lähetyksellä. Kattaa tyhjän/väärennetyn/vanhentuneen tokenin, tunnelin otsakkeet, asiakaserottelun, resetin/re-pairin, vanhan revision, saman vahvistuksen uusinnan, esikatselun tietosuojan, content type/body-rajat ja pyyntönopeuden.
- Koko `npm test`: **218/219 läpi**. Ainoa virhe `test/storefront-cart.test.mjs:20`: VM yrittää ajaa etusivun `export function whatsappEntry` -rivin tavallisena skriptinä. Sama aiemman dialogivaiheen havainto ilmoitettu storefront-omistajalle; tässä ei muokata sen tiedostoja.
- Chrome headless, erillinen palvelin ja synteettinen kori: **1280 ja 375 px**, 50 kpl + 0,5 l sekä 18.11 säilyvät, reload säilyttää linkin, tarkistus → muutos → uusi tarkistus, WhatsApp-muutoksen jälkeinen vahvistus estyy, lopuksi yksi nimenomainen demovahvistus. Kadonnut vahvistusvastaus + reload + saman pyynnön uusinta näyttää saman tilauksen ilman kaksoistilausta. Ei vaakaylivuotoa tai JS-virheitä. Tuloskuvat paikallisesti `/private/tmp/whatsapp-cart-desktop.png` ja `/private/tmp/whatsapp-cart-mobile.png`. Selainkoe ei käytä käyttäjän kantoja tai oikeita ulkoisia palveluita.

## Käyttöönotto

Aseta nykyisen WhatsApp-palvelimen ympäristöön `WHATSAPP_PUBLIC_URL=https://nykyinen-tunneli.example` (pelkkä julkinen HTTPS-alkuperä, ei webhook-polkuja/querya). Sama tunneli voi palvella webhookia ja rajattua koria. Tyhjä asetus pitää uuden reitin ja linkityksen poissa. HMAC käyttää jo olemassa olevaa `WHATSAPP_APP_SECRET`-arvoa erillisellä allekirjoitusprefiksillä; uutta avainta tai tietokantataulua ei tarvita. Tunneli ja sama asetus pitää uusia yhdessä osoitteen vaihtuessa.

Koordinointi: paikallisen taulun tehtävä `2779d057`, yhteisen MCP:n `4d367ec0`. Runtime ja uudet linkkitiedostot tässä chatissa; OK-helper omassa chatissaan. Ei dialogue/ordering/gateway-muutoksia tässä työvaiheessa eikä omaa palvelinrestartia. Käyttöönoton omistava chat yhdistää linkin, OK-helperin ja valmiit muut korjaukset samaan testattuun snapshotiin samoilla kannoilla.

**Tila:** lähde ja eristetyt testit valmiit. Nykyisen 4749-palvelimen päivitystä, asetuksen aktivointia, oikeaa puhelinlinkin toimitusta tai oikeaa maksamista ei vielä tämän raportin perusteella väitetä tehdyksi.
