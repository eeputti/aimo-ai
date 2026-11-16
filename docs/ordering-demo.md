# WhatsAppista koriin: kokeilu ja tarkistukset

Varsinainen polku käyttää yhtä palvelimella tallennettua luonnosta WhatsAppissa ja yksityisellä korisivulla. Hinnat ja saatavuus tarkistetaan taustapalvelusta. Käyttäjä valitsee tuotteet ja vahvistaa tilauksen erikseen selaimessa.

## Kokeilu

1. Käynnistä [WhatsApp-palvelin](whatsapp.md) tilaustilassa omilla demo-/testikannoilla. `/healthz` kertoo `ordering-demo`.
2. Varmista testinumeron Meta-hyväksyntä ja paikallinen numeroliitos. Paikallinen `/demo` toimii saman keskustelun varakokeiluna omalla synteettisellä asiakkaalla; se ei todista puhelinviestien toimitusta.
3. Kirjoita esimerkiksi `20 l maitoa ja 5 l kermaa maanantaiksi`. Ilman päivää apuri kysyy ensin toimituspäivän.
4. Vastaa tuotekohtaisiin tarkennuksiin ja valitse tuotteet numero kerrallaan. `Näytä lisää` hakee muita vaihtoehtoja.
5. Pyydä tarvittaessa `maitoa sittenkin 30 litraa`. Tarkista, että muut rivit ja ruokarajoitteet säilyvät.
6. Kuittaa yhteenveto ja avaa WhatsAppin lähettämä **Avaa ostoskori** -linkki. Tarkista tuotteet, pakkaukset, hinta ja päivä.
7. Valitse **Siirry maksamaan**. Painike pyytää tuoreen yhteenvedon, tekee demotilauksen ja avaa demomaksun, jonka **Hyväksy demomaksu** on viimeinen vaihe. Painike toimii vasta, kun toimituspäivä, tuotteet ja määrät ovat kunnossa.
8. Tarkista tilausnumero. Sivun uudelleenlataus ja saman vahvistuksen uusinta eivät saa tehdä toista tilausta. Mahdollinen demomaksu avautuu vasta rakenteisesti vahvistetulle tilaukselle.

Käytä toimituspäivää, jolle taustapalvelu tarjoaa tuotteita. Haasteen rajapinnan kellot ja saatavuus voivat estää vanhojen esimerkkipäivien tilaamisen. `DEMO_NOW` on erikseen asetettava demokello, ei tuotannon toimituslupaus.

## Automaattiset tarkistukset

```bash
npm test
npm run aimo:eval
npm run aimo:eval:spoken
```

Kohdistettu HTTP-koe:

```bash
node --disable-warning=ExperimentalWarning --test test/local-shop.test.mjs test/whatsapp-storefront-cart.test.mjs test/whatsapp-checkout.test.mjs
```

Testit käyttävät omia kantoja, simuloituja hinta-/Meta-palveluja ja tarvittaessa väliaikaista allekirjoitusavainta. `local-shop` tarkistaa myös gatewayn hyväksynnän ja audit-ketjun sekä vanhojen demoreittien poistumisen. Korisivun testi tarkistaa allekirjoitetun luonnoksen, revisiot, vahvistusuusinnan ja kuittauksen säilymisen latauksessa. Mallia käyttävät erilliset selfplay-ajot ovat `scripts/whatsapp-selfplay*.mjs`-tiedostoissa; niitä ei käynnistetä automaattisesti.

Oikean puhelimen toimitus, Valion oikea asiakastunnistus, oikea tilaus ja rahansiirto vaativat erillisen varmennuksen. Gatewayn demotallennusta ei esitetä oikeana Valio-tilauksena.
