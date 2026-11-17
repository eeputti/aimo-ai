# Aimon erillinen demo suuremmalle avoimelle mallille

Tämä on nykyisen palvelun rinnalla ajettava **selainkokeilu**. Käynnistys ei lue projektin nykyisiä `.env`-tiedostoja eikä käynnistä WhatsApp-palvelinta. Oletusmalli on `qwen3:14b`; voit valita esimerkiksi `qwen3:8b`- tai `qwen3:32b`-mallin oman palvelimen kapasiteetin mukaan. Mallin koosta ei päätellä laatua: jokainen versio pitää testata.

Demo käyttää nykyistä `createOrderingConversation`-moottoria ja `createModelInterpreter`-tulkkia kirjastona muuttamatta niiden lähdekoodia. Käyttöliittymä, asetukset, käynnistin, tallennus ja tuotetyökalut ovat tässä omassa hakemistossaan. Demo testaa tekstistä ostoslistaan, määränmuutoksiin ja tuotteen poistamiseen kulkevaa polkua. Tuotannon muu vapaa neuvontakeskustelu, reseptilinkit, puhelut, kuvat, ääniviestit ja Metan toimitus eivät kuulu tähän ensimmäiseen kokeiluversioon.

Tuotevalikoimassa on seitsemän kuvitteellista tuotetta: tavallinen/laktoositon maito, laktoositon kerma, voi, kananmunat, peruna ja kaurajuoma. Pakkauskoot, hinnat ja allergeenit ovat synteettisiä testitietoja. Esimerkiksi maito myydään kuuden litran erissä. Ostoslista näyttää pyydetyn määrän; tuotevaihtoehto kertoo myyntipakkausten määrän. Näitä tietoja ei esitetä Valion ajantasaisina tuotetietoina. Tilausten lähetys on estetty sekä ostajan oikeuksissa että demon työkalussa.

## Kokeilu koneella, jolla Ollama on jo käynnissä

Node.js 22.13 tai uudempi ja repon lukitut npm-riippuvuudet tarvitaan. Älä lataa mallia tavalliseen Vercel-funktioon: mallille tarvitaan erillinen CPU-/GPU-palvelin.

```bash
npm ci
ollama pull qwen3:14b
DEMO_MODEL=qwen3:14b DEMO_OLLAMA_URL=http://127.0.0.1:11434 node deploy/selfhost-demo/start.mjs
```

Avaa **http://localhost:4765/**. Mallin lataaminen on erillinen valmisteluvaihe; käyttöliittymän tila näyttää, löytyykö valittu malli. Ensimmäinen viesti lataa mallin muistiin ja voi kestää tavallista kauemmin. Vaihtoehtoisesti kopioi tämän hakemiston `.env.example` tiedostoksi `.env`, täytä vain demon asetukset ja aja:

```bash
node --env-file=deploy/selfhost-demo/.env deploy/selfhost-demo/start.mjs
```

Esimerkkipolku:

1. Lähetä **20 litraa laktoositonta maitoa perjantaiksi. Ei muita ruokavaliorajoituksia.**
2. Valitse tuote vastaamalla vaihtoehdon numerolla, yleensä **1**. Vastaa mahdollisiin tarkennuksiin.
3. Lähetä **Muuta maidon määrä 30 litraan.** Ostoslistassa pitää olla yksi maitorivi, määrä 30 l ja sama laktoosittomuusrajaus.
4. Lähetä **Poista maito.** Maidon pitää poistua.
5. **Aloita alusta** aloittaa uuden luonnoksen vain tässä selainistunnossa.

Jos lähetät viestin **TILAA**, demossa ei synny oikeaa tai gatewayn demotilausta. Nykyisen palvelun istuntoja tai numeroasiakkuuksia ei lueta.

## Oma pilvipalvelin Dockerilla

Oma Compose-projekti on `aimo-selfhost-demo`. Omat levyt ovat `demo-state` ja `demo-models`. Niiden nimet eivät viittaa WhatsApp-tuotannon levyihin. Oletusportti on 4765, ei nykyisen kaupan tai botin portti.

```bash
cp deploy/selfhost-demo/.env.example deploy/selfhost-demo/.env
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml config --quiet
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml up -d model
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml exec -e OLLAMA_HOST=http://127.0.0.1:11434 model ollama pull qwen3:14b
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml build demo
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml up -d demo
```

NVIDIA-palvelimella, jolla NVIDIA Container Toolkit toimii, lisää **jokaiseen** Compose-komentoon myös `-f deploy/selfhost-demo/compose.gpu.yaml`. Malli käyttää silloin sille annettua GPU:ta. Tämän ympäristön CPU-koe ei varmenna NVIDIA-ajureita tai GPU-ajoa.

