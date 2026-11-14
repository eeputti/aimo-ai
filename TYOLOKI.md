# Työloki ja työn jatkaminen

Tämä tiedosto välittää toteutuksen tilan ja päätökset Codexin ja Claude Coden välillä. Lisää uusin työvaihe ylimmäksi. Älä kirjaa salaisuuksia tai koko keskusteluhistoriaa.

## 14.11.2026 — tyhjän demokorin lopputarkistus (Codex)

Tämän korityövaiheen tyhjä alkukori, erillinen `referenceCart` ja käyttäjän muokkausten säilyttäminen ehtivät rinnakkaisen, käyttäjän pyytämän tilannetallennuksen commitiin `d20e017`. Samaa koodia ei commitoitu uudelleen.

**Varmennus:** korin storetestit 9/9, JavaScriptin syntaksi ja diff-tarkistus läpi. Selaimessa päivitetty `http://localhost:4747/cart.html`: tyhjä kori, otsakkeen summa 0,00 euroa, Lisää tuotteita avaa saman sinisen AI-haun ja mikrofonin, `aria-expanded` päivittyy ja vaakaylivuoto on 0 px. Kori jätettiin näkyviin esikatseluun. Päädemon uudet search/review-reitit ja vanhojen tilausrivien säilyminen varmistettiin sanelutyövaiheen käyttöönotossa (ks. `e9a7c69`-merkintä). Maksupalvelu on edelleen liittämättä; maksuvaihe on esikatselu.

## 14.11.2026 — työpuun tilannetallennus: ostoskori alkaa tyhjänä (Claude Code)

**Käyttäjän pyyntö:** Eelis pyysi pushaamaan uusimman version GitHubiin ennen käyttörajan täyttymistä. Työpuussa oli neljä commitoimatonta tiedostoa toisesta työvaiheesta; tämä istunto ei tehnyt niitä, vain tarkisti ja tallensi ne.

- `public/storefront-cart-data.json` ja `storefront-cart-store.js`: työkori (`cart`) alkaa tyhjänä ja täytetään hausta. Oikean korin vertailurivit säilyvät erillään kentässä `referenceCart`. Selaimeen aiemmin tallennettu koskematon vertailukori poistetaan latauksessa; käyttäjän muokkaama tai täydentämä kori säilyy.
- `test/storefront-cart.test.mjs`: kaksi uutta testiä (tyhjä aloitus, vain koskemattoman vertailukorin poisto). `README.md`: korin kuvaus päivitetty.

**Tarkistukset:** `npm test` 67/67, `node --check`, `git diff --check`, diffistä haettu avaimia, ei osumia. Selaimessa ei katsottu, eikä palvelimia käynnistetty uudelleen. Staattiset tiedostot tulevat käyttöön sivun päivityksellä.

## 14.11.2026 — sanelun reseptiohjaus ja yhteisen koripolun käyttöönotto (Codex)

**Käyttäjän päätös:** sanelusta pitää voida luetella tuotteita ja pyytää resepti samassa tarpeessa. Resepti avataan sovelluksen nykyiseen reseptihakuun ja annosmäärään (ei ulkoiselle sivustolle). Muut tuotteet säilyvät mukana. Ostoskorin ja hakuvaiheen yhteinen työ tehtiin Eeliksen erikseen valtuuttamalla chattien työnjaolla.

- `public/aimo-request-intent.js`: yhteinen reititys kirjoitetulle ja sanelulle pyynnölle. Poimii reseptin, annosmäärän ja päiväilmauksen sekä säilyttää erillisen tuoteluettelon ennen reseptiä tai sen jälkeen. `combineSearchResults` yhdistää tuotteiden ja reseptin tulokset rivejä pudottamatta; ristiriitaiset toimituspäivät palautuvat käyttäjän ratkaistaviksi.
- `public/aimo-ask.js/css`: reseptihaku avautuu oikealla hakusanalla, annosmäärä täyttyy vain jos se annettiin. Oma täsmäävä resepti valitaan valmiiksi; muista ehdotuksista käyttäjä valitsee sopivan. Puuttuvalla tai virheellisellä annosmäärällä ei lasketa oletuksena sataa annosta. Määrän kirjoitus laskee uudelleen 250 ms:n tauon jälkeen, eikä odota kentästä poistumista. Reseptin raaka-aineet ja muut tuotteet haetaan erikseen ja yhdistetään yhdeksi tarkistettavaksi koriehdotukseksi. Hakusuodattimien rivikohdistus säilyy. `aimo-voice.css` pitää myös uuden hakupaneelin ohjetekstin poissa kuuntelun aikana.
- **Koriin lisäämisen vian syy:** vanha 4747-palvelin ei tuntenut uusien `/api/storefront/search`- ja `/review`-reittien toteutusta (404), vaikka selain sai jo uudet staattiset tiedostot. Rinnakkainen hakutyö yhdisti lisäykset uuteen koriin commitissa `6e278a7`; käynnistin palvelimen lopuksi kerran uudelleen samoilla `data/aimo.db`- ja `data/gateway.db`-kannoilla. Nyt tyhjät hakujen/tarkistusten validointipyynnöt palauttavat 400, `/cart.html` 200. 12 gateway-tilauksen ja kolmen aiemman keittiöehdotuksen tuoterivien ennen–jälkeen-SHA-256:t olivat täsmälleen samat. Käyttäjän selaimen koria ei muutettu.

**Tarkistukset:** `npm test` 65/65, `aimo:eval` 26/26 ja `aimo:eval:spoken` 54/54, syntaksi ja diff-tarkistus. Reitityksen neljä testiä kattavat tavallisen listan, valmisruoan erottelun, reseptin ja annokset, sekapyynnön ja tulosten yhdistämisen. Eristetyssä 4762/4763-demossa omilla kannoilla ja simuloidulla puheella "100 kananmunaa ja resepti lohikeittoon 10 annosta" tuotti yhdeksän tarvetta ja siirtyi Kokoa ostoskori -napista yhteiseen koriin. Puheteksti pysyi piilossa kuunnellessa. Puuttuva annosmäärä jäi tyhjäksi, 375 px:n asettelussa ei vaakaylivuotoa. **Yksi oikea, vain lukeva päädemon haku:** "100 kananmunaa", ma 16.11. → 10 × M10 = 100, 17 × M6 = 102 ja 2 × M90 = 180; ensimmäinen vaihtoehto 10 rasiaa. Tällä live-haulla ei lisätty tuotteita eikä tehty tilausta.

**Rajaus:** oikean mikrofonin puheentunnistustarkkuutta ei tässä testattu. Mielivaltaisen reseptin haku riippuu edelleen mallin ehdotuksista ja raaka-ainetiedot tarkistetaan ennen koriin lisäämistä. Maksupalvelua tai uutta automaattitilausta ei liitetty. Kappalemuunnos on commitissa `898547a`; tämä commit viimeistelee sen kanssa yhteisen sanelu-/reseptipolun.

## 14.11.2026 — demon tuotekuvat kevyiksi ja esilataus käyttöön (Codex)

**Käyttäjän pyyntö:** selvitä kuvien hitaus ja nopeuta demoa. Syyt: puuttuva kuva etsittiin vasta selaimen pyynnöstä useasta ulkoisesta palvelusta, neljän haun jonossa; hidas GTIN-varatie oli ennen toimittajan lähimmän nimen hakua. Paikalliset tuotekuvat olivat jopa 2048 px ja 2,85 Mt, ja staattiset kuvat/fontit tarjoiltiin `no-store`-asetuksella.

- 51 etusivun ja vertailukorin tuotekuvasta johdettu enintään 400 px:n WebP-kopiot: **24 185 934 → 713 936 tavua, 97,0 % pienemmät**. Esimerkiksi 2 853 859 tavun juustokuva on nyt 26 470 tavua. Läpinäkyvyys säilyy. Alkuperäiset lähdekuvat ja niiden tarkistussummat säilyvät; kopioiden lähteet, muunnos ja hashit lisätty `storefront-assets/sources.json`:ään. `scripts/optimize-storefront-images.py` toistaa muunnoksen Pillow'lla, ajonaikaisia riippuvuuksia ei lisätty.
- Etusivun ja korin JSON käyttää sormenjäljen sisältäviä kuvapolkuja. Myös selaimeen aiemmin tallennetun korin vanhat vakiokuvapolut vaihtuvat kevyisiin kuviin latauksessa; käyttäjän tuotteet, määrät ja omat kuvaosoitteet säilyvät.
- `server/static-assets.mjs` ja kytkentä `index.mjs`: oikeat JPEG/WebP/fontti-MIME-tyypit, kuville ja fonteille selainvälimuisti sekä ETag/304. Sormenjälkikuvat ovat immutable; HTML, JS, CSS ja JSON päivittyvät edelleen ilman vanhaa välimuistia.
- `server/images.mjs`: paikalliset vertailutuotekuvat kelpaavat myös `/img/<id>`-reitille. Toimittajan nimitäsmäys kokeillaan ennen Open Food Factsia. `image-cache.mjs` huomaa toisen prosessin esilataukset ja tallentaa metatiedoston atomisella vaihdolla. Saman kuvan rinnakkaispyynnöt yhdistyvät; levyltä löytyvä kuva ohittaa verkkohakujen jonon. 404-vastausta ei enää lukita selaimen välimuistiin.
- `npm run images`: oletuksena nykyinen keittiöehdotus/korvaajat ja 13 tavallisen demohaun ensimmäiset 12 katalogiehdokasta. `--query` tukee omaa hakua; tuote- ja kategoriatunnisteet säilyvät. Ehdotus luetaan SQLite-kannasta readOnly-tilassa. Esiladattu tällä koneella `--demo 10400`: **239 tuotetta, 211 kuvaa löytyi, 28:lle ei kuvaa**. Ei hinta-API-, kielimalli- eikä tilauskutsuja. `data/img/` pysyy pois GitHubista, joten uuden koneen/deploymentin kuvat valmistellaan samalla komennolla.

**Tarkistukset:** `npm test` **65/65**, `aimo:eval` **26/26**, 0 mallikutsua; mukana kuusi kuvien regressiota ja tallennetun korin kuvapolun päivitys. Kaikkien lähdemanifestin **114/114** tiedoston koko ja SHA-256 täsmäävät, johdetut kuvat enintään 400 px. JS-syntaksit ja diff-tarkistus läpi. Selaimessa 4747-etusivun ja korin kevyet kuvat näkyvät. Erillisessä simuloidussa 4779-demossa omilla kannoilla maitohaku näyttää esiladatut kuvat. HTTP: paikalliset kuvaesimerkit 0,7–4,1 ms, WebP:n MIME ja immutable-välimuisti oikein, ETag-uusinta 304, puuttuva kuva 404/no-store. Jo käynnissä ollut 4779-palvelin näki erillisen esilatauksen uuden maitokuvan ilman restartia.

**Käyttöönotto ja rajaus:** kevyet etusivu-/korikuvat tulevat käyttöön sivun päivityksellä. Pääpalvelinta 4747 tai sen kantoja ei tässä työvaiheessa käynnistetty uudelleen eikä nollattu. Palvelinpuolen kuvamuutokset otetaan käyttöön muiden chattien kanssa jo sovitussa yhteisessä restartissa saneluvaiheen jälkeen. Ennen näkemättömän tuotteen ensimmäinen ulkoinen kuvahaku voi edelleen olla hidas; puuttuvaa kuvaa ei keksitä. Sanelu- ja reseptityövaiheen keskeneräiset tiedostot jätetään sen omiin committeihin.

## 14.11.2026 — rinnakkaisten työvaiheiden yhdistäminen (Codex)

- Yhdistetty etähaaran Danielin Tilausapuri `339bee8` sekä paikalliset kori-, haku-, sanelun määrämuunnos- ja budjettirajauksen poistocommitit. `TYOLOKI.md`:n molemmat lisäykset sekä palvelimen hakukorin ja Tilausapurin reitit säilyvät.
- Hakutyövaiheen commitiin ehti samanaikaisen kuvien optimoinnin `static-assets.mjs`-kytkentä ilman kyseistä uutta moduulia. Yhdistämiscommitin palvelin pidetään siksi vanhassa itsenäisesti toimivassa staattisten tiedostojen tarjoilussa. Kuvatyövaiheen nykyinen importti ja tarjoilukoodi säilyvät työpuussa, moduuli ja muut kuvatiedostot jätetään sen omaan commitiin. Keskeneräistä työtä ei nollattu eikä piilotettu.
- Tarkistukset ennen yhdistämistä: uuden korin oma selainvarmennus ja kuusi storetestiä; hakutyövaiheen eristetty QA koko tarpeesta korvaajan hyväksyntään ja maksuesikatseluun. Maksupalvelua ei ole kytketty, eikä tästä polusta tehty tilausta. Yhdistämiskonfliktien jälkeen palvelimen ja uuden Tilausapurin tiedostojen syntaksi sekä indeksin palvelinimporttien riippuvuudet tarkistettiin. Työpuun npm test 64/64 (sisältää myös muiden työvaiheiden paikalliset testit) ja aimo:eval 26/26, 0 mallikutsua. Oikeaa Danielin MCP-yhteyttä ei ajettu tässä työvaiheessa.

## 14.11.2026 — yksi hakupolku ja vain toimituspäivälle tilattavat tuotteet (Codex)

**Käyttäjän päätös:** haku on päätoiminto, sanelumikrofoni kuuluu samaan kenttään, valmis tilaus nimetään tilausehdotukseksi ja reseptipolku on pieni Lisää reseptistä -oikotie. Tarve → yhteinen ostoskori → muutosten hyväksyntä → maksuvaihe. Toimituspäivälle sopimattomia tuotteita ei näytetä hakuvaihtoehtoina. Rinnakkaisen korichatin uudempi tarkennus: vanhaa keittiö-/agenttitilausta ei tuoda tähän koriin, sininen AI-kuvake säilyy, maksaminen on esikatselu ilman maksupalvelua.

