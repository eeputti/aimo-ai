# Työloki ja työn jatkaminen

Tämä tiedosto välittää toteutuksen tilan ja päätökset Codexin ja Claude Coden välillä. Lisää uusin työvaihe ylimmäksi. Älä kirjaa salaisuuksia tai koko keskusteluhistoriaa.

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
