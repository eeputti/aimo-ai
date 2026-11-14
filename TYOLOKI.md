# Työloki ja työn jatkaminen

Tämä tiedosto välittää toteutuksen tilan ja päätökset Codexin ja Claude Coden välillä. Lisää uusin työvaihe ylimmäksi. Älä kirjaa salaisuuksia tai koko keskusteluhistoriaa.

## 14.11.2026 — etusivun fiksu haku (Claude Code)

**Käyttäjän päätös:** etusivusta (`/`, Toimitustukun ulkoasukopio) tehdään demon aloitusnäkymä, ja sen hakukenttä ymmärtää puhekielisen pyynnön. Valinnan jälkeen tilauksen hoitaa agentti portin kautta, ei etusivun oma ostoskori. Reseptihaku, allergeenirajaus omana toimintonaan ja live-hinnat rajattiin tästä työvaiheesta pois.

- Uusi `public/storefront-search.js` (ladataan `index.html`- ja `gateway.html`-sivuilla). Kirjoittaessa kutsutaan `POST /api/aimo/interpret` asetuksella `llm: false`, joten näppäily ei maksa mallikutsua eikä Valion API-kutsua. Otsakkeen alle avautuva paneeli näyttää rivikohtaisesti määrän, tuotteen, väittämät (esim. laktoositon), toimituspäivän, sopivien tuotteiden määrän ja kolme parasta osumaa kuvineen sekä tulkinnan keston. Ymmärtämättä jääneet sanat ja oletukset näytetään erikseen.
- Enter tai nappi "Pyydä tarjous agentilta" tallentaa tekstin `sessionStorage`-avaimeen `aimo.ask` ja avaa `/agent.html`-sivun. `public/aimo-shell.js` lukee avaimen konsolissa ja antaa tekstin samaan polkuun kuin konsolin oma haku: pyyntö tulkitaan ensin, tilaus ei lähde ilman käyttäjän seuraavaa painallusta.
- Etusivu ei näytä hintoja eikä saldoja hakutuloksissa. Tarkennusnapit (pakkauskoko, merkki) ovat vain konsolissa, koska valinta ei siirtyisi etusivulta mukana.
- Tyylit lisättiin `public/storefront.css`-tiedoston loppuun (`.ss-`-luokat). Puuttuvan tuotekuvan paikalla on pakkauskuvake.

**Tarkistukset:** selaimessa eristetyllä simuloidulla palvelimella (portti 4755, omat testikannat, ei API-avaimia): "laktoositonta kermaa 20 l perjantaiksi ja 5 kg voita" tuotti kaksi riviä, päivän pe 20.11. ja osumat; siirto konsoliin täytti pyynnön ja avasi tulkinnan. "gluteeniton leipä", tuntematon sana ja "lohikeitto 100 annosta maanantaiksi" näkyivät oikein. Reseptitapaus nojaa toisen työvaiheen commitoimattomaan `server/aimo/recipes.mjs`-työhön. `npm test` 26/26, `node --check` läpi. Kapeaa näyttöä ei tarkistettu.

**Jäljellä:** käynnissä olevat palvelimet tarjoavat staattiset tiedostot levyltä, joten haku näkyy sivun päivityksellä. `.claude/launch.json`-tiedostoon lisättiin paikallisesti asetus `aimo-ai-test-4755`; se ei ole tässä commitissa, koska tiedostossa on toisen työvaiheen muutoksia.

## 14.11.2026 — keittiönäkymän tilapalkki pois (Claude Code)

**Käyttäjän pyyntö:** Eelis halusi keittiönäkymän (`/kitchen.html`) yläpalkin alta pois rivin, jossa olivat merkit "Live: Aimo API", "Claude päällä" ja viimeisin vasteaika.