- `public/aimo-ask.js/css`: hakutulokset saavat päätilan, oikotiet ovat pieninä niiden alla. Kokoa ostoskori valitsee jokaiselle kokonaan ymmärretylle tarpeelle tilattavan tuotteen ja avaa saman selaimen korin; jo yksitellen lisättyä tarvetta ei lisätä uudestaan. Lisäystä ennen tarkistetaan myös korissa jo olevan määrän ja uuden määrän summa. Puuttuvaa tarvetta ei ohiteta koko korin valmistelussa. Tilausehdotuksen esikatselu näyttää selaimen oman korin, ei `/api/state`-ehdotusta.
- Yhteisessä hakutiedostossa ovat sovitusti myös korityövaiheen `attach`-placeholder, sininen AI-kuvake sekä juuri käytetystä hakukentästä avautuva animaatio, sijainnin rajaus ja fokuksen palautus. Tekijä tarkisti geometrian erikseen; tiedosto tallennetaan tässä yhteisessä commitissa.
- Uusi `server/storefront.mjs`, `POST /api/storefront/search` ja `/review`: vain tuore hinta, saatavuus ok, tarkka toimituspäivä, avoin tilausaika, muunnettava myyntierä ja riittävä tunnettu saldo läpäisevät. Tuntematon saldomäärä säilyy näkyvästi tuntemattomana; se ei ole varmennettu kappalemäärä. Myöhäisiä, aikaisemmalle päivälle tarjottuja, vanhentuneita tai puuttuvia saatavuustietoja ei nosteta tuotekorteiksi. Valittu päivä on näkyvissä myös ilman tekstissä annettua päivää. Hakukutsussa tarkistetaan enintään 80 ehdokasta per tarve, joten määrä tarkoittaa tarkistettuja osumia, ei koko katalogin kaikkia tuotteita.
- Korvaajat tarkistetaan samalla ehdolla, ruokavalio ja pyydetyt allergeenikiellot säilyvät. Osasaldon vaihtoehto kattaa koko alkuperäisen tarpeen; puuttuvaa osuutta ei sekoiteta kokonaiseen korvaukseen. Raaka-ainehaun hyllyjärjestys säilyy ennen hintajärjestystä (tuore kurkku ennen kurkkusalaattia).
- Sanelutyövaiheen `quantity.basis`-muunnos on liitetty hakuun ja gatewayn tarjouksiin. Munien kappale-/pakkauslasku näkyy haussa, ja korin review käyttää jo muunnettuja myyntiyksikköjä. Yhteinen muunnoshelper tallennettiin sanelun edellisessä commitissa.
- `public/cart-workflow.js/css`: tarkistus keltaisina huomioina tuoteriveillä, tuoreet korvaajat määrineen ja hintoineen, käyttäjän hyväksyntä vaihdolle tai hinnan/määrän muutokselle. Korin muutos mitätöi tarkistuksen. Maksuvaiheeseen siirryttäessä tarkistetaan uudelleen; epäonnistunut tarkistus ei kelpaa vanhan hyväksytyn tarkistuksen varassa. Siirry maksamaan avaa esikatselun, Maksa on estetty. Tästä polusta ei tehdä gatewaytilausta eikä oikeaa maksua.

**Tarkistukset:** yhteisen työpuun `npm test` 58/58, `aimo:eval` 26/26 ja `aimo:eval:spoken` 54/54, ei mallikutsuja. Storefrontin omat 9 regressiota kattavat päivän, tilausajan, vanhentuneen tiedon, riittämättömän saldon, myyntierät, ruokavalion, korvaajan koko tarpeen, munamuunnoksen ja tuorehyllyn järjestyksen. Syntaksit ja tämän vaiheen diff-tarkistus läpi. Selaimessa eristetyssä simulaatiossa 4774 omilla kannoilla: 20 l laktoositonta maitoa + 5 kg voita 16.11. → oikeat korimäärät; tarkistus → maksuesikatselu; kurkun 10 kg:n tarve ja 6 kg:n saldo → hyväksytty 10 kg:n korvaaja ja päivitetty summa. Ei JS-virheitä tässä polussa. 375 px: ei vaakaylivuotoa ja oikotiet tulosten alla. Korichat tarkisti myös kenttäanimaation puhelimella.

**Viimeistely:** maksuesikatselun puuttuva loppusumma näytetään tekstinä Hinta ei tiedossa eikä nollana. Korvaajan hyväksyntä päivittää myös tiedon veron puuttumisesta. Syntaksitarkistus läpi; muutos ei tee tilauksia tai maksuja.

**Rajaukset ja jatko:** oikeaa Valio-API:a tai oikeaa puhetta ei käytetty tämän vaiheen tarkistukseen. Oikealta sivulta kopioidun vertailukorin tunnisteet puuttuvat challenge-katalogista; review näyttää tämän eikä hyväksy niitä tilattaviksi. Toisen päivän vaihtoehto tarjotaan vain, jos rajapinta oikeasti kertoo sen. Mock-API:n aina 16.11. palauttava päivä voi jättää muiden päivien haun tyhjäksi. Sekalauseen sanelu + resepti -reititys jatkuu saneluchatin omassa vaiheessa tämän jälkeen. Pääpalvelinta 4747 ei käynnistetty tässä uudelleen eikä sen kantoja nollattu: sovittu yhteinen restart tehdään saneluvaiheen jälkeen. Korichat yhdistää Danielin etäcommitin 339bee8 ja pushaa yhteiset paikalliset commitit; muiden keskeneräisiä tiedostoja ei sisällytetä tähän commitiin.

## 14.11.2026 — budjettiominaisuus pois tämän vaiheen demosta (Codex)

**Käyttäjän päätös:** budjettiominaisuutta ei tarvita nyt, joten se poistetaan.

- `public/app.js` ja `styles.css`: budjettikortti, mittari, asetus, ylityslupa, karsintapainikkeet ja budjettitekstit poistettu. Avustajan oikotie kysyy nyt tilauksen hintaa.
- `server/proposal.mjs`, `agents/deep.mjs`, `agents/fast.mjs`, `demo.mjs`, `llm.mjs`, `planning.mjs` ja `index.mjs`: budjettikatto ei estä tilausta, ylityksiä ei hyväksytetä eikä määriä karsita budjettiin. `/api/budget` poistettu. Demon budjetin kalibrointi ja vain sitä varten tehty hintahaku poistettu. Tilauksen hinnat ja summat sekä muut hyväksyntäsäännöt säilyvät.
- Vanhasta kannasta luetaan vain nykyiset sääntöasetukset. Käynnistyksessä vanhan, lähettämättömän luonnoksen budjettipäätös ja tiivistelmä päivitetään ilman uutta ennusteajoa tai käyttäjän tuote- ja määrämuutosten hävittämistä. Lähetettyjä tilauksia ei muuteta.
- Vanhat karsintatestit päivitetty ostotarvelaskennan testeiksi. HTTP-regressio käynnistää palvelimen vanhan version tallennetulla luonnoksella ja tarkistaa määrämuutosten säilymisen, varoituksen poistumisen ja poistetun reitin 404-vastauksen. Ohjeesta `docs/kitchen-planning.md` poistettu vanha karsintaväite.

**Tarkistukset:** pelkästä tästä työvaiheesta eristetty kopio commitin `a73c808` päälle: `npm test` **35/35**, `npm run aimo:eval` **26/26**, 0 mallikutsua. Yhteisessä työpuussa tehty testiajo oli **49/49**; sen erillinen tulkintatesti jäi samanaikaisen kananmunien kappalemäärätyön uuden `basis`-kentän vuoksi 24/26:een. Budjettimuutoksen oma eristetty tulkintatesti varmisti, ettei poisto aiheuta näitä eroja. JavaScriptin syntaksi ja rajattu `git diff --check` läpi. Selaimessa erillinen simuloitu testipalvelin: tilaus, päätökset, hinnat ja sääntöasetukset renderöityvät, budjettimainintoja ei ole ja konsolissa ei JavaScript-virheitä. Ei live-API- tai kielimallikutsuja.

**Käyttöönotto ja työnjako:** portin 4747 demopalvelinta tai käyttäjän tilauskantaa ei käynnistetty uudelleen eikä nollattu. Palvelinpuolen poisto ja vanhan luonnoksen päivitys tulevat voimaan uudelleenkäynnistyksessä; korityövaiheen kanssa suunniteltu yhteinen uudelleenkäynnistys on yhä tekemättä. Commit rajataan tähän poistoon ja tähän lokimerkintään. Muiden chattien ostoskori-, haku- ja kappalemäärätyöt jäävät niiden omiin committeihin.

## 14.11.2026 — kananmunien kappaleet erotetaan myyntipakkauksista (Codex, sanelu)

**Käyttäjän päätös:** "100 kananmunaa" tarkoittaa sataa munaa, ei sataa rasiaa. Kappalemäärä ja myyntipakkausten määrä erotetaan valitulle tuotteelle, ja lasku näytetään ennen koriin lisäämistä.

- `server/itemQuantities.mjs`: ilmoitettu kappalemäärä luetaan tuotetiedosta tai nimestä (esim. Kieku M6/M10/M90, 12 kpl) sekä tarvittaessa perSales-muunnoksesta. Painosta ei päätellä munamäärää. Tuntematon tai ristiriitainen pakkaustieto ei muunnu kappaleiksi. `explainItemQuantity` antaa pyydetyn ja toimitettavan kappalemäärän sekä ylijäämän.
- `quantity.basis: items | sales` on vapaaehtoinen tarkenne PCS-yksikölle. Oletus sales säilyttää vanhojen koririvien ja API-pyyntöjen myyntiyksikkömerkityksen. Säännöt tunnistavat "100 kananmunaa" ja "100 kpl kananmunia" items-määräksi; rasia/paketti/laatikko säilyy myyntipakkauksena. Mallin skeema ja ohje sekä gatewayn sopimus päivitetty.
- `server/gateway/quantity.mjs`: yhteinen muunnos haulle ja tarjoukselle. Alkuperäinen irrotus `service.mjs`:stä kuuluu rinnakkaiseen hakutyöhön ja on tässä mukana sovitusti; saneluvaihe lisäsi basis-tuen. Haku-, tarjous- ja koritarkistuksen kytkennät tähän helperiin ovat rinnakkaisen hakutyön commitissa.
- `test/item-quantities.test.mjs`: bare/kpl/rasia-erottelu, 6/8/10/12/56/90 munan pakkaukset, tuntematon muunnos ja oikean katalogin kolme tuotetta. 100 munaa → 10 × 10 = 100, 17 × 6 = 102 tai 2 × 90 = 180. Aimo-evalin kahden tusinatapauksen odotuksiin lisätty items-tarkenne (luvut 24 ja 36 säilyvät).

**Tarkistukset:** kappale- ja intenttestit 8/8 sekä rinnakkaisen storefrontin regressiot 8/8, `npm run aimo:eval` 26/26 ja `aimo:eval:spoken` 54/54, 0 mallikutsua. Oikeaa mallia tai Valio-API:a ei tässä kutsuttu. **Seuraava askel:** liitä sanelun reseptiaikomus sovelluksen reseptihakuun ja annosmäärään, säilytä samassa lauseessa luetellut tuotteet, testaa yhteinen haku → kori ja käynnistä vanha 4747-palvelin sovitusti uudelleen samoilla kannoilla. Sen uudet storefront-reitit palauttivat tarkistuksessa vielä 404.

## 14.11.2026 — Aimon ostoskori ja yhteinen hakukenttä (Codex, korin ulkoasu)

**Käyttäjän päätös:** demossa käytetään uutta hakua ja Aimon toimitustukun mukaista ostoskoria. Keittiön vanhaa agenttiehdotusta ja agenttien aiempia tilauksia ei tuoda tähän koriin. Myöhempi tarkennus: myös korin Lisää tuotteita -kenttään sama sininen AI-kuvake ja mikrofoni; haku avautuu animaatiolla juuri käytetystä kentästä. Koriin tulee saatavuuden tarkistus, keltaiset huomiot, päivälle siirto ja hyväksyttävät korvaajat ennen maksuvaihetta. Oikeaa maksupalvelua ei ole kytketty.

- Uusi `public/cart.html`, `storefront-cart.css` ja `storefront-cart.js`: sama paikallinen otsake, Matter/National-fontit, toimituspäivävälilehdet, asiakastiedot, työkalurivi, tuoterivit, määrävalitsimet, verottomat/verolliset summat ja yhteenveto kuin Chromessa auki olleessa Aimon korissa. Määrät, poistot, tyhjennys, viite ja päivälle siirto toimivat selaimen omassa korissa. Tulostus ja CSV-vienti toimivat; tiedosto- ja tilauspohjatuontia ei vielä liitetty.
- `storefront-cart-store.js` pitää tilan avaimessa `aimo.storefront.cart.v1`, erillään keittiöstä ja gatewayn tilauksista. Määrät säilyttävät grammantarkkuuden; vain rahasummat pyöristetään sentteihin. Tuntematonta veroa tai hintaa ei esitetä varmistettuna loppusummana. Etusivun ja gateway-etusivun otsake sekä hakupaneelin lisäykset käyttävät tätä samaa koria.
- `storefront-cart-data.json`: oikean korin 16.11. välilehden 10 vertailutuotetta ja ensimmäiset kuusi joulukarusellin tuotetta. Toisen välilehden rivejä ei saatu luettua: 18.11. alkaa tyhjänä, eikä sen sisältöä keksitty. Vertailutuotteiden tunnisteet ovat eri valikoimasta kuin challenge-katalogi, joten saatavuustarkistus ei voi hyväksyä tuntemattomia tunnisteita. Toiminnallinen tilauspolku testataan hausta lisätyillä challenge-tuotteilla. Koko sivuston tai maksamisen täydellistä kopiota ei väitetä toteutetuksi.
- 15 uutta julkisilta Aimon/Valion tuotesivuilta haettua tuotekuvaa ja niiden lähteet/tarkistussummat `storefront-assets/sources.json`:ssä. Ensimmäiset yhdeksän kuvaa sekä store-/data-tiedostojen varhainen versio ehtivät mukaan toisen istunnon yhteiseen tilannetallennukseen `6d8ee2a`; tämä työvaihe viimeistelee ne.
- `aimo-ask.js`: tämän työvaiheen osuus on korikytkentä sekä `attach`-funktion valinnainen placeholder, AI-kuvake ja alemman kentän avautumisgeometria. Paneeli avautuu lähdekentän suorakulmiosta ja siirtyy tarvittaessa ylemmäs, jotta sisältö mahtuu ruutuun. Sulkeminen palauttaa kohdistuksen samaan kenttään ja päivittää `aria-expanded`-tilan. Yhteinen hakutiedosto tallennetaan toisen työvaiheen commitiin työnjaon mukaan.

**Työnjako Eeliksen luvalla:** chat ”Selkeytä hackathonin ominaisuudet” omistaa haun saatavuussuodatuksen, korvaajat ja `cart-workflow.js/css`-tarkistus-/maksuesikatselun. Tämä vaihe omistaa korin perusulkoasun, selainstoren ja animaation. Saneluchat työstää erikseen myyntipakkausten kappalemäärälaskentaa. Niiden keskeneräisiä tiedostoja ei oteta tähän commitiin.

