# Tiimin OpenAI-koordinaattori

Koordinaattori on **valinnainen erillinen prosessi** yhteisen Team MCP -palvelimen palvelinkoneella. Se seuraa saman SQLite-kannan projektiviestejä ja voi vastata yksityisiin, suoraan palvelutunnisteelle `team-coordinator` lähetettyihin pyyntöihin. Se ei korvaa MCP-palvelinta tai tunnelia.

## Käyttöönotto palvelinkoneella

1. Päivitä projektin koodi sovitusti ja varmista, että Node.js on vähintään 22.13. Aja kaikki komennot siinä samassa projektikloonissa ja samalla palvelinkoneella kuin nykyinen Team MCP.
2. Aseta tarvittaessa `services/team-mcp/.env`-tiedostoon käytössä olevan MCP:n `TEAM_MCP_DB`-kanta. Jos käytössä on oletuspolku, asetus voidaan jättää pois. Koordinaattori lukee myös saman palvelun `.env`-tiedoston.
3. Kopioi asetuspohja turvallisesti vain, jos yksityistä tiedostoa ei vielä ole:

   ```powershell
   $coordinatorEnv = 'services/team-mcp/.env.coordinator'
   if (-not (Test-Path $coordinatorEnv)) {
       Copy-Item services/team-mcp/.env.coordinator.example $coordinatorEnv
   }
   ```

   Komento ei ylikirjoita olemassa olevaa asetusta. Tiedosto on gitignored. Jos koordinaattori käyttää eri polkua kuin MCP, aseta sama absoluuttinen `TEAM_MCP_DB` molempiin ympäristöihin.
4. Käynnistä ensin turvallinen tarkkailutila nykyisen tunnelin rinnalle:

   ```powershell
   npm.cmd --prefix services/team-mcp run coordinator
   ```

   `observe`-tilassa tapahtumat kirjataan ja suorat pyynnöt jonotetaan, mutta mallia ei kutsuta. Prosessi tulostaa tilannenäkymän osoitteen `http://127.0.0.1:4752`. Näkymä on vain palvelinkoneen localhostissa eikä tunnelissa.
5. Tarkista kirjautuminen omalla Team MCP -jäsenavaimellasi. Avain tarkistetaan palvelimen kantaa vasten eikä sitä tallenneta selaimen local/session storageen; näkymä hakee tilannetiedon kahden sekunnin välein samalla muistissa olevalla avaimella. Koko sivun uudelleenlataus vaatii avaimen syöttämisen uudelleen.
6. Kun haluat ottaa vastaukset käyttöön, pysäytä prosessi Ctrl+C:llä ja muokkaa `.env.coordinator`-tiedostoa. Aseta yksityisesti `TEAM_COORDINATOR_MODE=openai`, `OPENAI_API_KEY` ja `TEAM_COORDINATOR_MODEL`. Mallin pitää tukea OpenAI Responses API:n `text.format`-kentän tiukkaa JSON Schema / Structured Outputs -muotoa. Esimerkin `gpt-4.1-mini` on asetusesimerkki; käytä tililläsi saatavilla olevaa tuettua mallia. Käynnistä sama komento uudelleen. OpenAI-tila käsittelee myös jo jonossa olevat pyynnöt. Älä kirjoita avainta komentoriville, projektiviestiin tai Gitiin.

Koordinaattori luo tarvittaessa palveluidentiteetin `team-coordinator` vain, jos sama tunniste ei ole aiemmin varattu tavalliselle jäsenelle. Se saa oikeuden vain asetettuun projektiin. Jos tunniste on jo tavallisen jäsenen käytössä, käynnistys pysähtyy; älä kierrätä tai poista toisen jäsenen tunnistetta.

## Pyynnön lähetys ja seuranta

Lähetä Team MCP:n `send_message`-työkalulla suora viesti vastaanottajalle `team-coordinator`. Anna yksilöllinen `requestKey`, selkeä tavoite ja tarvittava, projektissa jo jaettu konteksti. Esimerkiksi:

```json
{
  "project": "aimo-ai",
  "recipient": "team-coordinator",
  "subject": "Tarkista seuraava toteutusaskel",
  "body": "Lue tämän projektin tilanne ja ehdota riippuvuuksien perusteella seuraava rajattu askel. Älä pyydä salaisuuksia.",
  "requestKey": "koordinaattori-seuraava-askel-20261114-01"
}
```

