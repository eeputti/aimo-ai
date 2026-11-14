# Tilaus-API:n hostingvaatimukset ja avoin alustavalinta

## Käyttäjän päätösten järjestys, 14.11.2026

1. Hosting-yhteyschatissa käyttäjä pyysi palvelut hallitsemaansa aimo-ai-Cloudflare-accountiin, pois läppäririippuvuudesta. Työpaketit toimitettiin yhteisen MCP:n viestissä #55 ja koonti on `docs/parallel/cloudflare-hosting-ownership.md`:ssä.
2. Sen jälkeen käyttäjä kysyi, onko Workers paras nykyisen sovelluksen ja agentin hostaamiseen, ja pyysi parempien vaihtoehtojen vertailua. Hosting-yhteyschat vertailee nykyisen Node/SQLite-pinon palvelinhostingia Workersiin. **Koko taustan alustaa ei ole vielä valittu. Uutta Workers-porttausta tai kantojen siirtoa ei aloiteta ennen valintaa.**
3. Omistustavoite säilyy: Eeliksen/tiimin hallinta ja palvelujen toiminta läppärien ollessa kiinni. Nykyinen Danielin MCP-tunneli ja sen yhteinen kanta säilyvät käytössä testattuun siirtoon asti. Cloudflaren kehittäjäkutsut tai nykyinen katselusivu eivät itsessään ratkaise backendin alustaa.

Tämän raportin omistaa integraatiochat: yhteinen tehtävä `69279bef-8fe7-424a-b24a-4532ad519be7`, paikallinen `f2751816`. Ainoa tämän vaiheen tiedosto on tämä raportti. Hosting-omistajuuden alkuperäistä raporttia, palvelinasetuksia tai sovelluslähteitä ei muokata.

## Nykyinen toimiva vertailukohta

Danielin siirtorajapinta on julkaistu commiteissa `4d57190` ja `48c4139`. Riippumaton oikean gatewayn varmennus on GitHubissa `c63435d337474f011ed1638e876521b56ec4286d`: **191/191 testiä läpi**, ei ohituksia. Tämä on olemassa olevan Node-toteutuksen tulos; sitä ei ole ajettu Workersissa tai uudessa palvelinhostingissa.

- `GET /api/assistant/whatsapp-list` ja `POST /api/assistant/whatsapp-list/chat` jatkavat samaa pysyvää WhatsApp-luonnosta.
- Tuotevalinnat ja tarjous edeltävät erillistä TILAA-vahvistusta. Gateway tekee demositoumuksen kerran. Testi varmensi myös yrityksen hyväksynnän, saman tilauksen REST-/kauppatakaisinluvun ja ehjän audit-lokin.
- Nykyinen kauppa ja WhatsApp käyttävät samaa palvelinprosessia, gateway-yhteyttä ja allekirjoittajaa. Uusi hosting ei saa luoda toista rinnakkaista kirjoittajaa samalle tilauskannalle.

## Pysyvä tila, joka nykyisessä tilaustilassa on säilytettävä

Tiedostojen todelliset polut tulevat yksityisistä ympäristöasetuksista. Alla ovat asetusten nimet ja lähdekoodista tarkistetut tietokokonaisuudet, eivät nykyisten käyttäjäkantojen sisällöt.

| Asetus | Tila ja tarkoitus | Sovituksen vaatimus |
|---|---|---|
| `WHATSAPP_DB` | `members`, `invites`, `inbox`, `turns`, `reply_parts`, keskustelun `wa_dialogue` ja `wa_dialogue_results` | Asiakassidos/versio, webhookin deduplikointi, jonon uusinta, jo lähetetyt vastausosat ja nollauksen keskustelujakso säilyvät restartin yli. |
| `WHATSAPP_DRAFT_DB` | `drafts`, `turn_results` | Aktiivinen lista, valinnat, revisio ja viestikohtainen tulos tallennetaan atomisesti. |
| `WHATSAPP_QUOTE_DB` | `tool_quotes` | Asiakas-, sidos-, sisältö- ja revisiosidottu tarjous, vanheneminen ja käytetyn tarjouksen idempotenssi/tulos säilyvät. |
| `GATEWAY_DB` | `buyers`, `quotes`, `orders`, `ledger` | Ostajan valtuus, tilausnumerot, ostajakohtainen idempotenssi ja audit-ketjun pää muodostavat saman tilausauktoriteetin. |
| `AIMO_DB` | Hinta-/saatavuusvälimuisti ja muun sovelluksen keittiötila sen käyttötavasta riippuen | WhatsAppin erillinen kanta pysyy erillään päädemon kannasta. Välimuistin vanhentuneisuus säilyy eroteltuna varmennetusta hinnasta. Koko sovelluksen siirrossa mahdolliset keittiötiedot selvitetään erikseen. |
| `GATEWAY_PRIVATE_KEY_PEM` tai nykyinen yksityinen avaintiedosto | Ed25519-tarjousten allekirjoitus | Sama avain säilyy restartissa; automaattinen uuden avaimen generointi tyhjään levyyn ei ole hallittu migraatio. Vanhojen tarjousten allekirjoitus on voitava tarkistaa. |
| Paikallinen katalogi ja pakkaustiedot | Haku, tuotetunnisteet, allergeenit ja määrien muunnokset | Hallittu yksityinen aineistopolku. Rajoitettua challenge-aineistoa ei lisätä Gitiin tai julkisen katselusivun assetteihin. |