**Tarkistukset:** korin testit 6/6 (vertailusummat 1 534,73 / 1 918,40 euroa, lisäysten yhdistyminen, pysyvyys, päivälle siirto, virheellinen syöte, tuntematon vero ja grammantarkkuus). `npm test` ajon hetkellä 44/44 ja `npm run aimo:eval` 26/26, 0 mallikutsua. Omien JavaScript-tiedostojen syntaksi ja rajattu diff-tarkistus läpi. Lähdemanifestin 63/63 tiedoston koko ja SHA-256 täsmäävät. Selaimessa 1512×857, 375×812 ja 320×740: korin määrät ja summat, siirto 16.11. → 18.11. → 16.11., molemmat hakutriggereiden paikat ja korin AI-kuvake; ei vaakaylivuotoa. Puhelimen oikeaa mikrofonia ei testattu. Portin 4747 palvelinta tai tilauskantaa ei tässä vaiheessa käynnistetty uudelleen eikä nollattu.

**Jatko:** tarkista muiden työvaiheiden valmistuttua yhdistetty hakupolku, korvaajan hyväksyntä ja maksuesikatselu eristetyssä ympäristössä, sitten yksi sovittu 4747-uudelleenkäynnistys säilyttäen kannat. Aidon maksu-/tilausjärjestelmän yhdistäminen jää erilliseksi työksi.
## 14.11.2026 — Tilausapuri: Danielin agentti sivustolle (Claude Code, Danielin istunto)

**Käyttäjän pyyntö:** Daniel halusi, että hänen ostosagenttiaan voi käyttää sivuston kautta.

**Ratkaisu:** uusi sivu `/assistant.html` (yhteinen `aimo-shell.js`-kehys). Selain lähettää keskustelun reitille `POST /api/assistant/chat`; palvelin kutsuu Claudea Claude API:n MCP connectorilla (beta `mcp-client-2025-11-20`), ja Anthropic kutsuu Danielin Render-palvelimen työkaluja (`search_products`, `quote` ym.). Vastaus striimataan SSE:nä (`status`, `tool`, `text`, `done`, `error`) ja näytetään taulukkona: Tuote, Aikaisin toimitus, Tilaa viimeistään, Hinta (alv 0), Korvaava tuote. Kapealla näytöllä rivit ovat kortteja.

- `server/aimoAgent.mjs`: uusi `chatWithMcp` (malli `config.deepModel` = Opus 5.5, effort `medium`, palvelinpuolen fallback `default` ja uusinta ilman sitä 400:lla, `pause_turn`-jatko enintään 4 kierrosta, samat laskurit `byPurpose.assistant_chat`). Kaikki mallikutsut kulkevat yhä tämän moduulin kautta.
- `server/assistant.mjs` (uusi): syötteen tarkistus (enintään 20 viestiä, 4000 merkkiä, viimeinen käyttäjältä), järjestelmäohje tämän päivän päivämäärällä (Helsinki), Render-palvelun herätys `/healthz`-kutsulla ennen mallikutsua (ilmainen taso nukahtaa).
- `server/index.mjs`: kaksi reittiä (`GET /api/assistant/status`, `POST /api/assistant/chat`) ja tuonti. `server/config.mjs` ja `.env.example`: `ASSISTANT_MCP_URL`, `ASSISTANT_MCP_TOKEN`. README:n osoitetaulukkoon rivi.
- Uudet `public/assistant.html`, `assistant.js`, `assistant.css` (luokat `ta-`). Hakupaneeliin (`aimo-ask.js`) ja saneluun ei koskettu, koska Eelis työsti niitä samaan aikaan; linkki tai paneeliin kytkentä on Eeliksen päätettävissä.
- **Kustannus:** kutsut maksetaan palvelimen `ANTHROPIC_API_KEY`-avaimelta (Opus 5.5, yksi kysymys = useita API-kierroksia työkalutuloksineen).

**Tarkistukset:** `node --check` muutetuille tiedostoille. Päästä päähän -testi jäljiteltyä Claude API:a vasten (ei oikeaa avainta, 15/15): striimattu teksti merkilleen sama, työkalukutsut tilaviesteinä, pyynnössä `mcp_servers` (osoite, nimi, `authorization_token`) ja `mcp_toolset`, fallbackin 400-uusinta, `pause_turn`-jatko, virheellinen syöte 400 ilman API-kutsua, Markdown-taulukon muunnos ja HTML:n escapointi. `npm test` ei käynnistynyt Danielin koneella, koska `data/catalog.json` puuttuu (ei liity muutokseen). **Ei testattu:** oikea Claude API ja oikea MCP-yhteys Renderiin, sivun ulkoasu selaimessa.

**Käyttöönotto:** lisää `.env`:iin `ASSISTANT_MCP_URL` (Render-osoite + `/mcp`, ilman tokenia) ja `ASSISTANT_MCP_TOKEN` (Danielilta), käynnistä palvelin uudelleen ja avaa `/assistant.html`.

## 14.11.2026 — Danielin MCP-palvelin päivitetty ja pysyvästi Renderissä (Claude Code, Danielin istunto)

**Käyttäjän pyyntö:** Daniel pyysi päivittämään juuren `server.py`:n reposta `DanielTurkkinen/valio-aimo-agent` (yksityinen), jossa sitä nyt kehitetään. Palvelin pyörii Renderissä pysyvässä osoitteessa; tunneliosoite ei enää vaihdu. Osoitetta ja tokenia ei kirjata tähän julkiseen repoon, ne saa Danielilta.

- Juuren `server.py` ja `test_tools.py` korvattiin uusimmilla versioilla, lisättiin `requirements.txt` (`mcp>=2.3`). `server.cpython-311.pyc` poistettiin, ja `.gitignore` estää jatkossa `*.pyc`- ja `__pycache__`-tiedostot. Node-sovelluksen tiedostoihin ei koskettu.
- **Korjattu tämän lokin 14.11. havaitsemat viat:** saldo 999999 tulkitaan tuntemattomaksi kaikilla tuotteilla (ei vain Terminal), ja pyydettyä aikaisempi toimitus kelpaa (`deliversByRequestedDate`, huomautus näytetään). Ennallaan: tilausaikaraja verrataan koneen kelloon, ei `DEMO_NOW`-kelloon.
- **Uusi `quote`-työkalu ja vastausmuoto:** agentti vastaa yhdellä taulukolla, sarakkeet Tuote, Aikaisin toimitus, Tilaa viimeistään, Hinta (alv 0), Korvaava tuote. Korvaajat haetaan samasta `category`-ryhmästä nimen sanojen perusteella, vain saatavilla olevat, ja nimen ominaisuudet (laktoositon, gluteeniton, maidoton, vegaaninen, luomu, kasvis) säilyvät. Allergeeneja ei verrata luokittelusta.
- **Muisti:** tuotedata jäsennetään yksi tuote kerrallaan ja säilytetään kevyenä (lisätiedot zlib-pakattuina). Keksityllä, oikean kokoisella datalla latauksen huippu laski 641 Mt:stä noin 95 Mt:hen; vanha versio kaatui Renderin 512 Mt:n ilmaistasolla.
- Muut: tunnus myös osoitteessa `?token=` (claude.ai:n custom connector), `/healthz` ilman tunnusta, agentin ohjeet MCP:n `instructions`-kentässä.

**Tarkistukset:** Danielin repossa: `quote` ja korvaajalogiikka keksityllä datalla (laktoosittomalle ei tarjottu tavallista maitoa, umpeutunut takaraja ei kelpaa korvaajaksi, 4 API-kutsua), suoratoistojäsennys vastaa `json.loads`-tulosta myös monitavuisten merkkien kohdalla palarajoilla, palvelin käynnistyy ja `/healthz` vastaa. Daniel vahvisti agentin toimivan Renderin kautta. Korvaajien laatua oikealla datalla ei ole arvioitu järjestelmällisesti.

**Huomio Eelikselle:** Danielin palvelinta kehitetään jatkossa hänen omassa repossaan; tämän repon kopio päivitetään pyynnöstä. Gatewayn `/mcp` ja Danielin palvelin ovat yhä erillisiä.

## 14.11.2026 — sanelu keskelle isoksi lopetuspainikkeeksi (Codex)

**Käyttäjän päätös:** kuunnellessa näkyy keskellä iso litteä mikrofonipainike, kevyt pomppiva liike, teksti "Kuuntelen…" ja ohje "Lopeta sanelu painamalla mikrofonia." Puhetta ei kirjoiteta näkyviin kuuntelun aikana. Lopetuksen jälkeen näytetään käsittelytila ja sitten ostoslistan tulkinta.

- `public/aimo-voice.js`: keskimmäinen mikrofoni on oikea painike, joka päättää sanelun hiirellä, kosketuksella ja näppäimistöllä. Erillinen Valmis-painike poistettu. Välitulokset pysyvät muistissa; hakuteksti täytetään vasta lopetuksen yhteydessä. Käsittelyn ajan mikrofoni on estetty ja sen tilalla näkyvät kolme pistettä. Peruuta ja sulkeminen säilyvät, virheestä voi yrittää uudelleen tai jatkaa kirjoittamalla.
- `public/aimo-voice.css`: kuuntelun ajaksi hakukenttä ja oikotiet väistyvät. Keskitetty 104 px:n sininen painike (puhelimella 92 px), ääneen reagoivat kehät ja pieni pystysuuntainen liike. Vähennetyn liikkeen asetus estää animaation. Tulosten valmistuttua tavallinen hakupaneeli palaa näkyviin.

**Tarkistukset:** sanelun elinkaaritestit 8/8, `node --check`, `git diff --check`. Selaimessa erillisessä testidemossa simuloidulla puheella: välitulos ei näy hakukentässä (arvo pysyi tyhjänä), iso painike näyttää ensin "Kokoan ostoslistaa…" ja sitten 20 l kermaa + 5 kg voita pe 20.11.; lopetus Enterillä pysyy hakupaneelissa; peruutus palauttaa aiemman tekstin, lupaesto ja sulkeminen toimivat. 375/320 px:n leveydet ilman vaakaylivuotoa. Testiproxyn vastausta viivästettiin vain testissä käsittelytilan näkemiseksi; toteutukseen ei lisätty odotusta. Oikeaa mikrofonia ei tässä testattu. Tässä työvaiheessa muutettiin vain sanelun kahta tiedostoa ja tätä lokimerkintää.

## 14.11.2026 — koko työpuun tilannetallennus GitHubiin (Claude Code)

**Käyttäjän pyyntö:** Eelis kysyi, onko kaikki GitHubissa, jotta muut voivat jatkaa, koska hänen käyttörajansa lähestyy. Ei ollut: työpuussa oli 16 muutettua ja 10 uutta tiedostoa commitoimatta. Ne tallennettiin yhtenä tilannetallennuksena. **Suurin osa on muiden työvaiheiden keskeneräistä työtä, jota tämä istunto ei ole tehnyt eikä tarkistanut selaimessa.**

- Lokiin jo kirjattu, aiemmin commitoimaton työ: valmis tilaus tuotekuvina, esikatselun nuoli, oikoteiden kutistuminen kirjoittaessa ja `RAW_INGREDIENT`-rajaus (`public/aimo-ask.js`, `aimo-ask.css`, `server/aimo/resolve.mjs`, `server/aimo/index.mjs`); ks. merkintä "valmis tilaus tuotekuvina" alla.
- Ilman omaa lokimerkintää, tekijä ja tila tuntematon: hyväksyntänäkymän seurantatyylit (`public/approve-track.css`, `approve.html`, `agent.html`, `gateway.js`), `public/app.js`, `styles.css`, `storefront-search.js`, `storefront.css`, `server/index.mjs` (mm. `/api/storefront/quotes`), `server/images.mjs`, `server/substitutes.mjs` sekä 9 tuotekuvaa hakemistossa `public/storefront-assets/` (yhteensä noin 1,9 Mt, lähteitä ei ole tarkistettu `sources.json`-tiedostosta).
- `.claude/launch.json`: testipalvelinasetukset portteihin 4752, 4755, 4756 ja 4766. Kantapolut osoittavat päättyneiden istuntojen väliaikaishakemistoihin: vaihda polku ennen käyttöä.
- **Jätetty pois:** `public/aimo-voice.js` ja `aimo-voice.css`. Toinen työvaihe muokkasi niitä tallennushetkellä (klo 15.50), joten ne jäävät sen omaan commitiin.

**Tarkistukset:** `node --check` muutetuille JavaScript-tiedostoille, `git diff --check`, `npm test` 34/34, `npm run aimo:eval` 26/26, `npm run aimo:eval:spoken` 54/54. Diffistä haettu avaimia ja yksityisavaimia, ei osumia. Selaimessa ei katsottu mitään, eikä palvelimia käynnistetty uudelleen.

**Jatkajalle:** lue tämä loki ja `git log`. Portin 4747 demopalvelin ajaa vanhempaa palvelinkoodia, kunnes se käynnistetään uudelleen (`npm start`, ei watch-tilaa). Avoimet kohdat ovat alla olevissa merkinnöissä: mustikkajogurtin näyttäminen marjojen jälkeen, "luomupottu", reseptikortin järjestys puhelimella ja korvaajan valinta oikealla mallilla.

## 14.11.2026 — sanelupallo litteäksi (Codex)

**Käyttäjän päätös:** kuuntelupallon ei tarvitse näyttää kolmiulotteiselta. `public/aimo-voice.css`: pallon säteittäinen liukuväri sekä sisä- ja ulkovarjot poistettu; tilalla hakupaneelin tasainen sininen (`--ask-blue`). Ääneen reagoiva liike ja kehät säilyvät.

**Tarkistukset:** selaimessa erillisessä simuloidussa testidemossa (4762/4763) pallo näkyy litteänä; lasketut tyylit: sininen `rgb(22, 104, 227)`, `backgroundImage: none`, `boxShadow: none`. Kuuntelupaneeli avautui ja sulkeutui. `git diff --check` läpi. Pelkkään ulkoasumuutokseen ei ajettu toimintatestejä uudelleen. Käyttäjän demoa tai muiden keskeneräisiä muutoksia ei muokattu.

## 14.11.2026 — haku ymmärtää puhekielen, kirjoitusvirheet ja slangin (Claude Code)

