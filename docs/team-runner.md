# Paikallinen heräteajuri (runner): käyttöohje

> **Tila 14.11.2026:** tämä ohje on kirjoitettu toteutussopimuksen [`runner-contract.md`](runner-contract.md) perusteella. Ajurin koodi ei ollut vielä haarassa `work/local-runner` (pohja `454ad1b`), kun ohje kirjoitettiin. Merkinnällä **[varmistetaan koodista]** merkityt komennot, muuttujat ja polut korvataan todellisilla nimillä, kun toteutus on haarassa. Ohje ei väitä ajuria testatuksi tai käyttöönotetuksi.

## Mitä ajuri tekee ja mitä ei

Heräteajuri on omalla koneellasi pyörivä taustaprosessi. Se kuuntelee yhteistä Team MCP:tä **omalla erillisellä tunnisteellaan**. Kun sille luovutetaan tehtävä (`handed_off`) sallitulta lähettäjältä, ajuri tekee seuraavat vaiheet:

1. Varaa tehtävän ja sen tiedostot atomisesti (`runner_claim_task`). Kahdesta samanaikaisesta ajurista vain toinen voi aloittaa.
2. Luo tehtävälle oman Git-työpuun ja haaran.
3. Käynnistää paikallisen Codex CLI:n tai Claude Coden ei-interaktiivisesti siinä työpuussa. Tehtävän teksti annetaan stdinissä.
4. Uusii varausta ajon aikana (`runner_heartbeat`).
5. Palauttaa tuloksen alkuperäiselle lähettäjälle **tarkistettavaksi** (`runner_finish`): onnistui, estyi tai keskeytyi, muistiinpano ja valinnainen commit.

Ajuri **ei** tee näitä asioita:

- Ei herätä selaimessa auki olevaa ChatGPT- tai Claude-keskustelua. Kuluttajachatit lukevat viestit vasta, kun käyttäjä pyytää. Ajuri käynnistää vain koneelle asennetun komentorivityökalun.
- Ei yhdistä, pushaa mainiin tai julkaise mitään automaattisesti. Tulos jää omaan haaraansa ihmisen tarkistettavaksi.
- Ei ohita CLI:n luvituksia tai hiekkalaatikkoa (ei `--dangerously-skip-permissions`- tai `bypassPermissions`-tilaa).
- Ei ota vastaan tehtäviä, joita ei ole nimenomaisesti luovutettu sen tunnisteelle, eikä tavallisia viestejä.

## Ennen asennusta

### 1. Palvelimen pitää tuntea runner-työkalut

Ajuri tarvitsee yhteiseltä MCP-palvelimelta kolme uutta työkalua: `runner_claim_task`, `runner_heartbeat` ja `runner_finish`. Nykyinen, jo käynnissä oleva MCP-prosessi ei tunne niitä. **Palvelimen ylläpitäjän (nyt Daniel) pitää päivittää ja käynnistää MCP-palvelin hallitusti uudelleen** ennen kuin yksikään ajuri otetaan käyttöön. Ajuri tarkistaa työkalut ja niiden skeemat käynnistyessään ja pysähtyy, jos ne puuttuvat. Se ei siirry hiljaa vanhaan varaustapaan.

### 2. Oma identiteetti ja jäsenavain ajurille

Älä käytä ajurille samaa tunnistetta kuin omalla chatillasi (esim. `aleksi-claude`). Erillinen tunniste pitää lokit, varaukset ja oikeudet erillään, ja sen avaimen voi perua koskematta chattiyhteyteen.

Ylläpitäjä luo ajurille jäsenen palvelinkoneella:

```powershell
npm.cmd --prefix services/team-mcp run admin -- add-member --id aleksi-runner --name "Aleksi / runner" --projects aimo-ai
```

Avain näytetään vain kerran ylläpitäjän terminaalissa. Se toimitetaan sinulle yksityisesti, ei projektiviestinä, GitHubissa tai tavallisessa chatissa. Avaimen voi uusia (`rotate-key`) tai perua (`revoke-member`), kuten muidenkin jäsenten avaimet ([team-mcp-join.md](team-mcp-join.md)).

