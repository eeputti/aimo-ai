# Valio Aimo: WhatsApp-tilausapuri

## Nykyinen suunta, käyttäjän päätös 14.11.2026

Pääkäyttöliittymäksi WhatsApp: ammattiostaja kirjoittaa tarpeensa, apuri kokoaa tilausluonnoksen, selvittää puuttuvat olennaiset tiedot, ehdottaa tuotteita ja pyytää ostajan hyväksynnän. Hyödynnetään olemassa olevaa tuotetulkintaa, katalogia, määrämuunnoksia sekä hinta-, saatavuus- ja tilauslogiikkaa.

**Tämä korvaa alla olevan vanhan suunnitelman linjaukset "ei chattia", "ei avoimia kysymyksiä" ja tuotteiden automaattisesta valinnasta.** Vanha kilpailusuunnitelma säilyy historiana; sen tilanneväitteet pitää tarkistaa koodista. Alla oleva suunta kirjattiin ennen toteutusta. **Toteutuksen tila 14.11.2026:** WhatsAppin vain lukeva testikanava, palvelimelle tallennettu keskustelumuisti ja testinumeroiden koodiyhdistäminen on toteutettu; aitoa Meta-puhelintestiä ei ole vielä ajettu. Koodiyhdistäminen on tunnistusjäljitelmä, ei Valion asiakastunnistus. Rakenteinen tilausluonnos, tuotevalinnan hyväksyntä ja gateway-tilaus eivät vielä kuulu tähän kanavaan. Käyttöönotto ja rajat: [docs/whatsapp.md](docs/whatsapp.md).

### Keskustelun toiminta

- Säilytetään palvelimella aktiivinen tilausluonnos: tuotteet, määrät ja yksiköt, ruokavalio- ja allergeenivaatimukset, toimituspäivä, toimituspaikka, ehdotukset ja käyttäjän valinnat. Lyhyt jatkoviesti kuten "eikun 30 litraa" muuttaa oikeaa riviä eikä aloita tilausta alusta.
- Kysytään vain puuttuvaa tai ristiriitaista tietoa, lyhyesti. Aiemmassa saman tilauksen viestissä annettua toimituspäivää tai laktoosittomuutta ei kysytä uudelleen. Edellisen valmiin tilauksen vanhaa toimituspäivää ei siirretä uuteen tilaukseen.
- Selvitetään tarpeen kannalta olennaiset vaatimukset (esimerkiksi laktoosittomuus ja maidon käyttötarkoitus). Laktoositon ei tarkoita maidotonta. Pysyvät asiakasmieltymykset erotetaan tilauskohtaisista vastauksista ja muistetaan vain sovitussa laajuudessa.
- Näytetään muutama perusteltu tuotevaihtoehto ja pakkausmäärä suhteessa tarpeeseen. Tuote, pakkauskoko tai korvaaja ei tule hyväksytyksi pelkän mallin ehdotuksen perusteella.
- Hinnat, allergeenit ja saatavuus tarkistetaan taustapalveluista. Puuttuva tieto säilyy puuttuvana. Toimituspäivän vaihto mitätöi aiemman saatavuusarvion; eri toimituspäivää ei hyväksytä hiljaisesti.
- Ennen tilausta yhteenveto valituista tuotteista, määristä, hinnasta, toimituspaikasta ja päivästä. Hyväksyntä sidotaan juuri tähän luonnosversioon; muutos vaatii uuden hyväksynnän ja tuoreen tarkistuksen. "Joo" tarkentavaan kysymykseen ei ole tilauksen lähetyslupa.

### Asiakkaan tunnistus on Valion vastuulla

Käyttäjän tarkennus: Valion omasta asiakasrekisteristä ja tunnistuspalvelusta selvitetään WhatsApp-lähettäjän asiakkuus. Meille ei rakenneta oletuksena erillistä rekisteröintiä tai omaa kirjautumisratkaisua.

- Integraation tavoite: WhatsApp-tunniste → Valion palvelu → varmennettu asiakas-/käyttäjätunniste, sallitut asiakkuudet ja toimituspaikat sekä tilausoikeudet. Valio määrittelee, milloin puhelinnumerotieto riittää ja milloin sen oma lisävarmistus tarvitaan.
- Asiakasnumeroa, käyttöoikeuksia tai asiakkuuden vaihtoa ei päätetä kielimallilla tai käyttäjän vapaamuotoisella väitteellä. Asiakaskohtaiset hinnat ja tilaushistoria haetaan vain Valion vahvistamalle asiakkuudelle. Tuntematon tai epäselvä asiakkuus ohjataan Valion määrittelemään käsittelyyn ennen asiakastietojen näyttämistä tai tilaamista.
- Valion rekisterin sisältöä, rajapinnan olemassaoloa tai saatavuutta ei ole varmennettu. Ensimmäisessä demossa voidaan käyttää selvästi merkittyä testiasiakasta ja Valio-tunnistuksen rajapintajäljitelmää; se ei todista oikeaa asiakastunnistusta.
- Meta voi välittää käyttäjän business-scoped user ID:n (BSUID) ilman puhelinnumeroa. Kanavasovittimen on tuettava Metan toimittamaa tunnistetta ja Valion kanssa sovittavaa yhdistämistä, ei oletettava numeron olevan jokaisessa viestissä.

### Tekninen suositus ensimmäiseen toteutukseen

WhatsApp Business Platform / Cloud API → HTTPS-webhook → pysyvä viestijono → keskustelun käsittelijä ja tilausluonnos → nykyiset tuotetyökalut → vastaus WhatsAppiin.