**Käyttäjän pyyntö ja päätökset:** Eelis kysyi, onko haku oikeasti fiksu ("maitoo", "maetoo", "jugurtti"). Mittaus: noin 125 yhden sanan hausta noin 30 palautti tyhjää ja noin 10 meni väärälle hyllylle. Päätökset: omaa hakumallia ei kouluteta (ei hakulokeja, deadline). Haku ei kulje MCP-palvelimen läpi, koska siinä ei ole kieliymmärrystä. Kielimalli on varalla vain, kun säännöt eivät tunnista sanaa. Laajaa testisettiä ei tehty, vain pikalista.

- **Tunnistustasot** (`server/aimo/lexicon.mjs`, `recognize`): tavallinen taivutus, puhekielen muoto ja astevaihtelu (maitoo, lohee, kananmunii, perunoit, maidon, jogurtit, leivän), yhdyssanan loppuosa (jauho, muro) ja kirjoitusvirhe (Damerau–Levenshtein, 1 merkki, 2 kun sana on vähintään 8 merkkiä, ensimmäisen kirjaimen pitää täsmätä). Jokainen ehdokas hyväksytään vain, jos se on sanastossa.
- **Synonyymit ja hyllyt** (uusi `server/aimo/synonyms.mjs`): käsin ylläpidetty taulu (pottu, bansku, jätski, limu, limsa, kalja, kauramaito, jugurtti ym.) ja `SHELVES`: kana, broileri, lohi, nauta, porsas, kurkku, banaani ja peruna haetaan raaka-aineen omista tuoteryhmistä, kun sana on pyynnön ainoa tuotesana. Tuore hylly on ennen pakastetta ja säilykettä (`server/aimo/resolve.mjs`).
- **Oppiva muisti:** kun kielimalli tulkitsee sanan, jota säännöt eivät tunteneet, pari tallennetaan tiedostoon `data/aimo-learned.json` (ei gitissä, polun voi vaihtaa muuttujalla `AIMO_LEARNED`). Sama sana tunnistuu sen jälkeen säännöillä. Mallin skeemassa on uusi kenttä `heard` (ostajan oma sana), ja sama teksti ei maksa toista mallikutsua saman prosessin aikana (`server/aimo/model.mjs`, `server/aimo/index.mjs`).
- **Paneeli** (`public/aimo-ask.js`): jos säännöt jättävät sanan tunnistamatta, paneeli kysyy mallilta 600 ms kirjoitustauon jälkeen ja näyttää tekstin "Selvitän, mitä tarkoitit". Korjattu sana näkyy huomiona: "maetoo": haetaan sanalla "maito".
- **Muut korjaukset** (`server/aimo/understand.mjs`): "kahvimaito" ei ole enää juomamaitoa (tuotetyypin oma poissulku), "pakastemustikka" ja "tuoremehu" pilkotaan tilaksi ja tuotteeksi, eikä attribuutti "tuore" tai "pakaste" enää niele koko yhdyssanaa. Tuntematon yhdyssana haetaan pisimmällä tunnetulla loppuosalla.
- Uusi pikalista `npm run aimo:eval:spoken` (54 hakua, ei mallikutsuja, oppiva muisti pois päältä).

**Tarkistukset:** `npm run aimo:eval:spoken` 54/54, `npm run aimo:eval` 26/26, `npm test` 34/34, `node --check`. Sääntöjen vasteaika: tuttu sana alle 1 ms, kylmä kirjoitusvirhe 4–16 ms. Oikea malli (`claude-haiku-5-5`), väliaikainen muistitiedosto: "suklaajätskii 10 l" 3,8 s mallilta ja toisella kerralla 4 ms muistista, "nötköttiä 5 kg" 2,4 s. Selaimessa eristetyllä palvelimella portissa 4766 (omat kannat, live-mock-API): "10 l maetoo", "pottuu 5 kg", "kanaa 10 kg" ja "10 l maetoo ja jugurttii 5 kg" näyttävät oikeat tuotteet hintoineen ja korjaushuomiot, "nötköttiä 5 kg" täydentyy mallilta tauon jälkeen, ei konsolivirheitä.

**Keskeneräistä ja huomiot:**

- Portin 4747 demopalvelinta ei käynnistetty uudelleen: palvelinpuolen muutokset tulevat voimaan vasta uudelleenkäynnistyksessä.
- Toisen työvaiheen commitoimaton rajaus (`RAW_INGREDIENT`, `resolve.mjs`) näyttää sanalla "mustikka" vain marjat. Eelis sanoi tässä keskustelussa, että mustikkajogurttiakin saa tarjota. Rajaukseen ei koskettu; päätettävä, näytetäänkö makutuotteet marjojen jälkeen.
- Malli vastaa 2–4 sekunnissa, joten tuntematon slangisana näkyy ensimmäisellä kerralla viiveellä. Demon haut kannattaa ajaa kerran etukäteen, jolloin ne ovat muistissa.
- Mallin tulkinta voi kadottaa määritteen ("suklaajätskii" → jäätelö) tai valita kapean sanan ("nötkötti" → naudanliha, 4 tuotetta). Opittu pari jää muistiin, kunnes rivi poistetaan tiedostosta.
- "luomupottu" jää tunnistamatta (väittämä "luomu" nielee koko sanan). Lohen kärjessä on kirjolohi ennen lohta. Paneelin tekstiä "Selvitän, mitä tarkoitit" ei nähty ruudulla, koska selainpaneeli oli piilossa; DOM-sisältö tarkistettiin.
- Commitissa on tiedostoista `resolve.mjs`, `server/aimo/index.mjs`, `aimo-ask.js`, `aimo-ask.css` ja tästä lokista vain tämän työvaiheen kohdat. Muiden työvaiheiden commitoimattomat muutokset jäivät työpuuhun.

## 14.11.2026 — ostoslistan sanelu hakukenttään (Codex)

**Käyttäjän päätös:** hakukentän oikeaan reunaan mikrofoni, josta nykyinen hakupaneeli avautuu kuunteluun. Pieni sininen/petrolinvärinen pallo reagoi ääneen, puhe näkyy tekstinä ja Valmis näyttää tavallisen tuotetulkinnan. Tuotteet, määrät ja toimituspäivä tarkistetaan ennen nykyisiä koritoimintoja.

- Uudet `public/aimo-voice.js` ja `aimo-voice.css`: selaimen suomenkielinen SpeechRecognition/webkitSpeechRecognition, välitulokset, mikrofonin äänitasoon reagoiva pallo Web Audion avulla, Valmis, Peruuta, virhetilat ja kirjoittamiseen palaaminen. Värit ja painikkeet vastaavat hakupaneelia. 320/375 px:n asettelu ja vähennetty liike huomioitu.
- `public/aimo-ask.js`: pieni valinnaisesti ladattava kytkentä otsakkeen kenttään ja paneeliin. Vain valmis sanelu menee olemassa olevaan `/api/aimo/interpret`-hakuun (mallivaratien saa käyttää); näppäily säilyy sääntöhakuna. Sanelu ei lisää tuotteita eikä lähetä tilausta. Enter päättää kuuntelun ennen lomakkeen omaa siirtymää.
- Tauon vuoksi päättynyt selaimen tunnistusjakso jatkuu ilman lopullisten osien kahdentamista. Valmis, peruutus, Esc/sulkeminen, sivun piilottuminen ja siirtyminen vapauttavat äänimittarin mikrofoniraidat. Keskeneräinen lupapyyntö ei jätä myöhemmin saatua raitaa päälle. Kuuntelun enimmäiskesto 2 min; yli 600 merkin sanelua ei lähetetä palvelimen katkaistavaksi.
- Sanelu vaatii selaintuen sekä HTTPS:n tai localhostin. Puheentunnistuksen palvelu on selaimen tarjoama (voi tarvita verkkoyhteyden); projektiin ei lisätty uutta puhepalvelua, API-avainta tai äänitallennusta. Tuettuja selaimia ja oikean laitteen suomen tunnistustarkkuutta ei tässä varmennettu.
- `test/voice.test.mjs`: 8 testiä välituloksille, jaksojen jatkumiselle, myöhäisille tapahtumille, mikrofonin vapautukselle, lupa-/verkkovirheille, puuttuvalle selaintuelle, peruutukselle käsittelyn aikana ja liian pitkälle tekstille.

**Tarkistukset:** `npm test` 34/34, `npm run aimo:eval` 26/26 (0 mallikutsua), JS-syntaksi ja `git diff --check`. HTTP-testin portin avaamiseen tarvittiin hiekkalaatikon oikeuslaajennus. Selaimessa erillinen simuloitu palvelin 4762/4763 omilla väliaikaisilla kannoilla, ilman API-avaimia ja simuloidulla puheella: kuuntelu, väliteksti, Valmis ja Enter (ei tilaussiirtymää), 20 l laktoositonta kermaa + 5 kg voita pe 20.11., peruutuksen tekstinpalautus, estetty lupa, sulkeminen sekä 1280/375/320 px ilman vaakaylivuotoa. Käyttäjän demopalvelinta tai tilauskantaa ei muutettu eikä käynnistetty uudelleen.

**Rajaus ja jatko:** oikeaa puhetta, selaimen palvelun toimintaa, mikrofonilupaa ja tunnistustarkkuutta ei voitu todentaa simuloidulla äänilähteellä. Kokeile omalla mikrofonilla selaimessa. Commit sisältää vain sanelun sekä tämän kirjauksen; työpuun muiden työvaiheiden muutokset, myös `aimo-ask.js`:n muu työ ja vanhempi lokiluonnos, jätettiin paikalleen commitoimatta. Staattiset tiedostot tulevat käyttöön sivun päivityksellä.

## 14.11.2026 — valmis tilaus tuotekuvina, ei rivilistana (Claude Code, työpuussa)

**Käyttäjän päätös:** Eelis ei pidä hakupaneelin "tilaus on valmiina" -kortin rivilistasta (kuva, nimi, määrä, summa riveittäin). Kortti näyttää tilauksen tuotekuvina Woltin tilauskortin tapaan, kuten aiemmassa versiossa. Älä palauta rivilistaa.

- `public/aimo-ask.js` (`loadReady`): kuusi tuotekuvaa, määrä vihreänä merkkinä kuvan kulmassa, loput lukuna viimeisessä ruudussa ("+24"). Kuvalliset tuotteet valitaan ensin (18 kärkirivin kuvat kokeillaan), koska osalta tuotteista kuva puuttuu; kuvaton tuote näkyy nimiruutuna. Alarivi (tuotemäärä, päivä, summa) ja "Avaa tilaus" ovat ennallaan.
- `public/aimo-ask.css`: uudet säännöt tiedoston lopussa. Rivilistan säännöt (`.ask-crow`, `.ask-cname`, `.ask-csum`, `.ask-cmore`) jäivät käyttämättöminä paikalleen, koska ne kuuluvat toisen työvaiheen commitoimattomaan työhön.
- Muutos on samoissa tiedostoissa kuin toisen työvaiheen commitoimaton työ, joten sitä ei commitoitu erikseen: se tulee mukaan, kun ne tiedostot commitoidaan. Tämäkin lokimerkintä on commitoimatta.
- **Tillihaku:** Eelis pyysi korjaamaan, ettei "tilli" osu lakritsipastilliin. Vika oli jo korjattu commitissa `15f17a5` (kokonaisen sanan täsmäys). Tarkistettu portissa 4747: "1 kg tilliä" → 13 tuotetta, kaikki tilliä; "5 l kookosmaitoa" → 12 kookosmaitotuotetta. Avoin: "2 kg mustikkaa" tarjoaa yhä myös mustikkajogurttia ja muita mustikanmakuisia tuotteita (54 osumaa), koska sana on niiden nimessä kokonaisena.

**Jatko samana päivänä (Eeliksen pyynnöstä):**

- **Esikatselu aluksi kiinni:** valmiin tilauksen kuvakortti ei näy heti. "Katso valmis tilauksesi" -rivin nuoli (`.ask-peek`) avaa ja sulkee sen; muu osa kortista vie suoraan ostoskoriin (`/kitchen.html`).
- **Oikotiet kutistuvat kirjoittaessa:** kun hakukentässä on tekstiä, vasen sarake kapenee 68 px:n kuvakesarakkeeksi (resepti, tilaus) ja tulokset saavat tilan. Tilauskuvake vie ostoskoriin, reseptikuvake avaa reseptihaun, jolloin sarake levenee takaisin. Toteutus on pelkkää CSS:ää (`:has(.ask-idle)`), ei uutta tilaa JavaScriptissä.
- **Raaka-aine voittaa maun** (`server/aimo/resolve.mjs`, `RAW_INGREDIENT`): kun kategoriaton hakusana löytyy kokonaisena tuore- (174xx), pakaste- (41731, 41733, 41740) tai kuivamaustekategorian (22630) tuotteesta, ehdokkaiksi jäävät vain ne. "2 kg mustikkaa": 54 → 5 tuotetta (ei jogurttia, saippuaa eikä lautasliinoja); vadelma 6, omena 11, kaneli 13, valkosipuli 9, sitruuna 3. Jos osumia ei ole näissä kategorioissa, joukko pysyy ennallaan (lohi, suklaa, kookosmaito). "mustikkajogurttia" löytää yhä jogurtit. `npm run aimo:eval` 26/26, `npm test` 26/26. **Portin 4747 palvelinta ei käynnistetty uudelleen** (toisen työvaiheen käynnistämä klo 15.21), joten mustikkakorjaus ei ole siinä vielä voimassa.
- Selaimessa (noin 960 px): tyhjällä haulla sarakkeet 360 px + tulokset, esikatselu kiinni ja nuoli näkyy; nuoli avaa kortin; kirjoittaessa sarakkeet 68 px + tulokset, tekstit ja esikatselu piilossa. Puhelinleveyttä ei katsottu.

**Tarkistukset:** selaimessa `http://localhost:4747/`, leveys 800 px: kortissa 6 kuvaa ja "+24", 30 tuotetta, 3 277,65 €, ei konsolivirheitä. `node --check public/aimo-ask.js`. Leveää näyttöä ja puhelinleveyttä ei katsottu.

## 14.11.2026 — hakupaneeli puhelinleveydellä: tulokset kentän alle, alaosa näkyviin (Claude Code)

**Käyttäjän kysymys:** Eelis kysyi, toimiiko hakupaneeli puhelimessa. Paneeli aukesi ja haku toimi, mutta asettelussa oli kaksi vikaa, jotka korjattiin.

