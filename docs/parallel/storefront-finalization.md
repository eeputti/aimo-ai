# Verkkokaupan viimeistely, 14.11.2026 (Codex, Seuraa sessioita ja edistä työtä)

## Rajaus ja muiden työ

- Käyttäjä jätti Claudelle mallitulkin ja oikean Valio-mock-API:n keskustelutestit, niiden korjaukset, pitkien vastausten pilkkomisen ja selaimen WhatsApp-varademon. Niitä ei tehty tässä chatissa.
- `Jatka WhatsApp-käyttöönottoa` omistaa Meta-asetukset, tunnelin ja nykyisen palvelimen restartin. `Luo WhatsApp-testinumero` tekee erillistä käynnistys- ja julkaisupakettia. Tilat tarkistettiin chat-työkaluilla ja paikalliselta koordinointitaululta.
- Tämä osuus varattiin taululla ennen muutoksia. Ei muutoksia kanavaan, keskusteluytimeen, tuotetyökaluihin, `server/index.mjs`:ään, paketteihin tai ympäristötiedostoihin.

## Korjaus

`public/cart-workflow.js` poisti vanhan tuotteen ja korissa jo olevan korvaavan tuotteen ennen uuden yhdistetyn määrän validointia. Jos lisäys hylättiin, molemmat rivit olivat jo hävinneet myös selaimen tallennuksesta.

- `public/storefront-cart-store.js`: uusi `replace` tarkistaa korvattavan rivin, tuotetiedot, määrän ja yhdistetyn enimmäismäärän ennen yhtä tilapäivitystä. Virhe säilyttää alkuperäisen korin. Saman tuotteen päivitys korvaa määrän; eri tuotteeseen vaihto yhdistää jo korissa olevan määrän kerran.
- `public/cart-workflow.js`: hyväksyntä käyttää tätä operaatiota ja sitoo muutoksen alkuperäiseen päivään ja korisisältöön. Kesken asynkronisen päivityksen muuttunutta koria tai päivää ei ylikirjoiteta.
- `test/storefront-cart.test.mjs`: kolme regressiotestiä onnistumiselle/tallennukselle, validointivirheille ja rinnakkaiselle määrä-/päivämuutokselle.
- `scripts/check-storefront-order.mjs`: oikean käyttöliittymän epäonnistunut korvaus ja sivun päivitys säilyttävät rivit; onnistunut korvaus yhdistää kerran. Testipalvelimen WhatsApp-käynnistys estetään erikseen, vaikka kutsujan ympäristössä se olisi päällä.

## Tarkistukset

- `node --test test/storefront-cart.test.mjs test/storefront-order.test.mjs test/cart-selection.test.mjs`: **29/29 läpi**.
- `AIMO_PLAYWRIGHT_MODULE=…/playwright/index.mjs node scripts/check-storefront-order.mjs`: **läpi** headless-Chromessa. Korvaajan virhepolku ja onnistuminen sekä tuotekortti → kori → allekirjoitettu tarjous → hyväksynnän odotus → hyväksyntä → vahvistus → ehjä päätösketju → valtuuden tallennus → etusivun tilauslista. Ei selaimen JavaScript-virheitä.
- Oma simuloitu testipalvelin satunnaisessa portissa, tilapäiset keittiö-/gateway-kannat ja allekirjoitusavain, tyhjät malli- ja Valio-avaimet. Käyttäjän demoa, tietokantoja tai Meta-selainta ei muutettu. Sandbox esti ensin testipalvelimen kuunteluportin; sama testi onnistui hyväksytyllä oikeuslaajennuksella.
- JavaScript-syntaksit ja `git diff --check`: läpi. Koko `npm test` jätettiin muiden aktiivisten keskustelu-/tuotetyökalumuutosten omistajille; yllä oleva sarja ja selaintesti kattavat oman korjauksen.

## Seuraava askel

Toteutus ja tarkistukset tallennetaan samassa rajatussa commitissa `TYOLOKI.md`-kirjauksen kanssa. Muiden keskeneräisiä muutoksia ei sisällytetä. WhatsAppin puhelinvastaus ja oikean mallin/live-mockin keskusteluketju varmennetaan niitä omistavissa töissä.
