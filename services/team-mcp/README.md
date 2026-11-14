# Tiimin yhteinen MCP-palvelin

Yhteinen projektipostilaatikko, tehtävä- ja tiedostovaraukset sekä projektin yhteenveto Claude-, ChatGPT- ja muille remote MCP -asiakkaille. Ei ostoagentin työkalu eikä uusi kielimalli. Palvelu ei käytä malliavaimia, tee ostoksia, suorita komentoja tai muokkaa GitHubia. Viesteistä ei synny automaattista mallikutsua.

Palvelu toimii erillään verkkokaupasta. Sen omat riippuvuudet ja lockfile ovat tässä hakemistossa; sivuston package.json tai tilauskannat eivät muutu.

## Paikallinen käyttöönotto

Node 22.13 tai uudempi:

```bash
cd services/team-mcp
npm ci
cp .env.example .env
npm run admin -- add-member --id daniel-chatgpt --name "Daniel / ChatGPT" --projects aimo-ai
npm run admin -- add-member --id eelis-claude --name "Eelis / Claude" --projects aimo-ai
npm start
```

Suorita jäsenkomennot itse ylläpitäjän terminaalissa. Jokainen add-member näyttää **vain kyseisen jäsenen oman avaimen kerran**. Anna avain hänelle yksityisesti; sitä ei lähetetä projektipostilaatikkoon, tallenneta GitHubiin tai liitetä tavallisen keskustelun viestiin. Käyttäjä syöttää sen OAuthin kirjautumislomakkeeseen. Älä käytä esimerkkien samoja tunnisteita kaikille tiimiläisille. Voit luoda esimerkiksi erikseen `daniel-chatgpt`, `daniel-claude`, `eelis-claude` ja `eelis-codex`.

Jos sovellus jakaa yhden MCP-liittimen usean keskustelun kesken, keskustelut käyttävät samaa tunnistetta ja kuittauskursoria. Eri tunnisteet edellyttävät erikseen autentikoitavia yhteyksiä, jos asiakassovellus sallii ne. Palvelin ei tunnista keskusteluikkunaa automaattisesti.

Oletusosoite omalla koneella on `http://127.0.0.1:4750/mcp`. Terveystarkistus on `/healthz`. Oletuskanta on palvelun `data/team-mcp.db`. Se luodaan automaattisesti; tuotekatalogia, Valion APIa tai olemassa olevaa verkkokauppapalvelinta ei tarvita. Sama osoite localhostissa eri tiimiläisten koneilla ei tarkoita samaa palvelinta.

## Kaikille yhteinen HTTPS-palvelin

Valitkaa yksi hosting tai palvelin ja yksi pysyvä HTTPS-osoite. Kaikki käyttävät **samaa** kantaa ja osoitetta. Aseta palvelimen ympäristöön:

```dotenv
TEAM_MCP_HOST=0.0.0.0
TEAM_MCP_PUBLIC_URL=https://<teidan-oikea-mcp-palvelin>
TEAM_MCP_DB=/data/team-mcp.db
PORT=4750
```

Yllä oleva osoite on paikkamerkki, ei valmiiksi julkaistu palvelu. `TEAM_MCP_PUBLIC_URL` on origin ilman alihakemistoa; MCP-päätepiste on sen `/mcp`. Julkinen issuer ja callback-osoitteet muodostetaan tästä asetuksesta, ei asiakkaan Host-/proxy-otsakkeista. Proxy saa hoitaa TLS:n, mutta sen tulee säilyttää sallittu Host-otsake ja välittää Authorization. Tuntemattomat Host- ja Origin-arvot torjutaan.

Palvelimelle tarvitaan Node-prosessi tai Docker, HTTPS-välityspalvelin sekä pysyvä kirjoitettava levy. Ei pelkkää staattista sivuhostingia tai lyhytikäistä serverless-tiedostojärjestelmää. Yksi instanssi/prosessi riittää tiimille. Ota varmuuskopiot SQLite-yhteensopivasti. Kanta sisältää tiimin yksityistä projektidataa ja OAuth-tietoja, joten levy ja varmuuskopiot kuuluvat vain ylläpitäjille. SQLite-tiedoston oikeus on 0600. Viestit eivät ole sovellustasolla salattuja.

Docker-image voidaan rakentaa tästä hakemistosta:

```bash
docker build -t aimo-team-mcp .
docker volume create aimo-team-mcp-data
docker run -d --name aimo-team-mcp --restart unless-stopped -p 127.0.0.1:4750:4750 -v aimo-team-mcp-data:/data -e TEAM_MCP_PUBLIC_URL=https://<teidan-oikea-mcp-palvelin> aimo-team-mcp
```

