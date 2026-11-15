# Landing: 5 minuutin puhelu Metan hyväksyntään

15.11.2026, Claude Code (soittonappi-chat). Käyttäjä haluaa lähettää Valiolle linkin testattavaksi. Metan testinumerossa jokainen kokeilijan numero hyväksytään käsin, joten lomakkeen jälkeen sivu näyttää **Soita Eelikselle** -napin: 5 minuutin puhelussa numero saadaan käyttöön. Cal.comia tai muuta varauspalvelua ei käytetä.

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

## Tarkistukset

- Workerin testit **29/29** (uudet: soittotieto vain odottaville tiloille ja vain asetuksesta, virheellinen arvo piilottaa napin; sivun nappi ja sen katoaminen valmiina; vaarallinen numero ei muutu linkiksi). Typecheck, build ja `cf deploy --dry-run` läpi.
- Selain 375 px tuotannon CSP:llä paikallisella mock-palvelimella (keksitty numero, ei D1:tä): lomake → Soita-nappi `tel:`-linkillä → linked + koodikenttä → ready, jolloin nappi katoaa ja Avaa WhatsApp näkyy. Ei vaakaylivuotoa, ei konsolivirheitä.
- Tuotanto: D1-taulu luotu ja arvo takaisinluettu (12 numeroa, maatunnus 358), aiemmat 8 ilmoittautumisriviä ennallaan. Julkaisu tuoreesta origin/mainista f4d29dd, joka vastasi aiempaa julkaistua versiota d725f4d6. Worker **b7f80a7e-51fb-4ba2-9b6b-eff8c933fefe**: landing.js/css tavulleen samat, healthz/tilaukset/maksusivu 200, suojattu lista 401.
- **Ei tehty:** oikeaa ilmoittautumista tuotantoon (se olisi lähettänyt Gmail-ilmoituksen keksitystä numerosta), joten Soita-napin näkyminen oikealla ilmoittautumisella on varmennettu testeissä ja mock-palvelimella, ei livenä. Ilmoittautumisseuranta ei ollut käynnissä tarkistushetkellä; sitä ei käynnistetty ilman käyttäjän lupaa.
