# Hosting Eeliksen Cloudflare-tilille ja tiimin kehitysoikeudet, 14.11.2026

## Käyttäjän päätös

Käyttäjä haluaa projektin hostingit hallitsemaansa **aimo-ai-Cloudflare-accountiin**, jotta palvelut eivät riipu Danielin tai Eeliksen läppäristä. Siirtotyö jaetaan nykyisille toteuttajille. Käyttäjä tarkensi, ettei nykyistä Danielin `trycloudflare`-palvelimen kautta tehtävää yhteistyötä saa rikkoa.

**Uudempi tarkennus:** koko taustan alustaa ei ole vielä valittu. Alkuperäinen Workers-siirtosuunnitelma on ehdollinen; käyttäjä pyysi sen jälkeen hosting-vaihtoehtojen vertailun. Katso jäljempää alustavalinnan avoin tila.

Käyttäjä antoi Danielin, Aleksin ja Peetun kutsuosoitteet ja hyväksyi erillisellä vastauksella täsmälleen näille kolmelle **Workers Editor** -kutsut vain aimo-ai-accountiin. Hän hyväksyi myös niiden tekemisen Cloudflaren selaimen hallintasivulla liittimen teknisen oikeusrajan tultua vastaan. Sähköpostiosoitteita ei kopioida Git-raporttiin tai projektiviesteihin.

## Varmennettu nykytila

- Cloudflare-yhteyden käyttäjä on Eelis. `GET /accounts` ja `/memberships` varmensivat accountin `aimo-ai` (`41cfacacd7c70bbcf80372ab540dd974`) ja roolin **Super Administrator - All Privileges**. Ennen kutsuja jäsenlistalla oli vain Eelis.
- Projektin valmiiksi kirjautuneen `cf`-CLI:n `workers list` varmisti yhden Workerin: **aimo-order-demo**, osoite <https://aimo-order-demo.aimo-demo-41cfac.workers.dev/>. Etusivu ja `GET /api/orders` palauttivat HTTP 200; tarkistushetkellä tilauksia oli 0. Tämä on erillinen vain lukeva tilausnäkymä, ei koko WhatsApp-, verkkokauppa- tai MCP-tausta.
- Yhteisen MCP:n <https://bench-butter-save-marsh.trycloudflare.com/healthz> palautti HTTP 200, `aimo-team-mcp`. Nykyinen yhteinen yhteistyöpalvelin ja kanta toimivat edelleen Danielin koneen tunnelin kautta. Cloudflare-tilin hallintarooli ei itsessään siirrä tuota palvelinta tai kantaa.
- Nykyiset palvelut käyttävät Node-palvelimia, tiedostopohjaista `node:sqlite`/`DatabaseSync`-tilaa ja pitkäikäisiä prosessisilmukoita. Varsinainen Workers-siirto tarvitsee pysyvän tietokantasovituksen ja taustatyön elinkaaren sovittamisen. D1 ja SQLite-backed Durable Objects ovat arvioitavat tallennuskohteet; tässä työssä ei tehty runtime-porttausta tai valittu lopullista kantaa.

## Tiimikutsut toteutettu

- Cloudflaren Members-sivulla lisättiin käyttäjän hyväksymät kolme osoitetta ja **ainoastaan Workers Editor** account-scopeen `aimo-ai`. Näkyvä yhteenveto varmennettiin ennen lähetystä: `SCOPE aimo-ai`, `APPLIES TO Entire account`, `ROLES Workers Editor`.
- Hallintasivu kuittasi **Successfully invited 3 members**. Tämän jälkeen jäsenet luettiin erikseen takaisin Cloudflare API:sta: Daniel, Aleksi ja Peetu kaikki **pending**, kullakin vain `Workers Editor`. Eeliksen `accepted`/Super Administrator -rooli säilyi ennallaan.
- Hyväksytty rooli sallii accountin Workerien koodin lukemisen, muuttamisen ja julkaisemisen. Se ei salli Workerien luontia/poistoa, jäsenhallintaa tai laskutusta. Tiimille ei lisätty D1 Admin-, Developer Platform Admin- tai muita laajempia rooleja. Uusien resurssien perustaminen jää omistajalle, ellei erikseen sovita lisää oikeuksia.
- Alkuperäinen kutsuyritys pysähtyi automaattiseen hyväksyntätarkistukseen. Täsmällisen käyttäjähyväksynnän jälkeen MCP-liittimen API-kutsu palautti 403, koska yhteydeltä puuttui Account Settings Write. Myös selainreitti vaati ympäristöltä erillisen hyväksynnän, jonka käyttäjä antoi. Varsinaiset kutsut tehtiin vasta näiden hyväksyntöjen jälkeen, ilman oikeusrajan kiertämistä tai salaisuuksien lukemista.
- Kuvallinen varmennus säilyy tämän chatin paikallisessa visualisointihakemistossa, ei Gitissä. Kutsujen vastaanottamista ei vielä väitetä tapahtuneeksi.

