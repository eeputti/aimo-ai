# Sadan synteettisen asiakkaan loppukoe

Omistaja: Codex, token-korjauschatti. Tämä on erillinen laaja varmennus toisen itsekeskusteluchatin ydinkorjausten rinnalla. Ydintiedostoja ei muokata päällekkäin.

## Tavoite ja rajaus

Käyttäjä pyysi 15.11.2026 noin sataa erilaista asiakasprofiilia, aitoja keskusteluja WhatsApp-apurin kanssa ja virheiden korjaamista niin, että moni polku pääsee loppuun. Toteutuksessa on 100 synteettistä ostajaprofiilia: 20 erilaista ostotilannetta viidellä viestintätavaltaan ja taustaltaan erilaisella ostajalla. Määrät ja osa toimituspäivistä vaihtelevat. Profiilit ovat versionhallittua testidataa, eivät oikeita asiakkaita.

- Polut: kananmunat, maito, desilitrat, grammat, monirivinen kori, määrän korjaus, poisto, myöhempi lisäys, päivän vaihto, neuvontakysymys ennen tilausta, maitoallergia, gluteenittomuus, vegaanisuus, millilitrat, nollauksen kielto, uusi alku, puuttuvat tiedot, tervehdys kesken tilauksen, lisätuotteista kieltäytyminen ja puuttuva tuote.
- Sama WhatsAppin allekirjoitettu HTTP-webhook, jono, dialogi, tulkki, tuotehaku ja gateway. Simuloitu asiakas vastaa oikealla mallilla. Metan lähetys korvataan muistissa kerättävällä vastauksella; toimitus/saatavuus/hinnat ovat nykyinen simulaatio, eivät live-Valio.
- Korilinkki avataan oikeaan HTTP-reittiin. Sama luonnos varmistetaan, ja selaimen kori-API:a pitkin jatketaan tarkistukseen. Testi hyväksyy vain odotuksia vastaavan korin. Vasta sen jälkeen tehdään eristetty gatewayn demovahvistus ja uusitaan täsmälleen sama pyyntö kaksoistilauksen eston tarkistamiseksi. Tämä API-koe ei ole visuaalinen selaintesti.
- Eri prosessit käyttävät erillisiä tilapäisiä kantoja ja generoituja allekirjoitusavaimia. Oikeita WhatsApp-kantoja, numeroita, tilauksia, tokenia tai palvelinta ei käytetä. Verkkopyynnöt on rajattu localhostiin ja mallitoimittajaan. Malliavain välitetään prosessien ympäristössä, ei tiedostoihin tai raportteihin.
- Jokainen ajo ottaa muuttumattoman lähdekopion. Raportti sisältää commitin sekä käytettyjen palvelintiedostojen hashit, joten muiden chatien myöhemmät muutokset eivät vaihda testiä kesken ajon. `--source-ref` mahdollistaa saman testin ajamisen vanhalla commitilla.

## Mittarit

Mallin kauniista vastauksesta ei anneta läpäisyä. Koodissa tarkistetaan jokainen odotettu rivi, määrä ja yksikkö, rajoitteiden säilyminen, ei ylimääräisiä rivejä, oikea päivä, linkin avautuminen, tarkistus ja yksi demotilaus. Puuttuvalle tuotteelle sekä oikeasti estyvälle rajoitehaulle kelpaa perusteltu pysähdys ilman tilausta. Virhetilat ja duplikaatit näkyvät erillisinä virheinä. Asiakkaan pakolliset korjaus-/poisto-/nollausviestit tulevat versionoidusta tavoitteesta; malliasiakas ei saa poistaa testin vaikeutta muuttamalla tavoitetta.

Tämä on sovelluksen evaluointia ja löydösten kautta tehtävää kehitystä, ei perusmallin painojen koulutusta. Satakin simuloitua asiakasta on rajattu otos, ei todiste kaikkien oikeiden käyttäjien onnistumisesta. Erillistä jatkuvaa tai ajastettua ajoa ei luoda tämän kertaluonteisen pyynnön perusteella.

