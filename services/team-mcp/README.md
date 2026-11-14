# Tiimin yhteinen MCP-palvelin

**Liittyvälle tiimiläiselle: [yhteinen testiosoite, omat tunnisteet ja kirjautumisohje](../../docs/team-mcp-join.md).** Tämä README sisältää palvelimen ylläpidon ja teknisen käyttöönoton ohjeet.

Yhteinen projektipostilaatikko, tehtävä- ja tiedostovaraukset sekä projektin yhteenveto Claude-, ChatGPT- ja muille remote MCP -asiakkaille. MCP-palvelin ei tarvitse malliavaimia eikä tee ostoksia, suorita komentoja tai muokkaa GitHubia. Erikseen käynnistettävä [OpenAI-koordinaattori](../../docs/team-coordinator.md) seuraa tapahtumia jatkuvasti ja voi käsitellä sille suoraan osoitettuja analyysi- ja koordinointipyyntöjä API-agentilla.

Palvelu toimii erillään verkkokaupasta. Sen omat riippuvuudet ja lockfile ovat tässä hakemistossa; sivuston package.json tai tilauskannat eivät muutu.

## Selkeä tehtävänjako

Yksi tehtävä tarkoittaa yhtä rajattua tulosta ja sillä on yksi vastuullinen avustajatunniste.
Käytä eri chatille omaa tunnistetta, jos asiakas sallii erilliset yhteydet. Paikallisesti
voit luoda esimerkiksi `codex-mcp` ja `claude-tests` komennolla `join`.
Kirjoita otsikkoon tavoite ja kuvaukseen valmistumiskriteeri sekä työn ulkopuolelle jäävät asiat.
Varaa vain muokkaamasi tiedostot; koko projektikansion varaus estää rinnakkaistyön.

| Tila | Kuka jatkaa? | Tiedostot ja seuraava toimi |
|---|---|---|
| `in_progress` | `owner` | Omistaja tekee työn ja uusii varauksen ennen määräaikaa. |
| `blocked` | `owner`; nimetty auttaja ratkaisee esteen | Varaus säilyy. Auttajalle ilmoittaminen ei siirrä omistusta. |
| `handed_off` | `owner` on vastaanottaja, joka ei ole vielä aloittanut | Tiedostovaraukset ovat vapaat. Vastaanottaja käyttää `accept` / `claim_task(taskId)` ennen muokkausta; tiedostot varataan uudelleen konfliktitarkistuksella. |
| Varaus vanhentunut tai omistaja poistettu käytöstä | Kuka tahansa projektin jäsen voi yrittää ottaa työn | Lue muistiinpanot ja commit, sitten `accept` / `claim_task(taskId)`. Älä aloita ennen onnistunutta varausta. |
| `done` | Ei jatkajaa | Tulos on valmis; varaukset vapautuvat. Uusi työ saa uuden tehtävän. |
| `released` | Ei aktiivista vastuuhenkilöä | Työ jätettiin kesken; varaukset vapautuvat. Jatko luodaan uutena tehtävänä viitaten vanhaan. |

`status` näyttää omistajan, tilan, aktiiviset tiedostovaraukset, tehtävään kuuluvat
alkuperäiset tiedostot ja seuraavan toimenpiteen. `requestedResources` kertoo työn rajauksen;
`resources` kertoo juuri nyt voimassa olevat varaukset. Vanhentunutta omistajuutta ei pidä
lukea aktiiviseksi työksi. Kaikki avoimet tehtävät näkyvät, lisäksi viimeiset 100 suljettua.

Luovutuksen muistiinpanoon: **tehty, tarkistettu, jäljellä, commit**. Luovutuksen vastaanottaja
on vastuussa seuraavasta vaiheesta vasta otettuaan työn vastaan. Vanha omistaja ei jatka
muokkausta luovutuksen jälkeen. Vanhenneen varauksen omistajan on varattava tehtävä uudelleen
ennen luovutusta. Varaus on aina neuvoa antava, ei tiedostojärjestelmän lukko.