## Siirron järjestys ja työpaketit

1. **MCP ja koordinaattori / Danielin nykyinen omistaja:** Workers-toteutuspohja, pysyvä tallennus, OAuth ja nykyisen kannan siirtomenettely. Työ ei ole pelkkä URL-muutos. Säilytetään jäsenet, työkalut, viestit, työvaraukset, revisiot ja oikeusrajat. Pitkäikäisen jonotyön ajaminen suunnitellaan Workersin tapahtumien/hälytysten malliin.
2. **Cloudflare-toteutuschat:** Eeliksen accountin Worker-resurssien ja julkaisujen koordinointi, nykyinen katselusivu sekä myöhemmän verkkokauppa-/WhatsApp-taustan erillinen pilvivaihe. Aiempi vain luku -julkaisurajaus ja siihen liittyvät avoimet tietojen julkaisuun tarvittavat hyväksynnät säilyvät nykyvaiheessa.
3. **Integraatiochat:** sovitun handoff→gateway-testin jälkeen verkkokaupan/tilaus-API:n Workers-sovitus ja paikallisten levy-SQLite-kantojen korvaaminen pysyvällä pilvitallennuksella yhdessä julkaisuchatin kanssa. Nykyistä vain localhostiin rajattua demo-API:a ei avata julkiseksi sellaisenaan.
4. **Nykyinen WhatsApp-käyttöönoton omistaja:** webhookin ja yksityisten Worker-secrets-asetusten siirtovalmius sekä myöhempi testiviestiketju ja hallittu vaihto. Nykyiset Meta- ja palvelinasetukset pysyvät hänen hallinnassaan.

Kuittaukset, tarkat tiedostot ja toteutusvalinnat pyydetään omistajilta ennen päällekkäisiä muutoksia. Nykyisiä tehtäviä tai varauksia ei siirretty väkisin. Hosting-työpaketit toimitettiin yhteisen MCP:n broadcastissa **#55**, Danielille erikseen **#56**, ja tavoite lisättiin yhteenvetoon **revisio 2**. Viestit luettiin takaisin. Paikalliset toteutuschatit saavat saman käyttäjäpäätöksen sekä kutsujen varmennetun tilan.

## Yksi yhteinen yhteistyöpalvelin siirron ajan

- Kaikki käyttävät nykyistä Danielin `/mcp`-osoitetta valmistelun ajan. Eristetty pilvitestiversio ei korvaa nykyistä yhteistä taulua.
- Ennen vaihtoa tehdään yksityinen varmistus ja suunniteltu loppusiirto nykyisestä pysyvästä tilasta. Kahdesta kirjoitettavasta yhteisestä kannasta ei tehdä rinnakkaisia totuuksia.
- Uudesta palvelusta varmennetaan tunnisteet, projektit, nykyiset viestit/tehtävät, käyttöoikeudet ja uusintojen käsittely. OAuthin issuer/resource-osoitteen vaihtuessa liittimet yhdistetään uuteen osoitteeseen.
- Yhteinen osoitteen vaihto tehdään vasta testatun siirron jälkeen; vanhaa tunnelia ei suljeta valmistelun vuoksi. Pelkkä Worker-proxy läppärille ei täytä koneista riippumattomuuden tavoitetta.
- Malli-/Meta-/muut avaimet jäävät yksityisiin asetuksiin, eivät GitHubiin tai projektiviesteihin. Tämän pyynnön perusteella ei oteta maksullista tilausta.

## Tarkistukset ja jatko