- `public/aimo-ask.css`: enintään 900 px:n leveydellä (yksi sarake) hakutulokset nousevat heti hakukentän alle. Aiemmin ne jäivät resepti- ja tilauskorttien alle, joten kirjoittaessa ruudulla ei muuttunut mikään. Tyhjällä haulla oikotiet ovat yhä ensin (`:has(.ask-idle)`).
- `public/aimo-ask.js`: paneelin enimmäiskorkeus lasketaan sen yläreunasta (`100dvh - top`). Aiemmin paneeli alkoi hakukentän kohdalta mutta sai lähes koko ruudun korkeuden, joten alaosa (puhelimella 114 px) jäi ruudun alle eikä sinne voinut vierittää. Sama vika oli pienempänä myös leveällä näytöllä.
- Commitissa on vain nämä kaksi kohtaa. Tiedostojen muut commitoimattomat muutokset (toinen työvaihe) jäivät työpuuhun.

**Tarkistukset:** selaimessa `http://localhost:4747/` leveydellä 375 px: paneeli aukeaa, "laktoositonta kermaa 20 l ja 5 kg voita" näyttää tulkinnan ja tuotteet heti kentän alla, paneelin alareuna on ruudun alareunassa, ei vaakaylivuotoa. `node --check public/aimo-ask.js`. Reseptipolkua, siirtoa agenttikonsoliin ja oikeaa puhelinta ei kokeiltu.

**Jatko (Eeliksen pyynnöstä):** valmiin tilauksen kortissa pitkät tuotenimet katkesivat ilman kolmea pistettä, koska `.ask-cname` oli `display: grid` eikä `text-overflow` silloin vaikuta. Työpuussa se on nyt `display: block`, ja nimet päättyvät kolmeen pisteeseen (katsottu selaimessa 375 px:n leveydellä). Sääntö kuuluu toisen työvaiheen commitoimattomaan valmiin tilauksen korttiin, joten muutos ei ole vielä GitHubissa: se tulee mukaan, kun se työvaihe commitoidaan. Älä palauta arvoa `grid`.

**Jäljellä:** reseptin valinnan jälkeen tulokset nousevat puhelimella reseptikortin yläpuolelle, jolloin annoslaskuri jää niiden alle.

## 14.11.2026 — toimituspäivä näkyy etusivun otsakkeessa myös puhelimella (Claude Code)

**Käyttäjän pyyntö:** Eelis huomasi, että puhelinleveydellä otsakkeessa näkyi vain ostoskori, ei toimituspäivää.

- `public/storefront.css`: poistettu enintään 600 px:n säännöstä rivi, joka piilotti otsakkeen ensimmäisen toiminnon (toimituspäivä). Uusi enintään 350 px:n sääntö pienentää logon 80 px:iin ja tiivistää välejä, jotta logo, toimituspäivä ja ostoskori mahtuvat samalle riville.
- Commitissa on vain nämä kaksi kohtaa. Tiedoston lopussa olevat toisen työvaiheen commitoimattomat rivit jätettiin työpuuhun.

**Tarkistukset:** selaimessa `http://localhost:4747/` leveyksillä 375 px ja 320 px: toimituspäivä ja ostoskori ovat logon rivillä, ei vaakaylivuotoa. Oikealla puhelimella ei katsottu. Päivä on yhä kiinteää näyttödataa (16.11.2026).

## 14.11.2026 — konsolin toimitusvarmuus- ja hiilijalanjälkimerkit poistettu (Claude Code)

**Käyttäjän päätös:** Eelis pyysi poistamaan commitissa `c991ca2` lisätyt merkit, koska työ on rajattu hakukenttään ja ostoskoriin.

- Poistettu merkkien piirto (`public/gateway.js`, `public/gateway-products.js`), tyylit (`public/gateway.css`, `public/aimo-shell.css`) ja tilausrivin kentät `deliveryReliability` ja `co2PerKg` (`server/gateway/service.mjs`). Nämä neljä muuta tiedostoa ovat nyt samat kuin ennen merkkejä (commit `22853c9`). Tarjousrivien vastaavat kentät ovat ennallaan, kuten ennen merkkejä.
- `public/gateway.js`: commitissa on vain merkkien poisto. Tiedoston toisen työvaiheen commitoimattomat muutokset jätettiin työpuuhun koskematta.

**Tarkistukset:** `node --check` kolmelle JavaScript-tiedostolle, `npm test`, haku merkkien luokkanimillä ei löydä osumia. Selaimessa ei katsottu.

## 14.11.2026 — demopalvelimen uudelleenkäynnistys ja selaintarkistus (Claude Code)

**Käyttäjän pyyntö:** Eelis pyysi käynnistämään palvelimen uudelleen ja testaamaan selaimessa kahden edellisen työvaiheen muutokset (commitit `15f17a5` ja `02f62bc`).

- Portin 4747 demopalvelin pysäytettiin ja käynnistettiin uudelleen asetuksella `aimo-ai` (`npm start`, live-mock-API, Claude päällä). Tilauskantaa ei nollattu: agenttikonsoli näyttää aiemmat tilaukset ja lokin ehjänä (175 riviä).
- Portin 4748 palvelin on toisen työvaiheen käynnistämä. Siihen ei koskettu, joten se ajaa yhä vanhaa palvelinkoodia.

**Tarkistukset selaimessa (1280 px):**

- Etusivun hakupaneeli, "1 kg tilliä ja 5 l kookosmaitoa maanantaiksi": tilli 13 sopivaa tuotetta, kärjessä GREENS 1KG TILLI 4,71 €; kookosmaito 12 sopivaa tuotetta, kärjessä VALCOM 1L KOOKOSMAITO 3,51 €. Hinnat ja saatavuus näkyvät.
- Reseptihaku "kasvissosekeitto": malli palautti ehdotukset uuden agenttimoduulin kautta. Ensimmäisen valinta tuotti raaka-ainerivit (porkkana 12 kg, peruna 12 kg) hintoineen ja merkin "Tekoälyn ehdotus, tarkista tuotteet".
- Agenttikonsoli `/agent.html` latautuu ilman konsolivirheitä. Palvelimen lokissa ei virheitä.
- Aiemmin tarkistamatta jäänyt kohta: suodatettu haku MCP:n `tools/call`-kutsuna toimii (kaurajuoma, toimitusvarmuus vähintään 0,95 ja enintään 0,5 kg CO2e/kg → 7 tuotetta, oletukset kerrottu vastauksessa).

**Testitilaus Eeliksen luvalla (portti 4747):** skenaario "I need 1,000 litres of lactose-free milk by Monday." ostajana Nordic Hotels Oy. Tulos: tilaus `AGW-20261114-0012`, 1 000 kpl Valio Hyvä suomalainen Arki Eila kevytmaitojuoma 1 l laktoositon, 1 010,00 €, tila odottaa hyväksyntää (`SPEND_CAP_ORDER`, `UNUSUAL_QUANTITY`). Päätösketjussa on `MODEL_CALL`-rivi `explain_approval` (`claude-haiku-5-5`, 2 971 ms, 496 + 326 tokenia), ja näkymässä lukee "Tekoäly suosittelee: tarkista". Ketju on ehjä (192 riviä). Eelis pyysi hylkäämään testitilauksen: se hylättiin konsolin reitillä (`/console/orders/…/reject`), joten demossa ei ole siitä avointa hyväksyntää. Korvaajan valinta (`pick_substitute`) ei käynnistynyt, koska tilaus ei tarvinnut korvaajaa, joten se on yhä ajamatta oikealla mallilla.

**Tarkistamatta:** muita tilauksia ei tehty, joten korvaajan valinta ja vahvistettu tilaus jäivät selaimessa ajamatta. Keittiönäkymää ja kapeaa näyttöä ei katsottu. Etusivun 404-vastaukset ovat puuttuvia tuotekuvia (`/img/…`), ei tämän työn aiheuttamia.

## 14.11.2026 — mallikutsut yhden Aimo-agentti-moduulin taakse (Claude Code)

**Käyttäjän pyyntö:** Eelis pyysi kokoamaan Clauden kutsut yhden Aimo-agentti-moduulin taakse, jotta "Valion oma agentti" on yksi paikka ja mallin voi vaihtaa siitä.

- **Uusi `server/aimoAgent.mjs`:** ainoa tiedosto, joka tuo `@anthropic-ai/sdk`:n. Omistaa asiakkaan, mallivalinnan (`modelFor('fast' | 'deep')`), kutsuasetukset ja laskurit (`agentStats`, myös tehtävittäin `byPurpose`). Yksi funktio `askAgent({ purpose, tier, system, user, schema, maxTokens, timeoutMs, retries, onToken })` palauttaa `{ text, json, model, ms, stopReason, usage }`.
- **Kutsujat** antavat vain ohjeen, syötteen ja skeeman: `server/llm.mjs` (syvä tarkistus, reititys, vastaus striimattuna, reseptiehdotukset), `server/aimo/model.mjs` (pyynnön tulkinta) ja `server/gateway/advisor.mjs` (korvaajan valinta, hyväksynnän selitys). Ohjetekstit, skeemat, tarkistukset mallin vastaukselle ja `MODEL_CALL`-lokirivit ovat ennallaan. Vanhat laskurit (`llmStats`, `modelStats`, `advisorStats`) ja funktioiden nimet säilyivät, joten kutsuvaa koodia ei muutettu.
- **Käytöserot:** kolmen asiakkaan sijaan yksi (1 uusintayritys, 120 s aikakatkaisu). Tulkinta (6 s, ei uusintoja) ja portin neuvonantaja (4 s, ei uusintoja) antavat rajansa kutsukohtaisesti kuten ennen. `llmStats.lastError` täyttyy nyt kaikista keittiötehtävien virheistä, ei vain syvän tarkistuksen. Kieltäytyminen ja katkennut vastaus heittävät saman virheen kaikissa tehtävissä.
- `ANTHROPIC_API_KEY`, `DEEP_MODEL` ja `FAST_MODEL` toimivat kuten ennen. `agentStats` ei vielä näy missään reitissä tai näkymässä.

**Tarkistukset:** `node --check`, `git diff --check`, `npm test` 26/26, `npm run aimo:eval` 26/26. Yksi oikea mallikutsu jokaisesta tehtävästä väliaikaisilla testikannoilla, kuusi kutsua, kaikki onnistuivat: reititys, striimattu vastaus (11 palaa), reseptiehdotukset (6 ruokaa, `claude-haiku-5-5`), pyynnön tulkinta ("20 litraa laktoositonta kermaa perjantaiks" → kerma, FREE_FROM_LACTOSE, 20 L, 20.11.), hyväksynnän selitys ja syvä tarkistus.

**Tarkistamatta:** korvaajan valintaa (`pickSubstitute`) ei kutsuttu oikealla mallilla; se käyttää samaa `ask`-funktiota kuin hyväksynnän selitys. Aikakatkaisu- ja virhepolkuja ei pakotettu esiin. Käyttöliittymää ei katsottu selaimessa. Käynnissä oleva palvelin vaatii uudelleenkäynnistyksen.

**Seuraava askel, jos mallia halutaan vaihtaa:** toisen toimittajan tai Danielin oman mallin kytkentä tehdään `askAgent`-funktion sisään. Rakenteinen JSON-vastaus ja striimaus ovat ne kaksi asiaa, jotka korvaavan mallin pitää tukea.

## 14.11.2026 — Danielin agentin osat porttiin: kokonaiset sanat haussa, suodattimet, agenttiohje (Claude Code)

**Tausta:** Eelis pyysi katsomaan Danielin repon `DanielTurkkinen/valio-aimo-agent` ja yhdistämään sen tähän projektiin niin, että Danielin agentti korvaisi Clauden. Repossa on yksi commit: sama `server.py` kuin tämän repon juuressa (lisänä tunnus osoitteessa `?token=`), `test_tools.py`, README ja `requirements.txt`.

**Havainto ja päätös:** Danielin palvelin on MCP-työkalupalvelin (kuusi lukutyökalua ja ohjeteksti). Siinä ei ole kielimallia, joten se ei voi korvata Claudea: agentti syntyy vasta, kun Claude liitetään siihen. Eelis hyväksyi suunnan, jossa Danielin osat siirretään Node-porttiin eikä Python-palvelinta ajeta rinnalla (kaksi välimuistia samaan Valion rajapintaan, toinen prosessi demoon). Danielin tiedostoja ei muokattu.

- **Agenttiohje** (`server/gateway/contract.mjs`, `AGENT_INSTRUCTIONS`; `http.mjs` antaa sen MCP:n `initialize`-vastauksessa): Danielin työnkulku, jatkettuna vaiheilla `get_mandate`, `request_quote`, `place_order`, `pending_approval` ja `get_audit_trail`.
- **Suodattimet** `search_products`-operaatioon (`contract.mjs`, `service.mjs`): `minDeliveryReliability` (0–1) ja `maxCo2PerKg`. Tuote ilman tietoa jää pois, ja se kerrotaan `interpretedAs.assumptions`-kentässä. Virheellinen arvo palauttaa `INVALID_FILTER`.
- **Kokonaiset sanat ensin** (Danielin haun periaate): `server/catalog.mjs` merkitsee osumalle `exact`, kun jokainen hakusana on nimessä kokonaisena sanana. Portin haku nostaa nämä osasanaosumien edelle (`wholeWordMatch` tuotekortissa). Pisteytys on ennallaan.
- **Aiemmin kirjattu vika korjattu** ("tilli" → pastilli, "kookosmaito" → rasvaton maito, "mustikka" → mustikkakeitto). Syy oli tulkintakerroksessa, ei haussa:
  - `server/aimo/lexicon.mjs`: jos sanan yleisin tuoteryhmä syntyy pelkistä yhdyssanojen loppuosista (pas|tilli) eikä sana esiinny siellä kertaakaan itsenäisenä, ryhmä otetaan itsenäisistä osumista.
  - `server/aimo/understand.mjs`: sana, joka vain päättyy tuotetyypin avainsanaan (kookos|maito), ei saa tyyppiä, jos sanasto sijoittaa sen toiseen tuoteryhmään.
  - `server/aimo/resolve.mjs`: tuntemattoman ryhmän nimihaku käyttää vain kokonaisen sanan osumia, kun niitä on. Kun kaikki tuotesanat eivät osu samaan nimeen, valikoimassa harvinaisin sana rajaa (Oltermanni ennen sanaa juusto) aiemman "viimeinen sana" -säännön sijaan.