Eri koneiden paikalliset kannat eivät jaa tehtävätilannetta. Yhteinen tehtävänjako vaatii
saman HTTPS-palvelimen; GitHub välittää koodin ja työlokin, ei paikallisia varauksia.

## Paikallinen käyttö ilman palvelinta

Samalla koneella ja samassa projektikansiossa työskentelevät avustajat (esimerkiksi Codex ja Claude Code) voivat käyttää taulua suoraan komentoriviltä. Palvelinta, liitintä tai `npm ci`:tä ei tarvita: komento käyttää samaa kantaa ja samaa logiikkaa kuin MCP-palvelin.

```bash
npm run team -- join --id claude-code --name "Claude Code"
npm run team -- start --as claude-code
npm run team -- claim --as claude-code --title "Ostoskorin korjaus" --files public/cart-workflow.js
npm run team -- block --as claude-code --task 4855c582 --note "Tarvitsen restartin" --on codex
npm run team -- handoff --as claude-code --task 4855c582 --to codex --note "Tehty ja testattu, restart jäljellä" --commit HEAD
npm run team -- accept --as codex --task 4855c582
npm run team -- done --as codex --task 4855c582 --note "Restart tehty, healthz 200" --commit HEAD
```

`npm run team -- help` listaa kaikki komennot. `start` hakee ensin etähaaran ja näyttää eron siihen, commitoimattomat tiedostot ja uusimman `TYOLOKI.md`-otsikon, sitten avoimet tehtävät ja lukemattomat viestit. `handoff` ja `done` hyväksyvät `--commit`-arvon vain, jos commit on jossakin etähaarassa; `--allow-unpushed` ohittaa tarkistuksen ja lisää merkintään tekstin EI GITHUBISSA.

Paikallisessa käytössä tunniste on `--as`-arvo (tai `TEAM_AGENT`), eikä sitä varmenneta: jokainen, joka pääsee kantatiedostoon, on jo ylläpitäjä. Älä avaa tätä kantaa verkkolevyltä tai jaa sitä koneiden välillä; eri koneet käyttävät alla kuvattua HTTPS-palvelinta. Palvelin ja komentorivi voivat käyttää samaa kantaa yhtä aikaa.

## Paikallinen palvelin

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

## Nopea Cloudflare-tunnelikokeilu

Tässä kokeilussa Node-palvelin ja Cloudflare-tunneli toimivat samalla koneella. Renderiä, Cloudflare-tiliä, omaa verkkotunnusta tai Cloudflaren API-avainta ei tarvita. Asenna ensin Node 22.13+ sekä [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). Windowsissa PowerShell:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Avaa asennuksen jälkeen uusi terminaali projektin juuressa. Jos paikallisia muutoksia ei ole, päivitä ensin `git pull --ff-only`. Aja:

```bash
npm --prefix services/team-mcp ci
npm --prefix services/team-mcp run admin -- add-member --id daniel-chatgpt --name "Daniel / ChatGPT" --projects aimo-ai
npm --prefix services/team-mcp run tunnel
```

Jos jäsen on jo luotu, älä suorita add-member-komentoa uudelleen. Hae tarvittaessa uusi avain `npm --prefix services/team-mcp run admin -- rotate-key --id daniel-chatgpt` -komennolla (mitätöi tämän jäsenen vanhat yhteydet). Jäsenavaimen näkee vain omassa terminaalissa; syötä se MCP-liittimen OAuth-kirjautumissivulle. Luo muille avustajille omat jäsenet `add-member`-komennolla toisessa terminaalissa.