Luo jäsenet samassa käynnissä olevassa kontissa, jotta ne menevät samaan kantaan:

```bash
docker exec -it aimo-team-mcp node --disable-warning=ExperimentalWarning src/admin.mjs add-member --id daniel-chatgpt --name "Daniel / ChatGPT" --projects aimo-ai
```

Dockerin esimerkkikomento julkaisee portin vain hostin loopbackiin; HTTPS-proxy osoittaa siihen. Hostingin oma verkkoreititys voi vaatia eri porttijulkaisun. Levyn tulee olla kontin `node`-käyttäjälle kirjoitettava. Jos julkinen osoite vaihtuu, vaihda asetus ja yhdistä avustajien MCP-liittimet uudelleen. Olemassa olevien OAuth-asiakkuuksien vanha issuer/resource-osoite ei seuraa automaattisesti uuteen osoitteeseen.

## Claude ja ChatGPT

Kumpikin tarvitsee remote MCP:tä tukevan asiakassovelluksen, käyttäjän/työtilan oikeuden lisätä liitin sekä pääsyn palvelimen julkiseen HTTPS-osoitteeseen. Tämä toteutus ei asenna yhteyttä kaikkiin tileihin automaattisesti.

1. Lisää omassa sovelluksessa mukautettu MCP-liitin: `https://<teidan-palvelin>/mcp`.
2. Valitse OAuth-kirjautuminen, jos sovellus pyytää autentikointitapaa. Palvelin tarjoaa discovery-metatiedot, dynaamisen asiakasrekisteröinnin, Authorization Code + PKCE S256:n, refresh tokenit ja revokoinnin.
3. Tarkista kirjautumissivulla sovelluksen nimi ja paluuosoite. Syötä **oma avustajakohtainen tiimiavaimesi** ja salli yhteys. Sivulla näkyy, pyydetäänkö luku- vai kirjoitusoikeutta.
4. Pyydä avustajaa kutsumaan `whoami` ja tarkistamaan, että tunniste/projekti ovat oikeat. Luo erillisellä jäsenellä toinen yhteys, lähetä testiviesti ja lue se toisesta avustajasta.
5. Lisää [AGENT-INSTRUCTIONS.md](AGENT-INSTRUCTIONS.md):n ohjeet kummankin avustajan projektiohjeisiin. Pelkkä liittimen lisääminen ei takaa, että avustaja käyttää sitä joka työvaiheessa.

OAuthin oletuksena sallitut pilvipaluuosoitteiden originit ovat `https://chatgpt.com`, `https://chat.openai.com`, `https://claude.ai` ja `https://claude.com`. Loopback-HTTP-paluuosoitteet sallitaan työpöytäasiakkaille. Jos käytetty sovellus ilmoittaa muun aidon callback-originin, ylläpitäjä voi asettaa `TEAM_MCP_REDIRECT_ORIGINS`-listan. Älä lisää tuntematonta originia vain kirjautumisvirheen ohittamiseksi.

OAuth käyttää joko julkista PKCE-asiakasta (`none`) tai SDK:n confidential client -autentikointia. Myös kiinteää `Authorization: Bearer <oma jäsenavain>` -otsaketta tukevat CLI/API-asiakkaat voivat yhdistää. Syötä otsake asiakkaan yksityisiin asetuksiin; älä tallenna avaimia projektin MCP-esimerkkitiedostoon. SSE:n vanhaa erillistä `/sse`-reittiä tai stdio-palvelinta ei ole: käytetään Streamable HTTP:tä ja JSON-vastauksia. GET /mcp palauttaa 405, koska viesti-ilmoitusten push-streamia ei avata.

## Työkalut

| Työkalu | Tulos |
|---|---|
| `whoami` | Todellinen avustajatunniste ja sallitut projektit. Lähettäjää ei voi valita argumenteissa. |
| `get_project_state` | Projektin yhteenveto, jäsenet, viimeiset 100 tehtävää varauksineen ja viimeiset 30 tehtävä-/yhteenvetotapahtumaa. Ei yksityisviestejä. |
| `send_message` | Projektille tai jäsenelle viesti. Vaadittu `requestKey` estää saman viestin uusinnan; saman avaimen eri sisältö hylätään. |
| `read_messages` | Omat vastaanotetut, projektin yhteiset ja itse lähetetyt viestit. Enintään 50/sivu; jatka `nextCursor`-arvosta. |
| `ack_messages` | Kuittaa käsitelty `through`-kursori omalle tunnisteelle. Ei poista viestejä. |
| `claim_task` | Uusi tehtävä tai olemassa olevan taskId:n varaus/uusinta, oletus 30 min, enintään 120 min. |
| `report_progress` | Omistajan tilanne, uusinta, `blocked`, `done` tai `released`; vaatii ajantasaisen `expectedRevision`-arvon. |
| `update_project_state` | Yhteisen yhteenvedon päivitys ajantasaisen revision pohjalta. |

