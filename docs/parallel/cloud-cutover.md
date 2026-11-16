# Pilvisiirto (sessio E), tilanne 16.11.2026 klo 22.50

## Valmis
- Vercel-projekti `aimo-whatsapp` (eeputtis-projects), tuotanto-osoite https://aimo-whatsapp.vercel.app, julkaisu commitista 9744f42.
  Asetukset Vercelissä ovat nyt **testiarvot**: Turso-testikannat `aimo-t-*`, väärä Meta-token, testisalaisuudet,
  Worker-osoite `example.invalid`. Mitään ei lähde WhatsAppiin eikä Worker-sivustolle. Eelis hyväksyi testijulkaisun.
- Korjaukset (9744f42): pilven julkaisija välittää selainkeskustelun tilaukset (`includeWebChat`), korisivun Valion
  tuotekuvat (`data/img`) mukaan julkaisuun, jonon käsittely yrittää kerran uudelleen samassa instanssissa,
  `push-env.mjs` ottaa julkisen osoitteen vain pilven tiedostosta ja tukee `AIMO_ENV_ROOT`/`AIMO_CLOUD_ENV`.
- Pilvitestit: healthz 200, sisäiset reitit 404, webhookin GET-vahvistus, allekirjoittamaton POST 403, väärä tick 404,
  selainkeskustelu ilman avainta 401. Allekirjoitettu webhook → Turso-jono → vastaus → Meta 401 (väärä token, odotettu).
  YHDISTA-pariutus toimii. Selainkeskustelu oikealla mallilla: maito + voi perjantaiksi → numeroidut vaihtoehdot → valinnat
  → luonnos 59,64 € → ok → korilinkki Vercel-osoitteeseen. Korisivu, skriptit, fontit ja Valion kuvat 200. Tick 1,1–1,4 s.
- Siirron harjoitus: Macin viiden kannan VACUUM INTO -kopiot `migrate.mjs`:llä testikantoihin 12 sekunnissa,
  kaikki taulut täsmäävät sisällöltään.

## Tärkeä löydös
Valion testirajapinnan nimi ei enää ratkea (DNS ENOTFOUND). Botti vastaa vain välimuistin 3 252 tallennetusta
Valion vastauksesta (`VALIO_FALLBACK=last-known` + demokello). Siksi `whatsapp-kitchen.db` (api_cache) pitää siirtää
pilveen; tyhjällä kannalla pilvi ei löydä tilattavia tuotteita.

## Kesken (vaihto vaatii Eeliksen erillisen OK:n)
1. Lisää `WHATSAPP_PUBLIC_URL=https://aimo-whatsapp.vercel.app` tiedostoon `deploy/vercel/.env.cloud` ja aja
   tilannevedoksesta `AIMO_ENV_ROOT=/Users/eeputti/developer/aimo-ai node deploy/vercel/push-env.mjs`, sitten
   `vercel deploy --prod`. Älä kutsu tuotanto-osoitetta ennen kantojen siirtoa (migrate keskeytyy, jos riviä on).
2. Tarkista, ettei Macin jonossa ole pending/processing-rivejä, pysäytä botti (PID 94487) ja julkaisija (PID 21794) TERMillä.
3. VACUUM INTO -kopiot ja `migrate.mjs` tuotantokantoihin `aimo-*` (tyhjiä, tarkistettu).
4. Metan callback: `POST /{app}/subscriptions` samoilla 10 kentällä uuteen osoitteeseen; D1 `bot_backend_url` uuteen osoitteeseen
   (`cf d1 query`, cf on kirjautunut); tick-worker `deploy/vercel/tick` (wrangler@4 kirjautunut) salaisuuksilla TICK_URL ja TICK_SECRET.
5. Varmenna Eeliksen puhelimella ja Workers-sivuston Keskustele-välilehdellä.
- Paluu: Metan callback ja D1 takaisin tunneliin (jätä cloudflared PID 94071 päälle vaihdon ajaksi), botti uudelleen samasta
  snapshotista. Pilvessä syntyneet keskustelut saa takaisin `turso db shell <kanta> .dump`.
- Testikannat `aimo-t-*` ja testiasetukset (`scratchpad/env.cloud-test`) voi poistaa vaihdon jälkeen.
- WhatsApp-tilausvuoron testi jonon kautta jäi kesken (pariutusviestin uusinnat estivät seuraavan viestin, kuten pitääkin).
