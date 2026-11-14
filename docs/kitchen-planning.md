# Keittiön resepti- ja ostotarvelaskenta

`/kitchen.html` käyttää `server/planning.mjs`-moduulin laskentaa. Se on erillinen demoasiakas; gatewayn `/v1`-rajapinnat eivät itsessään ennusta keittiön kulutusta.

Tuotteen ostotarve lasketaan myyntiyksiköissä:

```
tavallisen myynnin historiaennuste × varauskerroin
+ tämän viikon ryhmien reseptitarve / saantokerroin
− käyttökelpoinen inventaario
− vahvistetut saapuvat toimitukset
= ostotarve, vähintään 0, pyöristettynä ylöspäin myyntierään
```

Historiaennuste huomioi mediaanin, trendin ja tilausrytmin. Varauskerroin voi pienentää määrää. Kuivatuotteille ja non-foodille varausmuutoksesta käytetään puolet, muille koko muutos. Alle 3 % muutosta ei sovelleta. Puuttuva varauspäivä ei tarkoita nollaa asiakasta: silloin käytetään historiaennustetta ja näytetään huomio.

## Ryhmät ja reseptit

Ryhmämenun annosmäärä saadaan suunnitteluviikolle osuvien `groups`-rivien `pax`-summasta. Vanha `portions`-kenttä ei ohjaa laskentaa. Näin seuraavan viikon ryhmä ei tule tämän viikon tilaukseen.

`includedInBookings: true` tarkoittaa, että ryhmä sisältyy saman päivän varauslukuun. Nämä asiakkaat vähennetään tavallisen myynnin varauksista ennen varauskerrointa. Ryhmän raaka-aineet lasketaan reseptistä. `false` tarkoittaa erikseen ilmoitettua ryhmää, jota ei vähennetä varausluvusta. Asetuksen voi antaa menulle tai ryhmäkohtaisesti; ryhmän asetus voittaa. Uusi API-syöte vaatii tämän tiedon. Vanhassa demodatassa oletus on `true`.

Reseptirivin `amount` on määrä yhtä annosta kohti. Yksiköt ovat `g`, `kg`, `ml`, `cl`, `dl`, `l` ja `sales` (tuotteen myyntiyksikkö). Valinnainen `yield` on saanto välillä 0–1, nolla poissuljettuna. Esimerkiksi 120 g annospainoa ja `yield: 0.8` tarkoittaa 150 g ostettavaa raaka-ainetta. Ilman kerrointa määrä käsitellään jo ostettavan raaka-aineen määränä (`yield: 1`); hävikkiä ei arvata.

Saman tuotteen reseptitarpeet summataan ennen pakkauspyöristystä. Tuote tulee mukaan myös ilman historiaa tai vaikka sen normaali tilausrytmi ei osu tälle viikolle. Kilot muunnetaan painotiedolla, litrat tilavuustiedolla; tiheyttä ei oleteta. Puuttuva muunnos tai ristiriitainen ryhmäluku tuottaa `planningIssues`-esteen, joka estää tilauksen myös tuoreessa tilausarviossa. Keittiön UI näyttää esteen päätöskorttina.

Reseptiin tarvittavaa tuotetta ei korvata automaattisesti. Vaihtoehtoihin lisätään huomio mausta, koostumuksesta ja saannosta; käyttäjä valitsee korvauksen. Allergeeni-, ruokavalio-, hinta- ja saatavuustarkistukset säilyvät käytössä. Tämä ei ole automaattinen arvio kulinaarisesta vastaavuudesta.

## Inventaario ja saapuvat toimitukset

Inventaario on erillinen, käyttäjän tai integraation antama saldo. Toimittajan saatavuus ei ole keittiön varastosaldo. Inventaarion `asOf` pitää olla suunnitteluviikon alkupäivä. Jokaisella erällä on yksilöllinen `id`, `productId`, `amount`, `unit` ja säilyvyyden varmistava `expiresOn`.

