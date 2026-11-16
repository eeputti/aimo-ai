# Tilaukset näkyvät vain tilaajalle: henkilökohtainen tilauslinkki (17.11.2026)

Sessio B (Claude Code), taulun tehtävä 8bc2c297. Eeliksen kysymys: voisiko demon tilaukset nähdä selainkohtaisesti tai puhelinnumerokohtaisesti, niin että jokainen näkee vain omansa? Vastaus oli kyllä, ja Eelis pyysi toteuttamaan sen ("Kyllä, tee se"). Ei julkaisua, restarttia, D1-ajoja eikä oikeita Meta-, Valio- tai mallikutsuja.

## Lähtötilanne

- WhatsAppissa jokainen puhelinnumero on botille oma asiakas, ja selainkeskustelussa jokainen selain saa oman synteettisen testiasiakkaan (`server/whatsapp/web-chat.mjs`). Asiakkaat oli siis jo erotettu.
- Ainoa kaikille yhteinen kohta oli Workerin julkinen `GET /api/orders`. Se listasi uusimmat 20 tilausta tuotteineen ja summineen sekä jokaisen demomaksun linkin. Maksusivu haki tilauksen tästä listasta pelkällä tilausnumerolla (`demo-payment.html#AGW-…`), joten numeron arvaamalla pääsi toisen tilaukseen ja maksuun (katselmoinnin avoin #263).
- B:n #13 (6a764ce) laajensi julkaisijan kaikkiin WhatsApp-jäseniin, joten muiden testaajien tilaukset olisivat näkyneet kaikille. Tämä muutos poistaa sen ongelman.

## Ratkaisu

1. **Henkilökohtainen linkki.** Botti antaa vahvistetulle tilaukselle linkin `demo-payment.html#<tilausnumero>.<tunniste>`. Tunniste on `HMAC-SHA256(WEBCHAT_SECRET, "aimo-order-link-v1\0<tilausnumero>\0<luontiaika>")` base64url-muodossa (43 merkkiä). Botti laskee sen tiedostossa `server/whatsapp/checkout.mjs` (`orderLinkToken`), ja `runtime.mjs` antaa sille salaisuuden ja tilauksen luontiajan gatewayn kannasta. Linkki tulee ostoskorisivun Siirry demomaksuun -painikkeeseen sekä WhatsAppissa että selainkeskustelussa (`public/whatsapp-checkout.js` hyväksyy vain allekirjoitetun muodon).
2. **Worker tarkistaa saman tunnisteen** (`deploy/cloudflare/src/demo-payment.ts`: `orderLinkToken`, `verifyOrderLinkToken`, `ownOrders`). Se lukee luontiajan omasta `order_events`-taulustaan ja laskee tunnisteen Web Cryptolla. Sama tunniste avaa:
   - demomaksun `GET/POST /api/demo-payments/<numero>` (maksun oma sisäinen tunniste toimii edelleen),
   - agentin jäljen `GET /api/agent-traces/<numero>` (`verifyDemoPaymentLink`),
   - uuden `POST /api/my-orders` `{ links: [{ orderId, token }] }`, enintään 50 linkkiä. Se palauttaa vain ne tilaukset, joiden tunniste täsmää, uusin ensin. Paluuarvon linkki on sama henkilökohtainen linkki, ei maksun sisäinen tunniste.
3. **Julkinen lista on tyhjä.** `GET /api/orders` vastaa yhä 200, mutta `orders: []` ja `personal: true`, jotta vanhat sivut ja tarkistukset eivät kaadu. Julkaisijan tilannekuva tallentuu D1:een kuten ennen, mutta mikään julkinen reitti ei näytä sitä.
4. **Sivut.** Maksusivu (`public/demo-payment.js`) avautuu vain henkilökohtaisesta linkistä. Juuri vahvistettu tilaus siirtyy Workeriin muutamassa sekunnissa, joten sivu yrittää noin 10 s ennen kuin pitää linkkiä virheellisenä. Avattu linkki tallennetaan selaimeen (`localStorage` `aimo.ownOrders.v1`, enintään 50). Pelkkä tilausnumero näyttää ohjeen avata maksu tilauksen omasta linkistä. Tilaukset-sivu (`public/app.js`, `tilaukset.html`) hakee vain tämän selaimen tallentamat tilaukset `/api/my-orders`-reitiltä. Otsikko on "Omat demotilaukset", ja Kopioi näkymän linkki -painike poistettiin, koska näkymä ei ole jaettava.

## Miksi WEBCHAT_SECRET

Tunnisteen pitää olla laskettavissa sekä botissa että Workerissa. `WEBCHAT_SECRET` on jo molemmissa: botin `.env.whatsapp`:ssa (ja pilven ympäristössä) sekä Workerin salaisuutena. Julkaisijan `SYNC_TOKEN` ei ole botin `.env.whatsapp`:ssa (se on `deploy/cloudflare/.env.publisher`:ssa), joten sitä ei voitu käyttää ilman uutta asetusta. Avain on eroteltu omalla etuliitteellä `aimo-order-link-v1`, joten tunniste ei käy minkään muun allekirjoituksen tilalle. Uutta salaisuutta ei tarvita.

## Turvallisuus

- Julkista tilauslistaa ei ole, eikä tilausnumeron arvaaminen avaa mitään: ilman oikeaa tunnistetta kaikki reitit vastaavat 404.
- Toisen tilauksen linkki ei avaa tätä tilausta, eikä väärällä salaisuudella laskettu tunniste kelpaa.
- Tunniste sisältää luontiajan. Jos sama tilausnumero joskus toistuisi uudessa kannassa (B:n #24), vanha linkki ei avaa uutta tilausta.
- Ilman `WEBCHAT_SECRET`iä botti ei anna maksupainiketta lainkaan, eikä Worker hyväksy omia linkkejä. Mitään ei siis avaudu vahingossa.
- Linkki on kuten korilinkki: se, jolla linkki on, näkee tilauksen. Se ei vanhene (maksu itse vanhenee 24 tunnissa kuten ennen).

## Rajat

- Tilaus näkyy Tilaukset-sivulla vasta, kun sen maksulinkki on avattu siinä selaimessa. Puhelimen WhatsAppista avattu linkki tallentuu puhelimen selaimeen, ei tietokoneen.
- Vain vahvistettu tilaus saa linkin. Hyväksyntää odottava tai hylätty tilaus ei näy Tilaukset-sivulla.
- Selaimen tyhjennys poistaa omat tilaukset sivulta; linkki toimii yhä viestistä.
- Vanhat pelkän tilausnumeron linkit (`demo-payment.html#AGW-…`) lakkaavat toimimasta, kun uusi Worker on käytössä.

## Tarkistukset

- Uusi `deploy/cloudflare/test/personal-orders.test.mjs` 3/3: botin tunniste (node:crypto) on sama kuin Workerin (Web Crypto), botin painike saa juuri tämän linkin, oma linkki avaa oman tilauksen ja maksun, toisen tilauksen linkki, väärennetty tunniste ja pelkkä numero eivät avaa mitään, julkinen lista on tyhjä, `/api/my-orders` palauttaa vain omat uusin ensin, maksu onnistuu omalla linkillä, vanha linkki ei avaa samalla numerolla tullutta uutta tilausta, ilman salaisuutta ei avaudu mitään, virheelliset ja liian suuret pyynnöt torjutaan.
- Päivitetyt testit: `test/whatsapp-checkout.test.mjs` (allekirjoitettu linkki, ei painiketta ilman salaisuutta tai luontiaikaa), `checkout-flow.test.mjs`, `orders.test.mjs` ja `agent-trace.test.mjs` (julkinen lista tyhjä, linkki omasta tunnisteesta).
- Selain: paikallinen palvelin oikealla Worker-koodilla ja muistissa olevalla D1:llä, kaksi asiakasta. Tyhjä selain: Tilaukset-sivulla "Tässä selaimessa ei ole vielä tilauksia". Asiakas A:n linkki avasi A:n maksusivun (tuotteet, päivä, 29,80 €). Sen jälkeen Tilaukset-sivu näytti vain A:n tilauksen, ei B:n.
- Lopulliset ajot, ks. `TYOLOKI.md`.

## Käyttöönotto (E, Eeliksen luvalla)

1. **Ei D1-migraatiota.** Uusia tauluja tai sarakkeita ei ole.
2. **Workerin julkaisu ja botin julkaisu samassa ikkunassa.** Uusi Worker ei enää avaa vanhoja pelkän numeron linkkejä, ja uudet allekirjoitetut linkit vaativat uuden Workerin. Jos vain toinen on käytössä, maksusivu ei avaudu niissä tilauksissa, jotka vahvistetaan välissä.
3. **`WEBCHAT_SECRET` pysyy samana** botissa (Vercel ja `.env.whatsapp`) ja Workerissa. Sen vaihtaminen mitätöi kaikki annetut tilauslinkit.
4. Julkaisijaan ei tarvita muutoksia. B:n #13 (kaikki WhatsApp-jäsenet) on nyt yksityinen, koska julkinen lista ei näytä kenenkään tilauksia.
