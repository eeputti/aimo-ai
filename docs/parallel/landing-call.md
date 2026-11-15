# Landing: 5 minuutin puhelu Metan hyväksyntään

15.11.2026, Claude Code (soittonappi-chat). Käyttäjä haluaa lähettää Valiolle linkin testattavaksi. Metan testinumerossa jokainen kokeilijan numero hyväksytään käsin, joten numeron lähettämisen jälkeen sivu näyttää **Soita Eelikselle**- ja **Laita viesti Eelikselle** -napit: lyhyessä puhelussa numero saadaan käyttöön. Cal.comia tai muuta varauspalvelua ei käytetä.

## Toteutus

- `deploy/cloudflare/src/signup.ts`: ilmoittautumisen luonti-, tila- ja koodivastaukset lisäävät `call: { tel, display }` vain tiloissa `pending` ja `linked`. Numero luetaan D1-taulusta `landing_settings` (`key='presenter_phone'`, kansainväliset numerot ilman plussaa). Puuttuva taulu tai virheellinen arvo piilottaa napin. Kokeilijan omaa numeroa ei edelleenkään palauteta selaimelle.
- Esittelijän numeroa ei ole Gitissä (repo on julkinen). Se on asetettu suoraan tuotannon D1:een; uusi Worker-julkaisu mistä tahansa kloonista säilyttää sen.
- `index.html`, `public/landing.js`, `public/landing.css`: lomakkeen ohje kertoo puhelusta, tilanäkymässä sininen **Soita Eelikselle** -nappi (`tel:`-linkki) ja numero tekstinä tietokonetta varten. Nappi katoaa, kun WhatsApp on valmis. Selain hyväksyy vain `+`-alkuisen numeron.
- `signup.sql`: lisäävä `CREATE TABLE IF NOT EXISTS landing_settings`.

Numeron vaihto tai poisto (hakemistossa `deploy/cloudflare`):

```bash
npm exec -- cf d1 query fd216575-282d-48a4-a2f9-d01f528aab19 --sql "UPDATE landing_settings SET value='358…' WHERE key='presenter_phone'"
npm exec -- cf d1 query fd216575-282d-48a4-a2f9-d01f528aab19 --sql "DELETE FROM landing_settings WHERE key='presenter_phone'"
```

## Puhelun muistilista esittelijälle

Edellytys: ilmoittautumisseuranta pyörii samassa koneessa kuin WhatsApp-palvelin, esimerkiksi palvelimen snapshot-hakemistossa:

```bash
node --env-file-if-exists=.env --env-file-if-exists=.env.whatsapp --env-file=/polku/deploy/cloudflare/.env.publisher scripts/whatsapp-signups.mjs watch
```

1. Seuranta liittää uuden numeron testiasiakkaaksi muutamassa sekunnissa ja näyttää sen (macOS-ilmoitus + terminaali).
2. Metassa: Step 1. Try it out → Recipient → Manage phone number list → Add phone number → kokeilijan numero.
3. Kokeilija lukee WhatsAppiin tulleen viisinumeroisen koodin puhelimessa (tai kirjoittaa sen sivulle, jolloin se näkyy seurannassa). Syötä koodi Metaan.
4. `scripts/whatsapp-signups.mjs approve --phone +358…` samalla env-asetuksella: kokeilijan sivulle tulee **Avaa WhatsApp**.

Metan testinumeroon mahtuu enintään 5 vastaanottajaa. Vapauta paikka tarvittaessa Metan listasta ja komennolla `remove --phone`.

## Lopullinen versio samana päivänä: neljä selkeää vaihetta

Käyttäjä ei ensin nähnyt nappia: hänen oma selaimensa muistaa jo hyväksytyn numeron ja avaa suoraan Avaa WhatsApp -näkymän. Välillä nappi siirrettiin kortin yläreunaan (Worker eea80732), mutta käyttäjä halusi sen nimenomaan numeron lisäämisen jälkeen, joten se palautettiin. Käyttäjän lopullinen ohje: turhat animaatiot pois ja vaiheet

1. **Numero vastaanotettu** (Eelis saa numeron, ks. seuranta alla)
2. **Soita tai laita viesti Eelikselle**, niin hän hyväksyttää numeron
3. **Hyväksytty WhatsAppiin**
4. **Valmis keskusteluun**

- Vaihe "Lisätty tilausapuriin" poistettu näkyvistä (taustan liitos ei kiinnosta kokeilijaa). Sydämen syke ja vaiheen pyörivä latausympyrä poistettu; nykyinen vaihe on paikallaan pysyvä sininen ympyrä.
- Soittonapin alle **Laita viesti Eelikselle**: WhatsApp-viesti Eelikselle valmiilla tekstillä ja kokeilijan nimellä ("Hei Eelis! Lisäsin numeroni Aimon WhatsApp-tilausapuriin nimellä …"). Molemmat napit näkyvät, kunnes WhatsApp on valmis.
- **Tieto uudesta numerosta:** `whatsapp-signups.mjs watch` käynnistettiin käyttäjän pyynnöstä hänen Terminal-paneeliinsa WhatsApp-palvelimen snapshot-hakemistossa (`/private/tmp/aimo-whatsapp-runtime-3bee913`, sama `.env`/`.env.whatsapp`, julkaisuavain jaetun kansion `deploy/cloudflare/.env.publisher`:sta). Uusi numero liitetään sekunneissa ja näkyy macOS-ilmoituksena sekä terminaalissa nimen ja numeron kanssa. Käynnistyessä se näytti kolme jo aiemmin odottanutta tiimin numeroa; uusia odottavia ei ollut. Codexin Gmail-ilmoitus toimii sen omalla ajastuksella, jos Codex on käynnissä.

