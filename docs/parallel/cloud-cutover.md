# WhatsApp-botti pilveen: Vercel + Turso (sessio E, 16.–17.11.2026)

## Tila nyt

Botti pyörii Vercelissä, ja Eeliksen Macia ei enää tarvita sen ajamiseen.

| Osa | Missä | Tarkistettu |
|---|---|---|
| WhatsApp-botti, korisivu, selainkeskustelun tausta | Vercel `eeputtis-projects/aimo-whatsapp`, https://aimo-whatsapp.vercel.app (fra1) | healthz `host: cloud`, webhookin GET-vahvistus 200, puhelinviesti 17.11. klo 0.04 käsitelty ja vastattu |
| Kannat | Turso `aimo-whatsapp`, `aimo-drafts`, `aimo-quotes`, `aimo-gateway`, `aimo-kitchen` (Frankfurt) | siirto Macin kopioista, jokainen taulu täsmää sisällöltään |
| Minuutin ajastin | Cloudflare Worker `aimo-whatsapp-tick` (cron `* * * * *`) | tilausnäkymän `observedAt` päivittyy kerran minuutissa |
| Metan webhook | `https://aimo-whatsapp.vercel.app/webhooks/whatsapp`, samat 10 kenttää | takaisinluku: oikea osoite, active |
| Worker-sivuston botti | D1 `landing_settings.bot_backend_url` = Vercel-osoite | takaisinluku, `/whatsapp/cart.js` Workerin kautta 200 |

Käytössä oleva versio: main **94c62f3** (sisältää A, B, C, D, F, H, I ja maksunapin korjaukset). Worker-sivusto julkaistu samasta commitista.
D1:ssä ajettu `signup-verify.sql` (5 saraketta ja indeksi, 14 ilmoittautumisriviä säilyi).

## Mitä tehtiin

1. Siirtokoodin tarkistus ja korjaukset (9744f42/a2b83c4, 94c62f3): pilven julkaisija välittää selainkeskustelun tilaukset,
   korisivun Valion tuotekuvat mukaan julkaisuun, jono käsitellään D:n rinnakkaisella `channel.drain`illa, `push-env.mjs`
   ottaa julkisen osoitteen vain `.env.cloud`ista ja tukee `--only`, ajastin julkaistaan `cf`-työkalulla
   (`deploy/vercel/tick/cloudflare.config.ts`, `vite.config.ts`; wranglerin kirjautuminen ei kata tiliä).
2. Testijulkaisu Eeliksen luvalla testikannoilla `aimo-t-*` ja väärällä Meta-tokenilla: webhook, allekirjoitus, jono,
   pariutus, selainkeskustelu korilinkkiin, korisivu kuvineen, tick. Kantojen siirron harjoitus 12 s.
3. Vaihto Eeliksen luvalla 16.11. klo 23.47–23.50: Macin botti (PID 34645) ja julkaisija (PID 21794) pysäytettiin TERMillä
   jonon ollessa tyhjä, VACUUM INTO -kopiot siirrettiin Tursoon, oikeat asetukset ja julkaisu Verceliin, Metan callback,
   D1 ja ajastin. Katko noin 2 min 40 s.
4. Ensimmäinen korjauserä Eeliksen luvalla: D1-migraatio, Worker, botti ja Groq (`WHATSAPP_TRANSCRIBE=groq`, `GROQ_API_KEY`).
   Eelis päätti: julkinen tilausnäkymä näyttää kaikkien WhatsApp-testaajien tilausten julkiset kentät (B:n #13).

## Löydökset

- **Valion testirajapinnan nimi ei enää ratkea (DNS ENOTFOUND).** Botti vastaa vain välimuistin 3 252 tallennetusta
  vastauksesta (`VALIO_FALLBACK=last-known`, demokello). Välimuistikanta siirtyi pilveen; uusia tuotteita ei saada.
- Yksi arvo (`WHATSAPP_VERIFY_TOKEN`) ei päätynyt Verceliin ensimmäisessä massaviennissä, vaikka komento ilmoitti
  onnistuneensa. Vienti uudelleen yksittäin korjasi sen. Tarkista vaikutus julkaisun jälkeen (docs/vercel.md).
- Vercelin lokiin tulee vain tulostetut rivit; onnistunut tick ei näy siellä. Tickin näkee `/api/orders`-vastauksen `observedAt`-ajasta.
- `test/whatsapp-server-url.test.mjs` kaatui kerran koko sarjan rinnakkaisajossa ja meni yksin läpi (ajoitusherkkä).

## Jatkossa

- **Botin käyttöönotto = Vercel-julkaisu** puhtaasta tilannevedoksesta (ohje `docs/vercel.md`). Macin bottia ei käynnistetä:
  Macin `data/`-kannat eivät enää päivity, ja kaksi bottia vastaisi eri kannoista.
- Ylläpitokomennot (esim. `scripts/whatsapp-signups.mjs`, `whatsapp:member`) Macilta pilvikantaa vasten antamalla
  `--env-file=deploy/vercel/.env.cloud` viimeisenä.

## Paluu Maciin (jos pilvi ei toimi)

1. Metan callback takaisin tunneliin: tunneli `cloudflared` PID 94071 (`ridge-photographers-prospective-monitor.trycloudflare.com`)
   jätettiin päälle vaihdon jälkeen. Jos se on suljettu, tarvitaan uusi pikatunneli ja sen osoite kolmeen paikkaan.
2. D1 `bot_backend_url` takaisin tunnelin osoitteeseen.
3. Botti snapshotista `/private/tmp/aimo-whatsapp-runtime-671b9a1` samalla komennolla
   (`node --disable-warning=ExperimentalWarning --env-file=.env --env-file=.env.whatsapp deploy/whatsapp/start.mjs`) ja julkaisija
   sen omalla komennolla (`--watch --order-events --agent-traces --include-web-chat`).
4. Pilvessä vaihdon jälkeen syntyneet keskustelut ja tilaukset ovat vain Tursossa. Ne saa talteen
   `turso db shell aimo-<kanta> .dump > kanta.sql` ja `sqlite3 kanta.db < kanta.sql` ennen paluuta.
5. Pysäytä ajastin (Worker `aimo-whatsapp-tick`), ettei pilvi julkaise samaan aikaan.

## Siivottavaa (Eeliksen päätös)

- Turso-testikannat `aimo-t-*` (sisältävät kopion keskusteluista) ja testiasetukset session scratchpadissa.
- Tunneli PID 94071 ja `caffeinate` PID 5780, kun pilvi on todettu toimivaksi.
- `deploy/vercel/tick/wrangler.jsonc` on vanha, ajastin julkaistaan nyt `cf`-työkalulla.
