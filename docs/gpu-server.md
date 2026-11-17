# GPU-palvelin erilliselle Aimo-demolle

Tilanne ja julkiset hinnastot tarkistettu 17.11.2026. Tämä on käyttöönottoa varten valmisteltu suunnitelma, ei tilattu palvelin tai varmennettu GPU-ajo. Nykyistä WhatsApp-tuotantoa ja käynnissä olevaa live-demoa ei muuteta tällä työvaiheella.

Kustannukset suhteessa Anthropicin API:in ja tarvittava käyttömäärä: [gpu-api-costs.md](gpu-api-costs.md). Kevyessä käytössä API voi olla jatkuvaa GPU-vuokraa huomattavasti edullisempi.

## Suositus ensimmäiseen kokeeseen

Vuokrataan yksi 24 Gt:n NVIDIA-GPU muutamaksi tunniksi. Nykyiseen Docker Compose -pakettiin suoraviivainen vaihtoehto on **Scaleway L4-1-24G -virtuaalikone**: 1 × L4, 24 Gt näyttömuistia, 8 vCPU:ta ja 48 Gt RAMia. GPU-käyttöjärjestelmäkuvassa on NVIDIA-ajurit ja Docker-ympäristö valmiina. Levyksi varataan esimerkiksi 60 Gt pysyvää tilaa.

Ensimmäinen ajo tehdään nykyisellä `qwen3:8b`-mallilla, jotta GPU:n vaikutus voidaan mitata vaihtamatta samalla mallia. Seuraavaksi kokeillaan `qwen3:14b`-mallia erillisessä testi-istunnossa. Ollaman nykyinen 14B-versio on Q4_K_M, painot noin 9,3 Gt; 24 Gt on järkevä lähtökohta lyhyelle 4096–8192 tokenin kontekstille ja yhdelle samanaikaiselle pyynnölle. Todellinen muistinkulutus ja viive mitataan. 32B-mallille suunnittelisin mieluummin 48 Gt:n GPU:n kuin lupaisin sen toimivan hyvin 24 Gt:ssa.

GPU nopeuttaa laskentaa, mutta ei itsessään muuta saman mallin vastausten laatua. Suuremman mallin suomenkielinen tilauslaatu on arvioitava erikseen. Tavoitteena voidaan pitää esimerkiksi alle 10 sekunnin lämmintä mallivastausta yksinkertaisessa tilauksessa; tämä on hyväksyntätavoite, ei mitattu tulos tai lupaus.

## Kustannusvaihtoehdot

| Vaihtoehto | Julkisessa hinnastossa | Kuuden tunnin laskenta | Jatkuva käyttö |
|---|---:|---:|---:|
| Scaleway L4-1-24G, 24 Gt | noin 0,79 €/h | noin 4,74 € | hinnaston arvio noin 575 €/kk |
| Runpod RTX A5000, 24 Gt | 0,27 $/h | 1,62 $ | noin 197 $ / 730 h |
| Runpod RTX 4090, 24 Gt | 0,89 $/h | 5,34 $ | noin 650 $ / 730 h |

Laskentahintojen päälle tulevat mahdolliset verot, levy, IP-osoite ja muut palvelukohtaiset kulut. Runpodin hinta riippuu valitusta tarjonnasta, pilviluokasta ja saatavuudesta; taulukko ei ole tilaushetken tarjous. Valuutoille ei ole tehty kurssimuunnosta. Scaleway ilmoittaa hinnat ilman veroja. Kohtuullinen ensimmäinen ehdotus on **enintään kuusi tuntia, 10–15 euron kokonaisbudjettivaraus**, jonka tarkka toteuma tarkistetaan tilausnäkymästä ennen käynnistystä.

Runpod on laskennaltaan edullinen vaihtoehto. Sen GPU Pod on hallittu kontti, ja valmistajan ohjeen mukaan Docker Compose ei ole käytettävissä. Nykyistä kahden palvelun Composea ei siis luvata ajettavaksi suoraan siellä: tarvitaan erillinen yhden kontin demopaketti tai mallin ja agentin erilliset palvelut suojatulla yhteydellä. Scalewayn virtuaalikoneella nykyinen Compose-rakenne on suoraan sovellettavissa. H100/A100 tai monen GPU:n klusteri ei ole tämän kokeen lähtökohta.

