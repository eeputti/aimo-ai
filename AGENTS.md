# Yhteiset työohjeet: Codex ja Claude Code

## Aloita tästä

- Lue `TYOLOKI.md` ennen muutoksia. `README.md` kuvaa toteutusta ja käynnistystä; `SUUNNITELMA.md` sisältää kilpailusuunnitelman ja aiempia havaintoja, jotka voivat vanhentua.
- Tarkista `git status`, nykyinen haara ja viimeisimmät commitit. Hae etämuutokset komennolla `git fetch origin` ennen työn aloittamista ja ennen pushia.
- Jos työpuu on puhdas ja nykyinen haara on jäljessä vastaavaa etähaaraa, päivitä komennolla `git pull --ff-only`. Jos työpuussa on muutoksia tai haarat ovat eriytyneet, selvitä erot säilyttäen keskeneräinen työ.
- Codex ja Claude Code voivat käyttää samaa projektikansiota yhtä aikaa. Älä peru, ylikirjoita, siivoa tai ota omiin nimiisi toisen tekemiä muutoksia. Älä käytä `reset --hard`, `clean` tai force pushia.

## Tallenna työ GitHubiin

Eelis pyysi 14.11.2026, että täällä tehtävä työ kirjataan GitHubiin, jotta myös Claude Code pysyy ajan tasalla. Tämän projektin tavallisten työvaiheiden commit ja push on valtuutettu; niihin ei tarvita erillistä vahvistusta joka kerta.

- Tee jokaisesta valmiista työvaiheesta selkeä commit ja push projektin etärepoon `https://github.com/eeputti/aimo-ai`. Käytä nykyistä sovittua työhaaraa; lähtötilanteessa se on `main`.
- Kirjaa samaan commitiin `TYOLOKI.md`: mitä muuttui, olennaiset päätökset ja syyt, tehdyt tarkistukset ja tulokset sekä keskeneräiset asiat ja seuraava askel. Kirjaa myös toteutukseen vaikuttavat keskustelupäätökset, vaikka koodi ei vielä muuttuisi.
- Rajaa tavallinen commit omaan työvaiheeseen. Koko työpuun yhteinen tilannetallennus on sallittu käyttäjän sitä pyytäessä; merkitse aiemmin olemassa olleet muutokset sellaisiksi.
- Tarkista diff ja aja muutokseen sopivat tarkistukset ennen committia. Keskeneräinen työ voidaan tallentaa selvästi merkittynä, mutta älä väitä testaamatonta toimivaksi.
- Älä lisää `.env`-tiedostoja, avaimia, allekirjoituksen yksityisavaimia, SQLite-kantoja, `node_modules`-hakemistoa tai rajoitettua challenge-lähdeaineistoa (`data/raw/`). Noudata `.gitignore`-tiedostoa.
- Pushin jälkeen varmista etähaaran commit. Kerro käyttäjälle commit ja mahdollinen jäljelle jäänyt paikallinen työ. Jos push ei onnistu, kerro este; älä ilmoita työn olevan GitHubissa ennen varmennusta.

## Työn jatkaminen toisessa työkalussa

- GitHub välittää commitit ja nämä tiedostot. Käynnissä olevan toisen agentin keskustelukonteksti ei päivity pelkällä pushilla.
- Samassa projektikansiossa tiedostomuutokset näkyvät heti. Eri kloonissa hae uudet commitit ja päivitä puhdas työpuu komennolla `git pull --ff-only`.
- Lue päivitetty `TYOLOKI.md` ja viimeisin diff ennen jatkamista. Älä tee päällekkäisiä muutoksia samaan tiedostoon selvittämättä ensin toisen työvaihetta.

## Käynnistys ja tarkistukset

- Node.js vähintään 22.13; `npm install`, ympäristöasetukset `.env.example`-mallin mukaan, `npm run fetch-data`, `npm run catalog`, `npm start`.
- `npm run aimo:eval`: olemassa oleva tulkinta- ja tuoteratkaisutesti, vaatii paikallisen katalogin.
- `npm run eval`: erillinen tarkkuustesti oikeaa Valio-mock-API:a vasten, vaatii `VALIO_API_KEY`-avaimen. Älä aja sitä tarpeettomasti API-kutsurajojen vuoksi.
- `npm run demo` tekee demo-tilauksia ja muuttaa palvelimen demo-tilaa. Käytä eristettyä testiympäristöä tai sovi käynnissä olevan demon käytöstä ennen sitä.
- Älä nollaa käyttäjän käynnissä olevaa demoa tai tilauskantaa tarkistusten yhteydessä.
