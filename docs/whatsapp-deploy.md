# WhatsApp-palvelimen käynnistys ja pysyvä tallennus

Tämä paketti käynnistää nykyisen `server/whatsapp-server.mjs`:n paikallisen ennakkotarkistuksen jälkeen. Se ei rekisteröi Metan webhookia tai ratkaise Metan lähetysestoja. Tilauskeskustelun toiminta on sama kuin `npm run whatsapp` -komennossa. Ylläpitäjän nykyinen käyttöönotto ja palvelinten restartit pidetään yhtenä työnä.

## Paikallinen ennakkotarkistus

Aja projektin juuresta Node 22.13:lla tai uudemmalla:

```bash
node --env-file=.env --env-file-if-exists=.env.whatsapp scripts/whatsapp-preflight.mjs
```

Koneellisesti luettava tulos: lisää `--json`. Paluuarvo 0 tarkoittaa, että paikalliset asetukset ovat kelvolliset; 1 tarkoittaa estettä. Tulosteessa ei ole avaimia, numeroita, henkilötietoja tai kantapolkuja. Komento ei avaa SQLite-kantoja, luo tiedostoja tai tee verkkokutsuja.

Tarkistus kattaa pakolliset Meta-asetukset, portin, tilauslipun kirjoitusasun, erilliset kirjoitettavat kantapolut, katalogin JSON-rakenteen ja Ed25519-avaimen. Kantojen päällekkäisyys huomataan myös symbolisista ja kovista linkeistä. Tilausdemo tarvitsee erilliset `GATEWAY_DB`- ja `AIMO_DB`-polut. Myös jono-, luonnos- ja tarjouskantojen on oltava eri tiedostoja. `:memory:` ei kelpaa tämän käynnistyspaketin pysyvään tallennukseen.

Huomiot eivät estä käynnistystä: ilman malliavainta keskustelu käyttää sääntöjä, ilman Valio-avainta hinnat simuloidaan ja `DEMO_NOW` käyttää demon kelloa. Vain lukeva tila sallii yhdistämisen ja `tuki`-testin ilman MCP:tä, mutta ilmoittaa puuttuvista tuotehaun asetuksista.

## Käynnistys tarkistuksen kautta

Sovittu ylläpitäjä tekee tämän vasta nykyisen samaa kantaa käyttävän WhatsApp-workerin hallitun pysäytyksen jälkeen:

```bash
node --disable-warning=ExperimentalWarning --env-file=.env --env-file-if-exists=.env.whatsapp deploy/whatsapp/start.mjs
```

Käynnistin luo vain asetettujen kantapolkujen vanhemmat hakemistot, kun kaikki tarkistukset ovat läpäisseet. Se ei nollaa olemassa olevia kantoja. `SIGTERM` ja `Ctrl+C` käyttävät palvelimen nykyistä hallittua sulkemista. Yksi worker per WhatsApp-kanta; käynnistin ei ole kaikkia muita käynnistystapoja estävä prosessilukko.

Tarkistus ei todista tokenin voimassaoloa, Metan vastaanottajarajausta tai viestin toimitusta. `/healthz` todistaa vain paikallisen HTTP-palvelun toiminnan. Aito WhatsApp-vastaus varmennetaan erikseen [käyttöönotto-ohjeen](whatsapp.md) mukaan.

## Docker-palvelin

Compose käyttää uutta nimettyä levyä. Nykyisen koneella käynnissä olevan demon tiedot eivät siirry sille automaattisesti. Katalogi liitetään koneelta vain luettavana, ja salaiset asetukset annetaan erillisessä Gitin ohittamassa tiedostossa. Build-kontekstin sallittujen tiedostojen lista sulkee pois `.env`-tiedostot, kannat, avaimet ja challenge-aineiston.

Valmistelu projektin juuresta:

```bash
cp deploy/whatsapp/.env.example deploy/whatsapp/.env
chmod 600 deploy/whatsapp/.env
```

Täytä `deploy/whatsapp/.env` yksityisesti. Älä kopioi siihen koneen kantapolkuja: Compose asettaa kontille omat polut. Nykyisen demoympäristön asetustiedostoja ei tarvitse muuttaa. `data/catalog.json` pitää olla rakennettu (`npm run catalog`).

```bash
docker compose -f deploy/whatsapp/compose.yaml config --quiet
docker compose -f deploy/whatsapp/compose.yaml build
docker compose -f deploy/whatsapp/compose.yaml run --rm --no-deps whatsapp node scripts/whatsapp-preflight.mjs
docker compose -f deploy/whatsapp/compose.yaml up -d
curl --fail http://127.0.0.1:4759/healthz
```

