# Illan työnjako muille koneille, 14.11.2026 (Claude Code, Eeliksen kone)

Eelis pyysi keksimään töitä, jakamaan ne muille koneille yhteisen Team MCP:n kautta ja tarkistamaan päällekkäisyydet. Sovelluskoodia ei muutettu tässä työvaiheessa.

## Lähtötilanne

- Yhteinen Team MCP pyörii Danielin koneella Cloudflaren pikatunnelin takana, ei Renderissä. Tämä chat on siinä tunnisteella `eelis-claude`.
- Tauluja on kaksi eivätkä ne näe toisiaan: Eeliksen koneen paikallinen (`codex`, `claude-code`) ja yhteinen (kahdeksan tunnistetta).
- Palautus su 15.11. klo 09.30.

## Varaukset ennen jakoa

| Taulu | Kuka | Mitä | Tiedostot |
|---|---|---|---|
| Yhteinen | daniel-chatgpt | WhatsApp-ostoslistan siirto verkkokaupan ostosapuriin | `server/shopping-list`, `server/whatsapp/shopping-list.mjs`, `ordering.mjs`, `runtime.mjs`, `server/order-conversation/runtime.mjs`, `public/assistant.js`, `public/whatsapp-shopping-list.js` |
| Yhteinen | daniel-chatgpt | Koordinaattori ja tilannenäkymä | `services/team-mcp`, `docs/team-coordinator.md`, `README.md`, `TYOLOKI.md` |
| Paikallinen | codex (Jatka WhatsApp-käyttöönottoa) | Meta-token, tila blocked | `.env`, `.env.whatsapp`, `docs/parallel/1.md` |
| Paikallinen | codex (Cloudflare Workers) | Jaettava tilausnäkymä | `deploy/cloudflare`, `docs/cloudflare.md`, `docs/parallel/cloudflare-setup.md` |

## Jaetut tehtävät

Jokainen sai suoran viestin (yhteisen taulun viestit 19–23) ja yleisviestin 16. Jako on ehdotus: kukaan ei ole vielä kuitannut.

| | Kenelle | Tehtävä | Omat tiedostot |
|---|---|---|---|
| A | aleksi-chatgpt | WhatsApp-käynnistyspaketin Docker-ajon varmennus | `deploy/whatsapp/`, `docs/whatsapp-deploy.md` |
| B | aleksi-claude | Selaimen varademon (`/demo`) visuaalinen tarkistus ja korjaukset | `public/whatsapp-demo.html`, `server/whatsapp/web-demo.mjs`, `test/whatsapp-web-demo.test.mjs` |
| C | peetu-claude | Demon ja videon käsikirjoitus, pitch deckin sisältö | `docs/demo-kasikirjoitus.md`, `docs/pitch.md` |
| D | peetu-chatgpt | Puhekielisen tilauskeskustelun testipaketti ja luku pitchiin | `eval/whatsapp-cases.mjs`, `scripts/whatsapp-conversation-eval.mjs`, `eval/whatsapp-results.md` |
| E | daniel-claude | Haun, reseptisivun, kokoelman ja korin puhelinleveys | `public/aimo-ask.css`, `public/recipes.css`, `public/collection.css` |
| F | eelis-claude, vain Eeliksen pyynnöstä | Tilauskeskustelun kolme tiedossa olevaa pikkuvikaa | `server/order-conversation/index.mjs`, `server/order-tools/index.mjs` |

Tehtävien tiedostot eivät osu toisiinsa eivätkä yllä oleviin varauksiin.

## Havaitut ristiriidat

1. `TYOLOKI.md` on varattu Danielin koordinaattoritehtävälle kahdeksi tunniksi, vaikka työohje vaatii jokaiselta työvaiheelta lokimerkinnän. Danielia pyydettiin vapauttamaan loki ja README. Tämän työvaiheen lokimerkintä on siksi tekemättä; tämä tiedosto korvaa sen siihen asti.
2. Danielin varaukset `server/whatsapp/runtime.mjs`- ja `ordering.mjs`-tiedostoihin eivät näy Eeliksen koneen Codex-chateille, jotka ovat viimeksi muokanneet samoja tiedostoja (commit `cf1d3b0`). Varaukset välitettiin paikalliselle taululle viestinä 30, ja paikalliset varaukset kerrottiin yhteiselle taululle.
3. Eeliksen Codexin raportti `docs/parallel/codex-team-mcp.md` odotti Git-vientiä lokivarauksen takia. Se on tässä commitissa sellaisenaan, tekijä eelis-chatgpt.

## Muuta

- Danielin kysymyksiin ostoslistan siirrosta ja asiakkaan aloittamista WhatsApp-puheluista vastattiin viestillä 24. Puheluita ei suositeltu demon kriittiselle polulle ennen palautusta.
- Taulu ei herätä muiden chatteja: jokaisen pitää pyytää omaa avustajaansa lukemaan viestit.
- Tarkistukset: molempien taulujen tila ja viestit luettu, `git fetch` ajan tasalla. Testejä ei ajettu, koska koodi ei muuttunut.
