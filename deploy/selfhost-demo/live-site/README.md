# Yksityinen live-käyttöliittymä

Julkaistu omistajalle ja erikseen kutsutulle testaajalle: https://aimo-live-8b-demo-1711.daniel-turkkinen.chatgpt.site

Tämä hakemisto on Sites-lähdekoodin GitHub-kopio. Kanonisen Sites-repositorion julkaistu commit on 961990ac3634cd61e15a0f7fab1f3305c0920a11. Julkaisu vaatii käyttöoikeuden saaneen käyttäjän ChatGPT-kirjautumisen; yleisöä ei avattu julkiseksi. Omistajan lisäksi Eelis sai käyttäjän pyynnöstä viewer-oikeuden 17.11.2026. Tarkat sähköpostiosoitteet ovat Sitesin käyttöoikeusasetuksissa. Mallia ei ajeta Workerissa: se on erillisen pilvitestikoneen Ollamassa.

## Polku

Selain → yksityinen Sites Worker → oma D1-viestijono → sites-runner.mjs:n HTTPS-pollaus → paikallinen erillinen demopalvelin → oma qwen3:8b. Vastaus palautuu saman jonon kautta selaimeen. Pitkää mallikutsua ei pidetä avoinna julkisessa HTTP-yhteydessä: POST palauttaa 202 ja selain seuraa tulosta lyhyillä kyselyillä.

Private Sites tunnistaa käyttäjän. Ostoskorit ja viestit on rajattu käyttäjätunnuksella. Taustakäsittelijä käyttää Sites-palvelupääsyä sekä erillistä RUNNER_TOKEN-salaisuutta. Kumpaakaan ei ole lähdekoodissa, komentoriviargumentissa tai selaimessa. Paikallisen demon istuntotunnus johdetaan HMACilla taustakäsittelijän salaisuudesta ja käyttäjästä, joten sama käyttäjä jatkaa omaa koriaan taustakäsittelijän uudelleenkäynnistyksen jälkeenkin.

D1-skeema kuuluu tähän erilliseen demoon; uusi tyhjä tietokanta alustetaan vain /runner/bootstrap-kutsulla palvelupääsyn ja runner-salaisuuden takaa. Tässä pienessä Worker-toteutuksessa ei ole migration-owned/Drizzle-tauluja. Pyyntöjen käsittely ei muuta nykyisiä asiakas- tai tilauskantoja.

Privilegioidussa HTTP-laatutestissä käytetään erillistä service-test-nimiavaruutta; sillä ei voi valita oikean kirjautuneen käyttäjän tunnusta. Tavallinen selain edellyttää alustalta tullutta oai-authenticated-user-id-identiteettiä. Mallin katko näkyy tilaviestinä eikä käynnistä maksullista API:a.

## Käyttöönotto ja rajat

- Build: node scripts/build.mjs. Manifestin d1 on loogisen sidoksen nimi DB. Tuloksena dist/server/index.js ja manifesti.
- Runtime-salaisuus RUNNER_TOKEN asetetaan Sites-työkalulla. Taustakäsittelijälle annetaan {siteUrl,siteAccess,runnerToken,localUrl} vain piilotetun stdin-syötteen kautta. siteAccess tulee omistajan Sites-palvelupääsystä; sitä ei tallenneta tiedostoon.
- Taustakäsittelijä: NODE_USE_ENV_PROXY=1 node ../sites-runner.mjs. Paikallinen erillinen demo on käynnistettävä ensin omalla 8B-mallilla. Taustakäsittelijä ylläpitää heartbeat-tilaa ja käsittelee yhden viestin kerrallaan.
- Salaisuuden vaihto muuttaa HMAC-istuntotunnuksia. Nykyiset korit säilytetään antamalla piilotetussa stdinissä myös `sessionAliases: { [sitesUserId]: existingLocalSessionId }`. Tunnisteet yhdistetään täsmällisestä Sites-työn id:stä paikallisen `turn_results.message_id`-tunnuksen loppuosaan; älä yhdistä ostoskoreja rivijärjestyksen tai yritysnimen perusteella. Alias-kartta pidetään vain prosessin muistissa. Se on annettava myös seuraavissa käynnistyksissä tai palautettava samoista viestitunnuksista. Virheellinen tai kahdelle käyttäjälle jaettu istunto estää käynnistyksen.
- Sivusto ja jonot ovat pilvessä, mutta nykyinen mallipalvelin on väliaikaisessa testityöympäristössä. Jos se pysähtyy, käyttäjä näkee mallin olevan poissa yhteydestä. Ympärivuorokautinen toiminta vaatii oman pysyvän CPU-/GPU-palvelimen tälle taustakäsittelijälle ja mallille.
- Mallin vastaus voi kestää 1–3 minuuttia. Vain synteettiset tuotteet ja hinnat; ei tilausten lähettämistä, Meta-integraatiota tai henkilökohtaista maksullista mallirajapintaa.
- 17.11. vasteparannus: selkeä määrämuutos kulkee paikallisen demon rajatun ohjelmalogiikan kautta. Julkaistun HTTP-/jonopolun koe noin 3 s, 0 mallikutsua; vapaat tilaukset tarvitsevat edelleen mallin. [Mittaukset ja rajaukset](../../../docs/evaluations/aimo-speed-20261117.md).

Lähdekoodin avaamisen/julkaisun Sites-apuskriptejä ei ollut tässä koneessa saatavilla. Käytettiin natiivityökalun sallimaa lähderepositorion Git-pushia (tunnus vain stdinistä prosessin ympäristöön), työn buildia ja natiivin työkalun validoimaa arkistoa. Julkaisu varmistettiin native save_version_and_deploy_private -tuloksesta. Selain-QA jätettiin tekemättä Sites-ohjeen mukaan, koska hallitun ympäristön cua_repl-työkalua ei ollut tarjolla. HTTP-/jonopolku varmennettiin julkaistun sivuston kautta oikealla mallilla omassa testinimiavaruudessa: 20 L → tuotevalinta → 30 L, sama laktoosittomuus ja päivä, ei duplikaattia uudelleenlähetyksessä eikä toisen testikäyttäjän tietoja. Käsittelyajat 127 977 ms ja 43 208 ms.
