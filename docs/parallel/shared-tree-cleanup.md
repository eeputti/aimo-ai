# Yhteisen projektikansion siivous 16.11.2026 (Claude Code, sessio G)

Kansio `/Users/eeputti/developer/aimo-ai` oli haarassa `main` commitissa `5e0a61f`, 85 committia jäljessä GitHubin mainista (`ed16a72` tarkistushetkellä klo 22.30). Työpuussa oli 43 muutettua tai seuraamatonta tiedostoa muilta chateilta.

**Tulos: yhtään ainutlaatuista tallentamatonta työtä ei löytynyt.** Jokaisen 43 tiedoston täsmälleen sama sisältö (git-blob) on jo GitHubin mainin historiassa. 19 tiedostoa on samat kuin nykyinen main, 24 on vanhempia versioita, joista mainissa on uudempi versio tai jotka on tarkoituksella poistettu.

## 1. Kukaan ei työskentele kansiossa

- **Tiedostot:** kaikki 43 tiedostoa on viimeksi muokattu 15.11. klo 00.51–03.06. Sen jälkeen niihin ei ole koskettu.
- **Git:** ei keskeneräistä mergeä, rebasea tai cherry-pickiä, ei stasheja.
- **Taulu (`start`):** kolme voimassa olevaa varausta (tilannechat: `befbe31e`, `f73748ea`, `caf54325`, mm. `server/order-conversation/index.mjs` ja `TYOLOKI.md`). Tilannechat työskentelee erillisessä worktreessä `/private/tmp/aimo-dash-date-qty` ja on jo pushannut työnsä (`671b9a1`). Se ei muokkaa tätä kansiota.
- **Prosessit:** kansio on työhakemistona vain MCP-palvelimilla (`rea mcp`) ja ChatGPT:n tietokoneenkäyttötyökaluilla. WhatsApp-botti PID 94487 ajaa snapshotista `/private/tmp/aimo-whatsapp-runtime-1585022` ja julkaisija PID 21794 snapshotista `/private/tmp/aimo-whatsapp-runtime-ae34900`.
- **Tärkeä raja:** botti pitää auki tämän kansion Gitin ohittamia kantoja `data/whatsapp*.db` (myös `-wal`/`-shm`), ja julkaisija on lukenut käynnistyessään `deploy/cloudflare/.env.publisher`-tiedoston. Lisäksi `.claude/worktrees/` sisältää kahdeksan käynnissä olevan session worktreet. Siksi kansiossa ei saa koskaan ajaa `git clean` -komentoa. Siivous koskee vain alla listattuja 43 seurattua tai seuraamatonta tiedostoa.

## 2. Turvatallennus

Koko työpuun tila tallennettiin haaraan **`wip/shared-tree-2026-11-16`**, commit **`2fb0b91`** (vanhempi `5e0a61f`). Tallennus tehtiin väliaikaisella `GIT_INDEX_FILE`-indeksillä (`git add -A`, `write-tree`, `commit-tree`, `update-ref`). Työpuu, oikea indeksi ja haara säilyivät ennallaan; `git status` ja `.git/index` tarkistettiin samoiksi ennen ja jälkeen.

- Kaikkien 43 tiedoston blob wip-commitissa täsmää työpuun tiedostoon.
- Ei `.env`-tiedostoja, kantoja, avaimia, `node_modules`- tai `data/raw/`-sisältöä. Tiedostot tarkistettiin myös tavallisten avainmuotojen varalta (ei osumia).
- Pushattu, etäcommit varmennettu: `git ls-remote` näyttää `2fb0b91` haarassa `refs/heads/wip/shared-tree-2026-11-16`.

## 3. Luokittelu tiedostoittain

Sarakkeet: tila kansiossa (M = muutettu, ?? = seuraamaton), commit jossa täsmälleen tämä versio on mainissa, sen tehnyt chat, sekä mainin uudempi versio (viimeisin polkua koskeva commit ja ero kansion versioon).

### (a) Sama kuin GitHubin main (19)

