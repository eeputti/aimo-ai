# AleksiCodex: koordinaattorin käyttöönotto-ohje

## Tehty

- Viimeistelty docs/team-coordinator.md erilliselle palvelinprosessille: sama SQLite-kanta ja nykyinen MCP/tunneli, ensin observe, sitten valinnainen OpenAI-tila, salaisuuksien käsittely, localhost-dashboard, viestin lähetys/vastaus ja vianrajaus.
- Lisätty turvallinen PowerShell-asetuspohjan kertakopiointi, saman TEAM_MCP_DB-kannan ohje, esimerkit suoralle pyynnölle ja blockedOn: team-coordinator -esteelle sekä kopioitava ohje agenttichattien projektiohjeisiin.
- Täsmennetty, että paikallaolo on viimeisin työkalukutsu eikä elävä agentti-istunto; raportit ja varaukset ovat itse ilmoitettuja.
- Erotettu vanhan käynnissä olevan MCP-prosessin nykyiset send_message/read_messages/report_progress-työkalut uudesta get_agent_activity-työkalusta, joka vaatii hallitun MCP-restartin ja liittimen työkaluluettelon refreshin.
- Lisätty yksityinen virhekuittaus jonon täyttymisestä ja pysyvästi epäonnistuneesta pyynnöstä. Virhekäyttäytyminen tarkistettiin c71d3a3-commitista; se on etähaaran commitissa de5b509.

## Tarkistukset

- Lähdekoodista tarkistettu käynnistyskomento, ympäristöasetukset, palvelutunnisteen luontirajat, OpenAI Responses / strict JSON Schema -pyyntö, oletuskiintiö, dashboardin loopback-sidonta ja jäsenavaimella tunnistautuminen, yksityiset onnistumis- ja virhevastauspolut, blockedOn-reitti sekä MCP-työkalujen rekisteröinti.
- Palvelun alkuperäisessä commitissa d2c899a raportoitiin 38/38 testiä sekä valinnainen Chromium-koe. Danielin uudessa c71d3a3-koodipäivityksessä raportoitiin 39/39 testiä ja Chromium-koe. Näitä ei ajettu uudelleen tässä dokumentointitehtävässä.
- Ei tehty oikeita API-kutsuja, avain- tai ympäristömuutoksia, palvelinrestartia tai sovelluskoodimuutoksia.
- Git status/diff estyi Codexin hallitussa worktreessä: git ilmoittaa 'fatal: this operation must be run in a work tree'. Dokumenttien tarkka sisältö toimitettiin Danielille MCP-viesteissä integraatiota, linkki- ja diff-tarkistusta sekä GitHub-pusha varten. AleksiCodex ei tehnyt committia tai pushia.

## Rajat ja seuraava askel

- Dokumentaatio ei käyttöönota prosessia eikä osoita, että palvelinkoneella on API-avain, OpenAI-tili tai malli käytettävissä.
- Työ tehtiin erillisessä worktreessä pohjasta d2c899a. Alkuperäisen yhteisen työpuun docs/PROJECT_REVIEW.md jätettiin koskematta.
- Daniel integroi vain nämä kaksi dokumenttia, kirjaa työvaiheen TYOLOKI.md:hen ja hoitaa pushin oman Git-kirjoitusoikeutensa mukaisesti.

## Danielin integraatiotarkistus

- Vastaanotettu Aleksin Codexin lopullinen teksti MCP-viesteissä 53–54 ja tehtävä luovutettu takaisin ennen muokkausta. Daniel otti tehtävän vastaan omassa pilvikloonissaan; Aleksin alkuperäiseen Windows-työpuuhun ei koskettu.
- Säilytetty Aleksin käyttöohje ja korjattu sovitusti avaimen säilyminen automaattisessa kahden sekunnin päivityksessä, `services/team-mcp/.env`-polku, mallille välitettävän rajatun projektikontekstin tarkka sisältö, palvelutunnisteen virheteksti ja jonon virhekuittauksen ajoitus. Lisätty muistutus vanhojen jonotöiden käsittelystä API-tilaan siirryttäessä sekä testien käynnistysohje.
- Lähdekoodi tässä vaiheessa: c71d3a3 / main de5b509. Sen 39/39 testiä ja Chromium-koe on ajettu Danielin ympäristössä. Docker-image rakennettu nykyisestä Dockerfilestä CA-tarkistus säilyttäen; dashboard-assetit, ei-root-käyttäjä, jäsenavaimella tunnistautuminen ja saman työjonon säilyminen erillisten konttiajojen välillä varmennettu omalla testilevyllä. Testikontit ja levy poistettu. Ei oikeita mallikutsuja tai käyttäjän palvelimen muutoksia.
- Integrointidiff, dokumenttien linkit ja JSON-esimerkkien jäsennys tarkistettu. Aleksin Claude -tarkistus on erillinen tehtävä; sen valmistumista ei päätellä tästä dokumentaatiotyöstä.
