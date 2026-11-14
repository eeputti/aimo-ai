# Yhtenäinen verkkokaupan demopolku

Etusivu `/`, `/gateway.html`, agentin vanhat osoitteet `/agent` ja `/agent.html`, tuoteryhmät ja reseptit käyttävät samaa selaimen ostoskoria. `/agent` ohjaa etusivulle ja avaa ostoapurin. Vanha agenttiportin tekninen konsoli säilyy osoitteessa `/console.html`; sen aiempia tilauksia, mandaatteja tai lokeja ei siirretä käyttäjän koriin eikä poisteta.

## Käyttäjän polku

1. Hae esimerkiksi **kananmunia** tai avaa tuote etusivun ostoskorikuvakkeesta / tuoteryhmän **Valitse tuote** -napista. Tuotekortin numero avaa juuri kyseisen tuotteen ajantasaisen haun; vanhan etusivusnapshotin hinta ei siirry tilaukselle. Jos numero puuttuu challenge-katalogista, apuri kertoo siitä ja tuotteen voi hakea nimellä.
2. Valitse **Lisää … koriin** yksittäiselle pakkaukselle tai **Kokoa ostoskori**. Jos määrä puuttuu, Kokoa ostoskori avaa määrän valinnan. Kananmunien määrä on munia; esimerkiksi 10 munaa ja M6-pakkaus tarkoittaa kahta rasiaa eli 12 munaa. Jo erikseen koriin valittua tuotetta ei lisätä toista kertaa kokonaiskorin yhteydessä.
3. Koriin lisääminen tarkistaa hinnan ja saatavuuden **korissa jo olevan määrän + lisäyksen summalle**. Hakupaneeli ja reseptit käyttävät samaa `addReviewedProducts`-funktiota. Lisäyserä tallennetaan yhtenä muutoksena; rinnakkainen korimuutos keskeyttää vanhan saatavuustarkistuksen lisäyksen.
4. Korissa muokkaa määrät ja toimituspäivä. **Tarkista tilaus** tarkistaa hinnat ja saatavuuden, ja mahdolliset korvaajat hyväksytään nykyisellä korin työnkululla.
5. **Jatka vahvistamaan** avaa ajantasaisen, palvelimelle tallennetun demotilausyhteenvedon. **Vahvista demotilaus** tallentaa tilauksen nykyisen gatewayn kautta ja näyttää tilausnumeron. Vahvistetun päivän kori tyhjennetään vain, jos se ei muuttunut lähetyksen aikana. Muiden päivien korit säilyvät.

Tämä on demo: ei maksua, oikeaa toimitusta, kirjautumista tai Valion asiakastunnistusta. Demotilaukset kuuluvat erilliselle `storefront-demo`-testiostajalle. Valion oma asiakas- ja tilausjärjestelmä kytketään erikseen tuotantoon. WhatsApp-kanavan tilaustoimintoihin ei tehdä tässä muutoksia.

## Palvelin ja vastuut

- `public/storefront-cart-store.js`: yksi paikallinen kori, toimituspäivät ja atominen `addMany`.
- `public/storefront-cart-actions.js`: yhteinen tuore tarkistus ja lisäys haulle sekä resepteille.
- `public/aimo-cart-selection.js`: puuttuvan määrän ja jo valittujen tuotteiden käsittely.
- `server/storefront.mjs`: sama hinta-/saatavuussääntö haussa ja korin tarkistuksessa, lisäksi täsmällinen tuotenumerohaku.
- `server/storefront-checkout.mjs`: tarkistettu yhteenveto → gatewayn allekirjoitetut tarjoukset → `placeOrder` → käyttäjän napin painalluksen hyväksyntä → tilausloki. Enintään 80 tuotteen tarjoukset haetaan 20 tuotteen erissä. Rivit, määrä, hinta, alv ja toimituspäivä sidotaan palvelimen luonnokseen; ne eivät tule vahvistuskutsun vapaista kentistä. Viisi minuuttia voimassa oleva satunnainen token on myös idempotenssiavain. Vahvistuksen uusinta samalla tokenilla palauttaa saman tilauksen; rinnakkaiset vahvistukset yhdistetään.
- Uudet reitit: `POST /api/storefront/checkout` ja `POST /api/storefront/checkout/confirm`. Luonnos tallennetaan keittiökannan `kv`-tauluun avaimella `storefront.checkout.<token>`, varsinainen tilaus gatewayn tilauskantaan. Demo ei vielä siivoa luonnosavaimia ajastetusti tai tarjoa tuotannon tilikohtaista tilaushistoriaa.

## Käyttöönotto olemassa olevaan localhost-palvelimeen

Hae uusin koodi puhtaaseen työpuuhun `git pull --ff-only` ja käynnistä Node-palvelin uudelleen tavallisella `npm start` -komennolla. Käytä olemassa olevia data-/ympäristöasetuksia; älä nollaa tai korvaa nykyisiä tietokantoja. Pelkkä selaimen päivitys ei lisää palvelimeen uusia checkout-reittejä. Avaa sen jälkeen `http://localhost:4747/` tai `/agent` ja päivitä selain.

Tämä korjaus ei korvaa puuttuvaa `data/catalog.json`-aineistoa tai muuta oikean mock-API:n toimituspäivärajoituksia. Sivun ajamiseen tarvitaan edelleen normaali katalogi. Automaattitesteille voi antaa erillisen synteettisen katalogin ympäristömuuttujalla `AIMO_CATALOG`; älä käytä sitä varsinaisen challenge-aineiston korvikkeena päädemossa.

## Tarkistukset

```bash
node --disable-warning=ExperimentalWarning --test test/cart-selection.test.mjs test/storefront-cart.test.mjs test/storefront-checkout.test.mjs test/whatsapp*.test.mjs test/assistant-whatsapp.test.mjs
```

Checkout-testit luovat oman synteettisen katalogin, tietokannat ja allekirjoitusavaimen väliaikaiseen hakemistoon. Ne eivät vaadi challenge-aineistoa tai ulkoisia API-kutsuja. Muu projektin koko testisarja edellyttää edelleen paikallista katalogia.