`run tunnel` tulostaa **MCP-osoitteen** muodossa `https://satunnainen-nimi.trycloudflare.com/mcp`. Lisää tämä sama osoite kaikkien avustajien mukautettuun MCP-liittimeen ja valitse OAuth. Käynnistys asettaa julkisen OAuth-osoitteen automaattisesti ja sitoo palvelimen vain `127.0.0.1`:een. `.env`:n `TEAM_MCP_PUBLIC_URL` ja `TEAM_MCP_HOST` ohitetaan vain tämän komennon ajaksi; tiedostoja ei muuteta. Olemassa olevaa portissa 4750 toimivaa palvelinta ei julkaista vahingossa: varattu portti keskeyttää käynnistyksen.

Pidä terminaali ja kone käynnissä. **Ctrl+C sulkee sekä tunnelin että MCP-palvelimen.** Uusi käynnistys antaa uuden osoitteen, jolloin liittimet on yhdistettävä uudelleen. Kanta ja jäsenet säilyvät `data/team-mcp.db`:ssä. Tunneli ei siirrä paikallista kantaa muiden koneiden kanssa samaan paikkaan: kaikkien on käytettävä juuri tätä yhtä MCP-osoitetta. Komento ei käynnistä verkkokauppaa tai WhatsApp-palvelinta.

Jos `cloudflared` ei löydy PATHista, määritä `CLOUDFLARED_BIN` sen koko tiedostopoluksi. Quick Tunnel ei toimi kaikissa verkoissa; Cloudflaren yhteyksien on oltava sallittuja. Käyttäjän oma `~/.cloudflared/config.yaml` voi myös estää Quick Tunnelin; tarkista silloin [Cloudflaren kokeiluohje](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). Käynnistysskripti ei muuta omia Cloudflare-asetuksiasi. Tämä on tilapäinen testi ilman saatavuustakuuta.

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
| `get_project_state` | Projektin yhteenveto, jäsenet, kaikki avoimet ja viimeiset 100 suljettua tehtävää varauksineen ja viimeiset 30 tehtävä-/yhteenvetotapahtumaa. Ei yksityisviestejä. |
| `get_agent_activity` | Avustajien viimeinen MCP-yhteys, raportoidut tehtävät ja koordinaattorin elonmerkki. Oman API-työjonon tilanne ja tulokset; muiden suorat työpyynnöt pysyvät yksityisinä. Yhteydenotto ei todista jatkuvaa työskentelyä. |
| `send_message` | Projektille tai jäsenelle viesti. Vaadittu `requestKey` estää saman viestin uusinnan; saman avaimen eri sisältö hylätään. |
| `read_messages` | Omat vastaanotetut, projektin yhteiset ja itse lähetetyt viestit. Enintään 50/sivu; jatka `nextCursor`-arvosta. |
| `ack_messages` | Kuittaa käsitelty `through`-kursori omalle tunnisteelle. Ei poista viestejä. |
| `claim_task` | Uusi tehtävä tai olemassa olevan taskId:n varaus/uusinta, oletus 30 min, enintään 120 min. |
| `report_progress` | Omistajan tilanne, uusinta, `blocked`, `done` tai `released`; vaatii ajantasaisen `expectedRevision`-arvon. `blocked` lähettää esteestä viestin: `blockedOn`-jäsenelle suoraan, muuten koko projektille. Varaus säilyy. |
| `handoff_task` | Luovuttaa oman tehtävän toiselle jäsenelle: omistus siirtyy, tiedostovaraukset vapautuvat ja vastaanottaja saa suoran viestin, jossa on muistiinpano, commit ja tehtävän tunniste. Vastaanottaja ottaa työn `claim_task`-kutsulla samalla `taskId`:llä; siihen asti tehtävä on tilassa `handed_off` eikä sitä voi päivittää. Tehtävä on varattu vastaanottajalle 120 minuuttia, sen jälkeen kuka tahansa voi ottaa sen. |
| `update_project_state` | Yhteisen yhteenvedon päivitys ajantasaisen revision pohjalta. |
| `runner_claim_task` | Paikallisen CLI-ajurin atominen vastaanotto: tuore omalle jäsenelle luovutettu tehtävä, odotettu revisio, instanssi ja ennen kutsua tallennettu salainen `claimKey`. Tarkistaa paikallisen lähettäjä-/polkulistan ja varaa tiedostot 120 sekunniksi. |
| `runner_heartbeat` | Uusii yhden ajon tokeniin ja instanssiin sidotun vuokran. Tavalliset tehtävätyökalut eivät ohita aktiivista ajoa. |
| `runner_finish` | Kuittaa tuloksen kerran ja palauttaa työn lähettäjälle tarkistettavaksi. Ei hyväksy koodia, commitoi tai pushaa. |

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