GPU:n pitäminen käynnissä maksaa myös silloin, kun kukaan ei keskustele. Pelkkä Ollaman pysäyttäminen ei vapauta vuokrattua GPU-konetta laskutuksesta. Scalewayn dokumentoitu palveluntarjoajan power-off pysäyttää koneen laskutuksen, mutta säilytetyt levyt ja IP voivat maksaa edelleen. Runpodissa pysäytettyjenkin Podien tallennuksesta voi tulla kuluja. Budjettihälytys on ilmoitus, ei automaattinen kulukatto. Kokeen lopetus sovitaan ja toteutetaan palveluntarjoajan tasolla; säilytettävää demodataa ei poisteta laskun lopettamiseksi ilman erillistä päätöstä.

## Rakenne ilman kehittäjien koneita

Nykyinen yksityinen selain ja D1-jono → GPU-palvelimen `sites-runner.mjs` → samalla palvelimella ajettava Node-demo → Ollama GPU:lla. Kaikki mallin tarvitsemat prosessit siirretään uudelle palvelimelle. Pelkän Ollaman siirto jättäisi agentin riippuvaiseksi tästä väliaikaisesta työympäristöstä.

Selain ja pilvijono voivat jäädä nykyisille paikoilleen. WhatsApp-käyttö on erillinen myöhempi kytkentä: erillisen GPU-demon pystytys ei vielä vaihda Eeliksen nykyistä WhatsApp-tuotantoa käyttämään sitä. Uusi malli hyväksytään oikeilla tilauskokeilla ennen tällaista vaihtoa. GPU-demossa käytetään edelleen synteettisiä tuotteita ja tilauslähetys on estetty.

Anthropicin tai OpenAI:n mallia ei tarvita tähän polkuun. Maksettavaksi jää palvelimen vuokra ja mahdolliset muut palvelut; oma mallipalvelin ei ole ilmaista laskentaa. Ollaman pilvi-inferenssi pidetään pois käytöstä.

## Nykyisen paketin käyttöönotto uudella GPU-virtuaalikoneella

Valmistellaan palveluntarjoajan GPU-kiintiö, valittu alue ja käyttöjärjestelmäkuva, SSH-käyttöoikeus sekä sovittu kuluraja. GPU-virtuaalikoneessa tarvitaan Docker Compose vähintään 2.30 (`gpus`-kenttä) sekä NVIDIA Container Toolkit. Ensimmäinen tarkistus on `nvidia-smi` isäntäkoneessa. NVIDIA-ajurien asennusta tai Dockerin uudelleenkäynnistystä ei tehdä tämän ohjeen perusteella käyttäjän nykyisellä tuotantokoneella.

Repo on kloonattu uudelle koneelle ja komennot ajetaan sen juuresta. Vain tämän erillisen demon yksityisessä `deploy/selfhost-demo/.env`-tiedostossa asetetaan aluksi `DEMO_MODEL=qwen3:8b` ja `DEMO_CONTEXT_TOKENS=4096`. Muu esimerkkiasetus tulee saman hakemiston `.env.example`-tiedostosta; tuotannon `.env`-tiedostoa ei kopioida.

```bash
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml config --quiet
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml up -d model
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml exec model nvidia-smi
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml exec -e OLLAMA_HOST=http://127.0.0.1:11434 model ollama pull qwen3:8b
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml build demo
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml -f deploy/selfhost-demo/compose.gpu.yaml up -d demo
```

Ollaman porttia 11434 ei julkaista internetiin. Demopalvelimen portti 4765 pysyy isäntäkoneen localhostissa. Isäntäkoneen runner voi käyttää sitä ja tehdä ulospäin HTTPS-yhteyden Sitesiin; Node.js 24 tarvitaan myös isäntäkoneelle. Sites-palvelupääsy ja runner-salaisuus annetaan runnerille suojatusta salaisuushallinnasta sen piilotettuun stdin-syötteeseen, ei Gitissä tai komentoriviargumenteissa. Älä lähetä tunnuksia keskusteluun.

Pysyvässä käytössä tarvitaan lisäksi koneen käynnistyksessä käynnistyvät palvelut, runnerin prosessivalvonta ja salaisuuksien toimitus käynnistyksen yhteydessä. Nykyinen Compose ei yksin sisällä runneria eikä näitä kaikkia valvonta-asetuksia. Sitä ei tämän suunnitelman perusteella ilmoiteta valmiiksi 24/7-palveluksi.

