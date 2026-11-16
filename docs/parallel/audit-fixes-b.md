# Katselmoinnin korjaukset B: tilausnumerot, idempotenssi, hintojen tuoreus, julkaisija ja Worker (16.11.2026)

Sessio B (Claude Code), taulun tehtävät adaf1c4d ja 312988a4. Korjatut kohdat raportista `code-audit-2026-11-15-ilta.md`: #6, #7, #13, #15, #24 ja #25. Ei julkaisua, restarttia, D1-ajoja eikä oikeita Meta-, Valio- tai mallikutsuja.

## Mitä muuttui

### #6 Tilausnumero ja samanaikaiset tilaukset (`server/gateway/store.mjs`, `service.mjs`)

- Numero varataan yhdellä atomisella `INSERT … ON CONFLICT DO UPDATE … RETURNING` -lauseella uudesta `counters`-taulusta. Ei enää `COUNT(*)+1`. Varaus jatkaa aina sekä laskurin että olemassa olevien `AGW-…`-numeroiden suurimmasta, joten vanhat kannat ja käsin tai vanhalla koodilla tallennetut tilaukset eivät törmää.
- Uusi tilaus tallennetaan tiukalla `INSERT`-lauseella (`orders.insert`). Sama numero ei voi enää ylikirjoittaa toisen ostajan tilausta.
- `placeOrder` sitoutuu yhdessä `BEGIN IMMEDIATE` -transaktiossa tuoreen hintatarkistuksen (await) jälkeen: idempotenssi, tarjousten kertakäyttö, mandaatin päiväkatto, vahti ja tallennus näkevät saman tilanteen. Toimii myös Turso-kannalla (`server/sqlite.mjs` muuttaa `BEGIN IMMEDIATE`:n kirjoitustransaktioksi).
- Päätösketjun `ledger.append` lukee edellisen rivin ja kirjoittaa uuden samassa transaktiossa, joten usea prosessi ei haaroita ketjua. Kuuntelijat saavat rivit vasta COMMITin jälkeen.
- `PRAGMA busy_timeout` asetetaan ennen `journal_mode`a: kolme prosessia samaan kantaan kaatui ennen käynnistyksessä "database is locked" -virheeseen.

### #7 Idempotenssiavain sidottu sisältöön (`service.mjs`)

- Pyynnön sormenjälki on allekirjoitettujen tarjousten SHA-256 (`requestFingerprint`, tallessa tilauksella).
- Sama avain ja sama sisältö palauttavat saman tilauksen (`duplicate: true`).
- Sama avain ja eri sisältö: jos aiempi yritys on vahvistettu tai odottaa hyväksyntää, vastaus on 409 `IDEMPOTENCY_KEY_REUSED` ja olemassa olevan tilauksen numero. Näin kadonneen vastauksen uusinta uudella tarjouksella ei tilaa toista kertaa.
- Jos kaikki aiemmat yritykset on hylätty, uusi yritys tallennetaan paikkaan `<avain>#<n>`. WhatsAppin `wa-<luonnos>-r<revisio>`-avain toimii siis hylkäyksen ja "näytä"-komennon jälkeen ilman muutosta `order-conversation/index.mjs`:ään (C:n tiedosto, ei kosketa).
- Vanhat tilaukset ilman sormenjälkeä: vahvistettu tai odottava palautuu kuten ennen, hylätty ei estä uutta yritystä.

### #15 Vanha hinta ei kelpaa hiljaa (`server/valioApi.mjs`, `service.mjs`)

