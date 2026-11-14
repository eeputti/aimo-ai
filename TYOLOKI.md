# Työloki ja työn jatkaminen

Tämä tiedosto välittää toteutuksen tilan ja päätökset Codexin ja Claude Coden välillä. Lisää uusin työvaihe ylimmäksi. Älä kirjaa salaisuuksia tai koko keskusteluhistoriaa.

## 14.11.2026 — konsolin toimitusvarmuus- ja hiilijalanjälkimerkit poistettu (Claude Code)

**Käyttäjän päätös:** Eelis pyysi poistamaan commitissa `c991ca2` lisätyt merkit, koska työ on rajattu hakukenttään ja ostoskoriin.

- Poistettu merkkien piirto (`public/gateway.js`, `public/gateway-products.js`), tyylit (`public/gateway.css`, `public/aimo-shell.css`) ja tilausrivin kentät `deliveryReliability` ja `co2PerKg` (`server/gateway/service.mjs`). Nämä neljä muuta tiedostoa ovat nyt samat kuin ennen merkkejä (commit `22853c9`). Tarjousrivien vastaavat kentät ovat ennallaan, kuten ennen merkkejä.
- `public/gateway.js`: commitissa on vain merkkien poisto. Tiedoston toisen työvaiheen commitoimattomat muutokset jätettiin työpuuhun koskematta.

**Tarkistukset:** `node --check` kolmelle JavaScript-tiedostolle, `npm test`, haku merkkien luokkanimillä ei löydä osumia. Selaimessa ei katsottu.

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