**Tarkistukset:** `node --check` muutetuille tiedostoille, `git diff --check`, `npm test` 26/26, `npm run aimo:eval` 26/26 (välivaiheessa 24/26 ja 25/26, korjattu). Tulkinta ilman mallia: "1 kg tilliä" → 13 tuotetta, kärjessä GREENS 1KG TILLI; "5 l kookosmaitoa" → 12 kookosmaitoa; "2 kg mustikkaa" → kärjessä mustikka (ennen mustikkasose ja mustikkakeitto); "12 kg Valio Oltermanni juustoa" → 12 Oltermannia; lohikeittoresepti ja "broilerin rintafilee" ennallaan. Suodattimet kokeiltu suoralla funktiokutsulla: "kaurajuoma" 36 tuotetta, toimitusvarmuus vähintään 0,95 → 8, enintään 0,5 kg CO2e/kg → 23. Eristetty simuloitu palvelin portissa 4757 (omat testikannat, ei avaimia): `initialize` palauttaa uuden ohjeen ja `tools/list` näyttää suodattimet.

**Tarkistamatta:** suodatettua hakua ei saatu ajettua MCP:n `tools/call`-kutsuna (testikutsun ostaja-avain oli väärä), vain suorana funktiokutsuna. Live-mock-API:a, `npm run eval`- ja `npm run demo` -ajoja ei tehty. Ulkopuolista Claudea ei liitetty porttiin uudella ohjeella. Tilauspolkua tarjoukseen asti ei ajettu korjatuilla hauilla, joten halvimman valinta korjatusta joukosta on katsomatta ("tilli" sisältää yhä tilli-sipulisilakan).

**Huomiot:**

- Palvelinmuutokset tulevat voimaan vasta käynnissä olevan palvelimen uudelleenkäynnistyksessä.
- Vertailuajossa käytin hetken `git stash` ja `git stash pop` -komentoja yhteisessä työpuussa. Tila palautui samaksi, mutta toisen työvaiheen commitoimattomat tiedostot olivat hetken poissa levyltä. Näin ei pidä tehdä yhteisessä kansiossa.
- Tekemättä: Clauden kutsujen kokoaminen yhden moduulin taakse (`server/llm.mjs`, `server/aimo/model.mjs`, `server/gateway/advisor.mjs`), jotta mallin voi vaihtaa yhdestä kohdasta. "10 l kahvimaitoa" tulkitaan yhä juomamaidoksi (vanha vika, ei korjattu).
- Danielin palvelimen aiemmin kirjatut viat (Stock-saldo 999999, aikaisempi toimitus hylätään, oikea kello) ovat hänen koodissaan ennallaan.

## 14.11.2026 — hakupaneelin reseptihaku kielimallilla ja annoslaskuri (Claude Code)

**Käyttäjän pyyntö:** Eelis halusi, että reseptin voi hakea kirjoittamalla ("lohikeitto", "kermainen lohikeitto"), ehdotuksia tulee paljon ja ne tulevat tekoälymallilta. Annosmäärälle laskuri: miinus vasemmalla, plus oikealla, luku keskellä muokattavana.

- **Reseptihaku** (`public/aimo-ask.js`, `aimo-ask.css`): reseptikortissa on oma hakukenttä ja ehdotuslista. Tyhjällä haulla näkyvät neljä omaa reseptiä (`recipes.mjs`, tähti-ikoni). Kolmesta merkistä alkaen lista täydentyy mallin ehdotuksilla (kipinä-ikoni), enintään 6.
- **Uusi reitti** `GET /console/recipes?q=…` (`server/gateway/http.mjs`) ja `suggestRecipes` (`server/llm.mjs`, nopea malli, JSON-skeema): malli palauttaa ruoan nimen, lyhyen kuvauksen ja raaka-aineet per annos (KG tai L). Vastaukset ovat muistissa hakusanan mukaan; jokaisesta mallikutsusta jää `MODEL_CALL`-rivi päätösketjuun (`purpose: recipe_ideas`). Ilman `ANTHROPIC_API_KEY`-avainta reitti palauttaa vain omat reseptit.
- **Malli ei valitse tuotteita.** Mallin ehdotuksen valinta muodostaa raaka-ainelistan (määrä per annos × annokset) ja ajaa sen tavallisen tulkinnan läpi (`/api/aimo/interpret`, `llm: false`). Hakukentässä näkyy ruoan nimi, agentille lähtee raaka-ainelista. Otsikon vieressä on merkki "Tekoälyn ehdotus, tarkista tuotteet". Oma resepti kulkee entistä kiinnitettyä polkua.
- **Annoslaskuri:** askel on 5 alle 50 annoksen, 10 alle 200 annoksen ja 25 siitä ylöspäin; luvun voi kirjoittaa itse (1–2000), nuolinäppäimet toimivat. Muutos laskee valitun reseptin uudelleen. Aiemmat annosnapit (20, 50, 100, 200) poistettiin.
- Commitissa on mukana toisen työvaiheen yhden rivin korjaus `aimo-ask.css`:ään (`.ask:not(form)`, luokkatörmäys agenttisivun `form.ask`-lomakkeen kanssa).

**Tarkistukset:** `node --check`, `npm test` 26/26. Selaimessa portissa 4748 (live-mock-API, `claude-haiku-5-5`): haku "kermainen lohikeitto" palautti oman Lohikeiton ja 6 mallin ehdotusta; ensimmäinen kutsu kesti noin 9 s (8 ehdotuksella, sen jälkeen pyyntö rajattiin 6:een, uutta aikaa ei mitattu). "Kermainen lohikeitto, 120 annosta" tuotti 5 raaka-aineriviä hintoineen ja saatavuuksineen; laskuri 100 → 120 kahdella plussalla.

**Keskeneräistä ja huomiot:**

- Mallin raaka-aineet osuvat vapaan haun kautta välillä väärään tuotteeseen (aiemmin kirjattu vika: "tilli" → pastilli). Siksi tuotteet pitää tarkistaa; kiinnitetyt omat reseptit ovat luotettavampi polku.
- Mallin suomi ei ole aina siistiä (kuvauksissa esim. "dilli"). Toimituspäivä on reseptipolulla aina "maanantaiksi".
- Daniel rakentaa varsinaisen mallin; tämä reitti on sen paikka, vastausmuoto `{items: [{name, note, pinned, ingredients: [{name, amount, unit}]}]}`.

## 14.11.2026 — hakukenttä avaa sivun levyisen hakupaneelin (Claude Code)

**Käyttäjän pyyntö:** Eelis halusi, että otsakkeen hakukentän suurennuslasi vaihtuu pieneksi tekoälykuvakkeeksi ja klikkaus avaa sivun levyisen valkoisen paneelin, joka kasvaa hakukentän kohdalta. Vasemmalle kaksi oikotietä (resepti, valmis tilaus), oikealle tuotteet kirjoittaessa, mukana hinta ja saatavuus. Tämä on käyttäjän tietoinen poikkeus aiempaan linjaukseen "ei AI-nappia".

- **Uusi moduuli** `public/aimo-ask.js` ja `public/aimo-ask.css`: yksi paneeli kaikille sivuille. Etusivu (`index.html`, `gateway.html`) lataa sen suoraan; yhteinen kehys (`aimo-shell.js`) lataa sen keittiö- ja agenttisivulle. Otsakkeen kenttä on enää avain (vain luku, vihjeteksti "Hae tuotteitasi"); kirjoittaminen tapahtuu paneelin omassa kentässä.
- **Animaatio:** paneelin leikkausalue (`clip-path`) kasvaa hakukentän reunoista koko paneelin kokoiseksi, 340 ms. `prefers-reduced-motion` ohittaa animaation. Esc, rasti ja tausta sulkevat.
- **Vasen sarake:** "Hae tuotteita reseptin perusteella" (neljä reseptiä ja annosmäärä napeista, täyttää hakukentän) ja "Katso valmis tilauksesi, perustuen aiempiin tilauksiisi" (keittiön tallennettu ehdotus `GET /api/state`: viikonpäivä, rivit, summa, kuvat; linkki `/kitchen.html`).
- **Oikea sarake:** tulkinta ja tuotteet `POST /api/aimo/interpret` (`llm: false`), kuten aiemmassa etusivun haussa. "Tilaa agentin kautta" ja Enter vievät pyynnön agenttikonsoliin (`sessionStorage` `aimo.ask`).
- **Hinta ja saatavuus:** uusi vain luku -reitti `GET /console/availability?ids=…&date=…` (`server/gateway/http.mjs`), enintään 12 tuotetta, sama välimuisti kuin tarjouksilla. Ei tarjousta, allekirjoitusta eikä merkintää päätösketjuun. Selain kutsuu sitä 450 ms kirjoitustauon jälkeen. Näytetään nettohinta sekä tila: saatavilla (päivä, saldo jos tiedossa), myöhässä, ei saatavilla, tilausaika umpeutunut tai ei tiedossa.
- `public/storefront-search.js` ei enää lataudu etusivulla (skriptitagi vaihdettu); tiedosto on tallella. Kehyksen vanha ehdotuslista jää varatieksi, jos `aimo-ask.js` ei lataudu.

**Tarkistukset:** `node --check` muutetuille tiedostoille, `npm test` 26/26. Selaimessa portissa 4748 (live-mock-API): paneeli avautuu etusivulla ja keittiösivulla, "1000 litraa maitoa maanantaiksi" näyttää kolme tuotetta hintoineen (yksi merkitty "Tilausaika umpeutunut"), "Lohikeitto 100 annosta" näyttää 8 raaka-ainetta hintoineen ja saldoineen, sulkeminen toimii, agenttisivulla kenttä on kytketty. Animaatiota ei nähty liikkeessä (selainpaneeli oli piilossa, jolloin animaatiot eivät etene); siirtoa agenttikonsoliin ei klikattu läpi.

**Keskeneräistä ja huomiot:**

- **Päällekkäinen työ:** toinen työvaihe lisää samaan aikaan hintaa ja saatavuutta vanhaan etusivun hakuun (`storefront-search.js`, `storefront.css`, `POST /api/storefront/quotes` tiedostossa `server/index.mjs`, commitoimatta). Ne eivät ole tässä commitissa, eikä vanha haku enää näy etusivulla. Päätettävä, kumpi reitti jää; `aimo-ask.js` voidaan vaihtaa käyttämään `/api/storefront/quotes`-reittiä.
- Reseptit ja esimerkkipyynnöt ovat kiinteitä tekstejä `aimo-ask.js`:ssä; "valmis tilaus" on aina keittiödemon ehdotus. Daniel rakentaa mallin, johon nämä myöhemmin perustuvat.
- Saldo näytetään sellaisenaan; pyydettyä määrää ei verrata saldoon (1000 litran pyyntö näyttää tuotteen saatavilla olevana, vaikka saldo ei riittäisi). Sen tarkistaa agentin tarjous.

## 14.11.2026 — rajaus: työstetään vain hakukenttää ja ostoskoria (Claude Code)

**Käyttäjän päätös:** Eelis rajasi työn: fiksuksi tehdään vain etusivun hakukenttä ja ostoskori, kaikki muu pysyy samanlaisena kuin Toimitustukussa. Ensin hakukenttä. Uusia elementtejä, merkkejä tai paneeleja ei lisätä näiden kahden ulkopuolelle.

- Alla kirjatut konsolin toimitusvarmuus- ja hiilijalanjälkimerkit (commit `c991ca2`) tehtiin ennen tätä rajausta. Niitä ei ole poistettu; Eelis ei ole vielä päättänyt, jäävätkö ne.
- Koodia ei muutettu tässä kirjauksessa.

## 14.11.2026 — toimitusvarmuus ja hiilijalanjälki näkyviin tilausriveille, Danielin liittimen arvio (Claude Code)

**Tausta:** Eelis sai Danielilta MCP-liittimen (Danielin `server.py` väliaikaisen `trycloudflare.com`-tunnelin takana, token osoitteessa). Liitin kytkettiin Claude Code -istuntoon ja kokeiltiin kolmella lukukutsulla: `ping` 200, `data_status` 17 546 tuotetta, 4 425 toimitusvarmuusriviä ja 11 033 hiilijalanjälkiriviä, `search_products` toimii. Hinta- ja saatavuuskutsuja ei tehty API-kiintiön vuoksi.

**Päätös:** liitintä ei kytketä palvelimeen eikä demoon. Sen data on samoista lähdetiedostoista kuin meidän `data/catalog.json` (samat rivimäärät), osoite katoaa tunnelin sulkeutuessa, eikä siinä ole tilaus-, mandaatti- tai hyväksyntäpuolta. Käyttö: vertailukohta pitchissä (pelkkä haku vastaan portti) ja tarkistus kehityksessä. Tokenia ei kirjata repoon.

**Löytynyt aukko ja korjaus:** gateway palautti toimitusvarmuuden ja hiilijalanjäljen tarjousriveillä, mutta tilausriveiltä ne putosivat pois eikä käyttöliittymä näyttänyt niitä.

- `server/gateway/service.mjs`: tilausrivi saa katalogista kentät `deliveryReliability` ja `co2PerKg` samoilla nimillä kuin tarjousrivi. Ne ovat näyttötietoa: allekirjoitettu tarjous ja mandaattitarkistus eivät muutu.
- `public/gateway-products.js` ja `public/gateway.js`: pienet merkit tuotekortissa sekä tilaus- ja lisäyskorttien riveillä (konsoli ja hyväksyntänäkymä käyttävät samaa tiedostoa). Rekkakuvake ja prosentti on vihreä, kun toimitusvarmuus on vähintään 95 %, muuten keltainen. Lehtikuvake ja kg CO₂e/kg on neutraali. Puuttuva tieto ei näy lainkaan.
- Tyylit: merkit `public/gateway.css`, tuotekortin rivi `public/aimo-shell.css`.

**Tarkistukset:** eristetty simuloitu palvelin portissa 4756 (omat testikannat, ei API-avaimia), kuusi testitilausta `/console/demo`-reitillä. `/console/state` palauttaa kentät; selaimessa 1280 px leveydellä merkit näkyvät tuotekorteissa ja tilausriveillä, kortit pysyvät samankorkuisina, ei vaakaylivuotoa. `npm test` 26/26, `node --check` ja `git diff --check` läpi. Keltaista alle 95 %:n merkkiä ei nähty oikealla rivillä (testituotteilla arvo oli 100 % tai puuttui). Hyväksyntänäkymää ja kapeaa näyttöä ei katsottu erikseen.