- `describePriceSource` luokittelee hinnan: `live`, `sim`, `stale` (vanha välimuistiarvo rajapintavirheessä) tai `last-known` (`VALIO_FALLBACK=last-known`). Ikäraja `FALLBACK_PRICE_MAX_AGE_HOURS`, oletus 72 h.
- Tarjous: liian vanha hinta jää pois (`PRICE_TOO_OLD`). Ikärajan sisällä rivi saa `priceSource`, `priceCurrent` ja `priceFetchedAt`, tarjous lipun `PRICE_NOT_LIVE` ja allekirjoitettu payload todellisen `priceSource`:n (heikoin rivi ratkaisee) ja `priceFetchedAt`:n.
- Tarjouksen yleisotsikko: `priceSource` kertoo tarjottujen rivien todellisen lähteen ("Viimeisin tunnettu hinta: hintarajapinta ei vastannut"), ja uusi `priceOrigin`-kenttä antaa koodin. Ennen otsikko sanoi aina "live".
- Tilaus: tuore tarkistus (`fresh: true`) merkitsee rajapintavirheessä käytetyn välimuistiarvon vanhaksi, vaikka se olisi TTL:n sisällä. Liian vanha estää tilauksen (`PRICE_TOO_OLD`). Ikärajan sisällä tilaus saa `priceSource`, `priceCheckedLive: false`, `priceFetchedAt` ja info-syyn `PRICE_NOT_LIVE`, joka menee myös hyväksyjän jälki-ilmoitukseen. Sama merkintä lisäyksissä (`addToOrder`).
- Sivuvaikutus: `server/storefront.mjs` (kaupan korin tarkistus, `fresh: true`) pitää jo `stale`-hintaa saatavuudeltaan tuntemattomana. Rajapintavirheessä korin tarkistus ei siis enää hyväksy 30 minuutin välimuistihintaa.

### #24 Nollauksen jälkeen toistuva numero (`store.mjs`, `deploy/cloudflare/src/index.ts`, `publish-orders.mjs`)

- Gateway: `counters` ei nollaudu `wipeGateway()`-kutsussa, joten saman kannan numerot eivät toistu.
- Worker: sama numero ja sama `createdAt` on sama tilaus (kopio). Eri `createdAt` ja uudempi `observedAt` korvaa vanhan tapahtuman ja poistaa vanhan tilauksen demomaksun ja agentin jäljen D1-batchissa. Uusi tilaus saa oman maksun, maksulinkin ja vahvistusviestin. Vanhempi välitys ei korvaa uudempaa (`superseded`).
- Resendin idempotenssiavain on `order-confirmation/<numero>/<createdAt>`, jotta korvaavan tilauksen viesti ei putoa vanhan avaimen alle.
- Julkaisija tunnistaa välitetyn tilauksen avaimella `<numero>@<createdAt>` (`orderEventKey`). Vanha pelkkä numero `known`-joukossa lasketaan yhä välitetyksi (pilven kv-tila).

### #25 Puuttuva summa ei jumita (`demo-payment.ts`, `publish-orders.mjs`)

- `registerDemoPayment` ei heitä virhettä, jos summa puuttuu tai on virheellinen. Maksua ei luoda, vahvistus lähtee ("Price to be confirmed"), ja lokiin jää `demo_payment_unavailable` ilman vastaanottajaa.
- Julkaisija käsittelee tilaukset erikseen: verkkovirhe, 5xx, 408 ja 429 yritetään uudelleen tilauskohtaisella viiveellä (5 s, tuplautuen, enintään 5 min). Pysyvä 4xx kirjataan eikä toistu. Väärä avain (401/403) koskee kaikkia ja pysäyttää kierroksen kuten ennen. Agentin jäljet eivät enää jää välistä, jos yksi tilaus epäonnistuu. Epäonnistumiset näkyvät lokissa `order_event_failed`.

### #13 Landingilta liittyneet (`publish-orders.mjs`)

- `readSnapshot` julkaisee oletuksena kaikkien WhatsApp-jäsenten tilaukset (`members`-taulu), ei vain `WHATSAPP_DEMO_PHONE`:a. Syy: jokainen vahvistettu WhatsApp-tilaus saa "Siirry demomaksuun" -linkin, ja maksusivu löytää tilauksen julkisesta `/api/orders`-listasta.
- `WHATSAPP_DEMO_BUYER_ID` (esim. kahvila-aalto) otetaan mukaan, mutta vain tilaukset, joiden `buyerReference` alkaa `whatsapp:`. Saman ostajan kauppa- ja MCP-tilaukset eivät tule mukaan.
- Selaindemo ja selainkeskustelu vain lipuilla kuten ennen. `--only-demo-phone` (ja `onlyDemoPhone: true`) palauttaa vanhan rajauksen.
- Sähköposti lähtee kaikista `ORDER_EMAIL_TO`-osoitteeseen. Tervehdysnimi (`ORDER_EMAIL_CUSTOMER_NAME`) vain demonumeron ja kiinnitetyn ostajan tilauksiin, muille neutraali tervehdys. Jäsenten nimiä ei lähetetä Workerille.
- **Yksityisyys, päätettävä ennen käyttöönottoa:** julkinen tilauslista näyttää nyt myös muiden testaajien tilausten julkiset kentät (tuotteet, määrät, summa, tila, numero). Nimiä ja numeroita ei näy. Aiemmin käyttäjä hyväksyi julkiseksi vain yhden testiasiakkaan tilaukset.

