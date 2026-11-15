# WhatsApp-palvelin pilvessä: Vercel + Turso

Tavoite: botti vastaa, korilinkit aukeavat ja ilmoittautumiset liitetään ilman, että kenenkään Mac on päällä.
Kaikki osat ovat ilmaistasoilla.

```text
WhatsApp → Meta → Vercel (api/index.mjs → server/cloud.mjs) ⇄ Turso (5 SQLite-kantaa)
                     ↑ kerran minuutissa: Cloudflare cron (deploy/vercel/tick) → POST /internal/tick
                     → Cloudflare Worker (landing, tilausnäkymä, demomaksu) kuten ennen
```

| Osa | Missä | Huom |
|---|---|---|
| WhatsApp-palvelin, korisivu, gateway | Vercel Hobby, `fra1` | Yksi Node-funktio, enintään 300 s ja 2 Gt per kutsu |
| Kannat | Turso Free | Samat viisi kantaa ja SQL kuin Macilla |
| Ajastus | Cloudflare Worker `aimo-whatsapp-tick` | Vercelin ilmaistaso sallii vain päivittäisen cronin |
| Landing, tilausnäkymä, maksu | Cloudflare Worker `aimo-order-demo` | Ennallaan |

## Miten sama koodi toimii pilvessä

- `server/sqlite.mjs`: tiedostopolku avautuu node:sqlite-kannaksi kuten ennen, `libsql://`-osoite Turso-kannaksi
  samalla synkronisella rajapinnalla. Kutsut kulkevat taustasäikeen kautta (`server/sqlite-remote-worker.mjs`),
  joten olemassa olevat 113 kantakutsua toimivat muuttamatta. `BEGIN IMMEDIATE … COMMIT` on Turson kirjoitustransaktio.
- WhatsApp-jonon varaus on atominen, ja käsittelyllä on 6 minuutin aikaraja (`PROCESSING_LEASE_MS`). Usea pilvi-instanssi
  ei siis käsittele samaa viestiä kahdesti, ja keskeytynyt käsittely palaa jonoon tickissä (`recoverStale`).
- Webhook kuitataan heti, ja jono käsitellään samassa kutsussa vastauksen jälkeen (`waitUntil`).
- Tick: keskeytyneet käsittelyt takaisin jonoon, epäonnistuneiden lähetysten uusinta, landingin ilmoittautumisten
  liittäminen, vahvistetut tilaukset ja agentin jäljet Workeriin sekä siivous 15 minuutin välein.
- Korisivun vahvistuksen jälkeen tilaus välitetään heti tilausnäkymään, jotta maksusivu löytää sen.
- Demokello: `DEMO_NOW_ANCHOR` kiinnittää kiertävän kellon lähtöhetken, jotta kaikki instanssit näyttävät saman ajan.
- Ulos näkyvät vain WhatsAppin reitit. `/demo`, `/mcp`, `/v1/*`, `/openapi.json`, `/approve.html` ja
  `/api/assistant/*` palauttavat 404.

## Käyttöönotto (tehdään kerran)

1. `npx vercel login`, `vercel link` (projekti `aimo-whatsapp`), `turso auth login`.
2. Turso: viisi kantaa `aimo-whatsapp`, `aimo-drafts`, `aimo-quotes`, `aimo-gateway`, `aimo-kitchen` (Frankfurt)
   ja ryhmän avain. Osoitteet ja avain Gitin ohittamaan `deploy/vercel/.env.cloud`-tiedostoon:
   `WHATSAPP_DB`, `WHATSAPP_DRAFT_DB`, `WHATSAPP_QUOTE_DB`, `GATEWAY_DB`, `AIMO_DB`, `TURSO_AUTH_TOKEN`, `TICK_SECRET`,
   `WHATSAPP_PUBLIC_URL=https://<projekti>.vercel.app`.
3. `node deploy/vercel/push-env.mjs` vie asetukset Verceliin (Macin `.env`-tiedostoista + `.env.cloud`).
4. `vercel deploy --prod`. Katalogi `data/catalog.json` kulkee mukaan julkaisuun (`.vercelignore`), ei GitHubiin.
5. Ajastin: `deploy/vercel/tick` → `wrangler secret put TICK_URL` (`https://<projekti>.vercel.app/internal/tick`),
   `wrangler secret put TICK_SECRET`, `wrangler deploy`.
6. Vaihto: pysäytä Macin 4749-palvelin ja julkaisija, siirrä kannat
   `TURSO_AUTH_TOKEN=… node deploy/vercel/migrate.mjs data/whatsapp.db=libsql://… …` (keskeytyy, jos etäkanta ei ole tyhjä,
   ja tarkistaa jokaisen taulun sisällön), vaihda Metan webhook osoitteeseen `https://<projekti>.vercel.app/webhooks/whatsapp`.

## Ylläpito Macilta

Hallintakomennot toimivat Macilta suoraan Turso-kantaa vasten, kun `.env.cloud` annetaan viimeisenä:

```bash
node --env-file=.env --env-file=.env.whatsapp --env-file=deploy/cloudflare/.env.publisher --env-file=deploy/vercel/.env.cloud scripts/whatsapp-signups.mjs list
```

Uusi versio: `vercel deploy --prod` projektikansiosta. Lokit: Vercelin projektin Logs-näkymä tai `vercel logs`.

## Rajat

- Ilmaistasot: Vercel Hobby on ei-kaupalliseen käyttöön. Turso Free estää kannat, jos jokin kuukausiraja ylittyy.
- Jokainen kantakutsu on verkkokutsu Frankfurtiin. Viestin käsittely hidastuu vähän, mutta mallikutsut ovat silti hitain osa.
- Metan testinumero hyväksyy edelleen vain käsin lisätyt vastaanottajat. Se ei riipu hostauksesta.
