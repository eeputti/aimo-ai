# Haaste vs. toteutus (tarkistettu su 15.11.2026 klo 00.35–00.45)

Valio Aimon "Trusted Trade Agents" -haasteen kohdat ja se, mikä niihin on toteutettu. Tarkistettu commitista `90ca34f` (GitHubin main). Työpuun commitoimattomat WhatsApp-muutokset eivät ole mukana.

**Miten tarkistettu:** puhdas kopio HEAD:sta, `npm test` 219/219, `aimo:eval` 26/26, `aimo:eval:spoken` 54/54 (ei mallikutsuja). `npm run demo` eristetyllä palvelimella (omat väliaikaiset kannat ja allekirjoitusavain) oikeaa Valio-mock-API:a vasten, kaikki 10 skenaariota. Käynnissä olevaan demoon ja sen kantoihin ei koskettu.

## Ydinvaatimukset

| Haaste | Toteutus | Nähty tarkistuksessa |
|---|---|---|
| Tuote-, hinta- ja saatavuushaku ulkoiselle agentille | `search_products` (17 546 tuotetta, suomi ja englanti, väittämät kuten laktoositon luokittelusuodattimiksi, GTIN) ja `request_quote` (live-hinta ja -saatavuus vain valituille ehdokkaille). Sama sopimus REST:nä, MCP-työkaluina ja OpenAPI 3.1 -dokumenttina (`server/gateway/contract.mjs`). | Briefin lause: 3 allekirjoitettua vaihtoehtoa, halvin 1 010,00 € (464306 × 1 000). Pois jätetyt ehdokkaat palautuvat syykoodeineen. |
| Hinta ja saatavuus → tilaus kiinteällä hinnalla | Tarjous on allekirjoitettu (JWS, EdDSA) 15 min voimassa oleva sitoumus kiinteillä nettohinnoilla, ei neuvottelu. `place_order` vaatii idempotenssiavaimen ja tarkistaa hinnan ja saldon uudelleen (`OFFER_STALE`). Julkinen avain `/.well-known/jwks.json`. | Muokattu tarjous → `OFFER_INVALID_SIGNATURE` (skenaario 4). |
| Oikeudet ja ihmisen hyväksyntä | Mandaatti on dataa: tasot `always` / `exceptions` / `autonomous`, euro- ja päiväkatot, vaaditut väittämät, kielletyt allergeenit (ei ohitettavissa), korvaussäännöt, sallittu päivän siirto. `get_mandate` näyttää agentille sen rajat. `pending_approval` → puhelinnäkymä, yksi nappi. | `SPEND_CAP_ORDER` → ihminen hyväksyy → confirmed (1). `APPROVAL_ALWAYS` uudelle ostajalle (5). Lisäys isoon tilaukseen odottaa, tilaus pysyy ennallaan (7). |

## Vapaaehtoiset suunnat

| Haaste | Toteutus | Puuttuu |
|---|---|---|
| Toimitusaika ja vastuullisuus | Tuotekohtainen toimitusvarmuus ja CO₂/kg rajapinnassa, hakusuodattimet `minDeliveryReliability` ja `maxCo2PerKg`, järjestys `rank: price / reliability / co2`. Merkinnät (laktoositon, gluteeniton, vegaaninen, EU-luomu). Puuttuva tieto näytetään puuttuvana. | Näkyy vain rajapinnassa; konsolin merkit poistettiin 14.11. rajauksessa. |
| Korvaavat tuotteet ja poikkeukset | Osittainen saldo täydennetään saman tuotetyypin korvaajalla, sama allergeeniprofiili ja väittämät. Varmentamaton allergeenitieto = sääntöjen ulkopuolella. Tilausaikaraja (`CUTOFF_PASSED`), `NOT_DELIVERABLE`, `STOCK_UNKNOWN`, `DELIVERY_DATE_SHIFT`. | Reseptilogiikkaan perustuva korvaus (resepti kiinnittää tuotteet, ei korvaa). |
| Jäljitettävyys ja selitettävyys | Hash-ketjutettu loki, `chain.valid`, sama loki ostajalle ja Aimolle. Mallikutsut (`MODEL_CALL`) ja taustavahdin arviot (`WATCH_EVALUATED`) omina riveinään. | |

Nähty: osittainen saldo 51 + 49 korvaajaa, `SUBSTITUTION_WITHIN_POLICY`, vahvistettu ilman ihmistä (2). Lokiketju ehjä, 184 riviä.

## Haasteen esimerkkiskenaariot

