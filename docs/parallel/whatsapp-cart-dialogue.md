# Auttava WhatsApp-keskustelu ja luonteva ostoskori

## Käyttäjän tavoite

14.11.2026 käyttäjä pyysi DM Champin kaltaista, keskustelun tarkoitusta ymmärtävää apuria. Pelkkä tekstien kaunistaminen ei riitä. Apurin pitää tulkita jokainen tavallinen viesti nykyisen korin ja edellisen kysymyksen perusteella. Käyttäjä painotti nimenomaisesti laatua nopeuden sijaan: malli saa miettiä hyvää vastausta pidempään.

Esimerkki tavoitellusta vastauksesta:

> Joo, laitetaan!
>
> Ostoskorissasi nyt:
> - maito 50 l
> - kananmuna
> - kerma
>
> Kuinka paljon laitetaan kananmunia ja kermaa?

## Oma tiedostorajaus ja toteutus

- `server/whatsapp/dialogue.mjs`: tavallisen viestin keskustelutulkinnalle vahvempi `deep`-malli ja enintään 60 sekunnin kutsuaika. Myös käyttöneuvot käyttävät deep-mallia. Mallille annetaan palvelimelta luettu ajantasainen rakenteinen kori sekä viimeinen kysymys/vaihtoehdot. Numerolla alkavaa tavallista lausetta ei enää ohiteta liian lavean komentotunnistimen vuoksi. Epäselvä muutospyyntö voidaan tarkentaa keskusteluna ennen korin muuttamista; yksiselitteiset vahvistukset säilyvät tilausmoottorin vastuulla.
- `server/whatsapp/ordering.mjs`: kytkentä nykyisen saman luonnoksen lukemiseen keskustelukerroksesta, saman asiakkaan ja keskustelujakson sisällä.
- `server/whatsapp/cart-presentation.mjs`: lyhyt mallin valitsema/muotoilema kuittaus, tarkka viivalista sekä yhteinen kysymys vain niille riveille, joista määrä puuttuu. Tuoterivit, määrät, ruokarajoitteet, virheet ja tilauksen vahvistusohje tulevat tilausmoottorista. Mallin määräkysymys käyttää koodin täyttämää tuotepaikkamerkkiä; numeroita tai uusia tuotteita ei generoida siihen. Käyttövirheet, tarjoukset ja lopullinen vahvistus eivät kulje tämän muotoilun kautta. Pelkkää katselua ei kuitata lisäyksenä. Uusinta palauttaa pysyvän saman vastauksen. Samassa kanava-apurissa tarkat fyysiset määrät dl/cl/ml/g muunnetaan L/KG-muotoon ennen tilaustulkkia: esimerkiksi `5 dl` → `0,5 l`. Se ei päättele puuttuvia määriä, ja alkuperäinen viesti säilyy historiassa.
- `test/whatsapp-dialogue.test.mjs`: oikean luonnosmoottorin ja WhatsApp-sillan regressiot käyttäjän maito/kananmuna/kerma-esimerkille, saman korin täydentämiselle, uusinnalle, ajantasaiselle mallikontekstille ja virhetilanteille.