| Tiedosto | Tila | Versio mainissa | Tekijä |
|---|---|---|---|
| `deploy/cloudflare/test/checkout-flow.test.mjs` | ?? | `135c1fd` | Codex, yhdistäjächat |
| `deploy/cloudflare/test/order-events.test.mjs` | M | `135c1fd` | Codex, yhdistäjächat |
| `docs/order-events.md` | M | `135c1fd` | Codex, yhdistäjächat |
| `public/whatsapp-checkout.css` | ?? | `135c1fd` | Codex, yhdistäjächat |
| `public/whatsapp-checkout.js` | ?? | `135c1fd` | Codex, yhdistäjächat |
| `server/whatsapp/checkout.mjs` | ?? | `135c1fd` | Codex, yhdistäjächat |
| `test/whatsapp-checkout.test.mjs` | ?? | `135c1fd` | Codex, yhdistäjächat |
| `eval/whatsapp-profiles-100.mjs` | M | `fe9940d` | Codex, token-korjauschatti |
| `scripts/whatsapp-profiles-eval.mjs` | M | `fe9940d` | Codex, token-korjauschatti |
| `test/whatsapp-cart-context.test.mjs` | ?? | `fe9940d` | Codex, token-korjauschatti |
| `test/whatsapp-option-stability.test.mjs` | ?? | `fe9940d` | Codex, token-korjauschatti |
| `test/whatsapp-profiles-eval.test.mjs` | M | `fe9940d` | Codex, token-korjauschatti |
| `docs/parallel/whatsapp-profiles-100.md` | M | `ddcebb4` | Codex, token-korjauschatti |
| `docs/parallel/system-audit-2026-11-15.md` | ?? | `7c7363c` | Codex, testauschat |
| `eval/whatsapp-personas.mjs` | ?? | `e36e3e4` | Claude Code, selfplay-100 |
| `eval/whatsapp-personas-data.mjs` | ?? | `6db2708` | Claude Code, selfplay-100 |
| `eval/whatsapp-personas-extended.mjs` | ?? | `b2f94e1` | Claude Code, selfplay-100 |
| `scripts/whatsapp-signups.mjs` | ?? | `043f08f` | Codex, landing-vahvistuschat |
| `scripts/whatsapp-signup-alerts.mjs` | ?? | `89c7345` | Codex, ilmoituschat |

### (b) Vanhempi versio, mainissa uudempi tai tarkoituksella poistettu (24)

| Tiedosto | Tila | Kansion versio mainissa | Tekijä | Mainin uudempi versio |
|---|---|---|---|---|
| `TYOLOKI.md` | M | `135c1fd` | Codex, yhdistäjächat | `ed16a72`, +475 riviä uusia merkintöjä |
| `deploy/cloudflare/cloudflare.config.ts` | M | `135c1fd` | Codex, yhdistäjächat | `ea4882d` (agentin jälki -chat), 1 rivi |
| `deploy/cloudflare/src/index.ts` | M | `135c1fd` | Codex, yhdistäjächat | `ea4882d`, +22/−1 |
| `server/whatsapp/runtime.mjs` | M | `135c1fd` | Codex, yhdistäjächat | `ea4882d`, +9/−3 |
| `deploy/cloudflare/index.html` | M | `23f5279` | Claude Code, landing-chat | `0e9e9ad` (Codex, Minusta pois), +64/−121 |
| `deploy/cloudflare/public/landing.css` | ?? | `23f5279` | Claude Code, landing-chat | `ea4882d`, +79/−114 |
| `deploy/cloudflare/public/landing.js` | ?? | `23f5279` | Claude Code, landing-chat | `b84fe1f` (soittonappi-chat), +55/−25 |
| `deploy/cloudflare/public/tilaukset.html` | ?? | `23f5279` | Claude Code, landing-chat | `ed16a72` (Tilaukset pois -chat), +2/−1 |
| `deploy/cloudflare/signup.sql` | ?? | `23f5279` | Claude Code, landing-chat | `8810a7c` (soittonappi-chat), +3 |
| `deploy/cloudflare/src/signup.ts` | ?? | `23f5279` | Claude Code, landing-chat | `8810a7c`, +22/−4 |
| `deploy/cloudflare/test/signup.test.mjs` | ?? | `23f5279` | Claude Code, landing-chat | `8810a7c`, +25 |
| `test/whatsapp-signups.test.mjs` | ?? | `23f5279` | Claude Code, landing-chat | `043f08f` (Codex, landing-vahvistuschat), +42 |
| `.gitignore` | M | `5147279` | Claude Code, selfplay-100 | `200eb62` (pilvisiirto-chat), +8/−1 |
| `package.json` | M | `5147279` | Claude Code, selfplay-100 | `200eb62`, +4/−10 |
| `server/order-conversation/index.mjs` | M | `fe9940d` | Codex, token-korjauschatti | `671b9a1` (tilannechat), +207/−19 |
| `server/whatsapp/dialogue.mjs` | M | `fe9940d` | Codex, token-korjauschatti | `9ae0b13` (valio-data-only), +149/−34 |
| `server/whatsapp/ordering.mjs` | M | `fe9940d` | Codex, token-korjauschatti | `3bee913` (Codex, linkkichat), +12/−6 |
| `docs/parallel/whatsapp-selfplay-100.md` | ?? | `e36e3e4` | Claude Code, selfplay-100 | `c5aee6e` (itsepelichat), +6 |
| `test/whatsapp-personas.test.mjs` | ?? | `e36e3e4` | Claude Code, selfplay-100 | `c5aee6e`, +18/−1 |
| `scripts/whatsapp-selfplay-batch.mjs` | ?? | `9f20407` | Claude Code, selfplay-100 | `c5aee6e`, +15/−9 |
| `docs/parallel/whatsapp-agent-audit.md` | ?? | sisältö `68bd180`:ssä | Codex, testauschat | `68bd180` lisäsi vain kahden rivin arkistointiotsakkeen |
| `docs/parallel/whatsapp-checkout-completion.md` | ?? | `d4a537e` | Codex, checkout-chat | poistettu tarkoituksella `b6f1efd` (Codex, siistimischat) |
| `docs/parallel/whatsapp-recipient-add.md` | ?? | `0b06d9d` | Codex, numeronlisäyschat | poistettu tarkoituksella `b6f1efd` |
| `docs/parallel/whatsapp-selfplay-deploy.md` | ?? | `71953d1` | Codex | poistettu tarkoituksella `b6f1efd` |

