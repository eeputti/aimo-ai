# Team MCP:n OpenAI-koordinaattori

Tämä on yhteiseen tarkistukseen julkaistu ensimmäinen toteutus. Aleksin Codex viimeistelee käyttöönottodokumentin ja Aleksin Claude tarkistaa työjonon/OpenAI-kytkennän erillisellä työvarauksella. Nykyistä palvelinkonetta ei ole päivitetty eikä oikeaa OpenAI-kutsua tehty.

## Toteutettu toiminta

- Erillinen Node-prosessi seuraa saman SQLite-kannan tapahtumia kahden sekunnin välein. Se voidaan käynnistää nykyisen MCP-tunnelin rinnalle, ilman tunnelin sulkemista.
- Paikallinen tilannenäkymä `http://127.0.0.1:4752` vaatii oman tiimiavaimen. Näkymä erottaa viimeisen MCP-yhteyden ja raportoidut tehtävät; avain säilyy vain välilehden muistissa.
- Palvelutunniste `team-coordinator` luodaan automaattisesti. Sen avainta ei tulosteta. Palvelutunnisteeksi ei voi ottaa olemassa olevaa ihmisen tunnistetta.
- Vain tälle palvelutunnisteelle osoitettu suora projektiviesti tuottaa API-työn. Yhteiset viestit ja muiden yksityisviestit eivät käynnistä mallia. Vastaus palautuu pyytäjän MCP-postilaatikkoon.
- Oletuksena `observe`: seuraa ja jonottaa ilman mallikutsuja. `openai` vaatii yksityiset `OPENAI_API_KEY`- ja `TEAM_COORDINATOR_MODEL`-asetukset.
- OpenAI-agentti arvioi ilmoitettua työtä ja vastaa pyyntöön. Sillä ei ole tiedostojen, Gitin, shellin tai julkaisun työkaluja. Tavalliset ChatGPT-/Claude-keskustelut eivät herää taustalla.

## Käynnistys palvelinkoneella

Käytä samaa projektikansiota ja `TEAM_MCP_DB`-kantaa kuin yhteinen MCP-palvelin. Päivitä koodi oman työpuun Git-ohjeiden mukaan. Avaa toinen PowerShell projektin juureen:

```powershell
Copy-Item services/team-mcp/.env.coordinator.example services/team-mcp/.env.coordinator
npm.cmd --prefix services/team-mcp run coordinator
```

Kopioi pohja vain ensimmäisellä kerralla, jos `.env.coordinator` ei ole vielä olemassa. Oletus on seurantatila. OpenAI-käytössä muokkaa yksityistä `services/team-mcp/.env.coordinator`-tiedostoa:

```dotenv
TEAM_COORDINATOR_MODE=openai
TEAM_COORDINATOR_MODEL=gpt-4.1-mini
OPENAI_API_KEY=<oma-api-avain-vain-paikalliseen-tiedostoon>
```

Tämän jälkeen käynnistä koordinaattori uudelleen. Nykyinen MCP-tunneli voi jatkaa toimintaansa. Jonossa olevat työt alkavat käsittelyyn API-tilan käynnistyessä. Mallin pitää olla käytettävissä omalla OpenAI API -tilillä ja tukea Responses API:n structured outputs -vastauksia. ChatGPT-tilaus ei korvaa API-avainta.

Oletusraja on 12 yritystä/tunti/projekti/palvelutunniste, enintään kolme yritystä/työ, yksi työ kerrallaan ja 100 odottavaa työtä. Kutsun aikaraja on 45 s. Retry-After huomioidaan. Työt, tapahtumakursori ja tuntiraja säilyvät kannassa restartin yli. Työvuokran versio estää vanhaa työntekijää julkaisemasta vastausta toisen otettua työn. Vastaus ja työn valmistuminen tallennetaan samassa transaktiossa. Verkkokatkon uusinta voi silti tehdä toisen laskutettavan mallikutsun.

Nykyiset MCP-työkalut riittävät viestipyyntöihin ja työraportteihin. Uusi `get_agent_activity` vaatii MCP-palvelimen koodin hallitun uudelleenkäynnistyksen sekä tarvittaessa liittimen työkaluluettelon päivityksen. Pelkkä koordinaattorin käynnistys ei päivitä vanhaa MCP-prosessia; aiemmista tehtäväraporteista saa silti tilannekuvan. Myöhempi MCP-tunnelin restart vaihtaa satunnaisen osoitteen.

## Tarkistukset

`npm --prefix services/team-mcp test` sekä valinnainen `npm --prefix services/team-mcp run check:dashboard` (vaatii asennetun Playwrightin, `AIMO_PLAYWRIGHT_MODULE` ja Chromiumin). Kokeet käyttävät erillisiä kantoja ja simuloitua OpenAI-palvelua; ne eivät soita oikeaan APIin. Tarkempi lopullinen käyttöönotto- ja vianrajausohje viimeistellään rinnakkaistyössä.
