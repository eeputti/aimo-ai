# WhatsAppin korilinkki kaupan ostoskorin näköisenä

15.11.2026, Claude Code (korisivuchatti), taulun tehtävä `d09c38bc`.

## Käyttäjän tavoite

Eelis pyysi 15.11. klo 00.30, että WhatsAppissa kerätty ostoskori näkyy täytettynä localhost-kaupan näköisenä: otsake, fontit, logo, toimituspäivävälilehdet, tuoterivit kuvineen, määrät ja summat. Tilauksen voi tarkistaa ja vahvistaa siellä. Workers-julkaisu vaihtoehtona vain erillisellä OK:lla.

## Ratkaisu ja perustelu

Valittiin suositus 1: sama rajattu korilinkki ja API, uusi ulkoasu. Syyt: toimii heti nykyisen tunnelin kautta, käyttää samaa palvelimen luonnosta ja nykyistä idempotenttia vahvistuspolkua, eikä vaadi julkista julkaisua. Workersia ei tarvita ennen kuin halutaan pysyvä osoite; sitä ei tehty.

- `server/whatsapp/storefront-cart.mjs`: tarjoilee vain staattiset tiedostot. `GET /whatsapp/cart` palauttaa uuden sivun, lisäksi `/whatsapp/cart/shop.{js,css}`, `/whatsapp/cart/storefront.css` ja `/whatsapp/cart/storefront-cart.css` (kaupan omat tyylit, joissa `/storefront-assets/`-polut ohjataan sallittuun `/whatsapp/cart/assets/`-polkuun), sallittu lista fontteja, logo ja ikonit sekä `/whatsapp/cart/img/<id>`. Kuvat luetaan vain levyltä (kaupan vertailukuvat ja `data/img`-välimuisti): tunnelin kautta ei käynnistetä ulkoisia kuvahakuja eikä avata `/img/`-reittiä. Tiukka CSP (`default-src 'none'`, kaikki `'self'`, ei inline-tyylejä), no-store, no-referrer, noindex.
- `server/whatsapp/runtime.mjs`: moduuli kytketään ennen `cartLink`ia vain, kun korilinkki on käytössä. `WHATSAPP_CART_VIEW=simple` palauttaa aiemman yksinkertaisen sivun. Allekirjoitettu API (`/whatsapp/cart/api`, `/chat`, `/export`) pysyy muuttumattomana `cart-link.mjs`:ssä.
- `public/whatsapp-storefront-cart.{html,js,css}`: kaupan `/cart.html`-rakenne ja -luokat. Tilausdemo-merkki otsakkeessa ja yhteenvedossa. Rivit tulevat `GET /api`:n ostoslistasta; hinnat, myyntipakkaukset, vertailuhinta ja alv Danielin `GET /api/export`-projektiosta (sama luonnos ja revisio, tarkistettu tarjous), vain kun lista on valmis. Keskeneräinen lista näyttää rivit ilman hintoja ja keltaisen täydennyshuomion. Muutokset kirjoitetaan korin hakukentän paikalla olevaan kenttään; määrä-, poisto- ja päivänvaihtonapit esitäyttävät viestin, eivät muuta koria hiljaa. TARKISTA JA TILAA pyytää yhteenvedon, vihreä VAHVISTA DEMOTILAUS näkyy vasta sen jälkeen. Pending-pyyntö ja sen uusinta sekä 409-käsittely samalla logiikalla kuin aiempi sivu. Vahvistuksen kuittaus säilyy saman välilehden reloadissa. WhatsAppista palatessa kori päivittyy; hyväksyntä säilyy vain, jos revisio ei muuttunut.
- Maksupolkuchatin pyynnöstä vahvistetussa haarassa lähetetään `aimo:order-result`-tapahtuma, ja jos tuloksessa on `checkout.url`, sivu lataa maksupolun oman `/whatsapp/checkout.js`-moduulin `#demo-checkout`-paikkaan. Ilman moduulia tai tietoa ei näytetä mitään.

## Tarkistukset

- `test/whatsapp-storefront-cart.test.mjs` **2/2**: (1) moduuli: CSP ja otsakkeet, ei inline-tyylejä/-handlereita tai ulkoisia osoitteita, jokainen HTML:n ja CSS:n paikallinen viittaus vastaa 200, fontin/ikonin tyypit, välimuistikuva ja vertailukuva 200, puuttuva/traversal-/väärätyyppinen/virheellinen kuva 404, sallitun listan ulkopuoliset assetit 404, POST 405, API ja kaupan reitit jätetään muille, `simple`-tila. (2) Oikea erillinen `whatsapp-server.mjs`-prosessi omilla kannoilla, oikealla katalogilla ja simuloiduilla hinnoilla: selaindemon kautta koottu valmis kori → allekirjoitettu linkki → tunnelin otsakkeilla korisivu, assetit ja kuva 200, kaupan `/`, `/cart.html`, `/storefront.css`, `/img/`, `/storefront-assets/`, `/api/local-shop`, `/api/storefront/whatsapp-cart`, `/console/state` ja `/demo` 403/404 → API ilman linkkiä 410 → lista ja export samaa luonnosta/revisiota → näytä → TILAA → saman viestitunnisteen uusinta → gatewayssa tasan yksi tilaus 16.11.
- Koko `npm test` worktreessä origin/mainin päällä: **226/226 läpi**, 0 ohitusta.
- Selain (in-app), eristetty palvelin portissa 4797 ja tunnelisimulaattori 4798 (julkinen origin, Cloudflare- ja forwarded-otsakkeet): 1280 ja 375 px, kaupan fontit ladattu, vaakaylivuoto 0. Määrän esitäyttö → maito 4 → 6 ltk, summat päivittyivät; reload säilytti muutoksen; TARKISTA JA TILAA → vihreä vahvistus; WhatsAppin puolella "poista voi" → vanha vahvistus 409, kori päivittyi kahteen riviin; uusi tarkistus → yksi vahvistus `AGW-20261114-0001`, gatewayssa 1 tilaus. Toisella korilla vahvistus → reload näyttää saman kuittauksen. Ei JS-poikkeuksia; konsolissa vain puuttuvan tuotekuvan 404 (sivu näyttää pakkauskuvakkeen) ja tarkoituksellinen 409.
- Ei Meta-, malli- tai live-Valio-kutsuja. Käyttäjän 4749-palvelinta, sen kantoja tai `.env`-tiedostoja ei muutettu eikä käynnistetty uudelleen.

## Rajat ja käyttöönotto

- Paikallinen selain eri originista saa API:lta oikein 403:n; sivu toimii julkisesta tunneliosoitteesta (`WHATSAPP_PUBLIC_URL`), kuten aiempikin.
- Kuvat näkyvät vain tuotteille, joiden kuva on jo levyllä. Muille pakkauskuvake. `npm run images` täydentää välimuistia.
- Käyttöönotto: Codexin käyttöönottochat ottaa commitin mukaan seuraavaan sovittuun restarttiin. Uutta asetusta ei tarvita; `WHATSAPP_CART_VIEW=simple` on paluutie. Hinnat vaativat Danielin `0285369`:n export-reitin samassa käyttöönotossa; ilman sitä rivit näkyvät ilman hintoja.
- Workers-julkaisua tai uutta julkista osoitetta ei tehty.
