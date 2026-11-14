# Liity tiimin MCP-palvelimeen

Danielin, Eeliksen, Aleksin ja Peetun Claude- ja ChatGPT-avustajat käyttävät samaa projektipostilaatikkoa, tehtävävarauksia ja tilannekuvaa. Jokaisella avustajayhteydellä on oma tunniste ja tiimiavain.

## Yhteinen osoite

**Lisää MCP-liittimeen tämä koko osoite:**

**<https://bench-butter-save-marsh.trycloudflare.com/mcp>**

Osoite on tilapäinen Cloudflare-tunneli, tarkistettu palvelimen OAuth-metatiedoista 14.11.2026. Palvelinkoneen ja tunnelin terminaalin pitää olla käynnissä. Jos tunneli käynnistetään uudelleen, ylläpitäjä päivittää uuden osoitteen tähän ohjeeseen ja projektin README:n Tiimin yhteinen MCP -kohtaan. Jokainen yhdistää liittimensä uudelleen.

Osoite kuuluu MCP-liittimen URL-kenttään. Palvelimen juuriosoite ei tarjoa erillistä tiimin verkkosivua. Projektin koodi ja ohjeet löytyvät [aimo-ai-repositoriosta](https://github.com/eeputti/aimo-ai).

## Oma tunniste ja avain

Nämä kahdeksan tunnistetta löytyivät yhteisen palvelimen jäsenrekisteristä 14.11.2026:

| Henkilö | Claude | ChatGPT |
| --- | --- | --- |
| Daniel | `daniel-claude` | `daniel-chatgpt` |
| Eelis | `eelis-claude` | `eelis-chatgpt` |
| Aleksi | `aleksi-claude` | `aleksi-chatgpt` |
| Peetu | `peetu-claude` | `peetu-chatgpt` |

Pyydä ylläpitäjältä oman avustajasi **tiimiavain yksityisesti**. Claude ja ChatGPT käyttävät eri avainta. Avaimia ei tallenneta tähän ohjeeseen, GitHubiin tai MCP:n projektiviesteihin. Jäsenen olemassaolo ei vielä tarkoita, että hänen avustajansa on yhdistetty.

## Yhdistä ChatGPT

1. Avaa [ChatGPT selaimessa](https://chatgpt.com) ja valitse oikea työtila.
2. Avaa **Plugins / Lisäosat → + → Add custom MCP server**. Anna nimeksi **Aimo Team MCP**.
3. Syötä yllä oleva koko `/mcp`-osoite yhteyden HTTPS URL -kenttään ja valitse **OAuth**. Cloudflare-linkki syötetään URL-kenttään; käyttöliittymän mahdollinen **Tunnel**-vaihtoehto tarkoittaa OpenAI:n erillistä Secure MCP Tunnel -toimintoa.
4. Hyväksy käyttöliittymän ilmoitus oman palvelimen lisäämisestä ja valitse **Create as a plugin**. Avautuvalla Team MCP -kirjautumissivulla syötä oma tiimiavaimesi ja paina **Salli yhteys**. Viimeistele liittimen luonti/asennus käyttöliittymässä.
5. Avaa uusi keskustelu ja valitse liitin kirjoittamalla `@` ja valitsemalla **Aimo Team MCP** tai sille antamasi nimi.

Valikot ja oikeudet riippuvat tilistä ja työtilasta. Vanhemmassa käyttöliittymässä polku on **Settings → Apps → Create**. OpenAI:n ohjeen mukaan täysi MCP-tuki, kuten viestien lähettäminen ja tehtävien varaaminen, edellyttää Business- tai Enterprise/Edu-tukea ja työtilan tarvittavia oikeuksia; Prossa tuki on rajattu read/fetch-toimintoihin. Jos lisäystoiminto puuttuu, tarkista työtilan oikeudet ja [OpenAI:n ajantasainen ohje](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## Yhdistä Claude

1. Avaa Claude ja mene **Settings → Connectors → Add custom connector**.
2. Anna nimeksi **Aimo Team MCP** ja URL-osoitteeksi yllä oleva koko `/mcp`-osoite.
3. Yhdistä liitin. Syötä Team MCP:n kirjautumissivulle oma **Claude-tunnisteesi avain** ja paina **Salli yhteys**.
4. Ota liitin käyttöön kyseisessä keskustelussa. Toiminnon saatavuus riippuu Clauden tilauksesta ja työtilan asetuksista: [Clauden remote MCP -ohje](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Tarkista yhteys

Lähetä omaan avustajaasi:

> Käytä Aimo Team MCP:n whoami-työkalua. Kerro tunnisteeni ja käytettävissä olevat projektit. Lue sitten get_project_state-työkalulla projektin aimo-ai tilanne.

Tuloksen pitää vastata yllä olevan taulukon omaa tunnistettasi. Projektina pitää olla `aimo-ai`. Jos tunniste kuuluu toiselle henkilölle tai toiselle avustajalle, yhdistä liitin uudelleen oikealla avaimella.

Viestitesti esimerkiksi Eeliksen Claudesta Danielin ChatGPT:lle:

> Lähetä Aimo Team MCP:n send_message-työkalulla projektiin aimo-ai jäsenelle daniel-chatgpt viesti "Yhteystesti Eeliksen Claudesta". Käytä tälle viestille uutta yksilöllistä requestKey-arvoa. Kerro, onnistuiko lähetys.

Vastaanottaja pyytää omassa keskustelussaan:

> Lue Aimo Team MCP:n read_messages-työkalulla projektin aimo-ai viestit.

Viestin lähettäminen ei herätä vastaanottajan keskustelua. Hänen avustajansa lukee viestit seuraavan työkalukutsun yhteydessä.

## Käytä palvelua projektityössä

Lisää [avustajien yhteiset ohjeet](../services/team-mcp/AGENT-INSTRUCTIONS.md) molempien avustajiesi projektiohjeisiin. Työn alussa luetaan tunniste, projektitilanne ja viestit; työ ja tiedostot varataan ennen muokkaamista. Valmis työ raportoidaan pushatun Git-commitin kanssa. Noudata myös [AGENTS.md](../AGENTS.md):n työnjakoa ja Git-ohjeita.

Koodin ajantasainen versio ja työloki ovat GitHubissa. MCP välittää projektiviestit ja varaukset; se ei automaattisesti siirrä koodia muiden koneille tai keskustelukontekstia avustajien välillä.

## Ylläpitäjälle: avaimet ja tunnelin käynnistys

Kaikki komennot ajetaan **sillä koneella ja siinä projektikansiossa, jossa yhteinen MCP-palvelin käyttää kantaansa**. Toisen koneen klooniin luotu avain ei toimi tämän tunnelin kautta.

Jäsenet on jo luotu. Jos oma avain katosi, avaa toinen PowerShell projektin juureen ja vaihda vain kyseisen jäsenen avain, esimerkiksi:

```powershell
npm.cmd --prefix services/team-mcp run admin -- rotate-key --id eelis-claude
```

Komento näyttää uuden avaimen terminaalissa ja mitätöi kyseisen jäsenen vanhat OAuth-yhteydet. Toimita uusi avain vain jäsenelle yksityisesti. Samalla tavalla voi käyttää tunnisteita `eelis-chatgpt`, `aleksi-claude`, `aleksi-chatgpt`, `peetu-claude` ja `peetu-chatgpt`. Olemassa olevaa jäsentä ei luoda uudelleen `add-member`-komennolla.

Jäsenlista ilman avaimia:

```powershell
npm.cmd --prefix services/team-mcp run admin -- list-members
```

Jos palvelin ja tunneli ovat pysähtyneet, käynnistä ne projektin juuresta:

```powershell
npm.cmd --prefix services/team-mcp run tunnel
```

Pidä terminaali auki ja päivitä sen tulostama uusi **MCP-osoite** tämän ohjeen alkuun sekä projektin README:n Tiimin yhteinen MCP -kohtaan. Kaikki käyttävät samaa osoitetta. Älä käynnistä toista tunnelia jo toimivan rinnalle. Tarkemmat asennus- ja palvelinasetukset: [Team MCP:n README](../services/team-mcp/README.md).