**Korjaus commitiin `c991ca2`:** `public/gateway.js` lisättiin commitiin kokonaisena, ja siinä oli samaan aikaan toisen työvaiheen keskeneräinen puhelimen seurantanäkymä (`phoneView`, `tk`-alkuiset funktiot). Se osa ei ole tämän työvaiheen työtä eikä sitä ole tarkistettu tässä. Näkymän tyylit ja `approve.html`-muutos ovat yhä commitoimatta, joten GitHubin `main` on hyväksyntänäkymän osalta välitilassa, kunnes se työvaihe tallennetaan. Paikallisesta työpuusta ei kadonnut mitään. Uusi seurantanäkymä piirtää hyväksyntäsivun rivit itse, joten merkit näkyvät vain konsolissa, eivät hyväksyntänäkymässä.

**Huomiot:** palvelinmuutos vaatii käynnissä olevan palvelimen uudelleenkäynnistyksen; ennen sitä tehdyillä tilauksilla ei ole kenttiä tallennettuna. Testissä "ruokakermaa 10 l" valitsi 2,5 dl:n maustetun ruokakerman: sama yleisen haun vika kuin aiemmin kirjattu, ei korjattu. `.claude/launch.json`-tiedostoon lisättiin paikallisesti asetus `aimo-ai-test-4756`, ei tässä commitissa.

## 14.11.2026 — graafiset ehdotukset tiiviistä ja luotettavasta ostoskorista (Codex)

**Käyttäjän täsmennys:** ostoportaali helpottaa tarkistusta huomaamalla poikkeavan määrän ja perustelemalla sen. Käyttöliittymän pitää painottaa visuaalisuutta: tuotekuvat, pienet rivit, keltainen huomio juuri tuotteen kohdalla sekä erityisen selkeä muutoksen hyväksyntä. Ei erillistä näkyvää tekoälyelementtiä, suuria päätöskortteja tai ”sinun päätöksesi” -otsikkoa. Vihreä kertoo tarkistetusta asiasta, punainen varataan todelliselle esteelle. Huomioitu myös lokiin kirjattu keskipiste-erottimien kielto.

- `design/aimo-ui-ehdotukset.html`: kolme klikattavaa vaihtoehtoa Aimon nykyisellä ilmeellä: **Huomio tuoterivillä**, **Yhteinen tarkistusnauha** ja **Tarkistus vahvistushetkellä**. Ensimmäinen on avustajan suositus; käyttäjä ei ole vielä valinnut toteutettavaa vaihtoehtoa.
- Tuotekuvallinen ostoslista näyttää sekä myyntierät että litrat/kilot. Maito-rivin avattava perustelu näyttää historian, reseptitarpeen ja varaston laskelmana lähteineen. Kerman keltainen huomio näyttää 30 l → 6 l, vaikutuksen summaan ja vihreän **HYVÄKSY MUUTOS** -painikkeen. Alkuperäisen määrän voi myös säilyttää.
- Hyväksyntä päivittää paikallisen määrän, summan ja tilavärin. Vaihtoehdot säilyttävät omat valintansa. Varsinainen tilauspainike näyttää vain paikallisen esimerkkiviestin.
- `design/README.md`: suunnittelun perusteet, vaihtoehtojen erot, kuvien lähteet sekä luotettavan toteutuksen rajaukset. Kaikki luonnosten hinnat, myyntierät, historiatiedot, reseptit ja varastosaldot ovat havainnollistavia esimerkkitietoja. Ne eivät ole mitattuja tuloksia tai oikean keittiön tietoja.
- Kuvat käytettiin olemassa olevasta julkisista lähteistä muodostetusta välimuistista. Fontit ja logo ovat nykyisestä etusivusta. Aineistot on upotettu alle 1 Mt:n fragmenttiin; ei uusia verkkolatauksia tai API-kutsuja. Voin kuvan CC BY-SA -lähde on kirjattu suunnittelun README:hen.

**Tarkistukset:** JavaScriptin `node --check`, fragmentin rakenne (3 vaihtoehtoa, yksilölliset id:t, upotetut kuvat) ja esimerkkisummat läpi. Erillinen staattinen esikatselu portissa 4763: tuotekuvat näkyvät, maidon laskelma avautuu, 30 l → 6 l päivittää summan 282,90 € → 162,90 € ja avaa esimerkkivahvistuksen; alkuperäisen 30 l säilytys pitää summan ennallaan. Kolmannen vaihtoehdon ikkuna sulkeutuu ja avautuu uudelleen. Asettelut katsottu selaimessa 1024 px ja 320 px sisältöleveydellä; kaikissa kolmessa ei vaakaylivuotoa kapealla ruudulla. Muutos koskee luonnoksia, joten palvelintestejä, live-evaluaatiota tai demotilauksia ei ajettu.

**Jäljellä:** valittavan mallin yhdistäminen oikeaan ostoskoriin sekä luotettavan poikkeamantunnistuksen rajojen ja lähteiden määrittely. Ostohistoria ei yksin ole kulutusta, eikä puuttuva tieto saa näyttää varmennetulta. Käynnissä olevaan palvelimeen, tilauskantaan tai rajapintoihin ei tehty muutoksia tässä työvaiheessa. Rinnakkaisen työvaiheen muutokset säilytetään erillään tästä commitista.


## 14.11.2026 — etusivun fiksu haku (Claude Code)

**Käyttäjän päätös:** etusivusta (`/`, Toimitustukun ulkoasukopio) tehdään demon aloitusnäkymä, ja sen hakukenttä ymmärtää puhekielisen pyynnön. Valinnan jälkeen tilauksen hoitaa agentti portin kautta, ei etusivun oma ostoskori. Reseptihaku, allergeenirajaus omana toimintonaan ja live-hinnat rajattiin tästä työvaiheesta pois.

- Uusi `public/storefront-search.js` (ladataan `index.html`- ja `gateway.html`-sivuilla). Kirjoittaessa kutsutaan `POST /api/aimo/interpret` asetuksella `llm: false`, joten näppäily ei maksa mallikutsua eikä Valion API-kutsua. Otsakkeen alle avautuva paneeli näyttää rivikohtaisesti määrän, tuotteen, väittämät (esim. laktoositon), toimituspäivän, sopivien tuotteiden määrän ja kolme parasta osumaa kuvineen sekä tulkinnan keston. Ymmärtämättä jääneet sanat ja oletukset näytetään erikseen.
- Enter tai nappi "Pyydä tarjous agentilta" tallentaa tekstin `sessionStorage`-avaimeen `aimo.ask` ja avaa `/agent.html`-sivun. `public/aimo-shell.js` lukee avaimen konsolissa ja antaa tekstin samaan polkuun kuin konsolin oma haku: pyyntö tulkitaan ensin, tilaus ei lähde ilman käyttäjän seuraavaa painallusta.
- Etusivu ei näytä hintoja eikä saldoja hakutuloksissa. Tarkennusnapit (pakkauskoko, merkki) ovat vain konsolissa, koska valinta ei siirtyisi etusivulta mukana.
- Tyylit lisättiin `public/storefront.css`-tiedoston loppuun (`.ss-`-luokat). Puuttuvan tuotekuvan paikalla on pakkauskuvake.

**Tarkistukset:** selaimessa eristetyllä simuloidulla palvelimella (portti 4755, omat testikannat, ei API-avaimia): "laktoositonta kermaa 20 l perjantaiksi ja 5 kg voita" tuotti kaksi riviä, päivän pe 20.11. ja osumat; siirto konsoliin täytti pyynnön ja avasi tulkinnan. "gluteeniton leipä", tuntematon sana ja "lohikeitto 100 annosta maanantaiksi" näkyivät oikein. Reseptitapaus nojaa toisen työvaiheen commitoimattomaan `server/aimo/recipes.mjs`-työhön. `npm test` 26/26, `node --check` läpi. Kapeaa näyttöä ei tarkistettu.

**Jäljellä:** käynnissä olevat palvelimet tarjoavat staattiset tiedostot levyltä, joten haku näkyy sivun päivityksellä. `.claude/launch.json`-tiedostoon lisättiin paikallisesti asetus `aimo-ai-test-4755`; se ei ole tässä commitissa, koska tiedostossa on toisen työvaiheen muutoksia.

## 14.11.2026 — keittiönäkymän tilapalkki pois (Claude Code)

**Käyttäjän pyyntö:** Eelis halusi keittiönäkymän (`/kitchen.html`) yläpalkin alta pois rivin, jossa olivat merkit "Live: Aimo API", "Claude päällä" ja viimeisin vasteaika.

- `public/app.js`: `renderStatus` ei enää piirrä tilamerkkejä.
- `public/aimo-shell.js`: yhteinen kehys ei luo keittiösivulle `#modes`-riviä. Agenttikonsolin (`/agent.html`) oma tilarivi (`#chips`) on ennallaan.
- Vasteaika näkyy edelleen "Miten tämä toimii" -välilehdellä. Simuloidusta tilasta (ei `VALIO_API_KEY`-avainta) ei ole enää näkyvää merkkiä keittiönäkymässä.

**Tarkistukset:** `node --check` molemmille tiedostoille läpi. Selaimessa `http://localhost:4748/kitchen.html`: rivi on poissa, sivu latautuu ilman JavaScript-virheitä. Muita testejä ei ajettu.

**Huomio:** commit sisältää vain tämän työvaiheen rivit. Työpuussa on muiden työvaiheiden commitoimattomia muutoksia, myös samassa `aimo-shell.js`-tiedostossa (etusivun haun siirto konsoliin), joita tämä commit ei sisällä.

## 14.11.2026 — näkymätön tekoäly: reseptistä ostoskori, tarkentava kysymys, Vahti-paneeli, vihreä hyväksyntä (Claude Code)

**Käyttäjän linjaus:** tekoäly ei näy omana elementtinään (ei chat-kuplaa, ei AI-nappia), vaan siinä, mitä tavalliset kentät osaavat. Sama lause lisättiin pitch deckin demokohtaan (`SUUNNITELMA.md`).