## Ajaminen ja tämän vaiheen tila

`node --disable-warning=ExperimentalWarning --env-file=.env scripts/whatsapp-profiles-eval.mjs --workers 3 --out /private/tmp/aimo-profiles-100.json`

Rajaus: `--ids P001,P003` tai `--limit 20`. Vertailu: `--source-ref <commit>`. Enintään neljä työntekijäprosessia ja 12 keskustelukierrosta/profiili. Raportit sisältävät vain synteettisiä keskusteluja; linkkien tunnisteet on peitetty. Täydet raakakeskustelut ja katalogista saadut vastaukset säilyvät paikallisessa tilapäisessä raportissa, eivät Gitissä.

- Evaluoijan **7 testiä läpi**: sata erillistä tavoitetta, korin virheiden tunnistaminen, linkin erottaminen loppuun viedystä tilauksesta, puuttuvan tuotteen esto, metriikat/linkkien peitto, toimituspäivä ensin ja vain katalogin tiedolla osoitettu tarkka yksikkövastaavuus (esim. 2 × 1 l = 2 l). Valitun tuotteen nimen ja tallennetun tilauksen päivän/tuotetunnisteiden vastaavuus tarkistetaan myös.
- Neljän profiilin vertailu vanhaan `90ca34f`-versioon: **1/4 läpi**, 0 korilinkkiä, 0 tarkistusta tai demotilausta. Puuttuva tuote pysähtyi turvallisesti. Kananmunapolussa turha ruokavaliokysymys; luonnollisiin koripyyntöihin malli toisti ettei linkkiä voi lähettää. Yhdessä tapauksessa ei saatu saman jonokäsittelyn aikana vastausta; se on erillinen suoritusvirhe, ei varmennettu mallin toimintavirhe. 95 onnistunutta mallikutsua, 0 API-kutsun epäonnistumista. Alkuperäinen tiukka määrä-/yksikkötarkistin merkitsi yhden 2 × 1 l -määrän eri yksiköksi; katalogiin perustuvan vastaavuuden jälkeen korin tarpeet tarkistetaan uudelleen molemmille piloteille samalla kriteerillä (`*-rechecked.json`).
- Samat neljä profiilia toisen chatin keskeneräiset korjaukset sisältävällä muuttumattomalla kopiolla: **3/4 läpi**, 4 linkkiä, 3 tarkistusta ja **3 demotilausta ilman duplikaattia**. Kananmunat, desilitrat ja maitomäärän korjaus etenivät loppuun. Puuttuvan tuotteen tapaus nosti uuden löydöksen: kuvitteelliselle kuukivijogurtille tarjottiin tavallisia jogurtteja. Alkuperäinen tarkistin löysi 4/4 oikeat tarverivit; valitun tuotteen tarkennettu tarkistus antaa **3/4 oikeaa koria**, koska viimeisen korin valittu tuote oli korvike. Tässä pilotissa myös simuloitu ostaja ajautui valitsemaan korvikkeen vastoin tavoitetta; evaluoijaa tarkennettiin ennen laajaa ajoa. Pilotti ei ole vielä todiste tuotehaun oikeellisuudesta.
- **Sadan profiilin ensimmäinen ajo käynnissä**. Neljä prosessia; lähdecommit `3c4f1c4` sekä kopion jokaisen palvelintiedoston hash tallennettu raporttiin. Koska kopio sisältää muiden chatien keskeneräisiä muutoksia, pelkkä commit ei yksilöi testattua toteutusta. Täydet tulokset ja korjausten jälkeinen varmennus lisätään vasta valmistuttua. Paikalliset raportit `/private/tmp/aimo-profiles-baseline.json`, `/private/tmp/aimo-profiles-pilot.json` ja `/private/tmp/aimo-profiles-100-round1.json`.
- Paikallinen koordinointivaraus `484c55ac`. Yhteinen etä-MCP ei vastannut aloituskutsuihin. Claude Codelle ja toiselle Codex-chatille ilmoitettu tästä sadan profiilin kokeesta, jotta samaa maksullista sarjaa ei ajeta kahdesti.
