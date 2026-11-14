# WhatsApp-itsekeskustelukorjauksen käyttöönotto, 15.11.2026

Omistaja: Codex, WhatsApp-itsekeskusteluchatti. Paikallisen taulun käyttöönotto `dc65de4b`. Keskustelukorjauksen commit on `68afeaa`, etäintegraatio `8989a2f`; yhteistyössä tehty tuotetyökalujen/päivä-ensin-vaihe `1a517f5` ja viimeinen ensiviestin tulkintakorjaus `5e0a61f`.

## Käytössä oleva versio

- **Julkaistu tarkka lähde:** `5e0a61f6829caa315df48d0d4451df5c3c7e473a`, snapshot `/private/tmp/aimo-whatsapp-runtime-5e0a61f68`. Sen kaikki **487 seurattua tiedostoa** tarkistettiin Gitin blob-tiivisteitä vasten: 0 eroa. Myöhemmät checkout-, landing- tai muut keskeneräiset muutokset eivät kuulu tähän julkaisuun.
- Vanha worker **70391** (`beda8e5c6`) pysäytettiin `SIGTERM`:llä. Portin 4749 vapautuminen tarkistettiin ennen käynnistystä. Uusi worker **98250**, hallintatyökalun istunto **73691**. Vain yksi listener portissa 4749.
- Sama `.env`, `.env.whatsapp`, `node_modules` ja pysyvä `data` linkitetty nykyisiin paikallisiin sijainteihin. Meta-asetuksia, testinumeron profiilia tai asiakkaiden sidoksia ei vaihdettu. Verkkokaupan muita palvelimia ei pysäytetty.
- Viisi SQLite-kantaa ja niiden **21 taulua** luettiin vain luku -yhteydellä juuri ennen ja jälkeen restartin. Kantatiedostojen identiteetit, kaikkien taulujen rivimäärät ja järjestetyistä riveistä lasketut SHA-256-tiivisteet täsmäsivät. Yhtäkään keskustelua, jäsenliitosta, koria, tarjousta tai tilausta ei nollattu.
- Käynnistimen preflight: asetukset kunnossa, `ordering-demo`, portti 4749, ei huomioita.

## Lopulliset tarkistukset

| Tarkistus | Tulos |
| --- | --- |
| Tarkan `5e0a61f`-lähdekuvan `npm test` eristetyillä kannoilla | **253/253**, 0 virhettä/ohitusta |
| Paikallinen `/healthz` | **200**, `ordering-demo` |
| Nykyisen tunnelin julkinen `/healthz` | **200**, `ordering-demo` |
| Julkinen `/whatsapp/cart` | **200** |
| Uusi `/whatsapp/cart/shop.js` | **200**, SHA-256 sama kuin snapshotissa |
| Vanha `/whatsapp/cart.js` | **200**, SHA-256 sama kuin snapshotin vanhassa korimoduulissa |
| Julkinen `/demo` ja `/` | **403 / 404**, aiempi rajaus säilyy |

Aluksi uuden korimoduulin tiivistettä verrattiin vahingossa vanhan `/whatsapp/cart.js`-reitin sisältöön. Reittikartan lukemisen jälkeen tarkistettiin molemmat oikeisiin lähdetiedostoihinsa: molemmat täsmäsivät. Tämä oli tarkistuksen osoitevirhe, eikä sen perusteella muutettu tuotantokoodia.

Käyttöönottoa edelsi myös oikealla mallilla tehty loppukoe:

- `8989a2f`: kananmunat ja monirivinen kori, **2 keskustelua / 5 asiakasvuoroa / 16 mallikutsua**. Molemmat korit ja luonnollinen tuotevalinta + korilinkkipyyntö oikein.
- `1a517f5`: monirivinen kori ja neuvonta, **2 keskustelua / 10 vuoroa / 32 kutsua**. Maito 50 -> 30 l, munat 50 kpl, kerma 5 desiä -> 0,5 l säilyivät. Neuvonnasta siirryttiin sopivaan maustamattomaan ruokakermaan, sipulikermaa ei tarjottu. Molemmat päättyivät oikeaan linkkiin.
- Julkaistu `5e0a61f`: ensiviesti `maustamatonta ruokakermaa 2 litraa maanantaiks 16.11. tavallinen käy, ei mitään erityisruokavalioita` -> sopivat maustamattomat vaihtoehdot -> `ykkönen käy ... laitatko korilinkin?` -> oikea linkki. **1 keskustelu / 2 vuoroa / 6 kutsua**, ei uutta laktoosikysymystä, ei maustettua ehdokasta, tallennettu tarve **2 l**.
- Näissä viidessä lisäkokeessa **0 mallirajapintavirhettä ja 0 tilausta**. Malli ja koko HTTP/jono/tilausmoottori/korilinkkipolku olivat oikeita; asiakas, Meta-toimitus ja hinnat simuloituja eristetyissä kannoissa.

Koko tämän chatin työvaiheessa alkuperäiset kokeet mukaan lukien **15 keskustelua / 51 asiakasvuoroa / 159 mallikutsua / 0 rajapintavirhettä / 0 tilausta**. Tapauksia toistettiin korjausvaiheiden välillä; tämä ei tarkoita 15 erilaista riippumatonta asiakasta tai kaikkien kokeiden ajoa lopullisella commitilla. Alkuvaiheen löydökset ja ajurin käyttö ovat `docs/parallel/whatsapp-selfplay.md`:ssä.

## Käytännön rajat

Tässä käyttöönotossa ei lähetetty uutta testiviestiä Metan kautta oikeaan puhelimeen. Paikallinen ja julkinen palvelin sekä oikean sovellusketjun synteettiset keskustelut varmennettiin. Aiemmin toimineet Meta-tunnukset ja webhook/tunneli säilyivät.

Katalogin ehdokkaiden järjestyksessä ja vastausten selkeydessä on edelleen parannettavaa. Esimerkiksi ammattikeittiön maitotarpeeseen voi nousta pieni annospakkaus ja linkin yhteydessä voisi toistaa valitun sisällön tiiviimmin. Malliarvio ei yksin osoita vikaa: tavallisen tuotteen salliminen ei itsessään kiellä laktoositonta. Jatkopäätös pitää tehdä asiakkaan oikeasta sanamuodosta ja tuotetiedoista. DM Champin tasoista laatua tai kaikkien vapaiden viestien täydellistä ymmärtämistä ei ole mitattu.

Uusi itsekeskustelu käynnistetään erikseen; jatkuvaa seurantaa, ajastusta tai automaattista mallin koulutusta ei perustettu. Muiden chattien laajat 100 asiakkaan kokeet ja myöhempi demomaksukytkentä ovat omia GitHub-työvaiheitaan.