| Skenaario | Tila | Mitä on |
|---|---|---|
| Tarve → resepti → tilaus | Osittain | Resepti × annokset → kori, ilman annosmäärää ei tilata. Reseptisivu (kuva, Excel, teksti), keittiön suunnittelu varaston ja saapuvien kanssa (`/api/planning`). Nähty: Lohikeitto 100 annosta → 8 raaka-ainetta, 215,24 €, confirmed (10). Kauden raaka-aineesta lähtevä reseptiehdotus puuttuu. |
| Viime hetken tilaisuus | Osittain | Tilausaikarajat ja koko korin pysäytys, jos raaka-aine puuttuu. Reseptilogiikalla tehty korvaus puuttuu. |
| Toimittajan loppuunmyynti | Osittain | Korvaaja sääntöjen sisällä ja selitys (2). Ennakoiva seuranta ennen kuin keittiö huomaa puuttuu. |
| Myyvä agentti | Osittain | "Unohtuiko tämä?" ostajan omasta historiasta, yhden napin lisäys (9). Uutuuksien tai kausituotteiden tarjoaminen puuttuu. |
| Allergeeniturvallinen korvaus | Kyllä | Kielletty allergeeni ei mene läpi edes hyväksynnällä. Ravitsemussäännöt puuttuvat. |
| Vakiotilauksen ajautuminen | Osittain | Taustavahti: `UNUSUAL_QUANTITY` (nähty 1 500 l vs. tavallinen 25, skenaario 8) ja `ORDER_SPLIT_UNDER_CAP`. Kustannusten ajautuminen ja vakiotilauksen automaattinen uusinta puuttuvat. |

## Haasteen ehdot

- **"Ei chatbot verkkokaupan tilalle":** portti on ratkaisu, ja WhatsApp-apuri on yksi sen asiakkaista. WhatsAppin tilaukset kulkevat saman portin kautta (`server/order-tools/index.mjs` → `requestQuote` / `placeOrder`, oma demo-ostaja ja mandaatti). Pitchissä ja README:n alussa tämä järjestys pitää näkyä.
- **Ei oikeita järjestelmiä tai luottamuksellista dataa:** Valion API-avain on vain palvelimella. Gitissä ei ole `.env`-tiedostoja, kantoja, allekirjoitusavainta, `data/raw/`-aineistoa eikä avaimen jälkiä historiassa (tarkistettu `git ls-files` ja `git log -S`). Hintakutsut tehdään vain valituille ehdokkaille, taustavahti käyttää vain ostajan omaa historiaa, ja toisen ostajan tarjous hylätään (`OFFER_WRONG_BUYER`). Demon rajaus: konsoli- ja hyväksyntäreitit ovat auki (README, oletus 10).
- **Avoimet standardit:** OpenAPI 3.1, JSON Schema, MCP, JWS/JWKS (RFC 7515/7517), GS1 GTIN; tuotantopolkuna Peppol BIS Ordering ja AP2-tyyppiset allekirjoitetut mandaatit.

## Löydökset ennen palautusta (su klo 10.00)

1. **Demon skenaario 3 ei toimi sunnuntaina.** "200 litres of lactose-free milk by Sunday" tulkitaan nyt seuraavaksi sunnuntaiksi 22.11., ja tilaus vahvistuu ilman päivän siirtoa. Tulkinta antaa sanalle "today" päivän 15.11., joka on mock-API:n aikaisinta toimitusta (16.11.) aiemmin. Tilauksen `DELIVERY_DATE_SHIFT`-polkua ei ajettu tällä tekstillä.
2. **Porttia ei voi kokeilla julkisesta osoitteesta.** Tunnelin kautta vastaavat vain `/healthz` ja WhatsAppin reitit; `/mcp`, `/openapi.json`, `/.well-known/agent-gateway.json`, `/v1/*` ja `/approve.html` palauttavat 404. Paikallisesti portissa 4749 ne vastaavat.
3. **README:n ja SUUNNITELMA.md:n alku on vanhentunut.** README sanoo WhatsAppin olevan vain lukeva ja tilaamisen puuttuvan, ja SUUNNITELMA.md esittää WhatsAppin pääkäyttöliittymänä. Molemmat sotivat haasteen "ei chatbot" -kehystä vastaan repoa lukevalle tuomarille.
4. **Palautuksen checklist (SUUNNITELMA.md) on kaikilta kohdiltaan avoin:** video, deck, julkinen demolinkki, tila FINAL.