Malli saa tehdä työn loppuun natiivin kirjoittaa-ilmaisimen aikana. Erillistä odotustekstiä, uutta seurantaa tai keinotekoista pitkää viivettä ei lisätä. Sävy ja lyhyet erilliset viestit perustuvat projektin `docs/dm-champ-opit.md`:hen sekä [DM Champin omaan keskustelun rytmiä kuvaavaan ohjeeseen](https://help.dmchamp.com/ai-automation/feels-human/). DM Champin sisäistä mallia tai palvelinkoodia ei väitetä nähdyksi.

## Todettu ydintulkin virhe ja korjaus omassa kanavarajassa

Nykyinen oikean WhatsApp-jonon viesti `no vaiks 50 kananmunaa ja sit 5 dl kermaa` tallentui kermaksi **5 l**, vaikka oikea määrä on **0,5 l**. Riippumaton oikean mallin koe toisti saman virheen nykyisestä `server/order-conversation/interpret.mjs`:stä. Sen mallikutsu on yhä `fast`, 12 sekunnin rajalla, eikä ohje kerro dl/cl/ml/g-muunnoksista. Keskustelun uusi deep-malli huomasi myöhemmässä kysymyksessä ristiriidan ja kysyi siitä asiakkaalta; tämä ei korvaa itse tulkin korjausta.

Henkilön 2 omistajalle lähetettiin yhteisen MCP:n viesti #103 sekä paikallinen #73. Koska ydintulkkia ei muuteta rinnakkain omin päin, WhatsAppin ongelma ratkaistiin tämän chatin omistamassa kanavarajassa yllä kuvatulla täsmällisellä yksikkömuunnoksella. Oikean mallin uusinta varmisti **5 dl → 0,5 l**. Omistajalle ilmoitettiin ratkaisusta viestissä #112; yleisen ydintulkin kehitys muissa kanavissa säilyy hänellä. Toinen aktiivinen käyttöönottotyö korjaa erikseen gatewayn valitun toimituspäivän virhettä ja omistaa nykyisen puhelinlistan sekä versionvaihdon; sen lähdetiedostoja tai listaa ei muuteta tässä.

## Tarkistukset ja keskeneräinen työ

- Rajatut keskustelu- ja kanavatestit: **26/26 läpi**. Mukana saman oikean luonnoksen lukeminen/muuttaminen, puuttuvat määrät, deep-mallin ajantasainen konteksti, pelkkä katselu, pysyvä uusinta sekä yksikkömuunnos. Myös lyhyt `joo 5 dl` kohdistuu viimeksi ehdotettuun ainesosaan oikealla 0,5 l määrällä. Syntaksit ja dokumenttidiff tarkistettu.
- Oikea nykyinen Claude, omat muistitietokannat, simuloidut tuotetyökalut: korjauksen jälkeen neljä puhekielistä viestiä, **8 mallikutsua, 0 API-virhettä**, 3,3–6,8 sekuntia per vuoro. Ensimmäinen vastaus tuotti tavoitellun kuittauksen, tarkan korilistan ja kysymyksen kananmunista sekä kermasta. Määrävastaus säilytti kananmunat 50 kpl ja muutti kerman 5 dl:stä oikeaksi 0,5 l:ksi. Maidon korjaus 50 → 30 l säilytti saman korin ja muut rivit. Kysymykseen "miks sä kysyit niitä määriä?" malli selitti syyn ja jatkoi nykyisistä valinnoista. Tallennetut määrät tarkistettu väitteiden lisäksi assert-tarkistuksilla. Ei Meta- tai Valio-kutsuja eikä tilauksia.
- Koko testisarjan ensimmäinen sandbox-ajo estyi paikallisten HTTP-porttien `listen EPERM`-rajoituksiin. Sallituilla testipalvelinporteilla uusinta **203/204 läpi, 0 ohituksia**. Ainoa jäljelle jäänyt virhe on erillisen uuden etusivun WhatsApp-painikkeen `test/storefront-cart.test.mjs`-lataus: sen VM-kääre ei poista uutta `export function whatsappEntry` -lausetta. Tämä ilmoitettiin etusivun omistajalle, eikä hänen tiedostojaan muutettu. Ensimmäisessä uusinnassa löytynyt oman muutoksen yhden vastauksen yhteensopivuus sääntötilassa korjattiin; mallittoman tilan aiempi vastaussopimus säilyy.
- Käynnissä oleva WhatsApp-palvelin ajaa edelleen aiempaa snapshotia; nämä muutokset eivät ole vielä puhelinkäytössä. Yksi sovittu käyttöönotto tehdään vasta testatusta commitista nykyisen omistajan kanssa, samat kannat ja lista säilyttäen.

Toteutus ja oikean mallin eristetty tarkistus ovat valmiit. Tämä raportti, omat lähteet/testit ja `TYOLOKI.md`:n vaihemerkintä tallennetaan samaan rajattuun commitiin. Käyttöönoton omistaja ottaa valmiin commitin yhteiseen tarkistettuun snapshotiin, ja tämä chat varmentaa sen jälkeen käytössä olevan version. Käyttäjän alkuperäistä puhelinluonnosta ei korjata tai tyhjennetä automaattisesti; aiemmin väärin tallentunut määrä pitää korjata asiakkaan omalla viestillä ennen mahdollista tilausta.