## Demokorin säilyttäminen ja siirtyminen

1. GPU-malli ja uusi demo tarkistetaan ensin uusilla synteettisillä testi-istunnoilla. Live-sivun runneria ei vielä siirretä.
2. Katkaisuvaiheessa vanha runner lopettaa uusien töiden ottamisen, nykyinen työ odotetaan loppuun ja paikallinen demosovellus suljetaan hallitusti. Vain demon merkitty tilahakemisto varmuuskopioidaan ja siirretään; aktiivista SQLite-kantaa ei kopioida irrallaan sen WAL-tiedostosta. Käytä suljettua kantaa tai SQLite-varmistusta ja tarkista rivimäärät/tiivisteet.
3. `.running` on vanhan koneen prosessilukko: sen puuttuminen tai vanhentuminen tarkistetaan ennen uuden sovelluksen käynnistystä. Käyttäjän luonnoksia tai nykyisen WhatsAppin kantoja ei nollata.
4. Runnerille tarvitaan myös olemassa olevat `sessionAliases`-määritykset: tämän live-demon tunnus on aiemmin vaihdettu. Sama nykyinen runner-token ei yksin palauta sitä vanhemmilla tunnuksilla aloitettuja koreja. Alias muodostetaan tarkasta Sites-työn id:n ja paikallisen `turn_results.message_id`:n vastaavuudesta, ei käyttäjien rivijärjestyksestä.
5. Vain yksi tuotantodemojonoa käsittelevä runner käynnistetään kerrallaan. Uusi heartbeat, erillisen testi-istunnon viesti ja oikean käyttäjän korin säilyminen varmennetaan ennen vanhan palvelimen lopullista sulkemista. Vanha tila säilytetään palautusta varten.

## Hyväksyntä ennen pidempää vuokrausta

- Oikean mallipyynnön jälkeen `ollama ps` näyttää `100% GPU`; pelkkä HTTP 200 tai toimiva `nvidia-smi` ei osoita, että malli käyttää GPU:ta. `docker compose … exec -e OLLAMA_HOST=http://127.0.0.1:11434 model ollama ps` suoritetaan samoilla kahdella Compose-tiedostolla.
- Uusi tilaus, tuotevalinta, määränmuutos, poisto, allergian säilyminen, yksiköt, epäselvä tuote ja malli-/verkkokatko tarkistetaan eristetyssä tilassa. Mallia mitataan uusilla tilausviesteillä tai erillisellä `DEMO_FAST_EDITS=false`-ajolla; 3 sekunnin sääntömuutos ei osoita GPU-nopeutta.
- Ajat kirjataan erikseen kylmälle ja lämpimälle pyynnölle, mallille, kontekstille ja yhtäaikaisille käyttäjille. Tavoitteesta ei tehdä tulosta ennen mittausta.
- Vasta tämän jälkeen siirretään live-demo ja testataan käyttö kehittäjien koneiden ollessa suljettuina. Varsinaiseen WhatsAppiin kytkeminen tehdään erillisenä työvaiheena.

## Lähteet

- [Scaleway GPU-hinnasto](https://www.scaleway.com/en/pricing/gpu/) ja [GPU-koneen luonti](https://www.scaleway.com/en/docs/gpu/how-to/create-manage-gpu-instance/).
- [Scaleway laskutuksen elinkaari](https://www.scaleway.com/en/docs/instances/reference-content/understanding-instance-pricing/).
- [Runpod-hinnasto](https://www.runpod.io/pricing), [kontti-/Compose-rajaus](https://www.runpod.io/articles/guides/run-openclaw-on-runpod-with-docker-and-local-llms) ja [pysäytettyjen palveluiden tallennuskulut](https://contact.runpod.io/hc/en-us/articles/57370686866707-Why-You-re-Still-Being-Charged-After-Stopping-Pods-and-Services).
- [Ollama Docker/GPU](https://docs.ollama.com/docker), [GPU-käytön tarkistus](https://docs.ollama.com/faq) ja [Qwen3 14B:n painot](https://ollama.com/library/qwen3:14b).
- [Docker Compose GPU-tuki](https://docs.docker.com/compose/how-tos/gpu-support/) ja [gpus-kentän versioraja](https://docs.docker.com/reference/compose-file/services/#gpus).