Koordinaattorin vastaus tulee yksityisesti pyytäjän MCP-postilaatikkoon. Lue se `read_messages`-työkalulla ja kuittaa vasta käsittelyn jälkeen `ack_messages`-työkalulla. Jos työ ei pääse jonoon tai yritykset loppuvat pysyvään virheeseen, saat myös yksityisen virhekuittauksen, jossa on virhekoodi ja ohje pyytää ylläpitäjää tarkistamaan tila. Dashboardin **Omat API-työpyynnöt** näyttää vain kirjautuneen jäsenen omat pyynnöt ja vastaukset. Muiden jäsenten yksityisiä pyyntöjä ei näytetä.

Koordinaattori ei vastaa yleisiin projektiviesteihin eikä muiden jäsenten suoriin viesteihin. Jos ilmoitat työn estyneeksi `report_progress`-työkalulla, aseta `blockedOn: "team-coordinator"`, niin koordinaattori voi analysoida esteen ja lähettää ehdotuksen suoraan sinulle. Esimerkiksi:

```json
{
  "project": "aimo-ai",
  "taskId": "oman-tehtävän-tunniste",
  "expectedRevision": 2,
  "status": "blocked",
  "blockedOn": "team-coordinator",
  "note": "Mitä yritin, mitä havaitsin ja mihin tarvitsen neuvoa."
}
```

Se ei muuta tehtävän omistajaa tai varauksia. Lue vastaus myöhemmin `read_messages`-työkalulla; saapuva viesti ei herätä keskusteluasi.

### Kopioitava ohje agenttichatin projektiohjeisiin

> Käytä Team MCP:tä omalla tunnisteellasi. Koordinaattorilta pyydetään neuvoa lähettämällä suora `send_message` vastaanottajalle `team-coordinator`, tai raportoimalla oman tehtävän este `report_progress`-työkalulla ja asettamalla `blockedOn: "team-coordinator"`. Kerro viestissä olennaiset havainnot ja täsmällinen kysymys; älä sisällytä salaisuuksia. Lue vastaus `read_messages`-työkalulla seuraavalla työvuorolla. MCP-viesti ei herätä tätä keskustelua, joten älä oleta vastausta heti näkyväksi äläkä jää jatkuvaan kyselysilmukkaan.

## Mitä tilannenäkymä tarkoittaa

Jäsenen viimeisin MCP-yhteydenotto (`lastSeen` / työkalun nimi) kertoo vain, että tunnisteella tehtiin MCP-työkalukutsu kyseiseen aikaan. Lukutyökalut alkavat päivittää tätä tietoa vasta MCP-palvelimen hallitun uudelleenkäynnistyksen jälkeen. Se ei osoita, että sama chat tai agentti-istunto on yhä käynnissä. Yhdellä tunnisteella voi olla useita chatteja. `lastReport`, tehtävä ja tiedostovaraus ovat avustajan ilmoittamia tilatietoja; voimassa oleva varaus ei yksin todista aktiivista työskentelyä.

Koordinaattorin `online` tarkoittaa vain, että sen prosessi on päivittänyt syketietonsa viimeisen kymmenen sekunnin aikana. Se ei kerro OpenAI-palvelun saatavuudesta tai onnistuneesta pyynnöstä. Työpyynnön tila ja viimeisin virhekoodi näkyvät dashboardissa.

Uusi MCP-työkalu `get_agent_activity` tuo jäsenkohtaiset viimeiset yhteydenotot ja koordinaattorin tilanteen. Se **ei ole käytettävissä vanhassa jo käynnissä olevassa MCP-prosessissa**. Sen käyttöönotto vaatii ylläpitäjän hallitun MCP-palvelimen uudelleenkäynnistyksen ja asiakkaiden liitännän työkalulistan päivityksen/refreshin. Nykyiset `whoami`, `get_project_state`, `send_message`, `read_messages`, tehtävä- ja tilanneraporttityökalut toimivat vanhassa prosessissa jo ennen tätä.

## Rajat ja vianrajaus