Tarkistukset: Worker **29/29**, typecheck/build. Mock 375 px tuotannon CSP:llä: vaiheet oikein (vastaanotettu done, soita/viesti current), 0 animoitua elementtiä, viestilinkki oikein, ei ylivuotoa. Julkaistu Worker **a6021dd8-49ea-4d30-9623-930c0371f2cd** (edellinen 9e261f2f oli tämän chatin): live JS/CSS tavulleen samat, uusi vaiheteksti sivulla, healthz 200, suojattu lista 401. Välissä ollut `GET /api/signups/call` ei ole enää käytössä (404).

## Tarkistukset (ensimmäinen versio)

- Workerin testit **29/29** (uudet: soittotieto vain odottaville tiloille ja vain asetuksesta, virheellinen arvo piilottaa napin; sivun nappi ja sen katoaminen valmiina; vaarallinen numero ei muutu linkiksi). Typecheck, build ja `cf deploy --dry-run` läpi.
- Selain 375 px tuotannon CSP:llä paikallisella mock-palvelimella (keksitty numero, ei D1:tä): lomake → Soita-nappi `tel:`-linkillä → linked + koodikenttä → ready, jolloin nappi katoaa ja Avaa WhatsApp näkyy. Ei vaakaylivuotoa, ei konsolivirheitä.
- Tuotanto: D1-taulu luotu ja arvo takaisinluettu (12 numeroa, maatunnus 358), aiemmat 8 ilmoittautumisriviä ennallaan. Julkaisu tuoreesta origin/mainista f4d29dd, joka vastasi aiempaa julkaistua versiota d725f4d6. Worker **b7f80a7e-51fb-4ba2-9b6b-eff8c933fefe**: landing.js/css tavulleen samat, healthz/tilaukset/maksusivu 200, suojattu lista 401.
- **Ei tehty:** oikeaa ilmoittautumista tuotantoon (se olisi lähettänyt Gmail-ilmoituksen keksitystä numerosta), joten Soita-napin näkyminen oikealla ilmoittautumisella on varmennettu testeissä ja mock-palvelimella, ei livenä. Ilmoittautumisseuranta ei ollut käynnissä tarkistushetkellä; sitä ei käynnistetty ilman käyttäjän lupaa.

## WhatsApp-tunnelin palautus ja sähköposti-ilmoituksen koe (klo 16.30–16.45)

- **Käyttäjän havainto:** kokeilulinkki ei toiminut. Landing (workers.dev) vastasi 200, ja Node 4749 vastasi paikallisesti, mutta `cloudflared` ei ollut käynnissä ja vanha `functional-circuits-makes-funny.trycloudflare.com` ei vastannut. Metan viestit ja korilinkit eivät siis päässeet perille. Katkon syy ja alkuaika eivät ole tiedossa. Sama oli tapahtunut kerran aiemmin.
- **Palautus käyttäjän luvalla ("pistä tä nyt toimimaan"):** uusi pikatunneli `nohup`-prosessina (PID 77519) osoitteeseen **https://mind-bristol-expects-wit.trycloudflare.com**, loki `/private/tmp/aimo-whatsapp-tools/tunnel.log`. Metan sovelluksen `whatsapp_business_account`-tilauksen callback vaihdettu uuteen osoitteeseen: POST 200 / success, ja takaisinluvussa active=true sekä samat 10 kenttää kuin ennen. `.env.whatsapp`:ssa vain `WHATSAPP_PUBLIC_URL` vaihtui (avaimet ja oikeudet 0600 ennallaan). Node 48952 pysäytettiin hallitusti (TERM, portti vapaa 2 s), ja sama snapshot käynnistettiin `nohup`-prosessina (PID 77774), loki `/private/tmp/aimo-whatsapp-tools/server-4749.log`. Kaikkien viiden kannan kaikkien taulujen rivimäärät olivat samat ennen ja jälkeen. Paikallinen ja tunnelin healthz 200 / ordering-demo.
- **Sähköposti-ilmoitus:** käyttäjä halusi sähköpostin jokaisesta lisätystä numerosta. Codexin olemassa oleva Gmail-ajastus hoitaa sen, kun Codex on auki. Koe selvästi merkityllä testinumerolla live-lomakkeesta: seuranta liitti numeron ja näytti macOS-ilmoituksen 16.43.37, Codex havaitsi sen 16.43.36 ja lähetti sähköpostin 16.44.15 (Gmailin viesti-ID tallessa, noin 40 s lomakkeesta). Postilaatikkoa ei voitu lukea tästä chatista, koska ilmoitus menee eri Gmail-tilille. Testinumero poistettiin `remove`-komennolla: D1:ssä 0 riviä, testijäsen peruttu.
- **Rajat:** pikatunneli voi katketa uudelleen, jolloin osoite vaihtuu ja callback, `WHATSAPP_PUBLIC_URL` ja Node-restart pitää tehdä uudelleen. Pysyvä osoite vaatisi oman verkkotunnuksen. Tunneli, apuri ja seuranta pyörivät käyttäjän Macilla; ne eivät kestä uudelleenkäynnistystä eivätkä lepotilaa. Oikean puhelimen WhatsApp-viestiä uuden tunnelin läpi ei tässä lähetetty.