- `public/app.js`: `renderStatus` ei enää piirrä tilamerkkejä.
- `public/aimo-shell.js`: yhteinen kehys ei luo keittiösivulle `#modes`-riviä. Agenttikonsolin (`/agent.html`) oma tilarivi (`#chips`) on ennallaan.
- Vasteaika näkyy edelleen "Miten tämä toimii" -välilehdellä. Simuloidusta tilasta (ei `VALIO_API_KEY`-avainta) ei ole enää näkyvää merkkiä keittiönäkymässä.

**Tarkistukset:** `node --check` molemmille tiedostoille läpi. Selaimessa `http://localhost:4748/kitchen.html`: rivi on poissa, sivu latautuu ilman JavaScript-virheitä. Muita testejä ei ajettu.

**Huomio:** commit sisältää vain tämän työvaiheen rivit. Työpuussa on muiden työvaiheiden commitoimattomia muutoksia, myös samassa `aimo-shell.js`-tiedostossa (etusivun haun siirto konsoliin), joita tämä commit ei sisällä.

## 14.11.2026 — keskipisteet pois koko projektista (Claude Code)

**Käyttäjän päätös:** Eelis ei halua keskipistettä (U+00B7) erottimena missään. Älä lisää sitä uuteen käyttöliittymätekstiin, lokitulosteeseen, kommenttiin tai dokumenttiin. Käytä pilkkua tai jaa tieto omiin elementteihinsä.

- Kaikki 90 esiintymää 20 seuratussa tiedostossa korvattiin: käyttöliittymät (`public/app.js`, `gateway.js`, `gateway-products.js`, `aimo-shell.js`), palvelimen tekstit ja kommentit, skriptien tulosteet, README, SUUNNITELMA ja tallennetut `eval/results.*`. Erotin on nyt pilkku. Poikkeukset: nopean agentin päätöslista erotetaan puolipisteellä, `demo-buyer`-tulosteen rivimerkki on tavuviiva, ja budjettirivi sekä tulkintanäkymän faktarivi muotoiltiin ilman edeltävää merkkiä.
- Sama korjaus tehtiin commitoimattomaan luonnokseen `design/aimo-ui-ehdotukset.html` (13 kohtaa). Tiedosto ei ole tässä commitissa, koska se on toisen työvaiheen keskeneräistä työtä.
- Riskilistan luettelomerkki (`public/app.js`, banneri) poistettiin Eeliksen jatkopyynnöstä: riskit ovat omilla riveillään ilman merkkiä.

**Tarkistukset:** haku koko projektista ei löydä enää merkkiä (pois lukien `node_modules`, `data/`), `node --check` muutetuille JavaScript-tiedostoille läpi, `git diff --check` läpi, `npm test` 26/26, `npm run aimo:eval` 26/26. Käyttöliittymää ei katsottu selaimessa; käynnissä oleva palvelin näyttää palvelinpuolen tekstit uusina vasta uudelleenkäynnistyksen ja ehdotuksen uudelleenajon jälkeen.

## 14.11.2026 — resepti- ja ostotarvelaskennan suurimmat aukot

**Käyttäjän pyyntö:** korjaa tarkistuksessa löytyneet suurimmat aukot: uudet reseptiraaka-aineet, varausten ja ryhmien kaksinkertainen laskenta, hiljaisemman viikon määrät sekä varasto-, saanto- ja reseptikorvausten käsittely.

### Muutokset ja päätökset