Lähteet koodissa: `server/whatsapp/store.mjs`, `server/whatsapp/dialogue.mjs`, `server/order-conversation/store.mjs`, `server/order-tools/index.mjs`, `server/gateway/store.mjs`, `server/gateway/signing.mjs`, `server/db.mjs` ja `server/catalog.mjs`.

## Ajovaatimukset

- Nykyinen paketti edellyttää Node.js-versiota vähintään 22.13 ja käyttää `node:sqlite` / `DatabaseSync` -rajapintaa synkronisesti. Pelkkä SQL-skeeman kopio ei muuta kutsurajapintaa.
- WhatsApp kuittaa webhookin vasta pysyvän jonotallennuksen jälkeen. Varsinainen tulkinta ja lähetys ovat erillistä työtä. `channel.start()` palauttaa keskeytyneet työt, käsittelee jonoa 500 ms:n välein ja säilyttää yritys-/osaviestitiedot. Hosting ei voi perustaa jatkokäsittelyä siihen, että käyttäjä avaa seuraavan sivun.
- Yhden asiakkaan WhatsApp- ja verkkokauppavuorot sarjoitetaan muistissa samalla prosessilla. Nykyisellä toteutuksella instansseja ei lisätä vaakasuunnassa ilman erillistä lukitus-/jonosuunnitelmaa. Käyttöönoton pitää estää vanhan ja uuden workerin yhtäaikainen työ samalle kannalle.
- Palvelimen hallittu pysäytys odottaa aktiivista kanavatyötä. Uudelleenkäynnistyksen jälkeen säilyneen vastauksen lähetysuusinta ei saa tehdä uutta mallikutsua tai tilausta.
- Kuunteluportti tulee hostingin asetuksista. Standalone-palvelin käyttää `WHATSAPP_PORT || PORT`; nykyistä konekohtaista porttiohitusta ei kopioida uuden palveluntarjoajan määräämän portin päälle tarkistamatta sitä.
- Team MCP / koordinaattori on oma palvelunsa ja oma pysyvä tilansa. Sen jatkuva silmukka, vuokrat, OAuth ja jäsenet kuuluvat Danielin omistamaan siirtosuunnitelmaan. Tässä ei perusteta toista yhteistä taulua.

## Varmennetut Workers-yhteensopivuushuomiot, eivät alustapäätös

