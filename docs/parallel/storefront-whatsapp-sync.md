# WhatsApp-kori automaattisesti kopioidun verkkokaupan varsinaiseen ostoskoriin

15.11.2026, Danielin alkuperäinen ostoslistachatti.

## Käyttäjän tarkennettu tavoite

Eelis lähettää WhatsAppissa ostostarpeen. Tarkat tuotteet ja määrät siirtyvät automaattisesti kopioidun Valio Aimo -verkkokaupan tavalliseen `/cart.html`-ostoskoriin, jonka kuvassa näkyvät toimituspäivävälilehdet, tuoterivit ja summat. Kohde on käyttäjän `localhost:4747`, ei erillinen WhatsApp-korisivu tai ostosapurin keskusteluruutu. Ei tuontipainiketta eikä automaattista tilausta. Sama koodi pitää voida hakea GitHubista eri koneille.

## Toteutus

- `public/storefront-cart-store.js`: `syncWhatsApp` päivittää tavallisen `aimoCart`-korin atomisesti. Se korvaa vain samasta WhatsApp-lähteestä aiemmin synkronoidut rivit, päivittää toimituspäivän ja säilyttää muut käsin lisätyt tuotteet/päivät. Sama lähdeversio ei lisää määrää uudelleen. Vanha revisio ja asiakkaan vaihto torjutaan. Käsin lisätty sama tuotetunniste aiheuttaa näkyvän ristiriidan; manuaalisia määriä ei summata huomaamatta WhatsApp-tarpeeseen.
- `public/whatsapp-cart-sync.js`: automaattinen oman originin GET noin kolmen sekunnin välein. Hinnat, pakkausmäärät, ostoskorimerkki ja taulukko päivittyvät nykyisen korin tapahtumilla. Ratkaisematon lähde tai yhteyskatko ei tyhjennä koria; odotustila/virhe näkyy ja uuden checkoutin avaaminen estyy, kunnes yhteys/lista on kunnossa.
- `server/storefront-whatsapp-sync.mjs` + `server/index.mjs`: paikallinen `GET /api/storefront/whatsapp-cart` hakee vain yksityisesti määritetyn lähteen. Ei selaimen antamaa vapaata kohde-URL:ia, ei redirecteja, rajattu koko/aikakatkaisu, lyhyt välimuisti ja rinnakkaisten hakujen yhdistäminen. Lähteen koritunniste ei päädy selaimelle. Paikallisuus- ja origin-rajaus säilyy. Tyhjä asetus pitää automaattikytkennän pois päältä.
- WhatsApp-palvelimen `GET /whatsapp/cart/api/export`: nykyinen allekirjoitettu määräaikainen korilinkki oikeuttaa vientiin. Palvelin tarkistaa saman asiakassidoksen ja luonnostunnisteen ennen tuotetietojen hakua. Korin tarkat tuotetunnisteet ja myyntipakkausmäärät tulevat nykyisistä tuotetyökaluista; esim. 24 litran tarve voi olla neljä kuuden litran myyntierää. Fyysistä litramäärää ei siirretä pakkausmääränä.
- `ordering`-silta sarjoittaa viennin saman asiakkaan muiden vuorojen kanssa ja tarkistaa oikeuden myös asynkronisen hinnanhaun jälkeen. Runtime käyttää nykyistä `tools.quote`-tarkistusta ja enintään 30 sekunnin/voimassaoloajan välimuistia per luonnosrevisio. Vienti ei tee submitia tai anna tilauslupaa; se voi hakea hinnat/saatavuuden ja tallentaa tavallisen tarkistetun tarjouksen.

## Käyttöönotto kahdelle eri koneelle