### 3. CLI asennettuna ja kirjautuneena etukäteen

Ajuri ei kirjaudu puolestasi. Kirjaudu käyttämääsi työkaluun samalla Windows- tai Linux-käyttäjällä, jolla ajuri ajetaan:

| Työkalu | Tarkistus | Kirjautuminen |
|---|---|---|
| Claude Code | `claude --version`, `claude auth status --text` | `claude auth login` |
| Codex CLI | `codex --version` | `codex login` **[varmistetaan omasta CLI:stä]** |

Huomio Windowsista: Codexin työpöytäsovellus (Microsoft Store, `OpenAI.Codex`) ei asenna `codex`-komentoa PATHiin. Ajuri tarvitsee erikseen asennetun Codex CLI:n. Claude Coden natiiviasennus on suoraan ajettava `claude.exe` (`%USERPROFILE%\.local\bin`), joten npm-käärettä ei tarvita. Jos jokin CLI on asennettu npm:llä, ajuri ratkaisee käärettä vastaavan paketin Node-entrypointin eikä käynnistä komentotulkkia.

Puuttuva CLI tai kirjautuminen on käyttöönoton este. Sitä ei kierretä antamalla ajurille API-avainta tai ohituslippuja.

### 4. Node ja oma klooni

- Node.js vähintään 22.13 (sama kuin projektissa).
- Oma klooni repositoriosta. Ajuri luo työpuut tämän kloonin rinnalle. **Älä osoita ajuria kansioon, jossa itse työskentelet:** päätyöpuuta ei nollata eikä sen haaraa vaihdeta, mutta ajurin Git-toimet ja omat muutoksesi on helpointa pitää eri kansioissa.

```powershell
git clone https://github.com/eeputti/aimo-ai.git $HOME\aimo-runner
cd $HOME\aimo-runner
npm.cmd ci --prefix services/team-mcp
```

```bash
git clone https://github.com/eeputti/aimo-ai.git ~/aimo-runner
cd ~/aimo-runner
npm ci --prefix services/team-mcp
```

## Asetukset: `.env.runner`

Asetukset luetaan Gitin ohittamasta tiedostosta `services/team-mcp/.env.runner`. Mallina toimii `services/team-mcp/.env.runner.example` (Danielin ylläpitämä). **[varmistetaan koodista: muuttujien tarkat nimet]**

| Asetus | Merkitys | Suositus |
|---|---|---|
| MCP-osoite | Sama HTTPS-osoite kuin chattien liittimillä ([team-mcp-join.md](team-mcp-join.md)), tai palvelinkoneella loopback-HTTP | Sama yhteinen osoite. Älä käytä toista tunnelia tai kantaa. |
| Jäsenavain | Ajurin oma avain kohdasta 2 | Vain tässä tiedostossa. Ei ympäristömuuttujana koko käyttäjälle. |
| Projekti | `aimo-ai` | |
| Sallitut lähettäjät | Tunnisteet, joiden luovutuksia ajuri hyväksyy | Esim. `daniel-chatgpt,aleksi-claude`. Älä salli kaikkia. |
| Sallitut polut | Tiedostot ja kansiot, joihin tehtävä saa koskea | Mahdollisimman kapea, esim. `docs/,test/`. Rajojen ulkopuolinen muutos estää onnistumiskuittauksen. |
| CLI | `claude` tai `codex` | |
| Oikeustaso | `read-only` (oletus) tai `workspace-write` | Aloita read-only-tilasta. |
| Aikaraja | Yhden ajon enimmäiskesto | Esim. 30 min |
| Työpuiden kansio | Mihin tehtävien työpuut luodaan | Oman kloonin ulkopuolelle, ei OneDrive-kansioon |

