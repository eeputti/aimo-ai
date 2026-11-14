# CLI-heräteajurin toteutussopimus

Tarkistettava sopimus 14.11.2026, ei vielä toteutuksen tai käyttöönoton varmennus. Lähtökohta on nykyinen `services/team-mcp`-koordinaattori.

## Työnkulku

Koneella käynnissä oleva `npm run runner` yhdistää yhteiseen HTTP-MCP:hen omalla tunnisteella. Se vastaanottaa vain sille nimenomaisesti luovutetun tehtävän (`handed_off`), varaa sen atomisesti, käynnistää Codex CLI:n tai Claude Coden omassa erillisessä Git-työpuussa ja palauttaa tuloksen lähettäjälle tarkistettavaksi. Selainchatteja ei käynnistetä tällä ajurilla.

## Uudet MCP-työkalut

- `runner_claim_task`: project, taskId, expectedRevision, instanceId (UUID), claimKey (30–100 merkin satunnainen salaisuus), allowedSenders[], allowedPaths[]. Asiakas tallentaa claimKeyn ennen verkkokutsua ja käyttää samaa arvoa kadonneen vastauksen uusintaan; palvelin säilyttää siitä vain tiivisteen. Vain voimassa oleva omalle tunnisteelle luovutettu tehtävä. Lähettäjä luetaan palvelimen tapahtumasta. Tarkistaa polut ja vapaat tiedostovaraukset. Palauttaa runId, salaisen leaseTokenin (= claimKey), leaseUntil, sourceMember ja task-olion. Vain toinen kahdesta samanaikaisesta varauksesta saa aloittaa.
- `runner_heartbeat`: project, runId, instanceId, leaseToken. Uusii tokeniin sidotun ajon ja tiedostovaraukset. Tavalliset claim/progress/handoff-kutsut eivät saa ohittaa aktiivista ajuria.
- `runner_finish`: samat tunnisteet, outcome (completed/blocked/interrupted), note ja valinnainen commitSha. Tallentaa kuittauksen, vapauttaa varaukset ja luovuttaa tehtävän alkuperäiselle lähettäjälle tarkistukseen atomisesti. Uusinta on idempotentti. Vanhentunut tai väärä token ei voi julkaista tulosta.

Ajuri tarkistaa työkalut/skeemat ennen ajoa. Vanha jo käynnissä oleva MCP-prosessi vaatii hallitun päivityksen. Hiljaista siirtymistä vanhaan kilpailutilanteelle alttiiseen varaukseen ei sallita.

## Paikallinen ajo

- HTTPS-MCP tai paikallinen loopback-HTTP. Oma jäsenavain vain `.env.runner`-tiedostossa; whoami tarkistaa identiteetin. Yksi instanssi, pysyvä ajopäiväkirja, rajattu pollaus, yksi työ kerrallaan.
- Kesken jäänyttä ajoa ei toisteta automaattisesti: se on jo saattanut muuttaa tiedostoja. Aikaraja, tulosteen kokoraja ja hallittu lapsiprosessin pysäytys. Yhteyden/varauksen menettäminen pysäyttää työn.
- Kiinteät paikallisesti valitut CLI-argumentit, tehtävä stdinissä, `shell:false`, ei permission-/sandbox-ohituksia. Windowsin npm-kääre ratkaistaan tunnetun paketin Node-entrypointiin komentotulkin sijasta.
- Oletus vain luku; kirjoitus erillisenä paikallisena asetuksena CLI:n normaalein oikeuksin. CLI:n oma kirjautuminen tehdään etukäteen. Ajurin jäsenavainta ei anneta lapsen ympäristöön.
- Oma Git-työpuu ja haara jokaiselle ajolle. Päätyöpuuta ei nollata tai vaihdeta. Tulos jää tarkistukseen, ei automaattista julkaisua tai yhdistämistä. Tehtävän polkurajojen ulkopuoliset muutokset estävät onnistumiskuittauksen.

## Automaattinen työnjako

Paikallisissa koordinaattoriasetuksissa sallitut vastaanottajat, lähettäjät ja tiedostopolut. Vain sallittulta lähettäjältä tullut `[DELEGATE]`-pyyntö voi johtaa malliehdotuksen pohjalta tehtävien luontiin ja luovutukseen. Palvelin tarkistaa ehdotuksen ja tekee jaon atomisesti; virhe ei jätä osittaista jakoa. Ajurin tulosviesti tai tavallinen analyysipyyntö ei saa käynnistää uutta delegointiketjua.

## Tekijät ja tiedostot

- Daniel: ydin `services/team-mcp/src/`, paketti/asetuspohjat, olemassa olevat testit ja uudet `runner.test.mjs`, `runner-process.test.mjs`, `runner-dispatch.test.mjs`; palvelun README ja yhteiset avustajaohjeet.
- Aleksin Codex: riippumaton tarkistus ja aidot regressiot vain `services/team-mcp/test/runner-review.test.mjs`; raportti `docs/parallel/runner-aleksi-codex.md`. Ydin vain luettavana.
- Aleksin Claude: `docs/team-runner.md` ja `docs/parallel/runner-aleksi-claude.md`; paikallisten CLI:den `--help`-tarkistus ilman malliajoja ja koodiin pohjaavat PowerShell/Linux-käyttöohjeet.

Varaa omat tiedostot, kuittaa vastaanotto ja raportoi tulos MCP:ssä. Käytä omaa raporttia; yleisloki vain commit-vaiheessa. Ei käyttäjän palvelinten restartia, salaisuuksia Gitiin tai oikeita malli-/Meta-/Valio-kutsuja testeissä. Puuttuva CLI/kirjautuminen on käyttöönoton este, ei lupa ohittaa suojauksia.