- **Reseptistä ostoskori** (`server/aimo/recipes.mjs`, `server/aimo/index.mjs`): "Lohikeitto 100 annosta maanantaiksi" → raaka-ainerivit, määrä = annokset × määrä per annos. Jokainen rivi on kiinnitetty yhteen tuotekoodiin ja lähtee tarjouspyyntöön ehdolla `allowSubstitutes: false`. Tulkinnan vastauksessa on uusi kenttä `recipe`. Reseptejä on neljä (lohikeitto, mustikkarahka, kanacurry ja riisi, riisipuuro). **Oletus:** reseptit ja annoskoot ovat itse kirjoitettua demodataa, eivät asiakkaan reseptiikkaa.
- **Tyhmien virheiden esto:** annosmäärä on pakollinen ja rajattu välille 1–2000; ilman sitä palautetaan `PORTIONS_MISSING` eikä tilata mitään (konsolissa annosnapit 20, 50, 100, 200). Jos yksikin raaka-aine puuttuu katalogista tai ei ole tilattavissa, koko kori jää tilaamatta ja viesti nimeää rivin (`buyerAgent.mjs`). Kielimallia ei kutsuta reseptipolulla. "lohikeittoa 10 kg" ei ole resepti vaan tavallinen tuotehaku.
- **Miksi tuotteet kiinnitettiin:** vapaan tekstin haku valitsi halvimman osuman väärin, esim. "1 kg tilliä" → lakritsipastilli, "5 l kookosmaitoa" → rasvaton maito, "2 kg mustikkaa" → mustikkakeitto. Tätä yleisen polun vikaa ei korjattu tässä työvaiheessa.
- **Tarkentava kysymys** (`public/gateway.js`): kun pyynnöstä puuttuu ruokavaliorajaus, joka jakaa ehdokkaat 20–80 % (esim. maito: laktoositon 25/73), konsoli kysyy ennen lähetystä "Pitääkö tuotteen maito olla jotain näistä?". Vastaus on yksi nappi ja lähettää pyynnön heti; "Ei väliä: halvin sopiva" ohittaa. Kysytään kerran per pyyntö, ei resepteille eikä valmiille skenaarionapeille. Toimii myös yläpalkin hausta.
- **Vahti-paneeli** (`public/agent.html`, `gateway.js`, `gateway.css`): näyttää `GET /console/watch` -raportin: ostajittain haut, tarjoukset, tilaukset, arviot ja puuttumiset, viimeisimmät havainnot linkkeineen päätösketjuun sekä sopimuksen säännöt.
- **Hyväksyntä:** Hyväksy-nappi on nyt vihreä (`.btn.approve`, #1a7f37, valkoinen teksti) ja leveämpi kuin Hylkää, konsolissa ja puhelinnäkymässä.
- `scripts/demo-buyer.mjs`: skenaario 10 (resepti ja sama ilman annosmäärää).

**Tarkistukset:** eristetty palvelin portissa 4752 omalla `GATEWAY_DB`- ja `AIMO_DB`-kannalla, live-mock-API. Lohikeitto 100 annosta → vahvistettu 215,24 €, 8 riviä (lohikuutio 2 × 5 kg, kerma 3 × 1,75 l); riisipuuro 40 → hyväksyntään (Kahvila Aalto); kanacurry 60 → 120,34 €; mustikkarahka 80 → 121,00 €; ilman annoksia → ei tilausta. Selaimessa: kysymys yläpalkin hausta → "Laktoositon" → tilaus hyväksyntään (1 010,00 €), Vahti-paneeli näyttää 1 500 litran havainnon, vihreä nappi puhelinnäkymässä. `npm run aimo:eval` 26/26, `npm test` 26/26. `npm run demo` -skriptiä ei ajettu.

**Keskeneräistä ja huomiot:**

- Käyttäjän palvelinta portissa 4747 ei käynnistetty uudelleen: palvelinpuolen muutokset (resepti) tulevat voimaan vasta uudelleenkäynnistyksessä, selainpuolen muutokset heti.
- Reseptien tuotteet valittiin sen mukaan, mikä oli tilattavissa la 14.11. iltapäivällä oikealla kellolla. Tilausaikojen umpeuduttua (viimeistään su 15.11. klo 17.00) resepti pysähtyy turvallisesti, ellei `DEMO_NOW` ole päällä.
- Portti hyväksyy pyydettyä aikaisemman toimituksen kysymättä: "perjantaiksi" pyydetty lohikeitto vahvistui toimitukseen ma 16.11. Tämä on portin aiempaa käytöstä kaikille pyynnöille, ei reseptin oma piirre; tuoretuotteilla se voi olla virhe.
- Vahti-paneelin Haut-sarake on nolla, kun agentti käyttää tulkintareittiä eikä `search_products`-kutsua.

## 14.11.2026 — keskipisteet pois koko projektista (Claude Code)

**Käyttäjän päätös:** Eelis ei halua keskipistettä (U+00B7) erottimena missään. Älä lisää sitä uuteen käyttöliittymätekstiin, lokitulosteeseen, kommenttiin tai dokumenttiin. Käytä pilkkua tai jaa tieto omiin elementteihinsä.

- Kaikki 90 esiintymää 20 seuratussa tiedostossa korvattiin: käyttöliittymät (`public/app.js`, `gateway.js`, `gateway-products.js`, `aimo-shell.js`), palvelimen tekstit ja kommentit, skriptien tulosteet, README, SUUNNITELMA ja tallennetut `eval/results.*`. Erotin on nyt pilkku. Poikkeukset: nopean agentin päätöslista erotetaan puolipisteellä, `demo-buyer`-tulosteen rivimerkki on tavuviiva, ja budjettirivi sekä tulkintanäkymän faktarivi muotoiltiin ilman edeltävää merkkiä.
- Sama korjaus tehtiin commitoimattomaan luonnokseen `design/aimo-ui-ehdotukset.html` (13 kohtaa). Tiedosto ei ole tässä commitissa, koska se on toisen työvaiheen keskeneräistä työtä.
- Riskilistan luettelomerkki (`public/app.js`, banneri) poistettiin Eeliksen jatkopyynnöstä: riskit ovat omilla riveillään ilman merkkiä.

**Tarkistukset:** haku koko projektista ei löydä enää merkkiä (pois lukien `node_modules`, `data/`), `node --check` muutetuille JavaScript-tiedostoille läpi, `git diff --check` läpi, `npm test` 26/26, `npm run aimo:eval` 26/26. Käyttöliittymää ei katsottu selaimessa; käynnissä oleva palvelin näyttää palvelinpuolen tekstit uusina vasta uudelleenkäynnistyksen ja ehdotuksen uudelleenajon jälkeen.

## 14.11.2026 — resepti- ja ostotarvelaskennan suurimmat aukot

**Käyttäjän pyyntö:** korjaa tarkistuksessa löytyneet suurimmat aukot: uudet reseptiraaka-aineet, varausten ja ryhmien kaksinkertainen laskenta, hiljaisemman viikon määrät sekä varasto-, saanto- ja reseptikorvausten käsittely.

### Muutokset ja päätökset

- Uusi puhdas `server/planning.mjs` yhdistää historiaennusteen, tavallisen myynnin varaukset ja päiväkohtaisen reseptitarpeen. Reseptit tuovat mukaan tuotteet ilman historiaa tai aktiivista tilausrytmiä. Saman tuotteen tarpeet yhdistetään ennen ylöspäin pyöristystä myyntieriin.
- Reseptistä lasketut ryhmät erotetaan varausluvuista kentällä `includedInBookings`. Uusi API-syöte vaatii tiedon; vanha demomenu käsitellään varauksiin sisältyvänä. Viikkorajan ylittävästä menusta käytetään vain kyseisen viikon ryhmiä. Puuttuva varauspäivä ei tarkoita nollaa asiakasta.
- Varauskerroin pienentää ostomäärää myös perustason alle. Budjettikarsinnan alaraja huomioi varastovähennyksen ja säilyttää reseptitarpeen; testeissä löytynyt vertailu alkuperäiseen bruttoperustasoon korjattiin.
- Tuetut resepti- ja varastoyksiköt: g/kg, ml/cl/dl/l ja sales. Kiloja ja litroja ei rinnasteta. Valinnainen reseptin `yield` muuntaa annospainon ostettavaksi määräksi; oletus 1 käsittelee syötteen jo raakatarpeena.
- Inventaario ja vahvistetut saapuvat toimitukset voidaan vähentää eräkohtaisesti. Vähennetään vain viikon alkupäivän ajantasainen inventaario ja samana päivänä saapuva vahvistettu toimitus, joka säilyy viikon loppuun. Puuttuvaa saldoa tai saantoa ei arvata. Lyhyt säilyvyys, vanha inventaario ja muut toimituspäivät näkyvät huomioina eivätkä pienennä tilausta.
- Reseptiin tarvittavan tuotteen korvausta ei hyväksytä automaattisesti. Käyttäjän pitää valita vaihtoehto ja varmistaa maku, koostumus ja saanto; reseptikäytön merkintä säilyy myös korvaavalla rivillä.
- `GET/POST /api/planning` lukee/päivittää resepti-, inventaario- ja saapumistiedot. Rakenteeltaan virheellinen syöte torjutaan ilman tallennusta. Hyväksytty päivitys laatii uuden ehdotuksen ja mitätöi vanhan ehdotuksen tilauskelpoisuuden suunnittelurevision kautta.
- Puuttuva reseptimuunnos tai ristiriitainen ryhmäluku tuottaa `planningIssues`-esteen. Se näkyy keittiön päätöskorttina ja estää tilauksen myös tuoreessa sääntötarkistuksessa. Laskennan huomiot säilyvät myös kielimalliyhteenvedon rinnalla.
- `AIMO_DB` mahdollistaa keittiökannan eristämisen testissä. `npm test` käyttää väliaikaisia kantoja, simulaatiota ja HTTP-testissä väliaikaista allekirjoitusavainta. Käyttäjän demoa ei nollattu eikä muokattu.
- Käyttötapa, JSON-esimerkki ja rajaukset: `docs/kitchen-planning.md`; README ja ympäristömalli päivitettiin.

### Tarkistukset

- Ennen työtä `main` puhdas commitissa `67461b8`; `git fetch origin` onnistui oikeuslaajennuksella, ei uusia etäcommitteja.
- `npm test`: **26/26 läpi**. Mukana puhtaan laskennan tapaukset, koko ehdotuksen muodostus, reseptikorvausten autonomian esto sekä HTTP-päivitys–laskenta–tilausarvio erillisessä demossa. HTTP-palvelimen portin avaus vaati hiekkalaatikon oikeuslaajennuksen.
- `npm run aimo:eval`: **26/26 oikein**, 0 mallikutsua.
- JavaScriptin syntaksitarkistukset ja `git diff --check`: läpi.
- Live-mock-API:a käyttävää `npm run eval`-testiä ei ajettu; muutos ei tarvitse API-kiintiötä. Käyttöliittymää ei tarkistettu selaimessa eikä kielimallipolkua ajettu.

### Jäljellä ja käyttöönotto

- Varasto- ja reseptijärjestelmäintegraatioita tai tiedonsyöttölomaketta ei ole; uudet tiedot annetaan API:lla. Päiväkohtaista eräkulutusta ja säilyvyysoptimointia ei toteutettu. Inventaarion ja saapuvien listojen pitää kuvata eri fyysisiä määriä.
- Historia on ostohistoriaa eikä mitattua kulutusta. Aiemmat ryhmäostot voivat edelleen vaikuttaa perustasoon. Tarkkuutta, säästöä tai hävikin vähenemistä ei ole validoitu oikeassa keittiössä.
- Käynnistä palvelin uudella koodilla ja käytä keittiön **Aja uudelleen** -toimintoa, kun haluat korvata tallennetun luonnoksen. Tässä työvaiheessa ei käynnistetty uudelleen käyttäjän palvelinta eikä ylikirjoitettu sen luonnosta.

## 14.11.2026 — Danielin MCP-palvelin ja STOCK_UNKNOWN-lipun laajennus (Claude Code)

**Tausta:** Daniel Turkkinen latasi GitHubiin commitissa `a38b854` kolme tiedostoa repojuureen: `server.py` (Python-MCP-palvelin Valion rajapinnalle: haku, tuotetiedot, hinnat, saatavuus), `test_tools.py` ja `server.cpython-311.pyc`. Tiedostot haettiin paikalliseen työpuuhun fast-forward-pullilla. Niitä ei ole muokattu, eikä niitä saa muokata ilman Eeliksen tai Danielin pyyntöä.

**Havainnot Danielin koodista (ei korjattu):**

- Palvelin on päällekkäinen gatewayn `/mcp`-liittymän lukupuolen kanssa; siinä ei ole tarjouksia, mandaatteja, hyväksyntää eikä audit-ketjua. Käyttötarkoitus on kysymättä Danielilta.
- Tuntematon saldo päätellään kentästä `logisticModel == "Terminal"`, joten Stock-tuotteen 999999 näytetään oikeana saldona.
- Pyydettyä aikaisempi toimituspäivä tulkitaan sopimattomaksi (`deliversOnRequestedDate: false`). Mock palauttaa aina 16.11., joten kysely päivälle 17.11. tai myöhemmälle hylkää kaiken.
- Tilausaikaraja verrataan koneen oikeaan kelloon, ei gatewayn `DEMO_NOW`-kelloon.
- Ilman `MCP_BEARER_TOKEN`-muuttujaa palvelin on avoin osoitteessa `0.0.0.0`. `.pyc` ja puuttuva `requirements.txt` kannattaa siivota Danielin kanssa.

**Muutos gatewayssa (Eeliksen päätös):** `STOCK_UNKNOWN`-lippu nostetaan nyt aina, kun rivin saldoa ei tiedetä, ei vain Terminal-tuotteille (`server/gateway/service.mjs`, `buildOption`). Syy: `data/eval-oracle-cache.json`-näytteen 253 saatavilla olevasta rivistä 67 on Stock-tuotteita, joiden `availableAmount` on 999999; ne menivät tarjoukseen ilman merkintää. Lipun teksti (`contract.mjs`) ja README:n rivi päivitettiin vastaamaan tätä. Lippu on tiedottava: `mandate.mjs` ei lue sitä, joten hyväksyntäpäätökset eivät muutu.

**Tarkistukset:** `node --check` muutetuille tiedostoille läpi, `git diff --check` läpi, `npm run aimo:eval` 26/26. Lipun uutta haaraa ei ajettu live-rajapintaa vasten (simulaattorin Stock-tuotteilla on aina saldo, eikä API-kutsuja tehty).

**Keskeneräistä:** työpuussa on toisen työvaiheen commitoimattomia muutoksia (`server/planning.mjs`, `test/`, `package.json` ym.), joita tämä commit ei sisällä. Avoin kysymys: tarkoittaako 999999 Stock-tuotteella rajatonta vai tuntematonta saldoa.

## 14.11.2026 — yhteinen GitHub-tilannetallennus ja työskentelytapa

**Käyttäjän päätös:** Eelis kehittää projektia myös Claude Codella ja haluaa täällä tehdyt muutokset sekä olennaiset päätökset GitHubiin. Jatkossa jokainen valmis työvaihe kirjataan tähän lokiin, commitoidaan ja pushataan yhteisten `AGENTS.md`-ohjeiden mukaan. `CLAUDE.md` tuo samat ohjeet ja lokin Claude Coden luettavaksi.

### Lähtötilanne ja tallennettavat muutokset

GitHubin `main` ja paikallinen `HEAD` olivat etäpäivityksen jälkeen samassa commitissa `f727548`. Työpuussa oli jo 87 muuttunutta tai uutta tiedostoa. Ne on otettu mukaan tähän käyttäjän pyytämään tilannetallennukseen; niiden alkuperäistä tekijää ei päätellä tästä chatista.

- **Toimitustukun etusivu:** `public/index.html` ja `public/gateway.html` näyttävät paikallisen ulkoasukopion. Sisältö on `storefront-data.json`-tiedostossa, ulkoasu ja toiminnot `storefront.css`- ja `storefront.js`-tiedostoissa. Paikalliset kuvat, fontit ja ikonit ovat `public/storefront-assets/`-hakemistossa; lähteet ja tarkistussummat ovat `sources.json`-tiedostossa.
- **Näkymien osoitteet:** agenttikonsoli on `/agent.html`, keittiödemo `/kitchen.html`, hyväksyntänäkymä `/approve.html?order=…`. Yhteisen navigaation linkkejä on päivitetty.
- **Unohtuiko tämä?** `server/gateway/suggest.mjs` muodostaa ostajan historiasta tuote- ja määräehdotuksia. Integrointi on gateway-palvelussa, HTTP-rajapinnoissa ja hyväksyntänäkymässä. Ehdotuksen lisääminen käyttää tarjous- ja tilauslisäysketjua. `scripts/demo-buyer.mjs` sisältää uuden demoskenaarion.
- **Muut aiemmat tiedostot:** `SUUNNITELMA.md`, README-päivitykset ja `.claude/launch.json`-tiedoston testipalvelinasetus sisältyvät tallennukseen.
- **Tässä työvaiheessa lisätty:** yhteiset `AGENTS.md`-ohjeet, Claude Coden `CLAUDE.md`, tämä työloki sekä README-linkit ja hakemistokuvauksen päivitys.

### Tarkistukset tässä työvaiheessa

- `git fetch origin main`: onnistui; ennen tallennusta ei paikallisia tai etähaaran omia committeja.
- `git diff --check`: läpi.
- `npm run aimo:eval`: **26/26 oikein**, 0 mallikutsua.
- `node --check` kaikille muuttuneille ja uusille JavaScript-tiedostoille: läpi.
- `public/storefront-assets/sources.json`: **48/48** listatun tiedoston koko ja SHA-256 vastaavat paikallista tiedostoa.
- Muuttuneiden tekstitiedostojen tarkistus tavallisten avain- ja yksityisavainmuotojen varalta: ei osumia. `.gitignore` jättää ympäristötiedostot, tietokannat ja challenge-lähdeaineiston pois.

### Keskeneräiset asiat ja seuraava askel

- Etusivun hinnat, saatavuus, toimituspäivä ja ostoskori ovat kiinteää näyttödataa. Karusellit ja apurin tervehdys toimivat paikallisesti; etusivu ei vielä tee tilauksia.
- Uuden ehdotustoiminnon koko tarjous–lisäys–hyväksyntäketjua, käyttöliittymän ulkoasua ja live-API-demoskenaarioita ei testattu tässä tilannetallennuksessa. Tulkintatestin 26/26 ei kata niitä. Tarkista ne eristetyssä testiympäristössä ennen demoa.
- `.claude/launch.json` sisältää aiemman Claude-istunnon väliaikaiseen hakemistoon osoittavan `GATEWAY_DB`-polun portin 4751 testipalvelimelle. Tarkista tai vaihda polku ennen asetuksen käyttöä toisella koneella tai uuden istunnon jälkeen.
- `SUUNNITELMA.md` sisältää aiempien työvaiheiden havaintoja ja avoimia kohtia; varmista niiden ajantasaisuus koodista ennen uuden korjauksen aloittamista.
- Kun jatkat Claude Codessa, lue `CLAUDE.md`, tämä loki ja viimeisin commit. Jos käytät eri kloonia, päivitä ensin puhdas työpuu komennolla `git pull --ff-only`.