Tiedoston oikeudet: Linuxissa `chmod 600 services/team-mcp/.env.runner`. Windowsissa tiedosto-oikeudet eivät rajaa lukua samalla tavalla (ks. [coordinator-aleksi-claude.md](parallel/coordinator-aleksi-claude.md), L3). Pidä klooni oman käyttäjäprofiilin alla äläkä jaetussa tai synkronoidussa kansiossa.

Ajurin jäsenavainta **ei** välitetä lapsiprosessille (Codex tai Claude). CLI käyttää vain omaa kirjautumistaan.

### Read-only vai workspace-write

- **read-only** (oletus): CLI saa lukea työpuuta ja vastata, mutta ei muokata tiedostoja. Sopii tarkistuksiin, selvityksiin ja raporttiluonnoksiin, jotka palautetaan tehtävän muistiinpanona.
- **workspace-write**: CLI saa muokata tiedostoja omassa työpuussaan CLI:n normaaleilla oikeuksilla. Ajuri tarkistaa lopuksi, että muutokset pysyivät sallituissa poluissa. Komentojen ja verkon käyttöä rajoittavat CLI:n omat asetukset, eivät ajurin ohitukset.

Claude Coden tunnetut ei-interaktiiviset liput tämän version ohjeesta (`claude --help`, 2.1.325): `-p/--print`, `--output-format json|stream-json`, `--permission-mode` (`manual`, `acceptEdits`, `plan`, `dontAsk`, `auto`, `bypassPermissions`), `--permission-prompts none` (kaikki luvitusta vaativa evätään automaattisesti), `--allowed-tools`/`--disallowed-tools`, `--max-budget-usd`, `--no-session-persistence` ja `--restricted`. Ajurin kiinteät argumentit valitsee toteutus **[varmistetaan koodista]**. Read-only-tilaan sopii esimerkiksi `--permission-mode plan` tai `--restricted`, kirjoitustilaan `--permission-mode acceptEdits` yhdessä `--permission-prompts none` -asetuksen kanssa. `bypassPermissions` ja `--dangerously-skip-permissions` eivät ole sallittuja.

`-p`-tilassa Claude Code ohittaa työtilan luottamusdialogin. Ajuri ajaa sen vain omassa työpuussaan, jonka sisältö on projektin repositoriosta.

## Käynnistys

**[varmistetaan koodista: skriptin nimi]** Sopimuksen mukaan:

```powershell
cd $HOME\aimo-runner
npm.cmd --prefix services/team-mcp run runner
```

```bash
cd ~/aimo-runner
npm --prefix services/team-mcp run runner
```

Käynnistyksessä ajuri:

1. lukee `.env.runner`-tiedoston ja kutsuu `whoami`. Väärä tai peruttu tunniste pysäyttää ajurin.
2. tarkistaa, että palvelimella on runner-työkalut oikeilla skeemoilla.
3. ottaa **instanssilukon**. Toinen samalla koneella samoilla asetuksilla käynnistetty ajuri pysähtyy heti. Yksi ajuri tekee yhden työn kerrallaan.
4. sovittaa ajopäiväkirjan (ks. Katkot), ja alkaa sitten pollata rajatulla välillä.

Pysäytys: Ctrl+C. Käynnissä oleva lapsiprosessi pysäytetään hallitusti ja ajo kuitataan keskeytyneeksi, jos yhteys palvelimeen vielä toimii.

### Pysyvä ajo

- **Windows:** Tehtävien ajoitus, käynnistys kirjautuessa, toiminto `npm.cmd` ja argumentit `--prefix services/team-mcp run runner`, aloituskansio klooni. Valitse sama käyttäjä, jolla CLI on kirjautunut. Älä aja SYSTEM-tilinä, koska silloin CLI:n kirjautuminen ja käyttäjäprofiilin oikeudet eivät ole käytössä.
- **Linux:** systemd-käyttäjäpalvelu (`systemctl --user`), `WorkingDirectory=` kloonin polku, `Restart=on-failure`. Ajurin oma instanssilukko estää rinnakkaiset kopiot.

