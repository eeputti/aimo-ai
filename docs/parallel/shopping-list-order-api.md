# Ostoslistan API-siirron loppuketjun varmennus — Eeliksen Codex

## Sovittu omistus 14.11.2026

Tämä on localhost-verkkokauppaintegraation jatkotyö. Käyttäjän työnjakopäätös on yhteisen MCP:n viestissä #17. Danielin toteutustehtävä `e6c4127e-366d-4f8c-8f54-0d401249299e` omistaa ostoslistan siirron. Sen toteuttaja hyväksyi tässä kuvatun erillisen varmennusosuuden viestissä #35 vastauksena pyyntöön #33.

- Oma yhteinen tehtävä `750a63f3-defe-4b49-931d-75204a7fed81`, tunniste `eelis-chatgpt`; paikallinen varaus `7ed54857` / `codex`.
- Omat tiedostot: uusi `test/shopping-list-order-api.test.mjs` ja tämä raportti.
- Daniel omistaa `server/shopping-list/`, WhatsAppin shopping-list-/ordering-/runtime-kytkennät, `server/order-conversation/runtime.mjs`, selainapurin kytkennän ja oman handoff-testinsä. Näitä ei muokata tässä työssä.
- Clauden `server/order-conversation/index.mjs`- ja `server/order-tools/index.mjs`-tiedostoihin ei tässä osuudessa tarvita muutoksia. Käyttöönotto, Meta, `.env` ja restartit säilyvät omistajillaan.

## Danielin vahvistama rajapintasopimus

- `GET /api/assistant/whatsapp-list[?buyerId=whatsapp-demo-<binding>]`: `{ mode: 'local-demo', accounts: [{ buyerId, companyName, personName }], buyerId, shoppingList }`. Lista on `null` tai `{ schemaVersion: 1, source: 'whatsapp', id, revision, buyerId, companyName, deliveryDate, deliverySiteId, diet, lines, missing, status, requiresExplicitConfirmation: true }`.
- `POST /api/assistant/whatsapp-list/chat`: JSON `{ buyerId, text, messageId, expectedList: { id, revision } | null }`. Vastaus on nykyinen ordering-tulos sekä `shoppingList`.
- Sama käyttäjän viestin `messageId` säilytetään uudelleenyrityksessä. Palvelin lisää `shop:<binding>:`-nimiavaruuden. Molemmat kanavat jatkavat samaa luonnosta ja samaa `wa_dialogue`-jaksoa.
- Väärä lista/revisio palauttaa 409 ennen muutoksia. Jo käsitellyn vuoron uusinta sallitaan, kun sillä ei liitetä vanhaa yhteenvetoa myöhemmin muuttuneeseen listaan. Tyhjä, tilattu tai nollattu lista palautuu `null`:na. Nollaus vaihtaa keskustelujakson.
- GET, listan siirto tai näyttäminen eivät tee tilausta. `TILAA` hyväksyy vain ajantasaisen yhteenvedon. Tuotetyökalut tarkistavat tarjouksen, määrät, oikeudet ja idempotenssin nykyisillä säännöillä.
- Vain palvelinkoneen paikallinen, saman originin demo. Tunneli-, välityspalvelin- ja vieraan sivuston pyynnöt torjutaan. Asiakkuus ratkaistaan palvelimella aktiivisesta WhatsApp-liitoksesta; selaimen toimittamaan customer-/permissions-/phone-objektiin ei luoteta. Revokointi katkaisee pääsyn. Reitit ovat käytössä vain tilaustilassa.

## Varmennuksen tila

**Valmis riippumaton varmennus.** Danielin toteutus julkaistiin committina `4d57190f65ebe537004a978d15c8aa47d93fe68a`, raportin viimeistely `48c4139`. Julkaisu ja valmistuminen luettiin takaisin yhteisen tehtävän revision 2 / `done`-tilasta. Testattujen API-lähteiden vastaavuus `48c4139`:ään tarkistettiin ennen ajoa. Yhteinen työpuu päivittyi Git-vastaavan yhdistämiscommittiin `5208f76`; oma osuus ei muuta sovelluksen lähdekoodia.

- Lähtötaso **17/17 läpi**: `local-shop`, `ordering-e2e`, `order-tools` ja `storefront-checkout`.
- Uusi `node --disable-warning=ExperimentalWarning --test test/shopping-list-order-api.test.mjs`: **1/1 läpi**, noin 0,7 s. Testi käynnistää oikean standalone-palvelimen satunnaiseen porttiin ja käyttää oikeaa HMAC-webhookia, jonoa, suomenkielistä tulkkia, pysyvää luonnosta, ruokavaliosääntöjä, paikallista katalogia, tuotetyökaluja, allekirjoitettuja tarjouksia ja gatewayta. Kaupan ja RESTin takaisinluku kulkevat oikean HTTP:n yli.
- Koko sovelluksen `npm test`: **191/191 läpi, 0 virhettä, 0 ohitettua**, noin 2,3 s. Syntaksi ja oma whitespace-diff tarkistettu.