14B-mallin Q4-painot ovat noin 9,3 GB. Alustavaksi palvelimeksi kannattaa varata esimerkiksi 32 GB RAMia ja 16–24 GB VRAMia, mutta tarvittava kapasiteetti ja nopeus mitataan valitulla kontekstilla ja rinnakkaisuudella. 32B vaatii enemmän. CPU-ajo on mahdollinen mutta voi ylittää keskustelun käytännöllisen vastausajan. Käytä omaa palvelinta, jos haluat kokeen toimivan ilman kehittäjien tietokoneita.

Demon HTTP-portti on vain palvelimen localhostissa ja mallin porttia ei julkaista ulos. Omalle koneellesi saat palvelimella ajettavan demon SSH-porttivälityksellä:

```bash
ssh -N -L 4765:127.0.0.1:4765 oma-kayttaja@oma-palvelin
```

Avaa sitten omalta koneeltasi http://localhost:4765/. Tämä paketti ei julkaise kaikille avointa sivua eikä muuta Metan webhookia. Julkinen monen käyttäjän palvelu tarvitsee erillisen kirjautumisen ja kapasiteettirajat.

Pysäytys säilyttäen demon tiedot:

```bash
docker compose --env-file deploy/selfhost-demo/.env -f deploy/selfhost-demo/compose.yaml stop
```

Älä käytä `down --volumes`, jos haluat säilyttää kokeilujen tiedot. Node-käynnistys pysähtyy Ctrl+C:llä. Kovassa prosessin keskeytyksessä omaan tilahakemistoon voi jäädä `.running`-lukko; varmista, ettei demoprosessi ole enää käynnissä, ennen kuin poistat juuri tämän demon lukon. Käynnistin ei poista kantoja tai ota olemassa olevaa vierasta hakemistoa käyttöön.

## Demon asetukset

| Asetus | Oletus | Merkitys |
|---|---|---|
| DEMO_MODEL | qwen3:14b | Omalle Ollamalle ladattu malli |
| DEMO_OLLAMA_URL | http://127.0.0.1:11434 | Node-ajon mallipalvelin; Compose asettaa sisäverkon osoitteen |
| DEMO_PORT | 4765 | Demon oma selainportti |
| DEMO_CONTEXT_TOKENS | 8192 | Mallin kontekstiraja |
| DEMO_TIMEOUT_MS | 180000 | Demon mallikutsun enimmäisaika, 1000–300000 ms |
| DEMO_STATE_DIR | tämän hakemiston .state/ | Tyhjä tai tämän demon tunnistama hakemisto |
| DEMO_OLLAMA_TOKEN | tyhjä | Mahdollisen oman HTTPS-mallivälityksen Bearer-tunnus |

Käynnistin luo lapsiprosessille puhtaan ympäristön. Tuotannon API-avaimia, Turso-tunnuksia, tietokantapolkuja tai NODE_OPTIONS-asetuksia ei peritä. Oma `.state` on Gitin ohittama. Jokaisella selainistunnolla on oma ostoslista. Ollama ei vaihdu automaattisesti maksulliseen malliin. Compose estää lisäksi Ollaman pilvi-inferenssin; itse ylläpidetylle erilliselle Ollamalle aseta myös `OLLAMA_NO_CLOUD=1`.

## Arviointi

Käyttöliittymässä näkyy valittu malli sekä viestin käsittelyaika. Mallin puuttuminen, väärä tulkinta ja palvelinkatko ovat eri asioita: testaa määrät, yksiköt, rajoitteiden säilyminen ja poistot. Käytä lisäksi repon `scripts/ollama-eval.mjs`-ajuria erilliseen kiinteään tulkintakokeeseen, kun mallin kapasiteetti on riittävä. Se käyttää tuotantotulkin 60 s aikarajaa; tämän selainversion oma raja on pidempi CPU-kokeiden mahdollistamiseksi.

Demon testit: `node --test test/selfhost-demo.test.mjs`. Ne käyttävät oikeaa HTTP-palvelinta ja keskustelumoottoria mutta käsikirjoitettua mallivastausta; näin testataan eristys, korimuutos, uudelleenyritys ja tallennuksen säilyminen. Todellisen mallin laatu raportoidaan erikseen työlokissa ja tämän demon testiraportissa.

Tämän työvaiheen varmennukset ja oikean 8B-mallin koe: [TEST-REPORT.md](TEST-REPORT.md). 14B-/32B-malleja tai GPU-overlayta ei vielä ajettu tässä ympäristössä.
