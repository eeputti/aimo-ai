# Koordinaattorin työjonon ja OpenAI-adapterin riippumaton tarkistus (aleksi-claude)

MCP-tehtävä `2e683d3d`, luovuttaja daniel-chatgpt. Tarkistettu nykyinen main (ydin `c71d3a3`, sisältää pohjan `d2c899a` jälkeiset viimeistelyt): `services/team-mcp/src/coordination-store.mjs`, `coordinator.mjs`, `openai-agent.mjs`, `coordinator-main.mjs`, `coordinator-web.mjs`. Ydinkoodi vain luettu. Ei oikeita OpenAI-, Meta- tai Valio-kutsuja, avaimia, palvelinasetuksia tai restartteja.

## Havainnot vakavuuksineen

### L1, keskitaso/matala: Retry-After-viiveellä ei ole ylärajaa

`openai-agent.mjs` muuntaa `retry-after`-otsakkeen (sekunnit tai HTTP-päivä) millisekunneiksi ilman ylärajaa, ja `coordination-store.mjs` / `fail()` käyttää arvoa `Math.max(retryAfterMs, backoff)`. Suuri arvo tai kaukainen päivä (OpenAI, välityspalvelin tai rikkinäinen otsake) siirtää työn `due`-ajan vuosien päähän. Työ jää tilaan `queued`, vie paikan 100 työn jonosta, eikä pyytäjä saa koskaan vastausta tai virhekuittausta.

**Toisto:** `test/coordinator-review.test.mjs`, testi L1: 429 + `retry-after: Fri, 01 Jan 2100 00:00:00 GMT` → `fail(..., retryable=true, retryAfterMs)` → vuorokauden päästä `claim()` palauttaa null eikä pyytäjälle ole viestiä.

**Korjausehdotus:** rajaa viive `fail()`issa, esim. `const delay = Math.min(retryAfterMs, 15 * 60000)`, tai käsittele yli 15 minuutin Retry-After pysyvänä virheenä (`OPENAI_RETRY_TOO_LONG`), jolloin nykyinen `failedReply` kertoo pyytäjälle.

### L2, keskitaso/matala: jonoraja on yhteinen, ei pyytäjäkohtainen

`ingest()` laskee jonossa olevat työt koko projektista (raja 100). Yksi jäsen tai virheellisesti silmukoiva agentti voi täyttää jonon suorilla viesteillä. Tuntirajalla 12 jonon purku kestää noin 8 tuntia, ja sillä välin kaikkien muiden pyynnöt saavat `QUEUE_FULL`-virheen. Tiimin sisällä tämä on lähinnä vahinkoriski, mutta se on juuri se agenttisilmukan seuraus, jota rajoilla halutaan estää.

**Toisto:** testi L2: alice 100 viestiä, bob 1 → bobin työ `failed/QUEUE_FULL`.

**Korjausehdotus:** `ingest()`iin pyytäjäkohtainen laskenta ennen yhteistä rajaa, esim. enintään 5 avointa (`queued`/`running`) työtä per pyytäjä. Ylimenevä saa `REQUESTER_QUEUE_FULL` ja saman yksityisen `failedReply`-kuittauksen.

### L3, matala: Windows-palvelinkone ja testien alustaoletukset

Käyttöohje neuvoo PowerShell-käynnistyksen, eli palvelinkone voi olla Windows. Tällä Windows 11 / Node 26 -koneella paketin `npm test` antaa 36 läpi ja 4 virhettä. Virheet ovat alustaeroja, eivät logiikkavikoja:

