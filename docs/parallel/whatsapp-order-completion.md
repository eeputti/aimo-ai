# WhatsApp-listan eteneminen demotilaukseen 14.11.2026

Käyttäjä pyysi toimivan viestikanavan jälkeen, että nykyinen tilaus saataisiin läpi. Tämä on tokenikorjauschatin seuraava vaihe. Kuljetuksen korjaus on valmis ja GitHubissa `fc29a0b`:ssä; tällä hetkellä yksi worker PID 59831 käyttää testattua 27ee93b-snapshotia ja toimivaa messaging-only SYSTEM_USER-tokenia. Käyttäjä vahvisti uuden vastauksen saapumisen puhelimeen.

## Nykyisen tilausesteen lukutarkistus

- Käyttäjän aktiivisessa luonnoksessa on 50 l maitoa, 50 kananmunaa ja 5 l kermaa, toimituspäivä 18.11.2026. Käyttäjä oli kuitenkin pyytänyt kermaa **5 dl**. Mallitulkki on siis muuttanut määrän kymmenkertaiseksi. Tätä ei hyväksytä oikeaksi tilaukseksi.
- Tuotevalinnan 2 / 1 / 1 jälkeen tarjous pysähtyi, koska kaikkien kolmen tuotteen testirajapinnan palauttama saatavuus alkaa **16.11.**, mutta gateway käyttää sitä virheellisesti tarjouksen toimituspäivänä pyydetyn **18.11.** sijaan. Tilausta ei tehty. Virheteksti "toimitetaan vasta 16.11." on siksi myös harhaanjohtava.
- **Syy varmistettu rajapintasopimuksesta:** paikallinen `data/raw/openapi.json`, `/api/availability` kuvaa `scheduleLines[].availableDate`:n aikaisimmaksi saatavuuspäiväksi (ei pakolliseksi toimituspäiväksi). `server/storefront.mjs:orderableProduct` jo hyväksyy saatavuuden pyydettyä päivää ennen. `server/gateway/service.mjs:assess` laskee jo max(saatavuus, pyydetty), mutta `buildOption` valitsee vain rivien raakojen saatavuuspäivien maksimin. Tarjouksen toimituspäivä pitää rajata vähintään asiakkaan pyytämään päivään; myöhempi saatavuus aiheuttaa yhä toimituspäiväpoikkeaman. `order-tools`:n tarjouksen ja luonnoksen yhtäsuuruustarkistusta ei tarvitse poistaa.
- Pelkkä TILAA ei ohita tätä estettä. Päivää tai käyttäjän alkuperäistä määrää ei muuteta salaa, eikä asiakkaan puolesta vahvisteta tilausta.

## Seuraavat toimet ja omistajuus

- Käyttäjä tarkensi nimenomaisesti: **toimituspäivän saa itse päättää ja apuri varmistaa sen yhteenvedossa**. Alkuperäinen 18.11. säilytetään; ehdotusta vaihtaa maanantaille ei hyväksytty. Kerma palautetaan alkuperäiseen 5 dl:n tarpeeseen, jonka myyntipakkaus voi ylittää.
- Henkilöiden 2–3 omistamien tulkki-/työkalutiedostojen korjaus pyydetty Eeliksen Claudelta yhteisellä MCP-viestillä. Mallipromptissa (`server/order-conversation/interpret.mjs`) puuttuu nimenomainen ml/cl/dl/g-muunnos, joka jo löytyy toisesta `server/aimo/model.mjs`-polusta. Pelkkää määrää tulkitseva `bareQuantity` tukee vain l/kg/kpl. Omistajalta pyydetty muunnoksen korjaus ja todellinen regressio, ei päivävertailun ohitusta.
- Gatewayn päivämääräosuus otettiin omaksi rajatuksi henkilön 3 työvaiheeksi ja varattiin molemmilla tauluilla: vain `server/gateway/service.mjs` ja uusi `test/whatsapp-delivery-date.test.mjs`. Muutoksesta ja tarkasta rajasta ilmoitettiin Eeliksen Claudelle; tiedostoihin ei ollut toista aktiivista varausta. Keskustelutulkki ja rinnakkaisen WhatsApp-dialogichatin tiedostot säilyvät niiden omistajilla. Käyttäjän WhatsApp-jonoa, luonnoksia tai tilauksia ei nollata.
- Valmis tarkistettava yhteenveto ja käyttäjän erillinen TILAA nykyisessä tilauskeskustelussa tarvitaan edelleen. Tuloksena on nykyisen gatewayn **demotilaus**, ei oikea Valion tuotantotilaus.

## Toteutettu gateway-korjaus ja tarkistukset

