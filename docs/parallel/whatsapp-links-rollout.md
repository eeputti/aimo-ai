# Linkkituen käyttöönotto WhatsAppiin, 15.11.2026

Omistaja: Codex, linkkichat. Koordinointitaulun varaus `7a029442`, etukäteisilmoitus kaikille #255.

- **Käytössä oleva lähde:** `3bee913c2d68cca433c3147e40bd7c3d609b622e`, varmennettu GitHubin mainista ennen käyttöönottoa. Snapshot `/private/tmp/aimo-whatsapp-runtime-3bee913`. Kaikki **542 seurattua tiedostoa** tarkistettu Gitin blob-tiivisteitä vasten, 0 eroa. Testitulokset ja oikean mallin loppukoe: `whatsapp-links.md`.
- Vanha worker **39055** (`9f20407`) pysäytetty hallitusti SIGTERM:llä. Jonossa ei ollut pending/processing-viestejä, ja portin 4749 vapautuminen varmistettiin ennen uuden käynnistystä.
- Uusi worker **48952**, lähde `3bee913`, yksi kuuntelija portissa 4749. Käynnistyi erilliseen istuntoon samalla `/usr/local/bin/node --disable-warning=ExperimentalWarning --env-file=.env --env-file=.env.whatsapp deploy/whatsapp/start.mjs` -komennolla. Loki `/private/tmp/aimo-whatsapp-ops/runtime-3bee913.log`.
- Sama `.env`, `.env.whatsapp`, `node_modules` ja `data` ovat linkkejä nykyisiin yhteisiin sijainteihin. Asetuksia, Meta-tunnuksia, julkista tunneliosoitetta tai muita palvelimia ei muutettu.
- Viiden kannan **kaikkien 22 aiemman taulun** rivimäärät ja järjestetystä sisällöstä lasketut SHA-256-tiivisteet täsmäsivät ennen pysäytystä, pysäytyksen jälkeen ja uuden käynnistyksen jälkeen. Myös kantatiedostojen inodet säilyivät ja `integrity_check` oli ok. Uusi tyhjä `wa_link_progress` on ainoa heti käynnistyksessä lisätty taulu; neuvonnan kaksi taulua syntyvät ensimmäisellä tilausvuorolla. Jono edelleen tyhjä.
- Paikallinen ja julkinen `/healthz`: **200**, `ordering-demo`. Molempien `/whatsapp/cart/shop.js`: **200**, SHA-256 sama kuin julkaistussa lähteessä. Julkiset `/demo` **403** ja `/` **404** kuten ennen. Tunneli, tilausjulkaisija ja ilmoittautumisseuranta säilytettiin käynnissä.
- Käyttöönoton tarkistukset olivat lukevia HTTP-/kantatarkistuksia. Oikeaa Meta-koeviestiä, asiakastilausta, Valio-API-kutsua tai sähköpostia ei lähetetty. Oikean puhelimen uusi käyttökoe on vielä käyttäjän tehtävissä lähettämällä reseptilinkki.

Käyttäjä voi lähettää esimerkiksi julkisen reseptilinkin ja tekstin ”tämä 40 hengelle”. Apuri kuittaa ensin lukemisen, poimii ainekset, laskee määrät ja näyttää katalogiehdotukset. Erillinen hyväksyntä jatkaa nykyiseen ostoslistan täydentämiseen; varsinainen tilaus vahvistetaan edelleen selaimessa.