- Uusi puhdas `server/planning.mjs` yhdistää historiaennusteen, tavallisen myynnin varaukset ja päiväkohtaisen reseptitarpeen. Reseptit tuovat mukaan tuotteet ilman historiaa tai aktiivista tilausrytmiä. Saman tuotteen tarpeet yhdistetään ennen ylöspäin pyöristystä myyntieriin.
- Reseptistä lasketut ryhmät erotetaan varausluvuista kentällä `includedInBookings`. Uusi API-syöte vaatii tiedon; vanha demomenu käsitellään varauksiin sisältyvänä. Viikkorajan ylittävästä menusta käytetään vain kyseisen viikon ryhmiä. Puuttuva varauspäivä ei tarkoita nollaa asiakasta.
- Varauskerroin pienentää ostomäärää myös perustason alle. Budjettikarsinnan alaraja huomioi varastovähennyksen ja säilyttää reseptitarpeen; testeissä löytynyt vertailu alkuperäiseen bruttoperustasoon korjattiin.
- Tuetut resepti- ja varastoyksiköt: g/kg, ml/cl/dl/l ja sales. Kiloja ja litroja ei rinnasteta. Valinnainen reseptin `yield` muuntaa annospainon ostettavaksi määräksi; oletus 1 käsittelee syötteen jo raakatarpeena.
- Inventaario ja vahvistetut saapuvat toimitukset voidaan vähentää eräkohtaisesti. Vähennetään vain viikon alkupäivän ajantasainen inventaario ja samana päivänä saapuva vahvistettu toimitus, joka säilyy viikon loppuun. Puuttuvaa saldoa tai saantoa ei arvata. Lyhyt säilyvyys, vanha inventaario ja muut toimituspäivät näkyvät huomioina eivätkä pienennä tilausta.
- Reseptiin tarvittavan tuotteen korvausta ei hyväksytä automaattisesti. Käyttäjän pitää valita vaihtoehto ja varmistaa maku, koostumus ja saanto; reseptikäytön merkintä säilyy myös korvaavalla rivillä.
- `GET/POST /api/planning` lukee/päivittää resepti-, inventaario- ja saapumistiedot. Rakenteeltaan virheellinen syöte torjutaan ilman tallennusta. Hyväksytty päivitys laatii uuden ehdotuksen ja mitätöi vanhan ehdotuksen tilauskelpoisuuden suunnittelurevision kautta.
- Puuttuva reseptimuunnos tai ristiriitainen ryhmäluku tuottaa `planningIssues`-esteen. Se näkyy keittiön päätöskorttina ja estää tilauksen myös tuoreessa sääntötarkistuksessa. Laskennan huomiot säilyvät myös kielimalliyhteenvedon rinnalla.
- `AIMO_DB` mahdollistaa keittiökannan eristämisen testissä. `npm test` käyttää väliaikaisia kantoja, simulaatiota ja HTTP-testissä väliaikaista allekirjoitusavainta. Käyttäjän demoa ei nollattu eikä muokattu.
- Käyttötapa, JSON-esimerkki ja rajaukset: `docs/kitchen-planning.md`; README ja ympäristömalli päivitettiin.

### Tarkistukset

- Ennen työtä `main` puhdas commitissa `67461b8`; `git fetch origin` onnistui oikeuslaajennuksella, ei uusia etäcommitteja.
- `npm test`: **26/26 läpi**. Mukana puhtaan laskennan tapaukset, koko ehdotuksen muodostus, reseptikorvausten autonomian esto sekä HTTP-päivitys–laskenta–tilausarvio erillisessä demossa. HTTP-palvelimen portin avaus vaati hiekkalaatikon oikeuslaajennuksen.
- `npm run aimo:eval`: **26/26 oikein**, 0 mallikutsua.
- JavaScriptin syntaksitarkistukset ja `git diff --check`: läpi.
- Live-mock-API:a käyttävää `npm run eval`-testiä ei ajettu; muutos ei tarvitse API-kiintiötä. Käyttöliittymää ei tarkistettu selaimessa eikä kielimallipolkua ajettu.

### Jäljellä ja käyttöönotto

- Varasto- ja reseptijärjestelmäintegraatioita tai tiedonsyöttölomaketta ei ole; uudet tiedot annetaan API:lla. Päiväkohtaista eräkulutusta ja säilyvyysoptimointia ei toteutettu. Inventaarion ja saapuvien listojen pitää kuvata eri fyysisiä määriä.
- Historia on ostohistoriaa eikä mitattua kulutusta. Aiemmat ryhmäostot voivat edelleen vaikuttaa perustasoon. Tarkkuutta, säästöä tai hävikin vähenemistä ei ole validoitu oikeassa keittiössä.
- Käynnistä palvelin uudella koodilla ja käytä keittiön **Aja uudelleen** -toimintoa, kun haluat korvata tallennetun luonnoksen. Tässä työvaiheessa ei käynnistetty uudelleen käyttäjän palvelinta eikä ylikirjoitettu sen luonnosta.