Käytä `config --quiet` -muotoa: tavallinen `config` voi näyttää `.env`:stä luetut arvot. Health-vastaus on `{"ok":true,"channel":"whatsapp","mode":"ordering-demo"}`. Oletusportti 4759 on vain koneen localhostissa; `WHATSAPP_CONTAINER_PORT` vaihtaa sitä. Julkinen HTTPS-välitys/tunneli osoitetaan tähän porttiin erillisessä käyttöönotossa. Metan callback päivitetään vasta, kun uusi palvelin on tarkoituksella otettu käyttöön.

Kontti toimii `node`-käyttäjänä, sovelluskoodi on vain luettava, tilapäistiedostot ovat tmpfs:ssä ja kaikki viisi kantaa ovat `whatsapp-data`-levyllä hakemistossa `/app/data/whatsapp`. Ilman erillistä `GATEWAY_PRIVATE_KEY_PEM`-asetusta gatewayn avain syntyy samalle pysyvälle levylle `/app/data/gateway-ed25519.pem`:ksi ensimmäisen tarjouksen yhteydessä. Säilytä tämä avain kantojen mukana; muuten aiemmat allekirjoitetut tarjoukset eivät ole enää saman avaimen tarjouksia.

Paikallisen selaimen `/demo`-varademo säilyy tavallisessa Node-käynnistyksessä. Dockerin porttivälitys ei ole palvelinkoodin näkökulmasta loopback-yhteys, joten nykyinen varademon paikallisuusrajaus estää `/demo`:n sen kautta. Käytä varademoon yllä olevaa paikallista Node-käynnistystä; tämän paketin kontti on WhatsApp-webhookia varten. Paikallisuusrajausta ei poisteta julkaisun vuoksi.

```bash
docker compose -f deploy/whatsapp/compose.yaml restart
docker compose -f deploy/whatsapp/compose.yaml stop
```

Nämä säilyttävät levyn. Myös `down` säilyttää nimetyn levyn; `down --volumes` poistaisi tiedot, joten sitä ei käytetä normaalissa demon ylläpidossa. Pidä yksi palveluinstanssi. Dockerin `unless-stopped` palauttaa palvelun Dockerin käynnistyessä; koneen ollessa sammutettu tai verkon poikki WhatsApp-palvelu ei ole tavoitettavissa.

Kun olemassa oleva käyttöönotto siirretään levylle, pysäytä lähteen worker ensin. Kopioi samasta pysäytetystä tilasta kaikki viisi kantaa, mahdolliset WAL-tiedostot ja allekirjoitusavain. Varmista kohteen oikeudet `node`-käyttäjälle ja sama avain ennen käynnistystä. Älä yhdistä uuden levyn testiasiakkuuksia vanhoihin luonnoksiin käsin. Säilytä lähde, kunnes kohteen jäsenliitos, luonnos ja tilaus on luettu takaisin. Tässä työvaiheessa ei tehdä tätä siirtoa tai muuteta nykyistä callbackia.

## Varmennettu ja avoin

- Automaattinen testi ajaa käynnistimen oikeana Node-prosessina kahdesti. Testin numerojäsenyys, tallennettu vastaus, luonnoksen revisio, gatewayn demotilaus, keittiökannan tieto ja erillinen tarjouskanta säilyvät. Testi käyttää vain väliaikaisia kantoja, omaa porttia ja keksittyjä tunnuksia.
- Virheelliset asetukset pysäyttävät käynnistyksen ennen hakemistojen tai kantojen luontia. Ennakkotarkistuksen teksti ja JSON testataan salaisuuksien vuotojen varalta.
- Docker-imagea ja Compose-ajoa ei ole rakennettu/ajettu tässä Codex-ympäristössä: Dockeria ei ole saatavilla. Niiden varmennus tehdään yllä olevilla komennoilla Docker-palvelimella ennen käyttöönottoa. Paikallinen Node-testi ei ole todiste konttiajon toiminnasta.
- Ei oikeita Meta-, malli- tai Valio-kutsuja. Ei nykyisen demon kantojen käyttöä, palvelimen restarttia tai julkaisua.

Lähteet: [Node: ympäristötiedostot](https://nodejs.org/api/cli.html#--env-filefile), [Docker: build-konteksti ja Dockerfile-kohtainen ignore-tiedosto](https://docs.docker.com/build/concepts/context/), [Docker: pysyvät levyt](https://docs.docker.com/engine/storage/volumes/), [Compose: palvelut ja mountit](https://docs.docker.com/reference/compose-file/services/).

## Rajatun repon koritiedostot

Dockerfile kopioi nyt korin HTML/JS/CSS-tiedostot, checkoutin, aloitusohjeen, logon sekä tarvittavat yhteiset tyylit, fontit, ikonit ja optimoidut kuvat. Dockerfilen oma ignore-tiedosto sallii nämä nimet; vanhat paikalliset näkymät tai `public/demo-config.json` eivät tule build-kontekstiin. Arkistoitu keittiö tai laaja verkkokauppakopio ei ole konttipaketin riippuvuus.
