# WhatsApp → kaupan kori → demomaksu (Codex, yhdistäjächat)

## Päätös ja toteutus 15.11.2026

Käyttäjä hyväksyi nykyisen localhost-taustan käyttämisen: WhatsApp → oma kaupan kori → tuotteiden ja toimituspäivän tarkistus → erillinen demotilauksen vahvistus → demomaksu. Asiakas avaa puhelimessa saman palvelimen korin rajatun HTTPS-tunnelin kautta. Korttitietoja ei kerätä eikä rahaa veloiteta. Tuotannon Toimitustukku-integraatiota ei väitetä toteutetuksi.

- `server/whatsapp/checkout.mjs` ja `runtime.mjs`: vain palvelimen rakenteinen `confirmed` + kelvollinen `orderId` saa oman demomaksulinkin. Wrapper säilyttää saman tilauspalvelun, luonnoksen, sarjoituksen ja idempotenssin. Uusi GET/HEAD-assetreitti tarjoaa vain checkoutin JS/CSS:n; koko paikalliskauppaa ei avata tunneliin.
- `public/whatsapp-checkout.js/css`: **Siirry demomaksuun** on asiakkaan painama tavallinen linkki. Se sopii korin CSP:hen ilman inline-tyylejä. Kori palauttaa saman kuitin ja maksulinkin myös sivun uudelleenlatauksessa. Linkin rendering ei tee tilausta tai maksua.
- `deploy/cloudflare/src/index.ts`: tilaustapahtuma rekisteröi demomaksun ennen sähköpostia, lähettäjä tarkistaa pysyvän maksuvartion, tilausnäkymän projektio saa `demoPayment`-kentän ja erillinen maksureitti käsittelee hyväksymisen/keskeytyksen. Olemassa olevia lähetettyjä vahvistuksia ei siirretä maksuodotukseen. `DEMO_PAYMENTS_ENABLED` käyttää projektin cf-version vaatimaa `bindings.text("true")`-asetusta.
- Uusin kaupan korisivu on Claude Coden **5feefbc**. Rakenteinen orderId/orderStatus sekä hyväksyntää odottavan tilauksen tilan säilyminen toistettaessa ovat saman omistajan **5e0a61f**-korjauksessa. Vanha luonnos ilman varmennettua tilaa ei saa maksulinkkiä. Näitä omistettuja tiedostoja ei muokattu rinnakkain.
- Vanhentunut tehtävä `4f595c97` otettiin vastaan. Sen aiemmat Claude Coden Resend-koodi ja testi säilytettiin ja uusi maksuvartio sovitettiin niihin. Aiempi pakollinen RESEND_API_KEY-binding poistettiin cf-asetuksesta, koska avainta ei ole nykyisessä ympäristössä: demomaksu toimii ilman sähköpostipalvelun käyttöönottoa. Lähettäjätuki on valinnainen; tässä vaiheessa ei lähetetty oikeita sähköposteja.

## Tarkistukset

- Lopullinen erillinen julkaisukopio pohjautuu **5e0a61f**:ään, mukana vain tämän vaiheen omat muutokset. Koko `npm test`: **257/257**, ei virheitä, ohituksia tai TODO:ita. Mukana neljä checkout-testiä: rakenteinen ID, vain confirmed-tilan maksulinkki, sama/uusi viestin uusinta, pending_approval-tilan säilyminen ja legacy-luonnoksen raja.
- Workerin testit **14/14**, `typecheck`, build ja `cf deploy --dry-run` läpi. Integroitu julkaisija → Worker → D1 → demomaksu → yksi simuloitu sähköposti: keskeytys ei lähetä, rinnakkaiset hyväksynnät ja uusinta säilyttävät yhden maksun ja alkuperäisen maksamisajan. Yksityinen vastaanottaja/nimi ei tule julkiseen vastaukseen.
- Oikea Chrome, **1280 px / 375 px**, oma Node-/gateway-kanta ja muistissa oleva D1: sama valmis kori → erillinen tarkistus → vahvistus → oma maksulinkki → keskeytys → onnistuminen → reload. **Yksi tilaus, yksi maksu, yksi simuloitu sähköposti; 0 JavaScript-virhettä ja 0 vaakaylivuotoa.** Kadonneen korivahvistuksen uusinta palauttaa saman tilausnumeron ja maksulinkin. Skripti `/private/tmp/aimo-checkout-browser.mjs`; kuvat `/private/tmp/aimo-checkout-cart-desktop.png`, `-cart-mobile.png` ja `-payment-mobile.png`.
- Ensimmäinen selainkoe ja regressio osoittivat puuttuvan orderId-kentän ennen sen korjausta; niiden onnistunut uusinta tehtiin vasta **5e0a61f**:n yhdistämisen jälkeen. Käyttäjän palvelimia, koria, tilauksia, Meta-, Valio- tai mallipalveluja ei käytetty näihin kokeisiin.
- Cloudflaren [D1 binding -ohje](https://developers.cloudflare.com/d1/worker-api/d1-database/) sekä projektin pinned cf-tyypit tarkistettu Workers/cf-skilleillä. Cloudflare-liittimen luku puuttuvalla scopella palautti 403:n; käytettiin olemassa olevaa cf-OAuthia aimo-ai-accountilla, ei uutta OAuthia.

## Julkaisu

- Lisäävä D1-migraatio: `demo_payments` puuttui, `CREATE TABLE IF NOT EXISTS` esikatseltiin ja ajettiin, kaikki kolme taulua luettiin takaisin. Nykyisiä tilaustietoja ei muutettu.
- Worker julkaistu: **fcf60dc0-eb78-4571-8dfb-b956685d68d7**, [aimo-order-demo](https://aimo-order-demo.aimo-demo-41cfac.workers.dev). Takaisinluku: health **200 / demoPayments:true**, tilaus-API **200 / samat kaksi tilausta / ei yksityisiä vastaanottajakenttiä**, maksu-HTML/JS **200**, tuntematon maksu **404** uuden reitin omalla virheellä.
- `.env.whatsapp`:iin lisätty vain sama julkinen `CLOUDFLARE_DEMO_URL` kuin julkaisijan asetuksessa. Muut arvot säilytetty ja 0600 takaisinluettu. Ei salaisuuksia lähteisiin tai Gitiin.
- **Seuraava käyttöönottovaihe:** yksi nykyisen julkaisijan `--watch --order-events`-käynnistys, vanhojen tilausten säilyttäminen lähtötasona ja yksi `dc65de4b`-rolloutchatin kanssa sovittu Node-restart tästä GitHubiin tallennetusta vaiheesta. Node-käyttöönoton ja julkaisijan kuittaus lisätään erikseen; niitä ei tämän kohdan perusteella väitetä jo tehdyiksi. Oikea sähköpostiosoite ja lähettäjä eivät ole asetettuina.