## 14.11.2026 — Danielin MCP-palvelin ja STOCK_UNKNOWN-lipun laajennus (Claude Code)

**Tausta:** Daniel Turkkinen latasi GitHubiin commitissa `a38b854` kolme tiedostoa repojuureen: `server.py` (Python-MCP-palvelin Valion rajapinnalle: haku, tuotetiedot, hinnat, saatavuus), `test_tools.py` ja `server.cpython-311.pyc`. Tiedostot haettiin paikalliseen työpuuhun fast-forward-pullilla. Niitä ei ole muokattu, eikä niitä saa muokata ilman Eeliksen tai Danielin pyyntöä.

**Havainnot Danielin koodista (ei korjattu):**

- Palvelin on päällekkäinen gatewayn `/mcp`-liittymän lukupuolen kanssa; siinä ei ole tarjouksia, mandaatteja, hyväksyntää eikä audit-ketjua. Käyttötarkoitus on kysymättä Danielilta.
- Tuntematon saldo päätellään kentästä `logisticModel == "Terminal"`, joten Stock-tuotteen 999999 näytetään oikeana saldona.
- Pyydettyä aikaisempi toimituspäivä tulkitaan sopimattomaksi (`deliversOnRequestedDate: false`). Mock palauttaa aina 16.11., joten kysely päivälle 17.11. tai myöhemmälle hylkää kaiken.
- Tilausaikaraja verrataan koneen oikeaan kelloon, ei gatewayn `DEMO_NOW`-kelloon.
- Ilman `MCP_BEARER_TOKEN`-muuttujaa palvelin on avoin osoitteessa `0.0.0.0`. `.pyc` ja puuttuva `requirements.txt` kannattaa siivota Danielin kanssa.

**Muutos gatewayssa (Eeliksen päätös):** `STOCK_UNKNOWN`-lippu nostetaan nyt aina, kun rivin saldoa ei tiedetä, ei vain Terminal-tuotteille (`server/gateway/service.mjs`, `buildOption`). Syy: `data/eval-oracle-cache.json`-näytteen 253 saatavilla olevasta rivistä 67 on Stock-tuotteita, joiden `availableAmount` on 999999; ne menivät tarjoukseen ilman merkintää. Lipun teksti (`contract.mjs`) ja README:n rivi päivitettiin vastaamaan tätä. Lippu on tiedottava: `mandate.mjs` ei lue sitä, joten hyväksyntäpäätökset eivät muutu.

**Tarkistukset:** `node --check` muutetuille tiedostoille läpi, `git diff --check` läpi, `npm run aimo:eval` 26/26. Lipun uutta haaraa ei ajettu live-rajapintaa vasten (simulaattorin Stock-tuotteilla on aina saldo, eikä API-kutsuja tehty).

**Keskeneräistä:** työpuussa on toisen työvaiheen commitoimattomia muutoksia (`server/planning.mjs`, `test/`, `package.json` ym.), joita tämä commit ei sisällä. Avoin kysymys: tarkoittaako 999999 Stock-tuotteella rajatonta vai tuntematonta saldoa.

## 14.11.2026 — yhteinen GitHub-tilannetallennus ja työskentelytapa

**Käyttäjän päätös:** Eelis kehittää projektia myös Claude Codella ja haluaa täällä tehdyt muutokset sekä olennaiset päätökset GitHubiin. Jatkossa jokainen valmis työvaihe kirjataan tähän lokiin, commitoidaan ja pushataan yhteisten `AGENTS.md`-ohjeiden mukaan. `CLAUDE.md` tuo samat ohjeet ja lokin Claude Coden luettavaksi.

### Lähtötilanne ja tallennettavat muutokset