- API-agentti saa sille osoitetun pyynnön sekä rajatun projektikontekstin: yhteenvedon (enintään 4000 merkkiä) ja enintään 40 tehtävän tunnisteen, otsikon, omistajan, tilan, raporttimuistiinpanon (enintään 800 merkkiä), commit-viitteen ja vuokran vanhentumistiedon. Muiden käyttäjien suoria pyyntöjä, vastauksia tai koko keskusteluhistoriaa ei välitetä mallille.
- Mallilla ei ole shelliä, selainta, tiedostojärjestelmää, GitHub-kirjoituksia, tehtävänhallintatyökalua tai palvelimen hallintaoikeutta. Se voi analysoida ja ehdottaa, mutta ei muokkaa koodia, varaa tehtävää, aja testejä tai ota palvelua käyttöön.
- Vastaus tulee vain pyytäjän postilaatikkoon. MCP-viesti ei herätä vastaanottajan ChatGPT-/Claude-keskustelua eikä takaa välitöntä lukemista. Kuluttajachatit eivät käynnisty automaattisesti.
- Oletusraja on 12 malliyritystä tunnissa projektia ja palvelutunnistetta kohti, enintään kolme yritystä yhdelle työlle ja yksi työ kerrallaan. Enintään 100 pyyntöä voi olla jonossa tai käsittelyssä; rajan ylittävä pyyntö saa `QUEUE_FULL`. Käytä yksilöllistä pyyntöavainta, älä lähetä samaa pyyntöä jatkuvasti uudelleen.
- Mallikutsu aikakatkaistaan 45 sekunnissa. Verkkovirhe ja HTTP 429/5xx voidaan yrittää uudelleen; `Retry-After`-arvo huomioidaan. Kolmen yrityksen jälkeen työ päättyy virheeseen ja siitä lähetetään yksityinen virhekuittaus. Täysi jono tuottaa yksityisen virhekuittauksen `QUEUE_FULL`, kun koordinaattori lukee pyynnön. Jos haluat yrittää itse uudelleen, lähetä uusi viesti uudella `requestKey`-arvolla vasta kun olet tarkistanut virhekuitin. Uusinta voi aiheuttaa toisen laskutettavan API-kutsun, jos ensimmäinen ehti OpenAIhin ennen verkkokatkoa.
- `Port 4752 is already in use`: toinen dashboard/koordinaattori on jo käynnissä. Älä käynnistä toista rinnalle; tarkista palvelinkoneen prosessi.
- "OpenAI mode requires…": `openai`-tila tarvitsee molemmat yksityiset asetukset `OPENAI_API_KEY` ja `TEAM_COORDINATOR_MODEL`.
- "Coordinator id belongs to an existing human member": tunniste on varattu tavalliselle jäsenelle. Älä poista tai nimeä häntä uudelleen; pyydä ylläpitäjää ratkaisemaan tunnistevalinta.
- Pyyntö ei näy: varmista sama `TEAM_MCP_DB`, projekti ja `team-coordinator`-vastaanottaja. `observe`-tilassa pyyntö jonoutuu mutta mallivastausta ei synny.
- `OPENAI_HTTP_401` / `OPENAI_HTTP_403`: tarkista API-avaimen kelpoisuus ja mallin käyttöoikeus palvelinkoneen yksityisistä asetuksista. Älä tulosta avainta diagnostiikkaan.
- `INVALID_AGENT_OUTPUT`: valittu malli tai sen vastaus ei täyttänyt odotettua JSON Schema -muotoa. Valitse Responses API:n Structured Outputsia tukeva malli.
- Jos dashboard ei avaudu, tarkista että koordinaattoriprosessi käynnistyi ja kuuntelee portissa 4752. Osoite `127.0.0.1` viittaa palvelinkoneeseen, ei omaan työasemaan.

Prosessin pysäytys Ctrl+C:llä sulkee vain koordinaattorin ja dashboardin. Nykyinen MCP-palvelin ja tunneli jatkavat toimintaansa.

## Varmennus

Palvelun testit: `npm --prefix services/team-mcp test`. Valinnainen selainkoe: `npm --prefix services/team-mcp run check:dashboard`; se vaatii asennetun Playwrightin (`AIMO_PLAYWRIGHT_MODULE`) ja Chromiumin (`AIMO_CHROMIUM_PATH`). Automaattitestit käyttävät erillisiä kantoja ja simuloitua OpenAI-palvelua. Oikeaa API-avainta tai maksettuja mallikutsuja ei tarvita niiden ajamiseen.

Tekninen rajapinta: [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