- Käytetään virallista Cloud API:a ja aloitetaan Metan testinumerolla. DM Champ voi toimia käyttöliittymävertailuna; sen maksullinen tili tai sisäisen toteutuksen selvittäminen ei ole tekninen edellytys.
- Webhook tarkistaa Metan allekirjoituksen ja kohteena olevan yritysnumeron, tallentaa viestin/jonotyön ja kuittaa vasta pysyvän tallennuksen jälkeen. Sama viestitunniste käsitellään kerran. Toimitus-/lukukuittaukset erotetaan ostajan uusista viesteistä.
- Käsittely järjestetään keskustelukohtaisesti; peräkkäiset viestit tai uusintatoimitukset eivät saa ylikirjoittaa uudempaa luonnosta tai aiheuttaa kaksoistilausta. Tilauksen lähetys käyttää nykyisen gatewayn idempotenssia sekä hyväksytyn luonnosversion tarkistusta.
- Edge-funktio sopii vastaanottimeksi. Ensimmäisen version varsinainen käsittelijä voi käyttää nykyistä Node-palvelinta ja sen SQLite-/katalogiratkaisua. Hosting-alustaa ei ole valittu eikä koko palvelinta luvata siirtää edgeen sellaisenaan. Jonotyön pitää säilyä vastaanotinprosessin päättyessä.
- Nopeuden ensimmäiset keinot: valmiina oleva palvelin, pieni keskustelumalli, lyhyet vastaukset, tarvittavien tuotetietojen rajaus ja hintakutsujen yhdistäminen. Nykyisen `/assistant.html`-polun Render-herätys ja raskas MCP-malliketju arvioidaan erikseen; edge ei yksin nopeuta niitä. Vasteajat mitataan oikealla viestiketjulla ennen lupauksia.
- Asiakkaan viestistä avautuva 24 tunnin WhatsApp-palveluikkuna huomioidaan lähetyksessä. Sen ulkopuolella käytetään hyväksyttyjä viestipohjia. Keskustelumuisti ja WhatsAppin lähetyslupa ovat erillisiä asioita.

### Ensimmäisen toimivan demon tavoite ja avoimet asiat

Yksi testiasiakas lähettää oikeassa WhatsAppissa tuotepyynnön, vastaa puuttuvaan ruokavalio-/päiväkysymykseen, valitsee ehdotetuista tuotteista ja hyväksyy yhteenvedon. Tilaus tallentuu gatewayn demotilauslokiin kerran. Oikeaan Valion tilausjärjestelmään lähettämistä ei väitetä tehdyksi: challenge-API:ssa ei ole tilauspäätepistettä.

Ennen tätä tarvitaan Meta-sovellus ja testinumero, palvelimen salaisuudet turvalliseen ympäristöön, julkinen HTTPS-vastaanotin, pysyvä jono/keskustelutila ja käsittelijä. Valion oikea tunnistus- ja tilausrajapinta ovat erilliset selvitettävät integraatiot. Kanavasta riippumaton keskusteluydin voidaan kehittää ja testata ilman niitä, erillään nykyisestä demokannasta.