Vähennykseen hyväksytään vain koko viikon loppuun säilyvät erät. Saapuvan toimituksen pitää olla tilassa `confirmed`, saapua viikon alkupäivänä ja säilyä viikon loppuun. `received`-toimitus kuuluu inventaarioon, eikä sitä lasketa uudelleen saapuvana. Tunnukset eivät saa toistua saman listan sisällä. Inventaarion ja saapuvien erien pitää kuvata eri fyysisiä määriä.

Vanhasta inventaariosta, puuttuvasta säilyvyydestä, kesken viikon vanhenevasta erästä ja eri päivänä saapuvasta toimituksesta näytetään huomio ja erä jätetään vähentämättä. Päiväkohtainen varaston kierto tai säilyvyysoptimointi ei vielä kuulu laskentaan. Puuttuva inventaario ei pienennä ostomäärää. Budjettikarsinta huomioi nämä vähennykset ja säilyttää reseptitarpeen.

## Tietojen päivittäminen

`GET /api/planning` palauttaa nykyiset `menuEvents`, `inventory` ja `incoming`-tiedot. `POST /api/planning` päivittää annetut kentät; muut säilyvät. Esimerkin päivämäärät on vaihdettava ehdotuksen toimitusviikolle:

```json
{
  "menuEvents": [{
    "id": "ryhma-1",
    "name": "Perjantain kalamenu",
    "includedInBookings": true,
    "groups": [{ "date": "2026-11-20", "pax": 100 }],
    "recipe": [{ "productId": "461915", "amount": 0.12, "unit": "kg", "yield": 0.8 }]
  }],
  "inventory": {
    "asOf": "2026-11-16",
    "items": [{ "id": "kala-era-1", "productId": "461915", "amount": 2, "unit": "kg", "expiresOn": "2026-11-22" }]
  },
  "incoming": [{
    "id": "toimitus-1-rivi-1",
    "productId": "461915",
    "amount": 3,
    "unit": "kg",
    "deliveryDate": "2026-11-16",
    "expiresOn": "2026-11-22",
    "status": "confirmed"
  }]
}
```

Virheellinen rakenne palauttaa 400 eikä tallenna muutosta. Hyväksytty päivitys palauttaa 202 ja laatii uuden ehdotuksen. Käynnissä olevan laskennan aikana päivitys palauttaa 409. Tietojen muuttuminen mitätöi vanhan ehdotuksen tilauskelpoisuuden: uuden ehdotuksen pitää valmistua ja läpäistä normaali tilausarvio. Tätä API:a ei vielä ole kytketty varasto- tai reseptijärjestelmään eikä käyttöliittymässä ole tietojen syöttölomaketta.

## Tarkistukset ja rajaukset

`npm test` ajaa laskenta-, ehdotus- ja HTTP-regressiotestit. Kokonaisuustestit käyttävät väliaikaisia `AIMO_DB`- ja `GATEWAY_DB`-kantoja sekä simuloituja hintoja ja saatavuutta, eivät käyttäjän demoa tai API-kiintiötä. HTTP-testi tarvitsee luvan avata paikallisen väliaikaisen portin. Paikallinen tuotekatalogi tarvitaan kuten `npm run aimo:eval`-testissäkin.

Ostohistoria kuvaa edelleen hankintoja, ei mitattua kulutusta. Historiassa olevien aiempien ryhmien ostomääriä ei erotella normaalista kulutuksesta; ennusteen tarkkuus pitää arvioida oikealla kulutus- ja varastodatalla. Viikoittainen tilausmalli, käsin määritellyt tuoteryhmäpainot ja hankintojen takaisin kirjoittaminen historiaan ovat edelleen demon oletuksia. Todennettua säästöä tai hävikin vähenemistä ei väitetä.

Koodipäivitys ei laske uudelleen jo tallennettua luonnosta. Käynnistä palvelin uudella koodilla ja käytä keittiön **Aja uudelleen** -toimintoa, kun haluat korvata luonnoksen. Käyttäjän käynnissä olevaa demoa tai muokattua ehdotusta ei nollata automaattisesti.
