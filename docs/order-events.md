# Vahvistettu tilaus Cloudflare Workeriin ja asiakkaan sähköposti

Päätös 14.11.2026 (Eelis): WhatsApp-keskustelu ja tilausydin pysyvät nykyisellä Node-palvelimella. Kun asiakas vahvistaa tilauksen (TILAA) ja gateway merkitsee sen tilaan `confirmed`, Workeriin siirtyy **vain se tilaus**. Worker tallentaa sen D1:een ja lähettää asiakkaalle Peetun pohjaan perustuvan vahvistusviestin. Koko localhostia ei siirretä Workersiin.

```
WhatsApp → Node-palvelin (keskustelu, luonnos, tarjous, TILAA, gateway)
              │ gateway-kanta (vain luku)
              ▼
         publish-orders.mjs --watch --order-events   (sama kone, 5 s välein)
              │ POST /api/order-events  (Bearer SYNC_TOKEN, HTTPS)
              ▼
         Worker aimo-order-demo → D1 order_events → env.EMAIL.send → asiakas
```

## Sopimus: `POST /api/order-events`

```json
{
  "version": 1,
  "observedAt": 1763121600000,
  "ledgerHead": "<gatewayn päätösketjun sha256, 64 heksaa>",
  "order": {
    "orderId": "AGW-20261114-0001", "channel": "whatsapp", "status": "confirmed",
    "createdAt": "2026-11-14T12:00:00.000Z", "deliveryDate": "2026-11-16",
    "net": 74.1, "lineCount": 1,
    "lines": [{ "productId": "1234", "name": "Laktoositon maito", "quantity": 20, "unit": "l", "net": 74.1 }]
  },
  "email": { "to": "testi@example.com", "customerName": "Ravintola Kulma" }
}
```

- `order` on täsmälleen sama sallittujen kenttien projektio kuin julkisessa tilannekuvassa (`src/protocol.ts`), ja sama validointi. Vain `confirmed` hyväksytään.
- `email` on valinnainen. Ilman vastaanottajaa tilaus tallentuu ja sähköpostin tila on `not_requested`. Vastaanottaja ja nimi eivät koskaan näy julkisilla reiteillä.
- Tilausnumero on idempotenssiavain. Sama tapahtuma uudelleen palauttaa `duplicate: true` eikä lähetä toista viestiä. Samanaikaiset uusinnat varaavat lähetyksen D1-päivityksellä, joten vain yksi lähettää.
- `observedAt` saa olla enintään 5 min vanha.

Vastaus: `{ "ok": true, "orderId": "...", "duplicate": false, "email": "<tila>" }`

| Sähköpostin tila | Merkitys | Julkaisija |
|---|---|---|
| `sent` | lähetetty kerran | ei yritä enää |
| `not_requested` | ei vastaanottajaa | ei yritä enää |
| `sender_missing` | Workerilta puuttuu `EMAIL`-binding tai `ORDER_EMAIL_FROM` | yrittää 5 s välein, kunnes lähettäjä on asetettu |
| `retry` | lähetys epäonnistui, yrityksiä jäljellä | yrittää uudelleen |
| `sending` | toinen pyyntö lähettää juuri nyt | yrittää uudelleen |
| `failed` | 3 yritystä käytetty | ei yritä enää |

Jos Cloudflare hyväksyy viestin mutta D1-päivitys sen jälkeen epäonnistuu, sama viesti voi lähteä toisen kerran. Täsmälleen yhtä toimitusta ei luvata.

## Sähköpostipohja

`src/email.ts` käyttää Peetun pohjaa [`public/emails/order-confirmation.html`](../public/emails/order-confirmation.html) ja korvaa esimerkkiarvot oikealla tilauksella: tilausnumero, päivä, rivit, määrät, rivisummat, verotonsumma ja toimituspäivä. Kaikki arvot escapoidaan. Mukana myös tekstiversio.

Poistettu pohjasta, koska tilauksessa ei ole tietoa: tuotekuvat, toimitusosoite ja aikaikkuna, toimitusmaksu ja alv. Teksti pysyy Peetun englanninkielisenä; suomennos on yhden tiedoston muutos. Painike vie Workerin tilaussivulle.

## Käyttöönotto (ei vielä tehty)

1. **D1-skeema:** aja uusi `order_events`-taulu nykyiseen tietokantaan: `npm exec -- cf d1 execute aimo-order-demo --remote --file schema.sql` hakemistossa `deploy/cloudflare` (`CREATE TABLE IF NOT EXISTS`, olemassa olevaa dataa ei muuteta).
2. **Lähettäjä:** onboardaa lähettäjädomain Cloudflare Email Serviceen, lisää `cloudflare.config.ts`:ään `send_email`-binding nimellä `EMAIL` (mieluiten rajattuna sallittuihin vastaanottajiin) ja `ORDER_EMAIL_FROM`-muuttuja. Ilman tätä tilaukset tallentuvat ja viestit odottavat tilassa `sender_missing`.
3. **Julkaisu:** `npm run typecheck`, `cf deploy --dry-run`, sitten `cf deploy`.
4. **Julkaisija:** lisää `.env.publisher`:iin `ORDER_EMAIL_TO` (oma testiosoite) ja valinnaisesti `ORDER_EMAIL_CUSTOMER_NAME`. Käynnistä julkaisija uudelleen valinnalla `--order-events`. Ilman valintaa `--order-events-backfill` jo vahvistettuja tilauksia ei lähetetä; vain käynnistyksen jälkeen vahvistetut.

Demossa lähetetään vain omiin, todellisiin testiosoitteisiin. Asiakkaan oikeaa osoitetta ei lueta WhatsApp-kannasta.

## Tarkistukset

`npm --prefix deploy/cloudflare test` (8/8), `run typecheck`, `run build`. Testit kattavat yhden lähetyksen myös rinnakkaisissa uusinnoissa, puuttuvan lähettäjän ja myöhemmän uusinnan, kolmen yrityksen rajan, väärän avaimen, muun kuin vahvistetun tilauksen, virheellisen osoitteen ja otsakeinjektion, vastaanottajan pysymisen pois julkiselta reitiltä sekä julkaisijan tilausten valinnan. Lähetys on testattu simuloidulla `EMAIL`-bindingillä; oikeaa sähköpostia, julkaisua tai D1-migraatiota ei ole tehty.