MCP ei avaa tai herätä tiimiläisten ChatGPT-/Claude-keskusteluja eikä muuta niiden omia käyttöoikeuksia. Erillinen `npm run coordinator` -prosessi seuraa samaa kantaa ja näyttää avaimella suojatun paikallisen tilannenäkymän portissa 4752. Oletus on `observe`: ei mallikutsuja. `openai` käsittelee vain `team-coordinator`-jäsenelle osoitetut suorat viestit ja vastaa pyytäjän postilaatikkoon; se käyttää erikseen asetettua API-avainta ja mallia. Agentti ei itse muokkaa koodia tai suorita komentoja. Katso [käyttöönotto ja työnkulku](../../docs/team-coordinator.md).

## Automaattinen CLI-heräte ja rajattu työnjako

`npm run runner` käynnistää oman koneen Codex CLI:n tai Claude Coden sille nimenomaisesti luovutetusta tehtävästä. Ajuri käyttää erillistä Git-työpuuta ja palauttaa tuloksen lähettäjän MCP-postilaatikkoon tarkistettavaksi. Se ei käynnistä selaimessa auki olevia chatteja. Palvelimen on ensin oltava päivitetty tähän 13 työkalun versioon; vanha käynnissä oleva prosessi pitää päivittää hallitusti. Ajuri pysähtyy, jos runner-työkalut puuttuvat.

1. Asenna Node 22.13+, Git ja ajantasainen Codex CLI tai Claude Code omaan klooniin. Kirjaudu CLI:hin etukäteen samalla käyttöjärjestelmäkäyttäjällä. Pelkkä Codex-työpöytäsovellus ei riitä. Käynnistys tarkistaa CLI:n tarvittavat liput `--help`-kutsuilla ilman malliajoa.
2. Ylläpitäjä luo yhteisen MCP:n omalla palvelinkoneella erillisen jäsenen, esim. `npm.cmd --prefix services/team-mcp run admin -- add-member --id aleksi-codex-runner --name "Aleksi / Codex runner" --projects aimo-ai`. Toimita tulostuva avain yksityisesti.
3. Kopioi tämän hakemiston `.env.runner.example` tiedostoksi `.env.runner`. Aseta nykyinen HTTPS-osoite `/mcp`-päätteellä ilman URL-tokenia, oma jäsen ja avain, `TEAM_RUNNER_PROVIDER=codex` tai `claude`, sallitut lähettäjät ja kapeat polut (esim. `docs`, ilman loppukauttaviivaa). Aloita `TEAM_RUNNER_ACCESS=read-only`. `workspace-write` sallii muutoksia erillisessä työpuussa. Pidä asetukset ja ajopäiväkirja oman käyttäjän yksityisessä kansiossa; Windowsissa POSIX-mode ei korvaa NTFS-oikeuksia.
4. Aja repon juuresta `npm.cmd ci --prefix services/team-mcp` ja `npm.cmd --prefix services/team-mcp run runner` (Linuxissa `npm`). Asetustiedosto luetaan vain `.env.runner`-tiedostosta. Ajuri pollaa oletuksena 5 sekunnin välein, tekee yhden työn kerrallaan ja aikaraja on 600 sekuntia. Ctrl+C pysäyttää ajurin.
5. Sallittu lähettäjä luo tehtävän tarkoilla tiedostopoluilla ja luovuttaa sen ajurin jäsenelle `handoff_task`-kutsulla. Tavallinen viesti ei käynnistä paikallista CLI:tä. Tuloksessa on työpuun ja paikallisen haaran sijainti sekä oikeasti tehdyt tarkistukset. Muutokset odottavat erillistä tarkistusta ja commit/push/mergeä. Katkon jälkeinen sovitus ei aja epävarmaa tehtävää uudelleen; päiväkirjaa ei pidä poistaa tai ohittaa.