1. WhatsApp-palvelimen omistaja päivittää lähdekoodin tähän versioon normaalilla hallitulla käyttöönotolla. Nykyinen korilinkki, jäsenet ja kannat säilyvät. Uusi export-reitti pitää olla käytössä lähdepalvelimella; vanha versio ei riitä.
2. Kunkin `localhost:4747`-verkkokaupan ylläpitäjä päivittää saman repon ja lisää **paikalliseen yksityiseen `.env`-tiedostoon**:

   ```dotenv
   WHATSAPP_CART_SOURCE_URL=https://<whatsapp-palvelimen-origin>/whatsapp/cart#<yksityinen-allekirjoitettu-koritunniste>
   ```

   Arvo on kyseisen korin voimassa oleva linkki kokonaisuudessaan, ei Meta-webhook, botin puhelinnumero tai Cloudflaren pelkkä etusivu. Älä kirjoita oikeaa arvoa Gitiin, keskusteluun tai komentorivin argumentteihin. Token pysyy palvelimella; selain saa vain normalisoidut tuoterivit. Sama yksityinen lähdeasetus voi yhdistää erilliset paikalliset verkkokaupat samaan demokoriin.
3. Käynnistä päivitetty oma verkkokauppa asetukset ladaten (`npm start` normaalisti portissa 4747). Avaa `/cart.html`. Sivulla ei tarvita tuontitoimintoa: valitut tuotteet päivittyvät taustalla.
4. Täydennä WhatsApp-agentissa puuttuvat määrät, päivä ja tarkka tuotevalinta. Sovitin ei valitse asiakkaan puolesta tuotetta vain sanan ”voi” perusteella. Kun tarkistettava kori on valmis, sen myyntierät näkyvät verkkokaupassa.

Nykyisen korilinkin allekirjoitus on **24 tunnin ja yhden luonnoksen** rajaus. Vanheneminen, uusi kori, revokointi tai numeron uudelleenyhdistäminen pysäyttää vanhan yhteyden; lähdeasetus vaihdetaan uuteen oikeutettuun linkkiin. Tämä ei ole pysyvä koko yrityksen tuotantokoriyhteys eikä kirjautumisjärjestelmä. Julkisen monen käyttäjän verkkokaupan käyttöönotto tarvitsee oman käyttäjäkohtaisen asiakassidoksen tämän paikallisen demon sijaan. GitHub jakaa koodin, ei salaisuuksia tai selainten localStoragea.

## Varmennus

- Kohdistettu sarja: **44/44 läpi**, 0 virhettä/ohitusta: uusi `test/storefront-whatsapp-sync.test.mjs`, vanhat `storefront-cart`, `whatsapp-cart-link`, `shopping-list-handoff` ja `whatsapp-ordering`.
- Uudet testit: rivien korvaaminen kerran, määrän/päivän muutos, restart/reload, muiden rivien säilyminen, tyhjä/ratkaisematon kori, vanha revisio, väärä asiakas, manuaalinen tuotekonflikti, tarkat myyntipakkaukset, oikea allekirjoitettu vienti ja revokointi, palvelinproxy ilman tunnistevuotoa, sama-origin-rajaus sekä verkkovirhe.
- Oikea Chromium + oikea eristetty standalone-WhatsApp-palvelin ja upotettu verkkokauppa, synteettinen katalogi ja omat väliaikaiset kannat. Taustalla simuloitu korilähde: `/cart.html` avautuu, neljä myyntipakkausta ilmestyy ilman klikkauksia, lähteen kuuden pakkauksen revisio päivittyy, manuaalinen eri tuote säilyy, reload ei monista rivejä ja ratkaisematon lähde estää checkoutin avaamisen. Ei JavaScript-virheitä, eikä lähdetokenia selaimen koridatassa. Ulkoiset fonttipyynnöt estetty. Ei oikeita Meta-, malli- tai Valio-kutsuja.
- Ei vielä varmennettu Eeliksen oikeaa lähdepalvelinta ja käyttäjän todellista 4747-prosessia vasten. Niiden yksityisiä lähdeasetuksia tai restarteja ei tehty tässä chatissa. Koko katalogiriippuvaista sovellussarjaa ei toistettu tässä vaiheessa.

## Koordinointi

Yhteinen MCP palautti whoami-, tila-, viesti- ja lähetyskutsuihin Internal error. Aloitusviestiä Eeliksen Codexille ei siksi ole varmennettu toimitetuksi. Työ rajattiin omaan klooniin ja paikalliselle taululle tehtävään `c390021c`; ei nykyisen Cloudflare-sivun, Meta-asetusten tai muiden keskeneräisten tiedostojen muutoksia. Tämä raportti ja työloki välittävät tarkat rajapinnat GitHubissa käyttöönottajalle.
