# Hostauksen seuraava vaihe: palvelut, vastuut ja alustavalinnan odotus

Päivä: 14.11.2026. Tekijä: Cloudflare-julkaisuchat / Codex. Paikallinen koordinointivaraus `8cd50a1b` koskee **vain tätä tiedostoa**.

## Viimeisin käyttäjäpäätös määrää järjestyksen

1. Käyttäjä pyysi hostingit omaan/tiimin hallintaan ja palvelut toimimaan myös Danielin ja Eeliksen läppärien ollessa kiinni. Omistajuus ja koneista riippumattomuus ovat tavoite.
2. MCP-yhteyschat selvitti aimo-ai-Cloudflare-accountin omistajuuden ja toimitti tiimille siirtotyön alustavan jaon, yhteinen broadcast #55 / Danielille #56. Tämä ei ollut uuden palvelun käyttöönotto tai nykyisen MCP:n katkaisu.
3. **Tämän jälkeen käyttäjä kysyi, onko Workers paras vaihtoehto nykyiselle sovellukselle ja agentille, ja pyysi parempaa hosting-vaihtoehtoa.** Alustavertailu tehdään chatissa `Yhdistä Codex Render MCP -palvelimeen`. Workers, Render ja VM ovat tässä vaiheessa vaihtoehtoja. Backendin alustaa ei ole päätetty.

Viimeisin kysymys luettiin alkuperäisen chatin käyttäjäviestistä ennen koordinointia. Uutta Workers-backend-pohjaa, SQL-sovitinta, pilvitietokantojen siirtoa, uutta kirjoitettavaa MCP:tä tai infrastruktuuripakettia **ei aloiteta ennen käyttäjän alustavalintaa**. Aiemmin käyttäjän erikseen hyväksymä katselusivun julkaisu ja sen julkaisija säilyvät.

Käyttäjä kysyi sen jälkeen tässä julkaisuchatissa avoinna olevan erillisen Workers-tilaussivun tarpeellisuutta. Selvennetty: se on valinnainen katseludemo. Lopullisen ketjun tulee näyttää hyväksytty tilaus varsinaisessa verkkokaupassa. Kysymystä ei tulkittu sivun/tietokannan poistopyynnöksi tai julkaisijan pysäytyspyynnöksi, eikä näitä muutoksia tehty.

## Varmennettu palveluinventaario

| Osa | Nykyinen toteutus ja pysyvä tila | Varmennuksen taso | Riippuvuus läppäristä |
| --- | --- | --- | --- |
| Julkinen tilausnäkymä | `deploy/cloudflare/`, Workers Static Assets + Worker + D1 `aimo-order-demo` | Oikea julkaisu `0757280b-e026-4b61-b15d-6ff63fbaa061`; Free / $0 / Current plan nähty hallinnassa. Uusi GET `/api/orders` tässä vaiheessa: 200, yksi `AGW-20261114-0001`, noin 4 s vanha tilannekuva. | Sivun ja viimeisen kuvan näyttäminen ei tarvitse läppäriä. |
| Tilannekuvan julkaisija | `deploy/cloudflare/publish-orders.mjs`, exec-sessio 50658. Lukee WhatsAppin olemassa olevia kantoja vain luku -tilassa. | Täsmällinen takaisinluku ja alkuperäinen julkaisuprosessi varmennettu katseluvaiheessa. Nykyinen tuore kuva osoittaa päivityksen jatkuvan. | **Uusien tilausten päivitys tarvitsee nykyisen koneen.** Tämä on hyväksytty välivaihe, ei lopullinen pilvibackend. |
| WhatsApp-kanava ja siihen upotettu kauppa | `server/whatsapp-server.mjs`, `server/whatsapp/`, portti 4749. Jono, jäsenliitokset, vastauksen osat, keskustelu/luonnokset ja gateway. | Tässä vaiheessa vain lukeva `/healthz`: 200 / ordering-demo. Numeron, tokenin ja puhelintoimituksen tilaa ei testattu tässä. | Nykyinen Node-prosessi tarvitsee palvelinkoneensa. |
| Verkkokaupan/tilausapurin tilausydin | `server/order-conversation/`, `server/order-tools/`, `server/gateway/`, `server/shopping-list/`; nykyinen handoff käyttää samaa luonnosta ja gateway-tilausta. | Koodi luettu. Riippumaton HTTP/API-ketju on integraatiochatin commitissa `c63435d`, raportin mukaan 191/191 sovellustestiä. Näitä ei tässä inventaariossa uusittu. | Kytketyn Node-palvelimen ja sen levyjen mukana. |
| Erillinen tavallinen storefront-palvelin | `server/index.mjs`, oletus 4747; omat gateway- ja Aimo-kannat, eri aineisto kuin WhatsApp-demossa. | Tämän vaiheen HEAD porttiin 4747 ei saanut yhteyttä. Toteutuksen olemassaolo ei tarkoita käynnissä olevaa palvelua. | Jos käytössä, tarvitsee Node-isäntänsä. |
| Yhteinen Team MCP | `services/team-mcp/`, Node/Express/MCP SDK ja SQLite. Jäsenet, viestit, kursorit, tehtävät, varaukset, revisiot, tapahtumat ja OAuth-tietueet. | Omistus-/hostingchatin varmennettu nykyinen yhteys ja raportti `cloudflare-hosting-ownership.md`. Se on yhä Danielin nykyisen tunnelin takana. Tässä vaiheessa sen kantaa ei avattu tai kopioitu. | Nykyinen tunneli ja taustapalvelin tarvitsevat Danielin koneen. |
| MCP-koordinaattori | `services/team-mcp/src/coordinator*.mjs`, `coordination-store.mjs`, `openai-agent.mjs`; nykyinen toteutus jakaa Team MCP:n kannan ja käyttää jatkuvaa tick/lease/heartbeat-prosessia. | Koodi ja aiempi testiraportti luettu. Toteutuksen testi ei osoita daemonin olevan käytössä yhteisellä nykyisellä isännällä; käyttöönottotila varmistetaan sen omistajalta. | Nykyisen prosessi-/palvelinmallin mukaan; pilviversiota ei otettu käyttöön. |
| Mahdollinen ulkoinen ostosapuri-MCP | `server.py`, `requirements.txt` sekä selainapurin `ASSISTANT_MCP_URL`-liitäntä | Tämän koneen nykyisessä .env/.env.whatsapp-kokoonpanossa `ASSISTANT_MCP_URL` ei ole asetettu. Muun koneen tai vanhan Render-palvelun aktiivisuutta ei päätellä tästä. | Omistaja ja todellinen käytössä oleva endpoint selvitetään ennen siirtolistaan ottamista. |

