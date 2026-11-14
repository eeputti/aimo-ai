# Heräteajurin käyttöohje ja CLI-yhteensopivuus (aleksi-claude)

MCP-tehtävä `46f5495d`, luovuttaja daniel-chatgpt. Pohja `origin/work/local-runner` `454ad1b`. Oma haara `work/runner-docs-aleksi-claude`. Danielin haaraan ei kirjoitettu. Omistus vain `docs/team-runner.md` ja tämä raportti.

## Tehty

- `docs/team-runner.md`: käyttöohjeen runko sopimuksen `docs/runner-contract.md` perusteella. Sisältö: mitä ajuri tekee ja mitä ei (ei kuluttajachatin heräämistä, ei automaattista julkaisua, ei luvitusten ohituksia), palvelinpäivityksen tarve, erillinen jäsen ja avain, CLI:n etukäteiskirjautuminen, oma klooni, `.env.runner`-asetukset (sama HTTPS-osoite, sallitut lähettäjät ja polut, read-only vs workspace-write, aikaraja), PowerShell- ja Linux-käynnistys, pysyvä ajo (Tehtävien ajoitus / systemd --user), instanssilukko, tehtävän elinkaari ja ihmistarkistus, katkojen ja aikarajan jälkeinen sovittaminen sekä vianetsintä.
- Ajurin koodia ei ollut haarassa ohjeen kirjoitushetkellä. Kaikki toteutuksesta riippuvat nimet (npm-skripti, `.env.runner`-muuttujat, CLI-argumentit, haaran nimeäminen) on merkitty tekstillä **[varmistetaan koodista]**. Ohje ei väitä ajuria testatuksi.

## CLI-tarkistukset tällä koneella (Windows 11, vain `--help`/`--version`, ei malliajoja)

| CLI | Tulos |
|---|---|
| Claude Code | `claude.exe` natiiviasennus `%USERPROFILE%\.local\bin`, versio **2.1.325**. Ei npm-käärettä, joten `spawn(..., { shell: false })` toimii suoraan exe-polulla. `claude auth status` on olemassa (`--json` oletus, `--text`). |
| Codex CLI | **Ei asennettu.** `codex` ei ole PATHissa. Koneella on Codexin työpöytäsovellus (Microsoft Store -paketti `OpenAI.Codex`), joka sisältää vain `codex-chrome-native-host.exe`- ja `codex-core-command-runner.exe`-apuohjelmat, ei käyttäjän `codex`-komentoa. **Käyttöönoton este** tämän koneen Codex-sovittimelle. CLI pitää asentaa erikseen. Asennusta ei tehty tässä työssä. |

Claude Coden `--help` (2.1.325), ajurin kannalta olennaiset liput:

- Ei-interaktiivinen: `-p/--print`, `--input-format text|stream-json`, `--output-format text|json|stream-json`, `--no-session-persistence`, `--max-budget-usd`.
- Luvitukset: `--permission-mode` (valinnat `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`), `--permission-prompts host|none` (`none` = kaikki luvitusta vaativa evätään automaattisesti, oletus `host`), `--allowed-tools` / `--disallowed-tools`, `--tools`.
- Rajattu tila: `--restricted` poistaa komentoja ja koodia ajavat työkalut sekä WebFetchin (ellei `--tools` nimeä niitä) ja ohittaa käyttäjän, projektin ja paikalliset asetustiedostot.
- Asetusten eristys: `--setting-sources`, `--settings`, `--strict-mcp-config`, `--bare` (huom: `--bare` lukee vain `ANTHROPIC_API_KEY`:n tai apiKeyHelperin, ei OAuth-kirjautumista, joten se ei sovi ajuriin, jos CLI on kirjautunut tilillä).
- Kielletyt ajurissa sopimuksen mukaan: `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--permission-mode bypassPermissions`.
- Huomio: `-p` ohittaa työtilan luottamusdialogin, ja virheelliset asetustiedostot ohitetaan siinä tilassa hiljaa. Ajurin pitää siksi ajaa CLI vain omassa työpuussaan.
- CLI:llä on oma `-w/--worktree`. Ajurin kannattaa silti luoda työpuu itse, koska sopimus vaatii ajon tunnisteeseen sidotun haaran ja polkutarkistuksen.

## Ehdotukset toteutukselle (Danielille, ei muutettu ydintä)

1. Claude-sovittimen kiinteät argumentit read-only-tilaan: `-p --output-format json --no-session-persistence --permission-mode plan --permission-prompts none`. Kirjoitustilaan sama, mutta `--permission-mode acceptEdits`. Kumpikin ilman ohituslippuja.
2. Windowsissa Claude ratkaistaan suoraan `claude.exe`-polkuun (natiivi). npm-kääreen ratkaisu tarvitaan vain npm-asennuksille, kuten Codex CLI:lle.
3. Ajurin käynnistystarkistukseen: CLI:n olemassaolo ja kirjautuminen (`claude auth status --json`). Puuttuva kirjautuminen pitää raportoida esteenä ennen ensimmäistä tehtävää.
4. Instanssilukko ja ajopäiväkirja oman käyttäjäprofiilin alle. Windowsissa 0600-oikeudet eivät rajaa lukua (ks. koordinaattoritarkistuksen L3).

## Ei tehty / rajat

- Ei oikeita malliajoja, ei CLI:n kirjautumisen muutoksia, ei Codex CLI:n asennusta.
- Ei avain- tai palvelinasetusmuutoksia eikä restartteja.
- Ohjeen koodiin perustuvat kohdat täydennetään, kun ajurin toteutus on `work/local-runner`-haarassa.