- `store.test.mjs` ja `coordinator.test.mjs`: kantatiedoston oikeudet 0666 eikä 0600. Windows ei toteuta POSIX-oikeuksia, joten "kanta 0600" -suoja ei päde siellä. Suojana toimii käyttäjäprofiilin NTFS-oikeus. Ohjeeseen kannattaa kirjata: pidä kanta oman käyttäjäprofiilin alla, älä jaetussa kansiossa.
- `config.test.mjs`: polku tarkistetaan `/`-erottimella (`endsWith('/services/team-mcp/data/team-mcp.db')`), Windowsissa erotin on `\`.
- `coordinator-cli.test.mjs`: `child.kill('SIGINT')` lopettaa prosessin Windowsissa pakotetusti (exit code null). Hallittu sulku Ctrl+C:llä oikeassa konsolissa ei tule tässä testatuksi.

**Ehdotus:** tee näistä alustatietoisia (`path.join`, oikeustarkistus vain kun `process.platform !== 'win32'`, Windowsissa exit-koodin sijaan portin vapautuminen). Varmista, millä alustalla oikea koordinaattori ajetaan.

### L4, tiedoksi

- Kun tuntiraja täyttyy, jonossa olevat työt odottavat hiljaa, eikä pyytäjä saa tietoa viiveestä. Lyhyt "jonossa, arvioitu viive" -kuittaus parantaisi käytettävyyttä.
- `coord_attempts`-taulua ei siivota. Kasvu on hidasta (enintään 12 riviä tunnissa), joten tällä ei ole kiire.
- Tässä istunnossa lähetin `team-coordinator`-tunnisteelle kaksi suoraa pyyntöä (#73 ja #82), eikä kumpaankaan tullut vastausta tai virhekuittausta useiden minuuttien aikana. Koodin mukaan näin käy, jos koordinaattori on `observe`-tilassa tai lukee eri kantaa kuin MCP-palvelin. Ylläpitäjän kannattaa tarkistaa dashboardista tila ja jono.

## Tarkistettu kunnossa olevaksi

- **Kadonnut prosessi ja vuokran versio:** `owns()` vaatii saman workerin, version ja voimassa olevan vuokran. Vanhentunut työ palaa jonoon tai epäonnistuu kolmannen yrityksen jälkeen. Vanhan workerin myöhäinen `complete` torjutaan (`JOB_LEASE_LOST`) ja niellään. Agentin aikaraja 45 s on pienempi kuin vuokra 120 s.
- **Vastaus ja valmistuminen atomisesti:** `complete()` kirjoittaa viestin, tapahtuman ja tilan samassa transaktiossa. Epäonnistunut vastaus ei jätä puolivalmista tilaa.
- **Peruttu jäsen tai työ:** peruttu pyytäjä peruuntuu `claim`issa ilman vastausta. Kesken ajon peruttu pyytäjä tai koordinaattori kaatuu `store.access`-tarkistukseen, ja `failedReply` ei lähetä viestiä perutulle.
- **Projektit ja yksityisyys:** `ingest` käsittelee vain koordinaattorille osoitetut saman projektin viestit, ei broadcasteja eikä muiden yksityisviestejä. Dashboardin jobs-näkymä rajautuu pyytäjään. Uusi testi varmistaa, ettei toinen jäsen näe vastausta viesteistä eikä snapshotista.
- **Ei agenttisilmukkaa:** koordinaattorin omat vastaukset ohitetaan (`e.actor === actor`). Uusi testi varmistaa, että useampi tick ei luo vastauksesta uutta työtä.
- **Responses-vastaus:** koko vastaus rajataan 1 Mt:iin ennen jäsennystä. Lisäksi tarkistetaan `status=completed`, tiukka skeema ja kenttärajat. Refusal ja rikkinäinen JSON tuottavat ei-uusittavan `INVALID_AGENT_OUTPUT`-virheen, eikä raakavirhe vuoda kuittaukseen.
- **Tuntiraja:** yritykset tallennetaan kantaan, joten raja säilyy restartin yli (olemassa oleva testi). Yhtä työtä yritetään enintään kolme kertaa.
- **Dashboard:** vain loopback-isäntä, Origin-tarkistus, Bearer-avain otsakkeessa, tiukka CSP ja no-store.

## Testit

- Uusi `services/team-mcp/test/coordinator-review.test.mjs`: 1 läpäisevä regressio (yksityisyys ja ei silmukkaa) ja 2 `todo`-testiä (L1, L2). Molemmat todo-testit kaatuvat nyt juuri kuvattuun väitteeseen ("vuorokauden jälkeen työtä ei yritetä uudelleen…" ja "bobin pyyntö sai QUEUE_FULL"). Kun korjaus on integroitu, `todo`-merkintä poistetaan.
- Paketin `npm test` Windowsissa: 42 testiä, 36 läpi, 4 virhettä (L3, alustaerot) ja 2 todo. Sama 4 virheen joukko kaatuu myös ilman uutta testitiedostoa.
- **Testauksen rajat:** ei oikeaa OpenAI-kutsua, ei Linux- tai Docker-ajoa tältä koneelta, ei oikean palvelinkoneen kantaa tai dashboardia, ei selainkoetta.
