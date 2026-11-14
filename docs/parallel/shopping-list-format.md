# Ostoslistan viivat (Codex, 14.11.2026)

Käyttäjä pyysi ostoslistan ranskalaisilla viivoilla pallukoiden sijaan. Muutos rajattu selaimen tilausapurin `public/assistant.css`-tiedostoon: HTML-luettelon `li::marker` on `"- "`. Markdownin muodostama semanttinen lista ja sisällön muotoilu säilyvät.

Koordinointivaraukset: `60e9234b` (CSS ja tämä raportti), `0af076c2` (työloki ja tämän vaiheen Git-tallennus). Ei muutoksia muiden varaamiin WhatsApp- tai verkkokauppatiedostoihin, paketteihin, kantoihin tai käynnissä oleviin palvelimiin.

Oma diff ja `git diff --check` tarkistettu. Ulkoasua ei katsottu selaimessa eikä pelkkää tyylimuutosta varten lisätty testejä. Selaimen sivupäivitys lataa uuden tyylin. GitHub-tallennus ja etähaaran varmennus raportoidaan koordinointitaululla.