`docs/parallel/whatsapp-agent-audit.md` ei ole sellaisenaan blobina mainissa, mutta ero mainin versioon on vain otsakkeen kaksi riviä, jotka Codexin tilannetallennus lisäsi. Itse raportin sisältö on mainissa sanasta sanaan.

### (c) Ainutlaatuinen tallentamaton työ (0)

Ei yhtään. Tämä selittää, miksi kansio jäi jälkeen: chatit tallensivat työnsä erillisistä worktreeistä suoraan mainiin, mutta yhteisen kansion samat tiedostot jäivät paikalleen.

## 4. Palautus (Eeliksen lupa 16.11. illalla: "Yes, restore")

1. Ennen palautusta tarkistettiin uudelleen, että jokainen 43 tiedostosta oli yhä sama kuin wip-commitissa. Kukaan ei ollut muokannut niitä välissä.
2. 16 seurattua muutettua tiedostoa palautettiin HEAD-versioon (`git checkout -- <tiedostot>`).
3. 27 seuraamatonta tiedostoa poistettiin nimeltä, kukin vasta kun sen blob oli todettu samaksi kuin wip-commitissa. `git clean` -komentoa ei käytetty.
4. `git pull --ff-only`: kansio `5e0a61f` → `962f0fa`, sama kuin `origin/main` sillä hetkellä.
5. **Korjattu sivuvaikutus:** fast-forward poisti seuratut `services/team-mcp/`-lähteet (50 tiedostoa), koska `b6f1efd` (Codex, siistimischat) poisti ne GitHubista ja lisäsi polun `.gitignore`:en tarkoituksena säilyttää ne vain tällä koneella (`AGENTS.md`: "säilytetty käyttäjän vanhassa paikallisessa projektikansiossa"). Koordinointitaulun komento lakkasi toimimasta. Tiedostot palautettiin commitista `5e0a61f` (`git archive`, ei indeksimuutoksia), kaikkien 50:n blob tarkistettiin samaksi, ja taulu toimii taas. Kanta `services/team-mcp/data/` ja `node_modules/` eivät missään vaiheessa poistuneet. Taulu oli poissa käytöstä vain muutaman minuutin. Muut 198 pullin poistamaa tiedostoa eivät ole Gitin ohittamia, eli ne on tarkoituksella poistettu repositoriosta, ja ne säilyvät historiassa.
6. Tämä raportti ja TYOLOKI-merkintä commitoitiin ja pushattiin mainiin.

Gitin ohittamat tiedostot (`.env*`, `data/`, `deploy/cloudflare/.env.publisher`, `.claude/worktrees/`, `node_modules/`) jäivät koskematta. Botti ja julkaisija PID 21794 ajavat omista snapshoteistaan, eikä tämä työ käynnistänyt niitä uudelleen. Tilannechat vaihtoi samaan aikaan botin versioon 671b9a1 (PID 94487 → 34645), ja sen merkinnän mukaan taulu puuttui sillä hetkellä; palautuksen jälkeen taulu toimii taas. `.local-archive/`, jonka `.gitignore` mainitsee, ei ole tässä kansiossa; sitä ei ole tässä työssä luotu eikä poistettu.

Wip-haara `wip/shared-tree-2026-11-16` (`2fb0b91`) poistettiin GitHubista ja paikallisesti Eeliksen pyynnöstä 17.11.2026. Sen kaikki 43 tiedostoa ovat sisällöltään mainin historiassa (luokittelu yllä), joten poisto ei hävittänyt mitään.