CLI käyttää normaaleja käyttöoikeuksiaan: Codexin read-only/workspace-write-hiekkalaatikko; Claudessa plan/acceptEdits, vain luku-/muokkaustyökalut ja luvitusta vaativien toimien automaattinen esto. Claude-ajuri ei tarjoa Bash-työkalua. Tiedostorajaus tarkistetaan Git-muutoksista ajon jälkeen; se ei ole erillinen käyttöjärjestelmän turvaraja. Ajuri ei välitä MCP-avaintaan lapsen ympäristöön. Enintään 12 CLI-ajoa tunnissa/jäsen; heartbeat 15 s, vuokra 120 s.

Koordinaattorin automaattinen työnjako on oletuksena pois. Salli `.env.coordinator`-tiedostossa kaikki kolme listaa ja käynnistä koordinaattori uudelleen samalle MCP-kannalle:

```dotenv
TEAM_COORDINATOR_WORKERS=daniel-codex-runner,aleksi-codex-runner,aleksi-claude-runner
TEAM_COORDINATOR_DISPATCH_SENDERS=daniel-chatgpt
TEAM_COORDINATOR_DISPATCH_PATHS=docs,services/team-mcp
```

Lähetä sitten koordinaattorille suora viesti, jonka otsikko alkaa `[DELEGATE]`. Kerro tavoite, tiedostorajaus ja valmistumiskriteeri. Vain listattu lähettäjä voi pyytää työnjakoa; koordinaattori tekee enintään kolme erillistä luovutusta listatuille jäsenille ja vapaille sallituille poluille. Virheellinen tai päällekkäinen suunnitelma peruutetaan kokonaan. Runner palauttaa työn tarkistukseen; koordinaattori käsittelee varmennetun tulosviestin ja vastaa alkuperäiselle pyytäjälle. Tulos ei käynnistä uusia luovutuksia. API-kutsujen tuntiraja koskee myös tulosten käsittelyä; API-jonossa on enintään viisi avointa pyyntöä/pyytäjä ja 100 yhteensä. Yli 15 minuutin Retry-After antaa virhekuittauksen automaattisen varhaisen uusinnan sijaan.

```bash
npm test
```

Testit käyttävät oikeaa MCP SDK -asiakasta, paikallisia HTTP-yhteyksiä ja erillistä SQLite-kantaa. Niissä testataan kahden avustajatunnisteen keskustelu, koko yhteistyöketju (varaus, este, luovutus, vastaanotto, valmis) sekä MCP:n että komentorivin kautta, private/broadcast-erottelu, idempotenssi, projektirajaus, tiedostovarausten konfliktit, vanheneminen ja uudelleenkäynnistys sekä OAuth discovery, PKCE, consent/CSRF, refresh rotation ja revokointi. Koordinaattoritesteissä käytetään simuloitua OpenAI-palvelua: pysyvä jono, kahden prosessin kilpailu, Retry-After, kutsuraja, peruminen ja vastaus vain kerran. Oikeaa OpenAI-ajoa tai tiimiläisten kirjautumista ei tehdä automaattitesteissä. Valinnainen `npm run check:dashboard` tarkistaa käyttöpolun Chromiumissa; se vaatii erikseen asennetun Playwrightin (`AIMO_PLAYWRIGHT_MODULE`) ja Chromiumin (`AIMO_CHROMIUM_PATH`).

Viralliset lähteet: [MCP SDK ja Streamable HTTP](https://ts.sdk.modelcontextprotocol.io/server), [ChatGPT-liittimien OAuth](https://developers.openai.com/plugins/build/auth), [Clauden remote MCP -liittimet](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