- Workersin `node:fs` on virtuaalinen tiedostojärjestelmä: bundle on vain luku -tilassa ja `/tmp` on pyyntökohtainen eikä pysyvä. Nykyisten `.db`-tiedostojen sijoittaminen sinne ei toteuta pysyvää tilaa. [Cloudflaren fs-dokumentaatio](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).
- D1:n prepared-statement-metodit suoritetaan asynkronisesti. Nykyisen synkronisen `prepare().get()/all()/run()`-ketjun korvaus D1:llä vaatii tallennuskutsujen ja transaktiorajojen sovituksen. Tämä on lähdekoodin ja API-dokumentaation perusteella tehty yhteensopivuusarvio, ei tehty porttaus. [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
- SQLite-backed Durable Object tarjoaa synkronisen SQL-rajapinnan ja `transactionSync`-transaktiot. Sen SQL-kutsussa ei käytetä nykyisiä `BEGIN IMMEDIATE` / `COMMIT` -lauseita sellaisenaan. Yhden gatewayn DO oli alustava sovitusehdotus; sitä ei hyväksytty lopulliseksi arkkitehtuuriksi eikä toteutettu. [DO SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
- DO-alarmit ovat vähintään kerran suoritettavia. Jos sellaiset joskus korvaavat nykyisen polling-silmukan, nykyiset pysyvät viesti-/tilausavaimet ja osaviestien tulokset on säilytettävä myös alarm-uusinnassa. [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

Renderin, virtuaalipalvelimen ja Workersin hinnoittelua tai lopullista sopivuutta ei ratkaista tässä raportissa. Alustavertailu on hosting-yhteyschatin nykyinen tehtävä.

## Pilven autentikoitu raja ja tietojen näkyvyys

Nykyinen localhost-API on palvelinkoneen ylläpitäjän demo: siinä voi valita aktiivisen testiasiakkaan. Se ei ole tuotannon asiakkaan kirjautuminen. Cloudflaren kehittäjärooli ei anna sovelluksen käyttäjälle asiakkuutta tai tilausvaltuutta.

Uudessa pilviversiossa palvelin ratkaisee asiakkaan, henkilön oikeuden, toimituspaikan ja sidoksen voimassaolon varmennetusta identiteetistä. Selaimen `buyerId` ei yksin anna pääsyä toisen listaan. Sama origin/CSRF-suojaus ja nykyiset määrä-, tarjous-, hyväksyntä- ja revisiontarkistukset säilyvät. Tarvittava todellinen Valio-tunnistus- ja tilausrajapinta on yhä erillinen avoin integraatio; sitä ei keksitä hosting-siirron yhteydessä.

Nykyinen `aimo-order-demo` on vain julkaistujen sallittujen kenttien katselusivu. Sen D1-tilannekuva tai läppäriltä ajettava publisher ei ole alkuperäinen tilauskanta eikä korvaa taustapalvelimen migraatiota. Sen nykyinen rajaus ja tietojen julkaisuhyväksynnät säilyvät.

## Omistajat ja konkreettinen seuraava vaihe

| Osuus | Nykyinen omistaja | Seuraava asia |
|---|---|---|
| Alustavertailu ja käyttäjän valinta | Hosting-/MCP-yhteyschat | Vertaa nykyisen Node/SQLite-pinon ajamista palvelinhostingissa Workers-sovituksen muutostarpeeseen ja vie valinta käyttäjälle. |
| Nykyinen Cloudflare-katselusivu ja accountin julkaisut | Cloudflare-toteutuschat | Viimeistelee nykyisen hyväksytyn katseluvaiheen. Vahvistaa, että backend-porttaus odottaa alustavalintaa. |
| Tilaus-API:n rajat ja riippumaton hyväksymiskoe | Integraatiochat | Tämä nykytilakartta ja julkaistu `c63435d`-koe uuden alustan hyväksymisehdoksi. Ei uutta alustakoodia ennen valintaa ja tiedostorajausta. |
| MCP/koordinaattorin oma tausta ja pysyvä tila | Danielin nykyinen toteuttaja | Sama yksi yhteinen taulu, eristetty testiversio ja hallittu migraatio valitulla alustalla. |
| Meta-token, webhook-asetukset ja nykyinen restart | Käyttöönoton omistavat chatit | Nykyinen korjaus aiemmalla rajauksella; myöhempi pilviosoitevaihto vasta testatun taustan jälkeen. |

Julkaisuchatille lähetettiin ensin rajauksen sopimispyyntö ja heti käyttäjän uuden tarkennuksen jälkeen korvaava ohje: uutta `deploy/order-api-workers/`-vaihetta ei aloiteta. Sinne ei kirjoitettu tiedostoja. **Julkaisuchatti kuittasi tämän rajan:** ei tausta-Workerin pohjaa, SQL-sovitinta tai tietosiirtoa ennen alustavalintaa. Sen oma uusi osuus on vain `docs/parallel/cloudflare-backend-plan.md`, joka kokoaa palveluinventaarion, omistajat ja hyväksymiskriteerit. Nykyinen `deploy/cloudflare/` ja `docs/cloudflare.md` säilyvät sen valmiissa katseluvaiheessa; varsinainen koodirajaus sovitaan vasta alustavalinnan jälkeen.

Alustavalinnan jälkeen ensimmäinen toteutusvaihe on **erillinen testiasennus synteettisellä asiakkaalla, katalogilla ja omalla pysyvällä tilalla**. Siitä varmistetaan sama HTTP-handoff → tarjous → TILAA → yksi tilaus → audit -ketju sekä kylmäkäynnistyksen jälkeinen luonnoksen, sidoksen, tarjouksen allekirjoituksen ja saman idempotenssiavaimen säilyminen. Vasta sen jälkeen valmistellaan nykyisten tietojen siirto, yksi kirjoittaja ja hallittu osoitteen vaihto. Nykyisiä käyttäjäkantoja ei käytetä tällaisen ensimmäisen testin fixtures-aineistona.

## Tämän vaiheen tarkistukset ja rajat

Koodin lukukartoitus ja yllä linkitetyt viralliset Cloudflare-lähteet tarkistettu 14.11.2026. Muutos on vain raportti; aiempaa 191 testin tulosta ei esitetä uuden hostingin testinä, eikä testisarjaa ajeta uudelleen pelkkää tekstiä varten. Ei uusia riippuvuuksia, Worker-/D1-/DO-resursseja, maksullista tilausta, avainmuutoksia, deploymentia, kantojen kopiointia tai siirtoa, toista MCP-palvelinta tai nykyisten palvelimien restarttia. Muiden keskeneräiset tiedostot säilyvät niiden omistajilla.

Git-vastaavalta pyydetään tämän valmiin raportin ja uuden alustavalintatarkennuksen kokoamista omaan loki-/commit-/push-vaiheeseen. Ennen push-kuittausta raportti on paikallinen.