- `buildOption` käyttää toimituspäivänä max(pyydetty päivä, rivien aikaisin saatavuus). Raaka saatavuuspäivä säilyy faktana rivin saatavuustiedossa. Pyydetty päivä säilyy tarjouksen vastauksessa, JWS-allekirjoitetussa sisällössä ja lopullisessa demotilauksessa. Aidosti myöhäisempi saatavuus näkyy edelleen `DELIVERY_DATE_SHIFT`-poikkeamana.
- Tuore tilaushetken tarkistus estää myös tilanteen, jossa saatavuus on tarjouksen jälkeen siirtynyt allekirjoitetun toimituspäivän yli. Tulos on `OFFER_STALE` ja hylkäys; vanhalla tarjouksella ei vahvisteta myöhästyvää toimitusta.
- Uusi regressio käyttää oikeaa gatewayta, allekirjoituksia ja tilaustallennusta, synteettistä katalogia, omia tilapäisiä kantoja ja vain paikallista simuloitua toimittaja-API:a. Ennen korjausta kaksi olennaista tapausta epäonnistui (16.11. korvasi pyydetyn 18.11.; tuore myöhästyminen hyväksyttiin). Korjauksen jälkeen **5/5 läpi**: aiempi/sama/myöhempi saatavuus, päivien säilyminen allekirjoituksessa ja tilauksessa sekä tuore myöhästyminen. Ei oikeita Meta-/Valio-/mallikutsuja tai käyttäjän kannan muutoksia.
- Kohdistettu keskustelu-, tuotetyökalu-, toimituspäivä- ja oikea HTTP-handoff/gateway-ketju **28/28 läpi**. Syntaksi ja `git diff --check` läpi.
- Koko yhteisen keskeneräisen työpuun `npm test`: **201/203 läpi, 2 virhettä**, ei ohituksia. Rinnakkainen uusi dialogi tuottaa enemmän vastausosia kuin vanhan e2e-testin odotus; toinen virhe on juuri julkaistun storefront.js:n uuden exportin ja vanhan classic-script-testituplan ristiriita. Virheet raportoitiin omistajille, niitä ei korjattu päällekkäin. Koko sarjaa ei merkitä läpäistyksi.

Gateway-korjausta ei ole vielä ladattu nykyiseen 27ee93b-prosessiin. Odottaa omaa rajattua commitia sekä tarvittavien tulkki-/dialogiosuuksien valmiutta yhtä sovittua päivitystä varten. Käyttäjän aktiivisen luonnoksen kerma on edelleen väärin 5 l, kunnes alkuperäisen 5 dl:n pyynnön korjaus tehdään normaalin keskusteluketjun kautta. Tilausta ei ole vahvistettu.

## Yhdistetyn version tarkistus ennen käyttöönottoa

- Gateway-vaihe on GitHubissa **f7f7222**, kanavan tarkka yksikkönormalisointi ja ajantasainen dialogi **812783a**, korilinkki ja OK-ohjaus **445bee8**. Uusin käyttäjän linjaus toisessa projektichatissa on OK → sama kori → erillinen vahvistus selaimessa. WhatsAppin OK ei siis tee tilausta. Erillinen demomaksutyö jatkuu omistajallaan, sitä ei oteta keskeneräisenä käyttöön.
- Korilinkin HMAC/binding/draft/revision-, origin- ja tietosuojarajat luettiin ennen käyttöönottoa. Linkkityön omistaja korjasi katselmuksessa huomatun kielletyn U+00B7-erottimen omassa tiedostossaan ennen committia. Linkin omistajan raportti `docs/parallel/whatsapp-cart-link.md` sisältää 43 kohdistettua testiä ja selainkokeen.
- Käyttöönottochat korjasi vapaan varauksen kautta ainoan jäljellä olleen storefront-koritestin VM-fixturen ymmärtämään uuden function-exportin. Kori **20/20**, sen jälkeen koko yhdistetty **npm test 219/219**, 0 virhettä/ohitusta. Tuotantokoodia tai testin toiminnallisia odotuksia ei muutettu. Tämä onnistunut ajo korvaa yllä kuvatun aiemman keskeneräisen työpuun 201/203-tilan.
- Yhteinen pilvessä oleva MCP-taulu ei vastannut tämän testikorjauksen varausvaiheessa (Cloudflare-tunnelivirhe 1033). Paikallinen taulu ja juuri tarkistettu yhteisen taulun resurssitilanne varmistivat erillisen testitiedoston omistuksen; muutoksia tai salaisuuksia ei lähetetty virhesivulle. Muiden keskeneräiset lähteet säilyvät niiden omistajilla.