### A:n pyyntö (#16)

`service.mjs`: tilaukselle `clockCycle`, tarjouspayloadiin `cyc` ja `verifyOffers` hylkää (`OFFER_EXPIRED`) edellisen kierroksen tarjouksen, kun `clock.looping`. Kutsu on `clock.cycle?.() ?? 0`, joten se toimii ennen A:n `clock.mjs`-muutosta ja sen jälkeen.

## Tarkistukset

- Uusi `test/audit-fixes-b.test.mjs` 8/8: samanaikaiset tilaukset node:sqlite- ja libsql-kannalla (kaksi ostajaa, sama tarjous kahdella avaimella, sama pyyntö kahdesti), kolme prosessia samassa kannassa (12 eri numeroa ja ehjä ketju), #7 hylkäys → uusi tilaus → uusinta → 409, vanhat tallenteet, nollaus ja #15 molemmat varapolut. Koeajuri `test/helpers/audit-b-orders.mjs`.
- Sama testi origin/mainin 76b1359 koodilla: 8/8 epäonnistuu (sama numero `AGW-20261114-0001` kahdelle ostajalle, hylätty tilaus palautuu, numerointi alkaa alusta nollauksen jälkeen, hintamerkinnät puuttuvat).
- Uusi `deploy/cloudflare/test/audit-fixes-b.test.mjs` 7/7: korvaus batchilla ja ilman, oma vahvistusviesti, myöhässä tuleva vanha välitys, puuttuva summa, julkaisijan eristys ja viive, jäsenvalinta ja nimi.
- Päivitetyt vanhat testit (tarkoituksellinen muutos): `orders.test.mjs` (#13), `order-events.test.mjs` (Resend-avain), `demo-payment.test.mjs` (#25), `checkout-flow.test.mjs` (`known`-avain).
- `npm test` 318/318, `npm --prefix deploy/cloudflare test` 44/44, typecheck ja build läpi.

## Käyttöönotto (E, Eeliksen luvalla)

1. **D1-migraatiota ei tarvita.** Worker käyttää olemassa olevia tauluja.
2. **Gatewayn kanta:** `counters`-taulu syntyy käynnistyksessä (`CREATE TABLE IF NOT EXISTS`) sekä paikallisessa SQLite- että Turso-kannassa. Ensimmäinen tilaus jatkaa suurimmasta olemassa olevasta numerosta.
3. **Järjestys:** ensin Worker (`deploy/cloudflare`, uusi `index.ts` ja `demo-payment.ts`), sitten botti ja julkaisija. Vanha Worker hyväksyy uuden julkaisijan pyynnöt, mutta ei tunnista nollauksen jälkeisiä tilauksia uusiksi.
4. **Julkaisija:** uusi koodi julkaisee kaikkien WhatsApp-jäsenten tilaukset. Jos Eelis ei hyväksy laajempaa julkista listaa, lisää `--only-demo-phone` (Mac) ja kerro pilvisiirrolle (cloud.mjs ei välitä lippua; tarvittaessa `onlyDemoPhone: true` sen `readSnapshot`-kutsuun).
5. **Valinnainen:** `FALLBACK_PRICE_MAX_AGE_HOURS` (oletus 72). Jos Valion rajapinta suljetaan pidemmäksi aikaa, arvoa voi nostaa; merkinnät säilyvät.
6. **Älä aja kahta gatewayta samaan Workeriin** (Mac ja pilvi yhtä aikaa eri kannoilla): saman numeron eri tilaukset korvaisivat toisensa.

## Ei korjattu tässä

- `addToOrder` lukee tilauksen ennen tuoretta tarkistusta ja tallentaa sen jälkeen: kaksi samanaikaista lisäystä voi kadottaa toisen. Sama kuvio kuin #6, mutta vain saman tilauksen lisäyksissä.
- WhatsAppin vastaus ei vielä kerro asiakkaalle `PRICE_NOT_LIVE`-merkinnästä (order-tools ja order-conversation, A:n ja C:n tiedostot).
- `contract.mjs`:n REASONS-listasta puuttuvat `PRICE_NOT_LIVE` ja `PRICE_TOO_OLD` (A:n varaus, pyydetty taululla #289). Siihen asti viesti on syykoodi.
