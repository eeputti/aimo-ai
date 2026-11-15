# WhatsApp-palvelin 4749: päivitys 777b5a4 → 9f20407

15.11.2026 klo 02.25, Claude Code (julkaisuchat). Eelis kysyi, onko uusin versio julkaistu, ja hyväksyi erikseen live-palvelimen uudelleenkäynnistyksen.

## Lähtötilanne

- GitHubin `main` oli ajan tasalla (`9f20407`). Puhelimen WhatsApp-botti ajoi kuitenkin versiota `777b5a45e` (PID 13329, käynnistetty 01.37, snapshot `/private/tmp/aimo-whatsapp-runtime-777b5a45e`).
- Puuttuvat palvelinkorjaukset: `9efab5b` (tervehdys kellonajan mukaan, kiireiset tilaukset), `252b337` (pyydetty tuotetyyppi ennen halvempaa väärää tuotetta), `34fc629` (tilausaikaraja ja seuraava toimituspäivä vaihtoehtoihin), `833b993` (kellonaikasanat pois tuotesanasta), `ce640b6` (väärinkäytöstestit, mallin vapaan tekstin ja viestimäärien rajat, korisivun escapointi), `f605549` (peruminen, tilausaika kysyttäessä, tukiyhteys, tervehdys), `5044a91` (korilinkki vasta valmiiseen tilaukseen). `6db2708` ja `9f20407` muuttavat vain itsepelin arviointia ja dokumentteja.
- Muuttuneet ajonaikaiset tiedostot 777b5a4 → 9f20407: 16 (`server/aimo/*`, `server/order-conversation/index.mjs`, `server/order-tools/index.mjs`, `server/storefront.mjs`, `server/whatsapp/*`, `public/whatsapp-storefront-cart.js`, `package.json`). Ei uusia riippuvuuksia.

## Tehty

- Varaus taululla `60d2b034`, ilmoitus kaikille #238 ennen vaihtoa.
- Jäädytetty snapshot `git archive 9f20407` → `/private/tmp/aimo-whatsapp-runtime-9f204077a`. `.env`, `.env.whatsapp`, `data` ja `node_modules` ovat linkkejä yhteiseen kansioon, kuten aiemmissa käyttöönotoissa. Kaikki 531 seurattua tiedostoa vastaavat Gitin blob-tiivisteitä. Lähdekansiot asetettu vain luettaviksi.
- Snapshotin `npm test`: **330/330 läpi**, 0 ohitettua. `whatsapp-preflight`: asetukset kunnossa, `ordering-demo`, portti 4749.
- Ennen vaihtoa jonossa ei ollut käsittelemättömiä viestejä (93 done, 10 vanhaa failed).
- Vanha PID 13329 pysäytetty TERM-signaalilla, portti vapaa noin sekunnissa. Uusi worker **PID 39055** käynnistetty snapshotista samalla `deploy/whatsapp/start.mjs`-komennolla ja samoilla asetuksilla. Prosessi on oma istuntonsa (`setsid`, isäntä launchd), joten se ei sammu tämän chatin mukana. Loki `/private/tmp/aimo-whatsapp-ops/runtime-9f204077a.log`.

## Varmennus

- Yksi kuuntelija portissa 4749 (PID 39055).
- Paikallinen ja julkinen `/healthz` 200, `ordering-demo`. Webhookin GET-vahvistus palauttaa haasteen paikallisesti ja tunnelin kautta. Allekirjoittamaton POST 403, julkinen `/demo` 403, `/` 404, `/whatsapp/cart` 200.
- Tarjoiltu `/whatsapp/cart/shop.js` on tavulleen sama kuin snapshotin `public/whatsapp-storefront-cart.js`.
- Tunneli PID 11619 sama kuin ennen, julkinen osoite ei vaihtunut. Tilausjulkaisija PID 6303 ja ilmoittautumisseuranta PID 28614 jatkavat koskemattomina; niiden koodi ei muuttunut.
- Viiden kannan kaikkien 22 taulun rivimäärät ja tiedostojen inodet täsmälleen samat ennen ja jälkeen. Luonnoskanta oli siististi suljettu (uusi worker avaa sen ensimmäisellä tilausvuorolla); se luettiin `immutable=1`-tilassa, kun yksikään prosessi ei pitänyt sitä auki, ja `integrity_check` = ok.
- Ei testiviestejä, Meta-lähetyksiä, tilauksia, mallikutsuja live-palvelimelle eikä kantojen tai `.env`-tiedostojen muutoksia.

## Ei varmennettu

- Uutta käyttäytymistä oikeassa puhelimessa ei ole vielä kokeiltu tämän päivityksen jälkeen (esimerkiksi korilinkki vasta valmiiseen tilaukseen).
- Työn alla olevat muutokset (`a2e1d877` vaihtoehtojen vertailu, `fea99383` linkkien lukeminen) eivät kuulu tähän versioon; ne tarvitsevat oman koordinoidun päivityksen.