### Käyttäjän uudempi tarkennus: backendin alustavalinta arvioitavana

Edellä kuvatun tiedotuksen jälkeen käyttäjä kysyi, onko Workers nykyiselle sovellukselle ja agentille paras vaihtoehto, ja pyysi vertaamaan parempia hosting-vaihtoehtoja. Hosting-chat vertaa nykyisen Node-, tiedosto-SQLite- ja jatkuvan koordinaattoriprosessin tarpeita Workersiin, Renderin pysyvään levyyn ja tavalliseen pilvipalvelimeen. Tämä raportti ei valitse niistä voittajaa.

- **Uutta koko taustan Workers-porttausta tai kantojen siirtoa ei aloiteta edellisen työnjakotiedotteen perusteella ennen vertailua ja käyttäjän alustavalintaa.** Yllä olevat siirtopaketit ovat ehdollinen valmistelusuunnitelma, eivät lopullinen arkkitehtuuri- tai käyttöönottohyväksyntä.
- Omistustavoite säilyy: hosting Eeliksen/tiimin hallintaan ja palvelut pois läppäririippuvuudesta. Cloudflare-tilin omistus ja jo lähetetyt Workers Editor -kutsut ovat varmennettuja toimia; kutsujen hyväksyminen ei itsessään valitse backendin alustaa.
- Nykyinen sovittu vain luku -katselusivu, token-korjaus, API-varmennukset ja muut käynnissä olevat vaiheet voivat jatkua aiemmin sovituilla rajauksilla. Niitä ei niputeta koko taustan uuden porttauksen alle.
- Danielin nykyinen yhteinen MCP-tunneli ja sen pysyvä kanta säilyvät käytössä. Uutta kirjoitettavaa yhteistä kantaa tai osoitevaihtoa ei tehdä tämän raportin perusteella.

Hosting-chat varmisti tarkennuksen tiedotuksen yhteisen MCP:n takaisinluetussa broadcastissa **#68** ja projektin yhteenvedossa **revisio 3** sekä neljän kohdechatin onnistuneissa lähetyskuittauksissa. Uutta erillistä migraation kooditehtävää ei syntynyt tai luovutettu. Samassa yhteisen taulun lukuvaiheessa `TYOLOKI.md`:llä ei ollut aktiivista resurssivarausta, ja raporttitehtävän `af7fedcd` varaus vapautettiin Git-kokoamista varten.

Katselusivun aiempi 0 tilauksen havainto koskee yllä kuvattua tarkistushetkeä. Cloudflare-julkaisuchat raportoi myöhemmin omassa erikseen hyväksytyssä vaiheessaan yhden `confirmed`-demotilauksen (74,10 €, yksi rivi) sekä julkisten kenttien ja `ledgerHead`:n vastaavuuden lähteeseen. Tämän erillisen julkaisuvaiheen varmennus ja lähteet ovat `docs/parallel/cloudflare-setup.md`:ssä; omistajuusraportin kokoaja ei uusinut julkaisua tai ulkoisia kirjoituksia.

Tässä työssä varmennettiin account/omistajuus, nykyinen Worker ja julkinen HTTP, nykyinen MCP sekä kutsujen vastaanottajat, tilat ja todelliset roolit. Sovelluskoodia ei muutettu, kantoja ei siirretty eikä palvelimia, tunneleita tai webhook-osoitteita vaihdettu. Hosting-siirtoa tai tiimin kutsujen hyväksymistä ei merkitä valmiiksi ennen erillistä varmennusta.

Git-vastaava kokoaa tämän valmiin raportin ja käyttäjäpäätöksen `TYOLOKI.md`:hen rajattuun commitiin/pushiin. Raportin paikallinen varaus `5a6b828d`, yhteisen MCP:n raporttitehtävä `af7fedcd-107b-4dd5-b17e-31e807de78e1`. Nykyiseen muiden Git-työvaiheeseen tai Cloudflare-julkaisun lähteisiin ei kirjoitettu.

Viralliset lähteet: [MCP Workersissa](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/), [Workers-roolit ja rajaukset](https://developers.cloudflare.com/workers/authorization/), [Workersin väliaikainen tiedostojärjestelmä](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), [D1 ja Durable Objects -tallennus](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).
