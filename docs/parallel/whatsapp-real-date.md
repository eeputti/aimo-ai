# WhatsApp-botti oikeaan päivään (17.11.2026, Claude Code)

## Pyyntö

Eelis: "tä ei tajunnu mikä on huomenna, tä on päivämäärissä sekasin eli tän pitää tietää mikä päivä nyt on ni tä tajuu mikä on huomenna".

## Syy

Pilvibotin (Vercel `aimo-whatsapp`) tuotantoasetuksissa on `DEMO_NOW=2026-11-15T09:00:00+02:00`, `DEMO_NOW_LOOP_MINUTES=420`
ja `DEMO_NOW_ANCHOR`. Ne lisättiin 15.11., kun Valion testirajapinta oli jäädytetty (toimitus aina ma 16.11., tilausraja
su 15.11. klo 17.00). Kello kiertää su 15.11. klo 9–16, joten botti luulee joka hetki, että on sunnuntai, ja "huomiseksi"
on ma 16.11. Asetukset tulivat Verceliin Macin `.env.whatsapp`:sta (`push-env.mjs`).

Lisäksi mallitulkki sai vain päivämäärän (`today: 2026-11-17`) ilman viikonpäivää ja joutui laskemaan itse, mikä päivä
"perjantaiks" on.

## Miksi demokelloa ei enää tarvita

Valion testirajapinnan nimi ei ratkea (`junction26.valioaimo.fi`, tarkistettu 17.11. klo 0.13). Botti toimii välimuistin
viimeisimmillä oikeilla arvoilla (`VALIO_FALLBACK=last-known`), ja ne siirtävät tilausajan pyydetylle päivälle samalla
toimitusajalla. Jäädytetyn rajapinnan raja ei siis enää rajaa mitään.

Koe Macin välimuistikannan kopiolla, oikealla kellolla (ti 17.11. klo 0.19) ja estetyllä rajapinnalla, 226 viimeksi
kysyttyä tuotetta:

| Toimituspäivä | Tilattavissa | Tilausraja | Ei tilattavissa (raja mennyt) |
|---|---|---|---|
| ke 18.11. (huomenna) | 76 | ti 17.11. klo 17.00 | 150 |
| to 19.11. (ylihuomenna) | 76 | ke 18.11. klo 17.00 | 150 |

Samat 150 tuotetta eivät ole tilattavissa demokellollakaan (niiden tallennettu raja oli jo ennen 15.11.), joten mikään ei
huonone. Klo 17 jälkeen huomiselle ei ehdi, ja botti tarjoaa aikaisimman päivän kuten kiireessä ennenkin.

## Muutos

- `server/gateway/clock.mjs`: `helsinkiCalendar(now, days)` antaa tämän päivän ja seuraavat päivät muodossa
  `2026-11-18 keskiviikko huomenna`.
- `server/order-conversation/interpret.mjs`: malli saa 14 päivän kalenterin, ja ohje käskee ottamaan päivän sieltä eikä
  laskemaan viikonpäiviä itse. Jos mallin päivä ei ole mikään viestissä mainituista päivistä, käytetään sääntöjen päivää.
  Kun malli ei löydä päivää, sitä ei lisätä ("puhutaan huomenna" ei ole toimituspäivä).
- `server/aimo/understand.mjs`: `deliveryDatesIn(text)` luettelee viestin kaikki päivät samalla tulkinnalla kuin säännöt.
- `server/order-conversation/runtime.mjs`: kytkee sääntöpäivät mallitulkkiin.
- Pilven asetus (vaatii luvan ja julkaisun): `DEMO_NOW`, `DEMO_NOW_LOOP_MINUTES` ja `DEMO_NOW_ANCHOR` pois Vercelistä ja
  Macin `.env.whatsapp`:sta, jotta `push-env.mjs` ei vie niitä takaisin.

Dialogimalli (`server/whatsapp/dialogue.mjs`, tuotekysymykset ja tervehdykset) saa saman kellon päivän, joten se on
oikea, kun demokello poistuu. Siltä puuttuu vielä viikonpäivä. Tiedosto on toisen session varauksessa (d4046e0f), jolle
on ehdotettu samaa kalenteria.

## Tarkistukset

- Uusi `test/whatsapp-real-date.test.mjs` 4/4. Mallitestin osa kaatui vanhalla `interpret.mjs`:llä (malli antoi 16.11.).
- `npm test` 382/388. Kuusi kaatuvaa ovat Turso-testejä, koska yhteisestä `node_modules`ista puuttuu `@libsql/client`.
- `aimo:eval` 26/26, `aimo:eval:spoken` 54/54, 0 mallikutsua.
- Ei malli-, Meta- tai Valio-kutsuja, ei tilauksia.

## Käyttöönotto 17.11. klo 0.20–0.26 (Eeliksen lupa: "Kyllä, molemmat")

- Vercel `aimo-whatsapp`, tuotanto: `DEMO_NOW`, `DEMO_NOW_LOOP_MINUTES` ja `DEMO_NOW_ANCHOR` poistettu,
  `FALLBACK_PRICE_MAX_AGE_HOURS=720` lisätty (takaisinluettu `vercel env ls`). Vercelin työkalu vaatii poistoon
  `--confirm-name`-vahvistuksen ihmisen hyväksynnän jälkeen.
- Macin `.env.whatsapp`: demokellon rivit kommentoitu ja `FALLBACK_PRICE_MAX_AGE_HOURS=720` lisätty, oikeudet 0600 ennallaan.
  Näin `push-env.mjs` ei vie demokelloa takaisin.
- Julkaisu tilannevedoksesta `/private/tmp/aimo-vercel-8b29cff` (origin/main 8b29cff, mukana myös 3b51b3d ja df3719c),
  `dpl_2wvtPvzP8rAYQkGRu2Hg5DeBkmRC`, alias https://aimo-whatsapp.vercel.app. Edellinen tuotanto oli 94c62f3, eikä
  uudempia tilannevedoksia ollut.
- Varmennettu: `/healthz` `host: cloud`, webhookin GET-vahvistus 200 ja haaste takaisin. Selainkeskustelun kautta
  (oma testiasiakas, ei tilausta) ti 17.11. klo 0.26: "Moi, tarviin 20 kananmunaa huomiseksi" → "Toimitus ke 18.11." ja
  "Huomiselle ehtii tilata ti 17.11. klo 17.00 asti". "toimitus vaihdetaan perjantaiksi" → pe 20.11. Testiasiakas ja sen
  luonnos jäivät botin kantaan. Puhelimesta lähetettyä viestiä ei ole vielä varmennettu.

## Hintojen ikäraja (ratkaistu asetuksella)

Viimeisin oikea hinta on haettu su 15.11. klo 20.01. Tarjous hylkää yli 72 tuntia vanhan hinnan (`PRICE_TOO_OLD`,
`FALLBACK_PRICE_MAX_AGE_HOURS`, oletus 72). Macin kopion 1 626 hinnasta liian vanhoja:

| Hetki | Liian vanhoja |
|---|---|
| ti 17.11. klo 12 | 87 |
| ke 18.11. klo 0 | 821 |
| ke 18.11. klo 12 | 1 450 |
| ke 18.11. klo 21 | 1 626 (kaikki) |

Ilman muutosta keskiviikkoiltana yhtäkään tilausta ei olisi voinut vahvistaa, kellosta riippumatta. Eelis hyväksyi
asetuksen `FALLBACK_PRICE_MAX_AGE_HOURS=720` (30 päivää, eli 14.12. asti). Hinnat näkyvät edelleen merkittyinä
viimeisimpinä tunnettuina, eivät ajantasaisina.