Lähteet tarkistettu 14.11.2026: [Meta Developer Hub, testinumerot](https://whatsappbusiness.com/developers/developer-hub/), [webhookit ja lähettäjän tunnisteet](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [viestityypit ja palveluikkuna](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages), [webhook-allekirjoitus](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/?locale=de_DE), [DM Champin kokeilun ehdot](https://help.dmchamp.com/billing/free-trial/). DM Champin dokumentaatio kertoo agentin kokeilemisesta ennen tilauksen valintaa; seitsemän päivän kokeilu kuuluu vain osaan mainostarjouksista ja vaatii kortin.

---

## Aiempi kilpailusuunnitelma: Agent Gateway (historia)

Koottu la 14.11. klo 00.50 Junction-alustan haastesivulta, osallistujaoppaasta ja haasteen datasta.
Päivitetty la klo 01.00: mock-API ja esimerkkipolku on testattu oikeasti, ja suunnitelma on korjattu löydösten mukaan (ks. "Testattu oikeasti").

## Faktat

- **Haaste:** Trusted Trade Agents (Valio Aimo). Palkinnot 4 000 / 2 000 / 1 000 €. Voittajan valitsee Valio Aimo itse omilla kriteereillään.
- **Deadline:** su 15.11. klo 10.00. Lomake sulkeutuu automaattisesti, eikä DRAFT-tilaan jäänyttä projektia arvioida. Tila pitää vaihtaa FINALiksi.
- **Pääpalkinto (10 000 €):** vertaisarviointi su 10.30–13.00 valitsee top 5:n, jotka pitchaavat lavalla 3 min + 3 min kysymyksiä. Tiimin on oltava paikalla vertaisarvioinnissa tai pääpalkinto jää saamatta.
- **Säännöt:** kaikki koodi kirjoitettu tapahtumassa, lähdekoodi julkinen (MIT), pitch-video enintään 2.00 min ("not a second longer").

## Arviointikriteerit

| Paino | Kriteeri | Mitä tuomarin pitää nähdä |
|---|---|---|
| 30 % | Toimiva end-to-end-demo | Koko ketju pyyntö → haku → tilaus/hyväksyntä mock-ympäristössä, ei irtopaloja |
| 20 % | Ongelman ja käyttäjätarpeen ratkaisu | Agentti osuu siihen mitä ostaja pyysi, mahdollisimman vähällä käsikorjauksella |
| 20 % | Autonomia ja kontrollit | Mitä agentti päättää yksin, mikä menee ihmiselle, miten päätökset kirjataan |
| 15 % | Poikkeustilanteet | Osittainen saatavuus, korvaavat tuotteet, toimitusrajoitteet |
| 15 % | Avoimuus ja tuotantopolku | Avoimet dokumentoidut standardit, näkyvät oletukset, perustellut valinnat, jatkoaskeleet |

## Kriteerien tilanne (ajettu `npm run demo` la klo 01.22)

Tavoite: jokainen kriteeri täytetään kokonaan. Portti on koodissa kansiossa `server/gateway/`, ja koko ketju meni läpi viidellä skenaariolla live-mock-API:a vasten.

| Paino | Kriteeri | Toimii nyt (nähty ajossa) | Puuttuu |
|---|---|---|---|
| 30 % | End-to-end-demo | Haku → allekirjoitettu tarjous → tilaus → hyväksyntä → loki, noin 75–250 ms. Konsoli `/gateway.html`, puhelinnäkymä `/approve.html`. | Julkinen deploy ja git-repo. Etusivu `/` on yhä vanha keittiö-UI. |
| 20 % | Osuu pyyntöön | Briefin lause → 464306 × 1 000 = 1 010,00 €. Suomi ja englanti. | Testisetti 15–20 pyyntöä ja X/20-luku. Tuotetyypit kuratoitu vain maidolle, kermalle, voille ja kananmunille. |
| 20 % | Autonomia ja kontrollit | Oletus "aina kuittaus", ostajakohtainen mandaatti (Nordic Hotels itsenäinen 1 000 € asti), hyväksyntä yhdellä napilla, syykoodit. "Unohtui kerma" -lisäys valmiiseen tilaukseen (`add_to_order`, demon skenaariot 6 ja 7). | Ilmoitus oikeasti puhelimeen (sähköposti tai viesti). |
| 15 % | Poikkeukset | Osittainen saatavuus + korvaaja hyväksytty itse sääntöjen sisällä, sulkemisaika, toimituspäivän siirto ihmiselle, muokattu tarjous hylätään. | – |
| 15 % | Avoimuus ja tuotantopolku | Yksi sopimus → REST, MCP ja `/openapi.json`, JWKS, hash-ketjutettu loki (ketju ehjä), README. | Toinen ulkopuolinen MCP-asiakas kokeiltu vain curlilla. Julkinen repo (MIT). |

Pieni siivottava: demoagentti kutsuu reittiä `POST /api/aimo/interpret`, jota ei ole (404, "ei käytetty"). Ei riko mitään, mutta näkyy demon tulosteessa.

## Testattu oikeasti (la klo 00.50–00.55)

Ajettu mock-API:a vasten (noin 20 lukukutsua, maitohylly 620 tuotetta) ja nykyistä koodia vasten. Koodiin ei koskettu.

| # | Löydös | Seuraus suunnitelmalle |
|---|---|---|
| 1 | Englanninkielinen haku ei toimi: "lactose-free milk" palauttaa rahkaa, alkoholitonta kuohuviiniä ja yleispuhdistusainetta. | Briefin esimerkki on englanniksi ja tuomarit kirjoittavat sen sellaisenaan. `nameEn` on katalogissa 17 544 tuotteella, mutta sitä ei indeksoida. **Korjataan ensimmäisenä.** |
| 2 | Suomeksikin haku sekoittaa: "laktoositon maito" nostaa kärkeen kahvimaitoa, kondensoitua maitoa ja annosmaitoa. | Haun jälkeen tarvitaan tuotetyypin rajaus (kategoria 10400, ei makua / kahvia / annospakkausta) tai LLM:n valinta enintään 30 ehdokkaasta ennen hintakyselyä. |
| 3 | Terminal-tuotteiden tilausaika umpeutui jo to 12.11. klo 12–15, mutta API näyttää ne silti saatavina maanantaille. | Portin pitää itse verrata `closingTime`a nykyhetkeen. Nykyinen koodi kuljettaa kentän mukana mutta ei vertaa sitä mihinkään. Maitohyllystä 317/620 on Terminal, mm. kaikki 10 l novoboxit. |
| 4 | Stock-tuotteiden tilausaika umpeutuu su 15.11. klo 17.00. | Sen jälkeen mikään ei ole tilattavissa oikealla kellolla. Tarvitaan **demokello**: asetettava "nyt", näkyvästi merkittynä. Ilman sitä julkinen demolinkki on rikki sunnuntai-illasta alkaen. |
| 5 | API ei välitä `requestedDate`sta: toimituspäivä on aina ma 16.11. (kokeiltu päivillä 14.–23.11.). | Toimituspäiviä on yksi. "Maanantaiksi" toimii, "sunnuntaiksi" on aina myöhässä, mikä on valmis toimitusrajoite-poikkeus. Toimituspäivien vertailua ei kannata rakentaa. |
| 6 | Litramäärä on katalogissa vain 960 tuotteella 17 546:sta. Esim. 10 l novoboxilta (laatikossa 2) se puuttuu. | Lisätään parsinta nimestä (`10 l`, `5 dl`, `12 x … 1 L`) kertaa `perSales`. Tarkistus hinnasta: nettohinta ÷ vertailuhinta = litrat per myyntiyksikkö (31,31 ÷ 1,57 ≈ 20 l). |
| 7 | Esimerkkitilauksen arvo on 1 010 € (alv 0 %), eli alle 1 800 €:n oletuskaton. | Tilaus menisi läpi ilman ihmistä, eikä hyväksyntää nähtäisi demossa. Hotelliketjulle oma mandaatti, katto 1 000 €. |
| 8 | Esimerkin kaikilla tilattavilla Valion maidoilla toimitusvarmuus on 1 ja CO2 1,1; Arlan maidoilta toimitusvarmuus puuttuu. | "Halvin / varmin / pienin hiilijalanjälki" ei erottele maidossa mitään. Järjestys hinnan mukaan. Kestävyysvertailu vaatisi toisen tuoteryhmän (valinnainen, ei testattu). |
| 9 | "Rajaton saldo" tulee neljänä eri lukuna: 999999, 9999999999, 555555555 ja 666666666. | Nykyinen ehto `>= 999999` kattaa kaikki. Sitä ei saa muuttaa tarkaksi vertailuksi. |
| 10 | 93/620 tuotteella ei ole toimitusriviä lainkaan, 99:llä on oikea rajallinen saldo, `salesBlock` ei esiintynyt kertaakaan. | Osittainen saatavuus löytyy datasta luonnostaan. Demoa ei rakenneta `salesBlock`in varaan. |
| 11 | API vastaa 60–200 ms 620 tuotteelle yhdellä kutsulla. Vastaukset pysyvät samoina, asiakasnumero ei vaikuta, hintavirheitä 0. | Nopeus ja kutsurajat eivät ole riski. Allekirjoitettu tarjous voimassaoloajalla on mielekäs, koska tiedot eivät elä. |
| 12 | Node 24, `node:sqlite` ja Ed25519-allekirjoitus toimivat ilman lisäkirjastoja. Koneella ei ole deploy-työkaluja, eikä kansio ole vielä git-repo. | Allekirjoitus ja hash-ketju ovat halpoja tehdä. Deploy ja repo ovat oma työnsä (ks. aikataulu). |

### Esimerkkipolun oikea vastaus

"I need 1,000 litres of lactose-free milk by Monday." Staattinen rajaus (kategoria 10400 + `FREE_FROM_LACTOSE` + sisältää maitoa + ei makua/kahvia/annosta) antaa 26 tuotetta. Niistä 9 on tilattavissa maanantaiksi (Stock, tilattava viimeistään su klo 17.00), 16 putoaa tilausajan takia (Terminal) ja 1:llä ei ole toimitusriviä.

| Tuote | €/l (alv 0 %) | 1 000 l | Saldo |
|---|---|---|---|
| 464306 Valio Arki Eila kevytmaitojuoma 1 l | 1,01 | 1 010,00 € | ei rajaa |
| 464401 Valio Arki Eila rasvaton maitojuoma 1 l | 1,10 | 1 100,00 € | ei rajaa |
| 463335 Valio Eila 3 % maitojuoma 1 l | 1,40 | 1 400,00 € | ei rajaa |
| 469363 Arla kevytmaitojuoma 1 l UHT | 2,48 | ei riitä | 384 |
| 463380 Arla Cafè maito 1 l UHT | 2,65 | ei riitä | 698 |
| 462775 Arla rasvaton maitojuoma 1 l UHT | 2,57 | ei riitä | 51 |

Odotettu vastaus: **464306 × 1 000 kpl = 1 010,00 €** (alv 13,5 % päälle = 1 146,35 €). Tämä on testisetin ensimmäinen testi. Pyyntö ei kerro rasvapitoisuutta, joten vastaukseen kirjataan oletus näkyviin ("rasvapitoisuutta ei rajattu, valittu halvin") eikä kysytä ihmiseltä.

## PÄÄTÖS (la 14.11. yöllä): ei vanhaan suuntaan

Vanha suunta (keittiöpäällikön tilausagentti / chatbot verkkokaupan päälle) on hylätty. Rakennetaan **Aimo Agent Gateway**: Aimon puolen portti, jonka kautta asiakkaan oma ostoagentti asioi. Keittiön tilausagentti jää vain demoasiakkaaksi, joka todistaa portin toimivan.

## Mitä tiedetään nykyisestä tilaamisesta

- Asiakkaat tilaavat nyt **toimitustukun** kautta: https://toimitustukku.valioaimo.fi/fi/ (tunnukset saa tiimiltä tarvittaessa).
- Kun tuote on loppu, toimitustukku **ehdottaa jo korvaavaa tuotetta**. Kukaan ei soita kenellekään.
- Johtopäätös: "ehdotetaan korvaaja" ei ole uutuus, eikä sitä pitchata ongelmana. Oikea kysymys on, **kuka hyväksyy korvaajan, kun tilaaja on agentti eikä ihminen**: saako agentti vaihtaa itse, milloin kysytään ihmiseltä ja mihin jää jälki. Tämä osuu kriteereihin autonomia (20 %) ja poikkeukset (15 %).

## Tuoteperiaate: näkymätön tekoäly (tiimin linjaus la yöllä)

- **Vertaus pitchiin:** "kuin laittaisit kaverille viestin: unohtui sipsit, tuotko kaupasta." Yksi viesti, kaveri hoitaa eikä kysele merkkiä tai pussin kokoa, ja kertoo vain jos sipsit oli loppu. Sama pätee lisäykseen jo tehtyyn tilaukseen ennen sulkemisaikaa.
- **Ei chattia.** Ihmisiä ärsyttää tekoäly, jonka kanssa pitää jutella ja joka kyselee tyhmiä. Agentti toimii taustalla eikä kysy avoimia kysymyksiä.
- **Agentti saa hyväksyä korvaavan tuotteen itse**, kun korvaaja pysyy sääntöjen sisällä (samat allergeenit, hinta enintään sallitun verran kalliimpi, toimitusvarmuus riittää). Ihminen saa tästä vain ilmoituksen jälkikäteen.
- Ihmiseltä kysytään vain, kun sääntö ylittyy, ja silloinkin yhdellä napilla: hyväksy / hylkää. Ei koskaan tekstikenttää.
- Allergeenirajoitetta rikkovaa korvaajaa ei hyväksytä koskaan, ei agentin eikä yhden napin kautta.
- **Oletuksena mikään tilaus ei lähde ilman ostajan hyväksyntää** (tiimin linjaus). Valmista oletuskattoa ei ole: `proposal.mjs`:n oletus 1 800 € ja `autonomy: 'ask_exceptions'` pitää vaihtaa niin, että oletus on aina kuittaus.
- Ostaja voi itse löysätä: kolme tasoa (aina kuittaus → kuittaus vain poikkeuksissa → itsenäinen sääntöjen sisällä) ja oma euroraja. Agentti ei koskaan saa enempää valtaa kuin ostaja on sille erikseen antanut.
- Hyväksyntä tulee ilmoituksena puhelimeen (sähköposti tai viesti): tilauksen summa, toimituspäivä, muutokset viime kertaan, sulkemisaika ja napit Hyväksy / Muokkaa. Ei avoimia kysymyksiä kuten "haluatko lisätä jotain".
  - Huom: briefin esimerkkitilaus on 1 010 €, eli oletuskatolla se menisi läpi ilman ihmistä. Demon hotelliketjulle annetaan oma mandaatti (katto 1 000 € / tilaus, alv 0 %), jolloin sama pyyntö pysähtyy yhden napin hyväksyntään. Tämä näyttää samalla, että katto on asiakaskohtainen.
- Valion testirajapinnassa ei ole tilauksen lähetystä (vain hinta ja saatavuus), joten tilauksen vastaanotto tehdään itse portin sisään.

## Koodin nykytila (la klo 00.50)

Tehty vanhan suunnan alla, mutta käyttökelpoista portin sisällä:

| Tiedosto | Mitä tekee | Paikka uudessa suunnassa |
|---|---|---|
| `scripts/build-catalog.mjs`, `server/catalog.mjs`, `data/catalog.json` | Tuoteindeksi ja haku (1–3 ms / kysely), yksiköt, allergeenit | `search_products` |
| `server/valioApi.mjs` | Hinta- ja saatavuuskutsut välimuistilla, simulointi ilman avainta | `request_quote` |
| `server/substitutes.mjs` | Oma korvaajahaku | Poikkeukset |
| `server/proposal.mjs` | Deterministinen sääntötarkistus: autonomiataso, kulukatto, allergeenit, toimitusvarmuus | Sääntömoottori |
| `server/db.mjs` | SQLite: tilaukset, ehdotukset, audit-loki, API-välimuisti | Audit trail (hash-ketjutus puuttuu) |
| `server/demo.mjs`, `server/agents/deep.mjs` | Demokeittiö "Ravintola Kulma" ja syvä agentti | Demoasiakas |

Puuttuu vielä: REST- ja MCP-rajapinta samalla sopimuksella, allekirjoitetut tarjoukset, `place_order` tiloineen, hyväksyntänäkymä (`public/` on tyhjä), toinen ulkopuolinen asiakas, testisetti, deploy, video ja deck.

Korjattavat viat nykyisessä koodissa (testattu, numerot viittaavat taulukkoon "Testattu oikeasti"):

- `server/catalog.mjs`: haku indeksoi vain suomenkielisen nimen (1), eikä erota juomamaitoa kahvi-, annos- ja kondensoidusta maidosta (2).
- `server/proposal.mjs` ja `server/agents/deep.mjs`: `closingTime`a ei verrata nykyhetkeen, joten jo sulkeutunut Terminal-tuote menee läpi tilana `ok` (3). Kello pitää saada yhdestä paikasta, jotta demokello toimii (4).
- `scripts/build-catalog.mjs`: `litres` jää tyhjäksi, kun tilavuus puuttuu perusyksiköltä (6).
- `scripts/fetch-data.mjs` ja `scripts/reset-demo.mjs` on mainittu `package.json`issa, mutta tiedostoja ei ole.
- `.gitignore` päästää julkiseen repoon `data/raw/`-kansion CSV:t ja skeemat. Datan ehdoissa lukee, ettei sitä saa käyttää Junctionin ulkopuolella, joten koko `data/raw/` pitää jättää pois ja hakea avaimella käynnistyksessä.
- ~~`server/agents/router.mjs`: sääntöreititin jäsentää briefin lauseen väärin ja varmana.~~ Korjattu la klo 01.20 (ks. "Nopeus ja kielimalli").

## Nopeus ja kielimalli (testattu la klo 01.05)

Nopeus on demon valtti, ja se tulee rakenteesta: kielimallia ei kutsuta, jos ei ole pakko.

| Vaihe | Mitattu aika | Kielimalli |
|---|---|---|
| Sääntöreititin (`routeByRules`) | alle 0,1 ms | ei |
| Tuotehaku | 2–5 ms | ei |
| Valion hinta + saatavuus | 60–200 ms | ei |
| Haiku-varapolku (`routeWithLLM`) | ei mitattu, avain puuttuu | kyllä |
| Opus-tarkistus (`deepReview`) | ei mitattu | kyllä, vain taustalla |

Ilman kielimallia koko polku on noin 0,2 s. Yksikään keskusteleva tekoäly ei pääse siihen, koska jo yksi mallikutsu on tätä hitaampi.

**Malli:** Claude. Anthropicin hackerpack antaa 20 $ API-krediittejä per osallistuja, ja koodi on jo kirjoitettu sille (`claude-haiku-5-5` nopeana, `claude-opus-5-5` taustalla). Haiku-kutsussa on jo oikeat asetukset: ajattelu pois, effort `low`, vastaus skeemalla, lyhyet vastaukset striimattuna.

**Ongelma on tarkkuus, ei nopeus.** Sääntöreititin vastaa briefin lauseeseen nopeasti mutta väärin, ja koska se ilmoittaa varmuudeksi 1, Haiku-varapolkua ei kutsuta lainkaan:

| Lause | Reitittimen tulos |
|---|---|
| "I need 1,000 litres of lactose-free milk by Monday" | Kaksi roskatoimintoa: 1 kpl tuotetta "need" ja 0 kpl tuotetta "litres of lactose free milk by monday". Pilkku luvussa 1,000 katkaisee lauseen. |
| "Tarvitsen 1 000 litraa laktoositonta maitoa maanantaiksi" | Määrä 1 (pitäisi olla 1 000). Välilyönti tuhaterottimena katkaisee luvun. |
| "Tarvitsen 1000 litraa laktoositonta maitoa maanantaiksi" | Määrä 1000 oikein, mutta yksikkö "litraa" katoaa ja "maanantaiksi" jää tuotenimeen. |

**Korjattu la klo 01.20** (`server/agents/router.mjs`, kytkentä `server/agents/fast.mjs`). Kaikki kolme lausetta antavat nyt saman rakenteen: 1 000 l, `FREE_FROM_LACTOSE`, toimitus 16.11., ja briefin toinen virke kirjautuu valintaperusteeksi (hinta, saatavuus) eikä tilausriviksi. Testattu 40 viestillä (suomi ja englanti): 16 ennallaan, 24 muuttui, kaikki muutokset korjauksia. Samalla korjaantui kolme muuta vikaa:

- "lisää 1,5 kg lohta" jakautui kahdeksi riviksi (1 ja 5), koska desimaalipilkku katkaisi lauseen.
- "vähennä kermaa 10 prosenttia" **lisäsi** kermaa 10 %. JavaScriptin `\b` ei tunne ä-kirjainta, joten "vähennä" ja "lisää" eivät koskaan täsmänneet.
- "tarvin 500 g voita" tarkoitti 500 myyntiyksikköä. Litrat ja kilot muunnetaan nyt tuotekohtaisesti myyntiyksiköiksi, ja jos pakkauskoko puuttuu datasta, se sanotaan eikä arvata.

Reititys vie lämpimänä alle 0,1 ms. Koko ketju briefin lauseella eristetyssä kopiossa oikeaa rajapintaa vasten: 319 ms ensimmäisellä kerralla, 75 ms toisella, 3 ms välimuistista.

Vielä auki:

- **Haun tarkkuus (vika 2).** Reitittimen tulos on oikea, mutta haku nostaa englanninkieliselle "milk"-haulle kärkeen maitokiisseliaineksen ja kahvimaitoa. Tämä on `server/catalog.mjs`n asia, ei reitittimen.
- **Keittiönäkymässä "I need 1,000 litres" lisää 1 000 l olemassa olevan rivin päälle** (27 → 1 027 kpl), koska `tarvitsen`/`need` tulkitaan lisäykseksi eikä kokonaismääräksi. Portin kautta tulevassa pyynnössä koria ei ole, joten siellä tätä ei synny.
- Suomenkielinen "2,500 kg" on epäselvä (2,5 vai 2 500). Reititin tulkitsee sen 2,5 kiloksi ja laskee varmuuden 0,5:een, jolloin Haiku ratkaisee, kun avain on käytössä.

Jäljellä olevat nopeuskorjaukset:

1. ~~Ostopyynnön jäsennin säännöillä, suomeksi ja englanniksi.~~ Tehty.
2. ~~Varmuus alas, kun jotain jää ymmärtämättä.~~ Tehty epäselville luvuille ja pitkille jäsentymättömille lauseille.
3. **Haku ja hintakysely liikkeelle heti**, rinnan mahdollisen Haiku-kutsun kanssa, ei sen jälkeen.
4. **Lämmitys käynnistyksessä:** Anthropic-SDK ladataan nyt vasta ensimmäisellä kutsulla, joten demon ensimmäinen mallikutsu on hitain.
5. **Nopeus näkyviin:** jokaisen vastauksen viereen kesto ja kutsumäärät, esim. "190 ms, 0 mallikutsua, 2 API-kutsua". Audit-loki tallentaa keston jo (`ms`-kenttä), ja `apiStats` sekä `llmStats` ovat olemassa.

Pitchiin: briefin oma lupaus on "in a fraction of the time it takes today". Vertailukohta on verkkokaupan minuutit, ei toinen chatbot.

## Pitch deck (PDF palautukseen, lavalla 3 min)

1. **Avaus, sipsivertaus (pakollinen, tiimin linjaus):** kuva tekstiviestistä kaverille: "Ainii, unohtui sipsit, tuotko kaupasta?" ja vastaus "Tuon 👍". Ei muuta tekstiä. Puhuttuna: "Näin helppoa tilaamisen pitäisi olla."
2. **Sama tukussa:** rinnakkain sama viestikupla, nyt "Ainii, unohtui kerma: 10 litraa kuohukermaa samaan tilaukseen" ja vastaus "Lisätty, uusi summa 219,95 €" (oikea luku demon skenaariosta 6; tarkista ennen deckin tekoa). Tämä näyttää käytännössä, miten tuote toimii, ennen kuin mitään tekniikkaa on mainittu.
3. **Ongelma ja ratkaisu:** ostajilla on kohta omat agentit, eikä toimitustukkua ole tehty niille. Me rakensimme oven: rajat, ihmisen hyväksyntä ja jälki jokaisesta päätöksestä.
4. **Demo:** "1 000 litraa laktoositonta maitoa maanantaiksi" alusta loppuun, lopuksi "unohtui kerma" -lisäys.
   - **Näkymätön tekoäly (sanotaan demon aikana, ei omaa diaa):** "Tässä ei ole chat-ikkunaa eikä AI-nappia. Tekoäly näkyy siinä, mitä tavalliset kentät osaavat." Kolme kohtaa, jotka näytetään ruudulta:
     1. **Hakukenttä ymmärtää lauseen.** "1000 litraa maitoa maanantaiksi" → kenttä kysyy yhden asian, "Pitääkö olla laktoositon?", ja vastaus on yksi nappi. Muuta ei kysytä; loput oletukset näkyvät tekstinä.
     2. **Hakukenttä ymmärtää reseptin.** "Lohikeitto 100 annosta maanantaiksi" → 8 raaka-ainetta, määrät laskettu annoksista, pakkaukset pyöristetty, 215,24 € (testiajon luku 14.11.; tarkista ennen deckin tekoa). Ilman annosmäärää ei tilata mitään.
     3. **Taustavahti on hiljaa, kunnes jokin poikkeaa.** Sama ostaja tilaa 1 500 litraa, kun tavallinen määrä on 25 → vihreä Hyväksy-nappi ihmiselle, syy yhdellä lauseella. Vahti on kerrottu sopimuksessa: näkymätön, ei salainen.
   - Yksi lause tekniikasta: säännöt ja Aimon oma sanasto hoitavat pyynnöt (0 mallikutsua), kielimalli kysytään vain, kun varmuus jää alle 0,6, ja siitäkin jää rivi lokiin.
5. **Kontrollit ja poikkeukset:** mitä agentti päättää yksin, mikä menee ihmiselle, miten kirjataan.
6. **Tarkkuus ja avoimuus:** X/20-luku ja standardit.
7. **Tuotantopolku:** miten tämä kytketään toimitustukkuun.

## Miksi suunta vaihtui

Haastekuvaus sanoo suoraan: *"This is not about replacing today's e-commerce UI with a chatbot."* Haettava asia on **rajapinta ja toimintamalli, jolla ulkopuolinen ostoagentti voi asioida Valio Aimon järjestelmien kanssa**.

Nykyinen kuvaus ("tilausagentti", "AI assisting the buying process") kuulostaa ostajan chatbotilta. Se on juuri se, mitä useimmat tiimit tekevät ja mitä brief sanoo ettei haeta.

**Uusi kehys:** tuote on *Aimon puolen portti agenteille* (Agent Gateway). Oma ostoagentti on vain demoasiakas, joka todistaa portin toimivan.

Ehdotus nimeksi: **Aimo Agent Gateway**. Punchline: *"The open front door for buyer agents: verifiable offers, spend-limited mandates, human sign-off when it matters, and a tamper-evident record of every decision."*

## Mitä rakennetaan

### 1. Gateway (Aimon puoli) – ydin

Yksi sopimus (OpenAPI 3.1 + JSON Schema), kaksi ohutta sovitinta: REST ja MCP. Brief rajaa "API vai MCP" -kysymyksen ulos, joten sama sopimus molempina näyttää, ettei ratkaisu ole sidottu kumpaankaan.

- `search_products` – haku staattisesta katalogista (paikallinen indeksi), suodattimet: allergeenit, väittämät, merkit, alkuperämaa, lämpötilaluokka.
- `request_quote` – live-hinta ja -saatavuus **vain rajatuille ehdokkaille**. Palauttaa allekirjoitetun tarjouksen, jolla on voimassaoloaika.
- `place_order` – viittaa tarjoukseen, idempotency key. Tulos `confirmed`, `pending_approval` tai `rejected` koneluettavine syineen.
- `get_order` / `get_audit_trail`.
- `/.well-known/` – julkinen avain (JWKS), kyvykkyyskuvaus, OpenAPI-dokumentti.
- Portti valvoo tilausajan itse: jos `closingTime` on mennyt, tuote ei ole tilattavissa, vaikka API näyttäisi saldoa. Syy palautetaan koneluettavana (`CUTOFF_PASSED`, kellonaika mukana).
- Yksi kello koko portille (`DEMO_NOW`-asetus). Kun se on päällä, jokainen vastaus ja UI kertoo ajan olevan simuloitu.
- Pyyntö voi tulla suomeksi tai englanniksi. Rajapinta ottaa rakenteisen pyynnön (tuotetyyppi, väittämät, määrä + yksikkö, toimituspäivä); vapaan tekstin tulkinta on asiakasagentin työ.

**Mock-API:ssa ei ole tilausrajapintaa** (vain ping, availability, price ja tiedostolataukset). Sitoutumisvaihe on siis oma suunnittelutyömme, ja juuri sitä brief pyytää: "from inquiry to commitment, based on fixed prices".

### 2. Sääntömoottori ja ihmisen hyväksyntä

Periaate: **LLM ehdottaa, deterministinen koodi päättää.** Policy on dataa (JSON), ei promptia.

- Ostajan mandaatti: kulukatto per tilaus ja per päivä, sallitut kategoriat, pakolliset ruokavaliorajoitteet, korvauspolitiikka.
- Kolme lopputulosta: automaattinen hyväksyntä, ihmisen hyväksyntä, esto. Jokaisella syykoodi.
- Aina ihmiselle: kulukaton ylitys, korvaava tuote mieltymysten ulkopuolelta, toimituspäivän lipsuminen, poikkeava määrä.
- Ei koskaan automaattisesti: allergeenirajoitetta rikkova korvaus.
- Hyväksyntänäkymä (toimii puhelimella): mitä pyydettiin, mitä ehdotetaan, miksi pysähtyi, hyväksy / hylkää.

### 3. Luottamus ja audit trail

- Tarjous allekirjoitetaan (JWS, avain `/.well-known/jwks.json`). Demossa muokattu tarjous hylätään.
- Audit trail: append-only, hash-ketjutettu tapahtumaloki. Sama loki luettavana aikajanana sekä ostajalle että Aimolle.

### 4. Demoasiakas (ostajan puoli)

- Oma ostoagentti (Claude + tool use), joka hoitaa hotelliketjun pyynnön.
- **Toinen, riippumaton asiakas samaan rajapintaan** (esim. MCP Inspector tai Claude Desktop). Tämä on vahvin todiste avoimuudesta: kuka tahansa agentti pääsee sisään lukemalla dokumentaation.

## Datan sudenkuopat (tarkistettu oikeasta datasta)

- **Briefin esimerkki on ansa.** Nimihaku "laktoositon maito" palauttaa 74 tuotetta: maitojauhetta, kaakaojuomaa, kahvimaitoa, annosmaitoa, kasvirasvasekoitetta. Lisäksi "vähälaktoosinen" ei ole "laktoositon": datassa `FREE_FROM_LACTOSE` (4 178 tuotetta) ja `LOW_LACTOSE` (321) ovat eri arvot. Suodata luokitteluilla, älä nimellä.
- **1 000 litraa ei ole 1 000 kappaletta.** Myyntiyksikkö on usein laatikko (KI = 5 × 1 l tai 2 × 10 l). Tilavuus puuttuu monelta CASE-tasolta, joten varalle tarvitaan tilavuuden parsinta nimestä ("1 l", "5 dl", "100x2 cl"). `allowedLotSize` on 0,01 lähes kaikilla (16 872 tuotetta), joten käytännön askel on yksi myyntiyksikkö.
- **Valmiita korvaavuuksia on vain 189 tuotteella** 17 546:sta. Oma korvauslogiikka tarvitaan: sama kategoria + allergeeniyhteensopivuus + sama pakkauskoko, järjestys good / better / best.
- **Toimitusvarmuus** on 4 425 tuotteelle (291 alle 0,9 ja 33 alle 0,5), **hiilijalanjälki** 11 033 tuotteelle. Puuttuva arvo pitää näyttää puuttuvana, ei arvata.
- **Terminal-tuotteiden** saldo on aina 999999 eli tuntematon. Älä esitä sitä varmana saatavuutena. Myös Stock-tuotteilla on "rajaton"-arvoja (9999999999, 555555555, 666666666).
- **Pantit** (506 tuotetta) ja **vaihtuvapainoiset** (632) vaikuttavat tilauksen loppusummaan ja siten kulukattoon.
- **Älä hae hintoja kaikille tuotteille.** API-kuvaus kieltää sen erikseen ja rajat ovat salaiset. Rajaa ensin staattisella datalla, kysy sitten enintään muutamalle kymmenelle, ja välimuistita.
- **API:n saatavuus on staattinen tilannekuva.** Toimituspäivä on aina ma 16.11., ja `closingTime` on ainoa asia, joka kertoo ehtiikö tilaus. API ei itse estä myöhästynyttä tilausta.
- Valmiit poikkeustilanteet demoon: mennyt `closingTime` (kaikki Terminal-tuotteet), rajallinen saldo (esim. 462775: 51 kpl, 469363: 384, 463380: 698), puuttuva toimitusrivi (esim. 464440) ja pyydettyä myöhäisempi toimituspäivä (mikä tahansa pyyntö sunnuntaiksi). `salesBlock`ia ei löytynyt maitohyllystä.

## Demon käsikirjoitus

Kaikki luvut ovat oikeasta mock-API:sta (14.11. klo 00.50). Demokello on kiinnitetty lauantaihin, jotta polku toimii myös sunnuntai-illan jälkeen.

1. **Briefin lause sellaisenaan, englanniksi:** "I need 1,000 litres of lactose-free milk by Monday." Hotelliketjun agentti lähettää sen portille.
2. **Portti vastaa kolmella vaihtoehdolla** hinnan mukaan: 464306 (1,01 €/l), 464401 (1,10 €/l), 463335 (1,40 €/l), allekirjoitettuna tarjouksena. Vastaus kertoo myös, miksi 16 tuotetta jäi pois: tilausaika meni to klo 15.00.
3. **Ihmisen hyväksyntä:** 1 010 € ylittää hotelliketjun 1 000 €:n mandaatin → `pending_approval`. Puhelimessa yksi nappi → `confirmed`.
4. **Agentti päättää itse (osittainen saatavuus):** "100 litraa Arlan rasvatonta laktoositonta maitojuomaa" (462775). Saldoa on 51. Portti täyttää loput 49 l tuotteella 469363: sama allergeeniprofiili, halvempi litrahinta (2,48 vs 2,57 €). Yhteensä 252,59 €, sääntöjen sisällä → vahvistuu ilman ihmistä, ihminen saa ilmoituksen.
5. **Toimitusrajoite:** sama pyyntö sunnuntaiksi → aikaisin toimitus on maanantai → yhden napin kysymys päivän siirrosta.
6. **Audit trail:** koko päätösketju luettavana, tarjouksen allekirjoitus tarkistettu, muokattu tarjous hylätään.
7. **Sama tilaus toisella, ulkopuolisella asiakkaalla** (MCP), jolla ei ole mitään muuta tietoa kuin portin osoite.

2 minuutin videoon mahtuvat kohdat 1–4 ja 6. Kohdat 5 ja 7 näytetään livenä tuomareille.

## Aikataulu ja tärkeysjärjestys (aikaa noin 33 h)

Työt tehdään tässä järjestyksessä. Jokaisen portaan jälkeen on palautuskelpoinen demo, joten ajan loppuessa pudotetaan alimmat portaat, ei keskeneräistä.

| Porras | Milloin valmis | Mitä | Kriteeri |
|---|---|---|---|
| **0. Korjaukset** | La klo 03 | Englanninkielinen haku ja juomamaidon rajaus, litramuunnos, `closingTime`n valvonta, demokello. Testi: briefin lause palauttaa 464306 × 1 000 = 1 010,00 €. | 20 % tarkkuus |
| **1. Koko ketju ilman UI:ta** | La klo 12 | REST: tuotehaku, tarjous, tilaus, hyväksy/hylkää, tilauksen tila. Asiakaskohtainen mandaatti. Ketju ajettavissa yhdellä skriptillä. | 30 % end-to-end |
| **2. Ihminen ja jälki** | La klo 16 | Hyväksyntänäkymä (yksi sivu, puhelin, yksi nappi) ja audit-aikajana. Tästä eteenpäin demo on näytettävissä. | 20 % kontrollit |
| **3. Poikkeukset** | La klo 19 | Osittainen saatavuus + korvaaja portin läpi (käsikirjoituksen kohta 4), myöhäinen toimituspäivä (kohta 5). | 15 % poikkeukset |
| **4. Avoimuus** | La klo 22 | MCP-sovitin samaan sopimukseen (`/mcp`), allekirjoitettu tarjous + JWKS, hash-ketju lokiin, toinen asiakas, README standardikarttoineen. | 15 % avoimuus |
| **5. Jos jää aikaa** | – | Testisetti 15–20 pyyntöä ja tarkkuusluku, kestävyysvertailu toisessa tuoteryhmässä, schema.org-muoto. | – |

Kiinteät ajat, jotka eivät jousta:

| Milloin | Mitä |
|---|---|
| La aamupäivä | Mentorien luo kysymyslistan kanssa. Samalla git-repo julkiseksi ja ensimmäinen deploy tyhjälläkin sovelluksella, jotta julkaisu ei ole yön yllätys. |
| La klo 24 | Feature freeze. Tämän jälkeen vain korjauksia. |
| Su 07–09 | Video (alle 2.00), pitch deck PDF, palautus FINAL viimeistään 09.30. |
| Su 10.30–13 | Vertaisarviointi paikan päällä. |
| Su klo 17.00 | Mock-API:n Stock-tuotteiden tilausaika umpeutuu. Demokellon pitää olla päällä julkisessa demossa ennen tätä. |

Deploy: koneella ei ole yhtään julkaisutyökalua. Ensisijainen vaihtoehto on mikä tahansa Node-palvelu, jossa prosessi pysyy käynnissä (SQLite ja 9 Mt:n katalogi muistissa). Varasuunnitelma on tunneli omalta koneelta (`cloudflared tunnel --url http://localhost:4747`), jolloin koneen pitää pysyä päällä arvioinnin ajan. Palvelimella data haetaan avaimella käynnistyksessä, koska sitä ei saa laittaa julkiseen repoon.

## Kysymykset mentoreille (lauantaiaamuna)

Mentorit: Hanna Forsström ja Pirjo Kaartinen (marketplace/kaupallinen), Minni Ruhtinas (verkkomyynti), Tommi Nurmi-Aro, Ville Takanen ja Riku Tapper (IT, integraatiot, data governance).

1. Terminal-tuotteiden `closingTime` on jo mennyt (to 12.11.), mutta API näyttää ne saatavina maanantaille. Onko tarkoitus, että agentti hylkää ne itse? (Vastaus ratkaisee, onko esimerkin oikea vastaus 1 litran tölkit vai 10 litran novoboxit.)
2. Saatavuus palauttaa aina toimituspäivän 16.11. pyydetystä päivästä riippumatta. Onko se tarkoitus?
3. Tuleeko mock-ympäristöön tilausrajapinta tai verkkokaupan testitunnukset, vai mockaammeko sitoutumisen itse?
4. Mitkä kaupankäyntisäännöt ovat tärkeimmät: sulkemisajat, eräkoot, pantit, vaihtuvapainoiset?
5. Mitä tarkistatte tänään uudesta asiakkaasta, ja mitä haluaisitte tarkistaa ulkopuolisesta agentista?

Vastaukset suoraan policyn oletusarvoiksi ja pitchiin ("validoitu Aimon verkkomyynnin kanssa").

## Avoimuus: standardikartta READMEen

| Tarve | Standardi |
|---|---|
| Sopimus | OpenAPI 3.1 + JSON Schema |
| Agenttiliittymä | MCP (sama sopimus) |
| Tuote- ja tarjousdata | schema.org Product / Offer / Order, GS1 GTIN (GTINit ovat datassa valmiina) |
| Tarjouksen todennettavuus | JWS-allekirjoitus + JWKS |
| Agentin valtuutus | Allekirjoitettu mandaatti (sama ajatus kuin AP2:n mandaateissa) |
| Tilaussanoma tuotannossa | Peppol BIS Ordering (UBL) |

Lisäksi yksi kappale siitä, miten ratkaisu asemoituu AP2-, ACP-, UCP- ja A2A-protokolliin, sekä lista oletuksista ja jatkoaskelista. x402 ja maksut mainitaan jatkoaskeleena, ei toteuteta.

## Mittaa tarkkuus

Tee 15–20 testipyynnön setti odotettuine tuloksineen (määrä, yksikkö, ruokavaliorajoite, päivä) ja aja se automaattisesti. Pitchiin luku: "X/20 pyynnöstä oikein ilman käsikorjausta." Tämä on suora vastaus 20 %:n kriteeriin, ja harva tiimi mittaa sitä.

## Palautuksen checklist

- [ ] Projektin nimi (max 30 merkkiä), punchline (max 200), kuvaus (max 5 000, markdown)
- [ ] Haasteeksi valittu Trusted Trade Agents
- [ ] Demolinkki julkisessa osoitteessa, demokello päällä ja merkitty
- [ ] Briefin englanninkielinen lause ajettu julkista demoa vasten juuri ennen palautusta
- [ ] Lähdekoodi julkisessa repossa, MIT
- [ ] Repossa ei ole `.env`-tiedostoa, API-avainta eikä `data/raw/`-kansion sisältöä
- [ ] Video enintään 2.00 min, kaikille näkyvä (YouTube tms.)
- [ ] Pitch deck PDF (max 20 MB)
- [ ] Tiimin puhelinnumerot ja Discord-nimet
- [ ] Tila vaihdettu DRAFT → FINAL
- [ ] Tech challenget valittu, jos jotain niiden tekniikkaa oikeasti käytetään (saa valita useita)
