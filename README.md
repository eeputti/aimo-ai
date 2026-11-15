# Aimo: WhatsApp-tilausapuri ja ostoskori

Ostaja kertoo tarpeensa WhatsAppissa, valitsee tuotteet ja avaa apurin lähettämän yksityisen korilinkin. Korissa tarkistetaan tuotteet, määrät, toimituspäivä ja hinta ennen demotilauksen vahvistamista. WhatsApp ja korisivu käyttävät samaa palvelimelle tallennettua luonnosta.

```text
WhatsApp → toimituspäivä ja tarpeet → tuotevalinnat → yksityinen ostoskori
                                                        ↓
                                      tarkistus → vahvistus → demotilaus
```

Taustalla oleva Aimo Agent Gateway hoitaa allekirjoitetut tarjoukset, tuoreen hinta- ja saatavuustarkistuksen, ostajan valtuudet, ihmishyväksynnän, kaksoistilausten eston ja päätöslokin. Sama tilauspalvelu tarjoaa REST-, MCP- ja OpenAPI-rajapinnat ulkoisille ostoagenteille.

## Käynnistys

Node.js 22.13 tai uudempi.

```bash
npm ci
cp .env.example .env
npm run fetch-data
npm run catalog
```

Täytä Meta- ja malliasetukset sekä tilausdemon erilliset tietokantapolut [WhatsApp-ohjeen](docs/whatsapp.md) mukaan. Lähdeaineisto tarvitsee haasteen käyttöoikeuden; aineistoa tai avaimia ei tallenneta GitHubiin.

```bash
npm run whatsapp
```

Tilauspolku otetaan käyttöön asetuksella `WHATSAPP_ORDERING_ENABLED=true`. Tuotehaku tarvitsee paikallisen katalogin. `VALIO_API_KEY` ottaa käyttöön haasteen hinta- ja saatavuusrajapinnan; ilman sitä tiedot simuloidaan. `ANTHROPIC_API_KEY` ottaa käyttöön kielimallin, muuten käytössä on sääntötulkinta.

| Osoite | Käyttö |
|---|---|
| `/webhooks/whatsapp` | Metan allekirjoitettu webhook |
| `/whatsapp/cart#…` | WhatsAppista saatu yksityinen kori; sama luonnos ja revisio |
| `/healthz` | Palvelun terveystarkistus; tilaustilassa `ordering-demo` |
| `/approve.html?order=…` | Paikallinen, tilauskohtainen ihmishyväksyntä |
| `/demo` | Sama keskustelu paikallisessa selaimessa omalla testiasiakkaalla |
| `/` | Paikallinen aloitusohje |

`/demo` ja gatewayn ylläpito toimivat vain palvelinkoneelta. Julkisen tunnelin kautta avautuvat WhatsAppin rajatut reitit. `npm start` käynnistää erikseen paikallisen gatewayn porttiin 4747; sitä ei tarvita erillisen WhatsApp-palvelimen rinnalle. Käytä yhtä WhatsApp-prosessia kutakin kantaa kohti.

## Rakenne

- `server/whatsapp/`: Meta-kanava, numeroliitos, keskustelusilta, korilinkki ja korisivu.
- `server/order-conversation/` ja `server/order-tools/`: luonnos, tarkennukset, tuotteet, tarjoukset ja vahvistus.
- `server/aimo/`, `server/storefront.mjs`, `server/valioApi.mjs`: tuotehaku, pakkausmäärät, hinta ja saatavuus. Storefront-nimi on yhteisen hakumoduulin historiallinen nimi.
- `server/gateway/`: tilauspalvelu, valtuudet, allekirjoitukset ja audit-ketju.
- `public/`: WhatsAppin kori, tilauskohtainen hyväksyntä, paikallinen keskustelukokeilu ja niiden tarvitsemat tyylit ja pienet kuvat.
- `test/`, `eval/`, `scripts/whatsapp-*`: tilauspolun testit ja erikseen ajettavat keskusteluarvioinnit.
- `deploy/whatsapp/`: palvelimen käyttöönottopohja.
- `deploy/cloudflare/`: nykyinen esittelysivu, liittyminen, demotilausten näkymä, demomaksu ja vahvistussähköposti.

## Rajapinta

Paikallisesti: `POST /v1/products/search`, `POST /v1/quotes`, `POST /v1/orders`, `GET /v1/orders/{id}`, `/mcp` ja `/openapi.json`. Ostajan avain lähetetään `Authorization: Bearer <avain>` -otsakkeessa. Sopimus on tiedostossa `server/gateway/contract.mjs`.

Gatewayn tilaustallennus ja valinnainen demomaksu ovat demoja: oikeaa Valio-tilausta, maksupalvelua tai toimitusta ei ole kytketty. Numeron kutsukoodi on testitunnistus; tuotannon asiakastunnistus ja ostovaltuudet kuuluvat Valion integraatioon. Metan testinumero edellyttää vastaanottajan hyväksymistä Metassa.

## Tarkistukset

```bash
npm test
npm run aimo:eval
npm run aimo:eval:spoken
```

Testit käyttävät erillisiä kantoja ja simuloituja ulkoisia palveluita. Katalogia tarvitsevat testit ilmoittavat ohituksen, jos aineisto puuttuu. `npm run eval` käyttää oikeaa haasteen mock-API:a ja kuluttaa sen kiintiötä. WhatsAppin selfplay-ajot käyttävät erikseen käynnistettyinä mallipalvelua; ne eivät ole ajastettuja.

## Ohjeet ja historia

[WhatsAppin asetukset](docs/whatsapp.md) · [tilauspolun koe](docs/ordering-demo.md) · [julkinen demo](docs/cloudflare.md) · [tilaustapahtumat ja sähköposti](docs/order-events.md) · [repon rajaus ja paikallisarkisto](docs/repository-scope.md).

Vanha keittiösuunnittelu, verkkokaupan laaja ulkoasukopio, erilliset apurinäkymät ja AI-työn koordinointipalvelu on arkistoitu paikallisesti. Niiden lähteet säilyvät myös Git-historiassa. `TYOLOKI.md` välittää päätökset ja tarkistukset kehittäjien välillä; `AGENTS.md` sisältää yhteiset työohjeet.