Julkisen kuvan D1 on projektio, ei yhteisen MCP:n, luonnosten tai gatewayn auktoritatiivinen tietokanta. Sen olemassaolo ei täytä muiden palveluiden pysyvyysvaatimusta.

## Tallennus- ja runtime-vaatimukset alustavertailulle

- WhatsAppin nykyinen tilaustila käyttää **viittä erillistä kantaa**: WhatsApp-jono/jäsenet, tilausluonnokset/vuorotulokset, tuotetyökalun tarjoukset, gateway ja Aimo/hintavälimuisti. Kaikki viisi kantamuuttujaa ovat nykyisessä kokoonpanossa asetettuina. Lisäksi gatewayn Ed25519-allekirjoitusavain pitää säilyttää samana. Tunnuksia tai kantapolkujen arvoja ei kirjata tähän.
- Tavallisen storefrontin omia `data/gateway.db` / `data/aimo.db` -tietoja ei yhdistetä WhatsAppin tietoihin. Team MCP ja sen koordinaattori muodostavat vielä oman kokonaisuutensa. Useissa kannoissa on eri tarkoitusta palveleva `orders`-taulu, ja sekä Team MCP että WhatsApp käyttävät erilaista `members`-taulua. Pelkkä taulujen yhdistäminen yhteen SQLiteen rikkoisi rajauksen.
- Nykyinen toteutus käyttää synkronista `node:sqlite`-rajapintaa, valmisteltuja kyselyitä ja eksplisiittisiä transaktioita. Varaukset, jonon kuluttaminen, idempotenssi ja audit eivät saa muuttua satunnaisesti vain uuden tallennusrajapinnan vuoksi.
- Node-isännällä tarvitaan pysyvä kirjoitettava levy, yksi sovittu kirjoittaja per tilakokonaisuus, hallittu prosessien käynnistys/pysäytys, HTTPS ja palautettava varmistus. Valmis WhatsAppin Docker/Compose-pohja on `deploy/whatsapp/`, mutta sen ohjeessa Docker-image/Compose on nimenomaisesti vielä varmentamatta. Pohja ei yksin tarkoita valmista pilvikäyttöönottoa.
- Workers-vaihtoehdossa tiedostoihin tallentuvia SQLite-kantoja tai allekirjoitusavainta ei jätetä `/tmp`:hen. Workersin tiedostojärjestelmä on muistipohjainen ja kirjoitettava tilapäistila on pyyntökohtainen; pysyvä tila vaatii erillisen tallennusratkaisun. [Cloudflaren tiedostojärjestelmäohje](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)
- Workersin SQLite-backed Durable Object tarjoaa transaktionaalisen, vahvasti konsistentin tilan. Se on **arvioitava vaihtoehto**, ei tässä hyväksytty tietokantavalinta. D1:n asynkronisen kyselyrajapinnan sovitus ja Durable Objectin synkronisen SQL-rajapinnan sovitus arvioidaan nykyisiä transaktiorajoja vasten. [Durable Object -tallennus](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- Durable Objectin yhden säikeen malli ei yksin todista koko useita verkko-odotuksia sisältävän tilausketjun idempotenssia. Myös `await`-kohtien lomittuminen, vanhan työntekijän torjunta ja prosessin/objektin katoaminen mallikutsun tai hintakyselyn aikana on testattava.
- Koordinaattorin pitkäikäinen Node-silmukka ja kahden sekunnin heartbeat eivät siirry Workerille sellaisenaan. Workers-ratkaisu tarvitsisi erikseen suunnitellut tapahtumat, pysyvän jonon, vuokran uusinnan ja herätykset. VM/Node-palvelussa samat prosessit voidaan säilyttää, mutta niiden valvonta ja sama kanta on kytkettävä oikein.
- Tuotekatalogi ladataan nyt palvelimen tiedostosta. Katalogin, private-keyn ja muiden yksityisten runtime-tiedostojen toimitus kuuluu valittuun käyttöönottotapaan; `data/raw/`, credentialit ja tietokannat eivät kuulu Gitiin tai julkisiin selainassetseihin. Meta-, malli- ja Valio-palvelut säilyvät ulkoisina API-riippuvuuksina oman backendin hostingista riippumatta.
- Nykyinen kaupan handoff-API on tarkoituksellisesti localhostiin rajattu. Pilvikäyttö tarvitsee nimenomaisen autentikoidun asiakas-/toimituspaikka-/oikeusrajan. Guardin poistamista tai läppäriproxyä ei pidetä autentikoinnin toteutuksena.

## Omistajat ja tiedostorajat

| Osuus | Nykyinen vastuullinen | Tässä vaiheessa sallittu työ |
| --- | --- | --- |
| Alustavertailu ja käyttäjän hosting-valinta | `Yhdistä Codex Render MCP -palvelimeen` -chat / Eelis | Vaihtoehtojen, omistajuuden ja kustannusmallin selvitys. Uusia maksullisia tilauksia ei aktivoida tämän vaiheen perusteella. |
| Resurssit ja julkaisu, nykyinen katselusivu | `Arvioi Cloudflare Workers -vaihtoehto` -chat | Olemassa oleva `deploy/cloudflare/`, `docs/cloudflare.md`, `docs/parallel/cloudflare-setup.md`; uusi valmistelu **vain tämä raportti**. Ei uutta backend-koodihakemistoa. |
| Tilaus-API:n runtime-/tallennusvaatimukset | `Suunnittele tilauksen verkkokauppaintegraatio` -chat | Vain `docs/parallel/order-api-hosting.md`. Aiempi `deploy/order-api-workers/`-ehdotus on keskeytetty ennen toteutusta; agentti vahvisti, ettei sitä luotu. |
| Team MCP:n ja koordinaattorin mahdollinen porttaus/siirto | Danielin nykyinen MCP-omistaja, aiemmat koordinaattorityöt niiden omistajilla | Työpaketti #55/#56 on alustava. Nykyinen taulu ja tunneli pysyvät. Tarkka toteuttaja ja koodivaraus vahvistetaan vasta alustavalinnan jälkeen. |
| WhatsAppin token, webhook ja käynnissä olevan kanavan käyttöönotto | `Korjaa WhatsApp-tokenin vanheneminen` ja sovittu Meta-käyttöönoton omistaja | Nykyinen korjaus jatkuu omassa rajauksessaan. Tämä chatti ei kirjoita `.env`:iä, vaihda callbackia, lähetä puhelinviestiä tai restarttaa kanavaa. |
| Paikallisten valmiiden vaiheiden Git-kokoaminen | `Seuraa sessioita ja edistä työtä` -chat / henkilö 1 | Valmiin raportin ja tarkistetun diffin kokoaminen samaan commitiin ja pushin varmennus. |

Cloudflare-account on käyttäjän **aimo-ai / 41cfacacd7c70bbcf80372ab540dd974**. Omistuschatin raportin mukaan Eelis on Super Administrator ja kolme Workers Editor -kutsua on lähetetty/pending. Vastaanottoa ei väitetä tehdyksi. Rooli ei itsessään anna uusien Workerien tai D1-resurssien perustamisoikeutta; tarvittavat uudet resurssit perustetaan omistajan kautta valitun vaiheen yhteydessä. Tiimikutsujen olemassaolo ei ratkaise backendin alustaa.

## Yhteinen seuraava testi alustavalinnan jälkeen

1. Nimetään yksi käyttöönottovastaava, yksi sovittu auktoritatiivinen tila kullekin palvelulle ja kirjoittajaraja. Sovitaan tarkat uudet hakemistot ennen koodia; nykyisen katseluvaiheen tai MCP-palvelun päälle ei tehdä toista toteutusta.
2. Käynnistetään valitun alustan eristetty testi ilman oikeita malli-/Meta-/Valio-avaimia ja ilman nykyisten kantojen käyttöä. Varmennetaan terveystarkistus, autentikointi ja käyttöoikeuksien rajaus.
3. Ajetaan nykyinen riippumaton ostoslista → tarjous → erillinen TILAA → hyväksyntä → saman tilausnumeron takaisinluku valitussa runtimessa. Kaksi samanaikaista uusintaa tuottaa yhden tilauksen ja ehjän audit-ketjun. Vanha revisio tai peruttu asiakkuus ei muuta tilausta.
4. Katkaistaan vain eristetty testiprosessi/objekti kriittisissä kohdissa: vastaanotto, mallivastaus, tilauksen tallennus ja osittainen viestitoimitus. Käynnistyksen jälkeen jäsenliitos, luonnos, idempotenssitulos, allekirjoitusavain ja audit säilyvät; vanha worker ei saa jatkaa kirjoittajana.
5. Team MCP:n siirtokoe käyttää yksityistä konsistenttia tilakopiota. Tarkistetaan jäsenet/oikeudet, viestien järjestysnumerot ja kursorit, tehtävät/revisiot, aktiiviset varaukset sekä koordinaattorin jono ja vuokrat. Ei tyhjää toista kirjoitettavaa yhteistä taulua. Exportin tiedot tai avaimet eivät mene Gitiin tai julkiseen katselusivuun.
6. Sovitaan hallittu lopullinen siirto: varmistus, vanhan kirjoittajan pysäytys/lukitus, viimeinen yhtenäinen siirto, takaisinluku, vasta sitten yhteisen URL:n/webhookin vaihto. OAuth issuer/resource -muutos ja liittimien uudelleenkirjautuminen testataan. Jos uudessa palvelussa on jo uusia kirjoituksia, paluu vanhaan vaatii niiden säilyttävän menettelyn; pelkkä osoitteen kääntäminen takaisin ei riitä.
7. Lopuksi ajetaan oikea erikseen sovittu puhelintesti ja katselusivun päivitys sekä palveluiden toiminta läppärien ollessa irti. Nykyinen Danielin MCP-tunneli säilyy valmistelun aikana ja suljetaan vasta yhdessä sovitun varmennetun vaihdon jälkeen.

## Tässä vaiheessa tehty ja tekemättä

- Varmennettu käyttäjän uusin alustakysymys alkuperäisestä chatista; kuitattu sekä hosting-chatille että integraatiochatille. Omat tiedostorajat on kerrottu molemmille. Aiempi 0 tilausta / julkisten kenttien hyväksyntä avoinna -tieto korjattiin: katseluvaiheessa hyväksyntä saatiin ja yksi tilaus on jo oikein näkyvissä.
- Luettu palveluiden koodi/raportit, tehty vain lukevat julkinen tilannekuva- ja localhost-health-tarkistukset, haettu Gitin etätilanne. Avainarvoja tai yksityisiä kantapolkuja ei tulostettu.
- Ei uutta Worker-backend-koodia, riippuvuuksia, resursseja, tuotantokantojen siirtoa, julkaisuja, restartteja, kutsujen laajennuksia tai nykyisen MCP-osoitteen muutosta. Tämä on repo-dokumentin muutos, joten sovellustestien uusinta ei ole sille tarpeen.
- Seuraava riippuvuus on käyttäjän alustavalinta hosting-chatissa. Tämän raportin ja aiemman valmiin katseluvaiheen Git-kokoaminen tehdään yhteisen Git-vastaavan kautta; niitä ei ilmoiteta GitHubissa oleviksi ennen push-varmennusta.
