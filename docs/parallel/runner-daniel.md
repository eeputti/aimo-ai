# CLI-heräteajuri: Danielin toteutus ja integrointi

## Ensimmäinen tarkistettava koodipohja

- `runner-store.mjs`: atominen runner_claim_task, runner_heartbeat ja runner_finish. Asiakkaan ennen verkkopyyntöä tallentama salainen claimKey mahdollistaa kadonneen claim-vastauksen uusinnan ilman toista ajoa. Token sidotaan jäsenelle, instanssille ja vuokraan. Tavalliset tehtävätyökalut eivät ohita käynnissä olevaa ajuria. Tulos palautuu alkuperäiselle lähettäjälle katselmointiin; ei automaattista koodin hyväksyntää.
- `runner*.mjs`: HTTP-MCP-asiakas, yhden instanssin lukko, SQLite-ajopäiväkirja, katkon sovittaminen ilman CLI-uusintaa, erillinen Git-työpuu/haara, luotetut CLI-argumentit ja stdin-prompti, aikaraja ja tulosteen kokoraja. Jäsenavain ei siirry lapsen ympäristöön. Oletus read-only, workspace-write erillisenä asetuksena. Ei automaattista commit/push/mergeä.
- `dispatch.mjs` ja koordinaattorikytkentä: vain `[DELEGATE]`-pyyntö sallitulta lähettäjältä, sallitut vastaanottajat ja polut, enintään kolme riippumatonta jakoa. Luonti/luovutus/vastaus yhdessä transaktiossa (sisäkkäiset savepointit); koko jako peruuntuu virheessä. Runnerin tulosviesti ei käynnistä delegointiketjua.
- Aleksin Clauden aiemman tarkistuksen L1/L2 korjattu samalla: yli 15 minuutin Retry-After tuottaa pysyvän virhekuittauksen sen sijaan että viivettä lyhennettäisiin ja API:n pyyntö ohitettaisiin; enintään viisi avointa API-työtä pyytäjää kohti ennen koko projektin 100 rajaa. TODO-regressioiden tarkistus ja Windows-testien viimeistely jatkuvat seuraavassa vaiheessa.

## Tarkistukset ensimmäiselle pohjalle

- Paketin 56 testistä 54 läpi, 0 virhettä, kaksi vanhaa TODO-merkittyä katselmointitestiä myös läpi mutta niitä ei vielä lasketa tavallisiin hyväksyttyihin testeihin.
- Oikeat erilliset SQLite-yhteydet: kilpailu, token/jäsen/instanssi, idempotentti kuittaus, vanhentunut vuokra ja tavallisten työkalujen ohituksen esto. Oikeat lapsiprosessit simuloivat CLI:tä: stdin ei ole shell-koodi, env-avaimen poisto, aikaraja, ulkoinen pysäytys, suuri tuloste ja epäonnistunut exit. Oikea Git-työpuu ja paikallinen päiväkirja: lähde säilyy ja kesken jäänyttä ajoa ei toisteta.
- Ei oikeita Codex-/Claude-malliajoja, OpenAI-, Meta- tai Valio-kutsuja. Codexin argumentit tarkistettu paikallisesta --help-tulosteesta, Aleksin Claude tarkisti oman natiivin Claude 2.1.325:n --helpin. Varsinainen CLI-kirjautuminen ja käytössä olevan CLI-version toiminta käyttäjän koneella on vielä käyttöönottoasia.
- Kesken: HTTP-MCP:n ja ajurin täysi ketju, Aleksin Codexin riippumaton tarkistus, Aleksin Clauden koodiin sovitettu käyttöohje, viimeistely ja main-integrointi. Nykyistä käyttäjän MCP-prosessia/tunnelia ei muuteta.

## Viimeistely ja HTTP-varmennus

- Oikea Streamable HTTP -asiakas, luovutus, pysyvä ajopäiväkirja, Git-työpuu ja oikea Node-lapsi testattu yhtenä ketjuna. Codex/Claude tulosteet simuloitu; ei mallikuluja.
- Koordinaattorin jako tallentaa alkuperäisen pyytäjän. `runner_finish`-palvelintapahtuman metatieto varmentaa tuloksen; sitä ei voi luoda tavallisella viestin tekstillä. Koordinaattori vastaa alkuperäiselle jäsenelle ja tulosaihe ei käynnistä uutta työnjakoa.
- `runner-child.mjs` valvoo IPC-disconnectia ja pysäyttää oman CLI-puunsa myös ajurin äkkikuolemassa. Todellinen kaatumiskoe läpi Linuxissa. `preflightCli` tarkistaa asennetun CLI:n liput ennen palvelinyhteyttä/varauksia; väärä versio pysäyttää käynnistyksen. Claude ei käytä Bashia, Codex ei siirrä työtä erilliseen daemoniin.
- Koko paketti **62/62 läpi**, myös L1/L2 nyt pakolliset. Windowsin mode/polku/SIGTERM-testien oletukset korjattu; oma ympäristö on Linux, Windows-ajoa ei väitetä tehdyksi.
- MCP-yhteys katkesi sisäiseen virheeseen tämän vaiheen aikana. Aiemmat luovutukset ja koodi-ilmoitukset ovat menneet läpi; uusia vertaisvastauksia tai loppukuittauksia ei ole luettu. Vertaisomisteiset tiedostot jätetään erilleen. Julkaistu ohjerunko 84ddfad ei vielä vastaa lopullista koodia.