### Uudessa kokeessa nähty ketju

1. Testiasiakkaan allekirjoitettu WhatsApp-viesti: `20 l maitoa ja 5 l kermaa maanantaiksi`. GET palauttaa samat kaksi riviä, päivän 16.11. ja puuttuvan ruokavaliotiedon ilman tilausta tai avainten/puhelinnumeron palautusta.
2. Kaupan POST muuttaa maidon 30 litraan. Sama luonnostunniste, uusi revisio ja sama määrä palautuvat GETistä. Täsmälleen saman UUID:n uusinta palauttaa saman tuloksen kasvattamatta revisiota.
3. WhatsAppin `laktoositon` kohdistuu samaan luonnokseen. Kaupassa valitaan tuotteet `1 1`, saadaan tarkistettava tarjous, ja `joo` ei vielä tee tilausta.
4. WhatsApp muuttaa maidon 40 litraan. Vanhaan yhteenvetoon kohdistuva TILAA palauttaa 409 eikä tee tilausta. Uudessa versiossa määrä, valitut tuotetunnisteet ja laktoosittomuus säilyvät.
5. Kaksi samanaikaista HTTP-TILAA-pyyntöä samalla UUID:lla palauttavat saman tuloksen. Syntyy täsmälleen yksi gatewayn demotilaus oikeille valituille tuotteille, 40 litran maitotarpeelle ja päivälle 16.11. Testin `always`-valtuus jättää sen yrityksen hyväksyntään; localhost-kaupan hyväksyntä vahvistaa saman tilauksen.
6. RESTin ostajakohtainen takaisinluku, localhost-kaupan asiakaskonteksti ja tilausnäkymä vastaavat samaa tilausta. Päätösketju on ehjä, ja siinä on yksi `ORDER_RECEIVED` ja yksi `ORDER_CONFIRMED`.
7. Saman Meta-webhookin ja saman selainvahvistuksen uusinta eivät lisää toista tilausta. Nollauksen ja uuden voilistan jälkeen vanhan vahvistuksen uusinta saa 409 ja uusi lista säilyy. Vieraan sivuston, tunnelin ja proxyn GET/POST saavat 403. Testin oman numeroliitoksen poisto estää listan lukemisen ja lähettämisen 404:llä myös väärennetyn customer-/permissions-objektin kanssa.

Testi käyttää vain omia väliaikaisia kantojaan. Hinnat/saatavuus ovat simuloituja ja malliavaimet tyhjiä. Vain Metan lähetys- ja status-HTTP-vastaukset simuloidaan testipalvelimen sisällä; kaikki muu ulkoinen verkko on siinä estetty. Testikannat ja palvelin poistetaan lopuksi. Tämä ei todista viestin toimitusta oikeaan puhelimeen tai ulkoisen Valion tilausjärjestelmän hyväksyntää.

## Käyttöönotto ja tallennus

Rajapinnan sovelluskoodi on jo GitHubissa Danielin yllä mainituissa commiteissa. Tämä testitiedosto ja raportti luovutetaan paikalliselle Git-vastaavalle omaa loki-/commit-/push-vaihetta varten; ennen sen kuittausta ne ovat paikallisia. Muiden Cloudflare-, julkinen-demo- tai token-raporttien muutoksia ei liitetä tämän työn nimiin.

Nykyiseen WhatsApp-palvelimeen, Metaan, `.env`-tiedostoihin tai käyttäjän demo-/tilauskantoihin ei tehty muutoksia tässä vaiheessa. Käyttöönoton omistaja päivittää palvelimen hallitusti julkaistuun versioon. Sen jälkeen omaa WhatsApp-listaa voi jatkaa osoitteessa `http://localhost:4749/assistant.html`, ja hyväksytty tilaus näkyy osoitteessa `http://localhost:4749/?shop=orders`. Pelkkä sivun päivitys ei lataa vanhaan prosessiin uutta rajapintaa.

## Ulkoinen tilausjärjestelmä

Paikallisen challenge-OpenAPI:n endpointit ovat ping, hinta, saatavuus ja aineistojen lataus. Tilauksen vastaanottavaa Valion tuotantorajapintaa ei ole toimitettu. Gatewayn `commit.simulated: true` tarkoittaa projektin omaa demositoumusta. Ulkoisen verkkokaupan vastaanottamaa tilausta ei väitetä tehdyksi paikallisen onnistumisen perusteella.