## Tehtävän elinkaari ja ihmistarkistus

1. Sallittu lähettäjä luovuttaa tehtävän ajurin tunnisteelle (`handoff_task`) ja nimeää tiedostot.
2. Ajuri varaa tehtävän. Polkujen pitää olla sallittujen polkujen sisällä ja tiedostojen vapaina.
3. Ajuri luo työpuun ja haaran (nimi sisältää tehtävän ja ajon tunnisteen **[varmistetaan koodista]**) ja ajaa CLI:n aikarajan ja tulosteen kokorajan sisällä.
4. Valmis työ palautetaan lähettäjälle `runner_finish`-kutsulla. Tila on `completed`, `blocked` tai `interrupted`, ja mukana on muistiinpano ja haaran commit. Varaukset vapautuvat samassa kutsussa.
5. **Ihminen tai hänen chattinsa tarkistaa haaran diffin**, ajaa tarvittavat testit ja yhdistää itse. Ajurin onnistumiskuittaus tarkoittaa vain, että ajo päättyi sallituissa rajoissa, ei että muutos olisi oikein.

Ajurin tulosviesti tai tavallinen kysymys ei käynnistä uutta delegointiketjua. Automaattisesta työnjaosta vastaa koordinaattori sallituilla asetuksillaan (`[DELEGATE]`-pyynnöt), ei ajuri.

## Katkot, aikarajat ja sovittaminen

- **Yhteys katkeaa tai varaus vanhenee:** ajuri pysäyttää lapsiprosessin. Vanhentuneella tokenilla ei voi enää julkaista tulosta.
- **Aikaraja täyttyy:** lapsiprosessi pysäytetään ja ajo kuitataan `interrupted`-tilaan. Työpuu säilyy tarkistusta varten.
- **Kone tai ajuri kaatuu kesken ajon:** uudelleenkäynnistyksessä ajuri lukee pysyvästä ajopäiväkirjasta keskeneräisen ajon. **Sitä ei ajeta automaattisesti uudelleen**, koska se on jo voinut muuttaa tiedostoja. Ajuri kuittaa sen keskeytyneeksi, jos token on yhä voimassa. Muuten varaus vanhenee palvelimella ja lähettäjä näkee sen. Työpuu jää koneelle käsin tarkistettavaksi.
- **Sama `runner_finish` lähetetään uudelleen** verkkokatkon jälkeen: uusinta on idempotentti, joten tulos ei kirjaudu kahdesti.

## Vianetsintä

| Oire | Syy ja korjaus |
|---|---|
| Ajuri pysähtyy käynnistyksessä: runner-työkalut puuttuvat | Palvelinta ei ole päivitetty. Pyydä ylläpitäjältä hallittu päivitys. |
| whoami-virhe tai 401 | Väärä tai peruttu avain, tai väärä osoite. Tarkista `.env.runner`. |
| Toinen instanssi on jo käynnissä | Instanssilukko. Sulje toinen ajuri, älä poista lukkoa käsin sen ollessa käynnissä. |
| Tehtävää ei oteta vastaan | Lähettäjä ei ole sallittujen listalla, polut ovat rajojen ulkopuolella tai tiedosto on varattu. |
| CLI:tä ei löydy tai se vaatii kirjautumisen | Asenna ja kirjaudu samalla käyttäjällä (Ennen asennusta, kohta 3). |
| `blocked`: muutoksia rajojen ulkopuolella | CLI muokkasi sallimattomia polkuja. Tarkista työpuu käsin. Tulosta ei julkaistu onnistuneena. |

## Liittyvät dokumentit

- Toteutussopimus: [runner-contract.md](runner-contract.md)
- MCP-yhteys ja jäsenavaimet: [team-mcp-join.md](team-mcp-join.md)
- Koordinaattori ja suorat pyynnöt: [team-coordinator.md](team-coordinator.md)
- CLI-tarkistusten raportti: [parallel/runner-aleksi-claude.md](parallel/runner-aleksi-claude.md)