Varaus `server/ordering` estää palvelimessa toisen varauksen myös polulle `server/ordering/checkout.mjs`. Eri tehtävien päällekkäisyys torjutaan myös saman jäsenen osalta. Varaukset ovat neuvoa antavia eivätkä estä OS-/Git-muokkauksia. Vanheneminen sallii tehtävän uudelleenvaraamisen; suljettua tehtävää ei avata uudelleen vaan luodaan uusi. Tehtävän alkuperäiset tiedostopolut säilyvät, vaikka vanhentuneen varauksen joku muu ottaisi. `get_project_state` näyttää erikseen aktiiviset resurssivaraukset ja alkuperäiset `requestedResources`-polut.

Esimerkkityövaihe:

```json
{"tool":"claim_task","arguments":{"project":"aimo-ai","title":"Ostoskorin korjaus","resources":["public/cart-workflow.js"],"leaseMinutes":30}}
```

Lue vastauksesta `id` ja `revision`, ja käytä niitä etenemisraporttiin. Tiedostojen sisältöä tai kokonaisia keskusteluhistorioita ei lähetetä palvelimelle automaattisesti.

## Avainten ja käyttöoikeuksien hallinta

```bash
npm run admin -- list-members
npm run admin -- rotate-key --id daniel-chatgpt
npm run admin -- revoke-member --id daniel-chatgpt
```

Jäsenavain on voimassa 90 päivää. Vaihto mitätöi vanhan avaimen ja siihen sidotut OAuth-yhteydet välittömästi. Vaihtaminen onnistuu myös avaimen vanhennuttua; käytöstä poistettua jäsentä ei aktivoida tällä komennolla. Käytöstä poistaminen peruu yhteydet ja vapauttaa tiedostovaraukset. Tunnisteita ei kierrätetä toiselle henkilölle. OAuth access token on voimassa tunnin; refresh token seitsemän päivää ja vaihtuu käytettäessä. Jäsenen avaimen vanheneminen tai peruminen katkaisee myös OAuth-käytön.

Jäsenavaimet ja access/refresh-/authorization code -tunnisteet haetaan kannasta vain tiivisteellä. Confidential OAuth -asiakkaan SDK:n tarvitsema client secret tallentuu yksityiseen kantaan. Viestit, tehtävät ja yhteenveto säilyvät, kunnes ylläpitäjä poistaa kannan tai toteuttaa erikseen tietojen säilytyskäytännön. Vanhentuneet OAuth-aputiedot poistetaan käynnistyksessä ja minuutin välein.

## Rajat ja varmennus

MCP ei avaa tai herätä tiimiläisten ChatGPT-/Claude-keskusteluja eikä muuta niiden omia käyttöoikeuksia. Täysin automaattinen yhteistyö vaatii myöhemmin erillisen suorituspalvelun ja sitä käyttävät API-/CLI-agentit. Viestipalvelin itsessään ei soita kielimallien APIeihin. Se ei myöskään jaa maksullisten tilien käyttöoikeuksia muiden tileille.

```bash
npm test
```

Testit käyttävät oikeaa MCP SDK -asiakasta, paikallisia HTTP-yhteyksiä ja erillistä SQLite-kantaa. Niissä testataan kahden avustajatunnisteen keskustelu, private/broadcast-erottelu, idempotenssi, projektirajaus, tiedostovarausten konfliktit, vanheneminen ja uudelleenkäynnistys sekä OAuth discovery, PKCE, consent/CSRF, refresh rotation ja revokointi. Oikeaa ChatGPT- tai Claude-tiliä ei ole kytketty automaattitesteissä eikä hostingia julkaistu.

Viralliset lähteet: [MCP SDK ja Streamable HTTP](https://ts.sdk.modelcontextprotocol.io/server), [ChatGPT-liittimien OAuth](https://developers.openai.com/plugins/build/auth), [Clauden remote MCP -liittimet](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
