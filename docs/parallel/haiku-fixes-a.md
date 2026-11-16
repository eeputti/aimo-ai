# Haiku-mittauksen A-löydösten korjaukset (17.11.2026, Claude Code, sessio A)

Lähde: session F:n `docs/parallel/haiku-quality-2026-11-16.md`, kohdat A1–A3 ja V019. Eelis hyväksyi korjaamisen sessiossa A.
F:n mukaan nämä ovat koodivikoja: mallin vaihto ei korjaa niitä. Ei malli-, Meta- tai Valio-kutsuja, ei restartteja.

## Mitä muuttui

| Kohta | Korjaus | Tiedosto |
|---|---|---|
| A1 | Mallitulkki saa viestin slangisanat synonyymitaulusta (`slang: [{ word: 'jauhista', means: 'jauheliha' }]`) ja ohjeen käyttää niitä tuotesanana. Jos malli silti palauttaa samannäköisen sanan ("jauho" sanasta "jauhis"), koodi korvaa sen taulun sanalla. Ostajan itse kirjoittama sana säilyy ("2 kg jauhoja ja 3 kg jauhista"). Sääntötulkki käytti taulua jo ennestään. Taulu ladataan vasta käytössä, koska staattinen tuonti latasi katalogin ennen testin omaa polkua. | `order-conversation/interpret.mjs` |
| A2a | Kyllä/ei-kysymykseen vastataan ensin suoraan samoista Valion kentistä: "Onko HK Coleslaw 3 kg munaton?" → "Ei: sisältää kananmunaa.". Mukana gluteeniton ja keliakia, laktoositon, munaton, maidoton, pähkinätön ym., vegaaninen, luomu, suomalainen, pakaste ja huoneenlämpö sekä "sisältääkö X". "Voi sisältää" on "Ei varmasti", ja puuttuva allergeenitieto "En voi sanoa". Allergeenihierarkia (`allergens.mjs`) on käytössä. | `whatsapp/product-facts.mjs` |
| A2b | Vain kysytty tuote näytetään: viestiin sellaisenaan kirjoitettu tuotenimi, tai haun osumat, joiden nimeen osuu eniten kysymyksen tuotesanoja. Pelkkä merkki (HK Suomipekoni) tai ruokavaliosana (Sunnuntai gluteeniton jauhoseos) ei riitä. | `whatsapp/product-facts.mjs` |
| A2c | Jos mikään osuma ei koske kysyttyä tuotetta, vastaus kertoo, ettei tuotetta löytynyt, eikä vieraita tuotteita näytetä. | `whatsapp/product-facts.mjs` |
| A2d | Viestiin kirjoitettu katalogin tuotenimi haetaan katalogista suoraan: "APPELSIINI JAFFA" on appelsiini (alkuperä Israel), ei Hartwall Jaffa -virvoitusjuoma. | `whatsapp/product-facts.mjs` (`namedInMessage`), `whatsapp/dialogue.mjs` |
| A2e | Pelkkään tuotetietokysymykseen vastaus on koodin Valion-tiedot, ja mallin irrallinen avauslause ("Tarkista ne sieltä ennen ostopäätöstä") jätetään pois. Käyttötapakysymyksessä ("mihin se sopii?") mallin neuvo jää. | `whatsapp/dialogue.mjs` |
| A3 | Rivin otsikko ei näytä raakaa GS1-koodia: "(ei allergeeneja AW)" on nyt "(ei gluteeniviljoja)". Myös vehnä, laktoosi, sulfiitit, lupiini, nilviäiset ja yleisimmät pähkinät on suomennettu. Tuntematon koodi näkyy sanana "allergeenirajaus". | `order-conversation/index.mjs` (`lineLabel`, `dietLabel`) |
| V019 | Vertailu ei väitä tuntematonta arvoa samaksi: "1) 25,62, 2) 25,62, 3) ei tietoa" päättyy nyt lauseeseen "Arvo on sama niillä, joilta tieto löytyy." | `order-conversation/index.mjs` |

## Tarkistukset

- Uusi `test/haiku-findings-a.test.mjs` (5 testiä): A1 kiinteällä mallivastauksella, A2 oikealla katalogilla (HK Coleslaw, Oatly iKaffe, APPELSIINI JAFFA, HK Suomipekoni, Sunnuntai-jauhoseos) sekä dialogin kautta, A3 ja V019 tilauskeskustelun kautta. Vanhalla koodilla kaikki viisi epäonnistuivat. A1:n ja A2:n osalta syy on myös se, ettei uusia funktioita ollut. A3 ja V019 tarkistettiin lisäksi vanhasta koodista: raaka koodi `lineLabel`issa ja ehto `top.length === known.length`.
- `test/valio-data-only.test.mjs`: tuotetietokysymyksen odotus päivitetty tarkoitettuun muutokseen. Avauslause jää pois ja suora vastaus tulee ensin. Lisätty tarkistus, että käyttötapakysymyksessä mallin neuvo jää.
- `npm test` **377/377** origin/mainin 6d247d2 päällä, `aimo:eval` 26/26 ja `aimo:eval:spoken` 54/54. Välivaiheessa synonyymitaulun staattinen tuonti `interpret.mjs`:ssä rikkoi viisi testiä, koska katalogi latautui ennen testin omaa polkua. Tuonti muutettiin dynaamiseksi.
- Itsepeliä (Haiku, V- ja S-persoonat) ei ajettu uudelleen. Vaikutus F:n mittaukseen on siis tarkistamatta.

## Rajat

- Suora vastaus tulee vain tunnistettuihin kyllä/ei-kysymyksiin. Avoimeen kysymykseen ("Mitä se sisältää?") vastataan tietoriveillä kuten ennen.
- Merkinnän puuttuminen ei ole kielteinen vastaus: "Ei laktoositon-merkintää Valion tuotetiedoissa". Laktoosin puuttumista ei päätellä.
- Tuotenimen täsmähaku vaatii vähintään 8 merkin nimen kirjoitettuna viestiin sellaisenaan (kirjainkoko ja välilyönnit eivät haittaa).

## Käyttöönotto

WhatsApp-botin restart (sessio E). Workeriin ei muutoksia.