GitHubin `main` ja paikallinen `HEAD` olivat etäpäivityksen jälkeen samassa commitissa `f727548`. Työpuussa oli jo 87 muuttunutta tai uutta tiedostoa. Ne on otettu mukaan tähän käyttäjän pyytämään tilannetallennukseen; niiden alkuperäistä tekijää ei päätellä tästä chatista.

- **Toimitustukun etusivu:** `public/index.html` ja `public/gateway.html` näyttävät paikallisen ulkoasukopion. Sisältö on `storefront-data.json`-tiedostossa, ulkoasu ja toiminnot `storefront.css`- ja `storefront.js`-tiedostoissa. Paikalliset kuvat, fontit ja ikonit ovat `public/storefront-assets/`-hakemistossa; lähteet ja tarkistussummat ovat `sources.json`-tiedostossa.
- **Näkymien osoitteet:** agenttikonsoli on `/agent.html`, keittiödemo `/kitchen.html`, hyväksyntänäkymä `/approve.html?order=…`. Yhteisen navigaation linkkejä on päivitetty.
- **Unohtuiko tämä?** `server/gateway/suggest.mjs` muodostaa ostajan historiasta tuote- ja määräehdotuksia. Integrointi on gateway-palvelussa, HTTP-rajapinnoissa ja hyväksyntänäkymässä. Ehdotuksen lisääminen käyttää tarjous- ja tilauslisäysketjua. `scripts/demo-buyer.mjs` sisältää uuden demoskenaarion.
- **Muut aiemmat tiedostot:** `SUUNNITELMA.md`, README-päivitykset ja `.claude/launch.json`-tiedoston testipalvelinasetus sisältyvät tallennukseen.
- **Tässä työvaiheessa lisätty:** yhteiset `AGENTS.md`-ohjeet, Claude Coden `CLAUDE.md`, tämä työloki sekä README-linkit ja hakemistokuvauksen päivitys.

### Tarkistukset tässä työvaiheessa

- `git fetch origin main`: onnistui; ennen tallennusta ei paikallisia tai etähaaran omia committeja.
- `git diff --check`: läpi.
- `npm run aimo:eval`: **26/26 oikein**, 0 mallikutsua.
- `node --check` kaikille muuttuneille ja uusille JavaScript-tiedostoille: läpi.
- `public/storefront-assets/sources.json`: **48/48** listatun tiedoston koko ja SHA-256 vastaavat paikallista tiedostoa.
- Muuttuneiden tekstitiedostojen tarkistus tavallisten avain- ja yksityisavainmuotojen varalta: ei osumia. `.gitignore` jättää ympäristötiedostot, tietokannat ja challenge-lähdeaineiston pois.

### Keskeneräiset asiat ja seuraava askel

- Etusivun hinnat, saatavuus, toimituspäivä ja ostoskori ovat kiinteää näyttödataa. Karusellit ja apurin tervehdys toimivat paikallisesti; etusivu ei vielä tee tilauksia.
- Uuden ehdotustoiminnon koko tarjous–lisäys–hyväksyntäketjua, käyttöliittymän ulkoasua ja live-API-demoskenaarioita ei testattu tässä tilannetallennuksessa. Tulkintatestin 26/26 ei kata niitä. Tarkista ne eristetyssä testiympäristössä ennen demoa.
- `.claude/launch.json` sisältää aiemman Claude-istunnon väliaikaiseen hakemistoon osoittavan `GATEWAY_DB`-polun portin 4751 testipalvelimelle. Tarkista tai vaihda polku ennen asetuksen käyttöä toisella koneella tai uuden istunnon jälkeen.
- `SUUNNITELMA.md` sisältää aiempien työvaiheiden havaintoja ja avoimia kohtia; varmista niiden ajantasaisuus koodista ennen uuden korjauksen aloittamista.
- Kun jatkat Claude Codessa, lue `CLAUDE.md`, tämä loki ja viimeisin commit. Jos käytät eri kloonia, päivitä ensin puhdas työpuu komennolla `git pull --ff-only`.
