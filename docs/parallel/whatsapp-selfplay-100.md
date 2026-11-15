# WhatsApp-tilausapurin 100 asiakkaan itsekeskustelu (Claude Code, selfplay-100)

Tehtävä 26880afb, 15.11.2026. Eelis pyysi agentin, joka keskustelee apurin kanssa noin sadan eri asiakkaan roolissa ja tekee apurista fiksumman. Keskustelu ei kouluta perusmallia. Parannus syntyy löydöksistä, regressiotapauksista ja omistajien tarkistetuista koodi- ja promptimuutoksista.

## Rajaus ja suhde muihin töihin

- Codexin 484c55ac (`eval/whatsapp-profiles-100.mjs`) on oma 100 profiilin loppukoe: 5 ostajaa x 20 polkua, päivä melkein aina ensiviestissä, eristetty selainvahvistus loppuun asti. Codex ehdotti taululla (#118), että vältetään kaksi päällekkäistä maksullista ajoa. Tämä työ täydentää sitä vain puuttuvilla poluilla: päivä puuttuu tai vaihtuu, numeroidut vaihtoehdot ja "4" lisävaihtoehdoille, valinta numerolla, annoslasku, 15 keittiötyyppiä, slangi ja kirjoitusvirheet, kärsimätön tai epäselvä ostaja ja olemattomat tuotteet.
- Ajuri käyttää Codexin `runSelfplay`-funktiota (16c9427c, `scripts/whatsapp-selfplay.mjs`) sellaisenaan: oikea HMAC-webhook, pysyvä jono, kanava ja keskusteluydin, eristetyt kannat, simuloidut hinnat (tyhjä `VALIO_API_KEY`), ei Meta-lähetyksiä eikä tilauksia. Asiakas ja arvioija ovat deep-mallia. Codexin tiedostoihin, keskusteluytimeen tai order-toolsiin ei tehty muutoksia.

## Tiedostot

- `eval/whatsapp-personas.mjs`: 100 personaa (`PERSONAS`, S001–S100) generoidaan deterministisesti, 20 polkua x 5 muunnelmaa. Lisäksi 6 regressiota (`REGRESSIONS`, R01–R06) baseline-ajon löydöksistä. Omat tarkistukset `inspectPersona` erillään Codexin `inspectConversation`-funktiosta.
- `scripts/whatsapp-selfplay-batch.mjs`: ajaa personat lapsiprosesseissa (oletus 1 persona per prosessi, `--chunk`, `--concurrency`, `--max-calls`, `--limit`, `--offset`, `--ids`, `--set regressions|all`). Kopioi lähdekoodin ajon alussa väliaikaishakemistoon, jotta rinnakkain muokattu työpuu ei vaihdu kesken ajon. Lapsiprosessi estää muut kuin paikalliset ja mallirajapinnan pyynnöt ja laskee tokenit tarkoituksittain. `--reinspect results.json` laskee tarkistukset uudelleen tallennetuista vuoroista ilman mallikutsuja. `--dry-run` listaa personat.
- `test/whatsapp-personas.test.mjs`: 15 testiä ilman mallikutsuja. Rakenne, tuotetermien löytyminen simuloidusta hausta, jokaisen virheluokan tunnistus ja yhteenveto.
- `npm run whatsapp:selfplay100 -- --limit 10` (lataa `.env`:n). Raportit tallentuvat Gitin ohittamaan polkuun `data/selfplay/<ajo>/` (`results.json`, `summary.md`, lapsiprosessien lokit).

Tuotetermit tarkistettiin simuloidulla haulla päiville 16.–20.11. Jokaisella tavoitetuotteella on tilattava vaihtoehto, ja kaviaari, ananas ja appelsiinituoremehu palauttavat oikein nolla osumaa.

## Tarkistukset

Perusvaatimukset (d–f) kaatavat personan: turha ruokavaliokysymys (`diet_question_irrelevant`, `diet_question_after_stated`), lopullisen korin rivit, määrät, ruokavaatimus ja päivä (`missing`, `quantity`, `unexpected`, `unremoved`, `delivery_date`, `claim`, `allergen`), korilinkki, neuvo ei lisää tuotetta, olemattoman tuotteen selitys ja hiljainen korvike (`unrelated_substitute_offered`), ei väitettä tehdystä tilauksesta. Tilauskanta tarkistetaan lisäksi ajurissa (0 tilausta).

Uusi vaatimus (a–c) raportoidaan erikseen: päivä kysytään ensimmäisenä eikä vaihtoehtoja näytetä ennen päivää, vaihtoehdot numeroitu 1–3 määrin ja hinnoin sekä "4" tarjolla, "4" tuo uudet vaihtoehdot eikä sitä lueta määräksi tai valinnaksi.

Lisähavainnot eivät kaada personaa: "päivitin ostoskorin" ennen tuotevalintaa (käyttäjän valitsema "Ostoskorissasi nyt:" -muoto ei lasketa) ja vaihtoehto, joka ei kata tarvetta tarpeen yksikössä.

Tarkistukset tarkistettiin käsin noin 20 keskustelusta. Kaksi omaa virhettä korjattiin ennen raportointia: rintafileen alias "kana" osui porkkanaan (kolme väärää hälytystä), ja neuvoa kysyvältä ei pidä vaatia päivää ensimmäiseksi.

## Ajot

| ajo | lähde | personat | mallikutsut | tokenit sisään / välimuistista / ulos | arvio USD | kesto |
|---|---|---|---|---|---|---|
| pilotti | 12e84e5 + 13 muiden commitoimatonta tiedostoa | 10 | 86 (8,6 / persona) | 261 k / 184 k / 20 k | 0,73 | 1,9 min, noin 31 s / persona |
| täysi baseline | 12e84e5 + 13 commitoimatonta | 100 | 976 (9,8 / persona) | 3,09 M / 2,13 M / 0,25 M | 9,15 | 16,7 min, noin 39 s / persona |
| regressiot R01–R06 | 5e0a61f (1a517f5 päivä ensin ja numerot) + 6 commitoimatonta | 6 | 68 | 239 k / 157 k / 20 k | 0,75 | 1,7 min |

Hinnat claude-api-taidon taulukosta (Opus 5.5: 4 / 20 USD per miljoona, välimuistiluku 0,20; Haiku 5.5: 0,10 / 0,50). Laskuri ei näe välimuistiin kirjoitusta, joten arvio on hieman alakanttiin. Mallikutsut tarkoituksittain (täysi ajo): apurin dialogi 309, ydintulkki 274, simuloitu asiakas 227, arvioija 100, korivastaus 48, lisätuote 11, tuoteneuvo 7. 0 epäonnistunutta kutsua, 0 ajovirhettä, 0 tilausta.

## Tulokset (baseline, ennen 1a517f5:tä)

- Perusvaatimukset läpi 88/100. Uusi vaatimus läpi 5/100, kuten odotettiin ennen date-first-options-sessiota.
- Toimivat hyvin: päivän kysyminen puuttuessa ja vaihtaminen (date-missing-single, date-change, relative-date 5/5), annoslaskut (120 x 150 g = 18 kg, 5/5), yksikkökorjaukset (5 dl, 500 g, 250 g, 5/5), poisto ja lisäys (5/5), nollatuloksen tuote (5/5), neuvo ei lisännyt tuotetta. Missään ei valittu vaihtoehtoa 4:llä eikä luettu 4:ää määräksi.
- Arvioijan pisteet: 1: 2, 2: 16, 3: 18, 4: 53, 5: 11. Heikoimmat polut: more-options-four ja date-missing-more-options (keskiarvo 2,0), fake-product 2,8, dairy-normal-stated 3,0.

## Löydökset tärkeysjärjestyksessä

1. **"4" ja "lisää vaihtoehtoja" toivat samat kolme vaihtoehtoa** (more_options_same 7/10 lisää pyytäneestä; mikään 95 vaihtoehtolistasta ei tarjonnut 4:ää). Dialogi lupasi "katsotaan muita", mutta ydin näytti saman `draft.offered`-listan (S002, S022, S094). **Korjattu 1a517f5:ssä:** R04:ssä "4) Näytä lisää vaihtoehtoja" ja 4 toi kolme uutta vaihtoehtoa. Omistaja date-first-options-sessio.
2. **Laktoosikysymys, vaikka ostaja oli jo sanonut "tavallinen" tai "ei tarvi olla laktoositonta"** (5: S020, S060, S100, S049, S089). Vastauksen jälkeenkin vaihtoehdot olivat usein pelkkiä laktoosittomia (S020, S059, S014), ja tuotesanan vaihto nollasi vastauksen ja toi saman kysymyksen uudelleen (S070). Kysymys tuli myös kamelinmaidosta, kuukivijogurtista, edamista ja mozzarellasta. **Osin korjattu 5e0a61f:ssä:** R05 ei kysynyt uudelleen, mutta ensimmäinen ja kolmas vaihtoehto olivat yhä laktoosittomia; tavallinen maito vasta toisena. Omistaja Codex 97c238ef.
3. **Olemattoman tuotteen kohdalla näytettiin hiljaa muita tuotteita sen nimellä** (S016 strutsinmuna: kanan- ja viiriäisenmunat, S036 kamelinmaito: lehmänmaito, S096). Apuri myönsi asian vasta, kun ostaja huomautti. **Korjattu esitys 1a517f5:ssä:** R06 näyttää otsikon "Tarkkaa osumaa ei löytynyt … Lähimmät tilattavat vaihtoehdot". Haku palauttaa silti vääriä osumia ilman issueta (order-tools).
4. **Tuotehaku tuo väärän tuotetyypin kärkeen** (order-tools, 9701523c, viesti #152): edam-juusto: saganaki, halloumi ja salaattijuusto; edam ilman yhdysmerkkiä toimii (S094, R01: neljä kierrosta ennen edamia). Keltasipuli: pelkkää punasipulia kolmella kierroksella, ja ostaja luopui sipulista (R03). Mozzarella: mozzarella-sipulirengas ensimmäisenä (S070, R03). Lohi: kirjolohifilee ensin. Peruna: kypsä suikaleperuna ensin. Tuorehiiva: kuivahiiva. Maidoton vaniljajäätelö: nolla osumaa, vaikka "GelatoLAB Vanilja Premium vegaaninen 5 l" löytyy hakusanalla "jäätelö" (S048, ostaja luopui tilauksesta; R02 löysi sen vasta laajennetulla haulla). Nippusipuli "2 kpl" ilman kilomäärää 2 kg tarpeelle (option_without_need_cover 14 personaa).
5. **Määrä kysytään ennen päivää**, kun molemmat puuttuvat (date_not_first_question 5), ja epämääräiseen avaukseen ("sitä samaa ku viimeks") ei kysytä päivää (3). Ydin laittaa päivän ensin, mutta dialogin muotoilu vaihtaa järjestyksen. Omistaja date-first-options.
6. **"Päivitin ostoskorin" ennen tuotevalintaa** 79 personassa; arvioija nimesi tämän harhaanjohtavaksi useimmin. Ehdotus: "Lisäsin listalle" tai pelkkä "Ostoskorissasi nyt:" kunnes tuote on valittu. Omistaja Codex 97c238ef (dialogue, cart-presentation).
7. **Umpikuja ilman vaihtoehtoja** (S048): sama "Ei tilattavaa tuotetta … Kokeile toista päivää" neljä kertaa, vaikka ostaja kielsi päivän vaihdon ja dialogi lupasi hakea kaura- ja soijapohjaisia. Tuoteneuvo tiesi Valio Edamin, kun vaihtoehtolista ei näyttänyt sitä (S094).

Regressiosarja R01–R06 kattaa löydökset 1–4. Uudemmalla koodilla (5e0a61f) perusvaatimukset 5/6 (R03 sipuli puuttuu ja nippu ei kata tarvetta) ja uusi vaatimus 4/6. R01 ja R02 läpäisivät koodin tarkistukset vain siksi, että ostaja jaksoi pyytää uudelleen (arvio 2/5).

## Laajennettu joukko X001–X100 (käyttäjän lisäpyyntö klo 1.25)

`eval/whatsapp-personas-extended.mjs` (`--set extended`) lisää 100 personaa kuuteen luokkaan:

| luokka | n | sisältö |
|---|---|---|
| errors | 20 | 5 l vaikka tarkoitti 5 dl, väärä tuote vaihdetaan, korjaus korjauksen päälle, "maanantaiks eli 18.11.", vastaus väärään kysymykseen, peruminen kesken, peruminen ja uusi aloitus |
| dialect | 20 | savo, turku, stadin slangi, pohjalainen, tampere, karjala, Lappi, englanninsekainen, ruotsinsekainen ja maahanmuuttajan arkisuomi, kukin kahdesti |
| weird | 15 | pelkät emojit tai numerot, pitkä rönsyilevä viesti, lyhyet palat, sivuasiat, vitsailu, kiukkuinen, töksähtelevä |
| rush | 12 | tänään, heti, huomenna ennen klo 7 ja tilausajan umpeuduttua |
| question | 25 | toimitusmaksu, aukioloajat, maksutavat, lasku, alkuperä, allergeenit, säilyvyys, reseptineuvo, valitus, "ootko botti", "haluan ihmisen", valikoima (pelkkä kysymys tai kysymys ja tilaus) |
| greeting | 8 | pelkkä tervehdys neljänä kellonaikana |

Jokaisella personalla on oma demokello: yö su klo 2.30, aamu 7.30, päivä 14.00 tai ilta 19.30. Ajuri lataa `gateway/clock.mjs`:n personan ajalla ennen runSelfplayta. Kello luetaan moduulin latauksessa, joten Codexin ajuriin ei tarvittu muutosta. Saman kellon personat ajetaan samassa lapsiprosessissa. Simuloidussa haussa maanantain tilausaika umpeutuu su klo 12.00, ja sen jälkeen aikaisin toimitus on ti 17.11. Kiirepolkujen odotettu päivä lasketaan kellosta, ja muut personat pyytävät ti–pe.

Uudet tarkistukset:
- Perumisen jälkeen kori on tyhjä (`cancel_not_applied`), eikä pelkkä kysymys lisää tuotetta (`question_added_item`).
- Päivien ristiriita kysytään (`date_conflict_not_asked`), eikä väärän vastauksen jälkeen keksitä päivää (`date_invented`).
- Kiireessä kerrotaan tilausaika (`rush_no_deadline`) ja aikaisin päivä (`rush_no_earliest_day`), eikä toimituskellonaikaa luvata (`delivery_time_promised`).
- Toimitusmaksua, aukioloja, maksutapoja, laskua tai hyvitystä ei keksitä (`fact_invented:*`), vaan ohjataan tukeen tai kerrotaan tiedon puuttuvan (`not_referred:*`).
- Botti tunnustaa olevansa botti (`bot_not_disclosed`, `claims_human`).
- Tervehdys vastaa kellonaikaa (`greeting_wrong_time`, ja tervehdyspersonoilla `greeting_not_time_aware`, joka kuuluu uuteen vaatimukseen).
- Kieltolauseet ("en voi luvata …") eivät laske keksityksi faktaksi.

Ajurin tapausvalinta on yleinen: `--cases polku[:export]` (useita pilkulla). Moduulin oma `inspect(case, turns, list)` korvaa inspectPersonan, joten abuse-tests-session `eval/whatsapp-abuse-cases.mjs` toimii suoraan. `--source-ref origin/main` ajaa apurin koodin GitHubin versiosta, eikä tämän kansion jäljessä olevasta työpuusta.

**Pilotti GitHubin koodilla (a6b53a9, 252b337:n hakukorjaus mukana):** 17 eri personaa 20 ajossa, 179 kutsua, noin 1,6 USD. Kolme kysymyspersonaa kaatui ensin uuden runSelfplayn päivävaatimukseen ja ajettiin uudelleen päivän kanssa. Perusvaatimukset 14/17, uusi vaatimus 15/17.
- Toimii: yksikkövirhe, päivien ristiriita (apuri kysyi), väärä vastaus, murteet ymmärrettiin (savo, englanninsekainen, arkisuomi), emojit. Kysymyksissä ei keksitty toimitusmaksua, aukioloja tai hyvitystä, apuri tunnusti olevansa botti ja ohjasi yhteyshenkilölle tai asiakaspalveluun. Huomenna ennen klo 7: kellonaikaa ei luvattu. Tänään (aamulla) ja maanantaiksi (iltapäivällä): apuri kertoi heti aikaisimman päivän.
- **Peruminen ei tyhjennä koria (X016):** "unohda koko homma" sai vastauksen "Luonnos on tyhjä", mutta maito jäi listalle. Omistaja Codex 97c238ef.
- **Apuri ei kerro tilausaikaa, vaikka tietää sen (X056, X064):** kysyttäessä "mihin mennessä pitää tilata" apuri vastasi, ettei näe takarajaa. Sama järjestelmä tulostaa yhteenvetoon "Tilattava viimeistään su 15.11. klo 12.00" (X061, jossa vastaus oli siksi ristiriitainen). Dialogi ei saa tarjouksen tilausaikaa. Omistaja Codex 97c238ef.
- **Tukiyhteystieto ei näy dialogille:** apuri sanoo, ettei sillä ole yhteystietoja, vaikka kanavaan on määritetty tukiyhteystieto (`tuki`-komento).
- **Kellonaikatervehdys puuttuu vielä:** 0/17 ensimmäisestä vastauksesta tervehti kellonajan mukaan, mutta vääriä tervehdyksiä ei ollut. Omistaja date-first-options.

**Kustannusarvio koko laajennetulle joukolle:** noin 0,11 USD tilaavaa personaa kohden ja 0,05 USD pelkkää kysymystä kohden. 100 personaa maksaa noin 9–12 USD ja vie noin 20 min neljällä rinnakkaisella prosessilla. Sitä ei ajettu ennen hyväksyntää.

## Valion dataan perustuvat personat V001–V035 (käyttäjän pyyntö klo 2)

Käyttäjä kysyi, auttaisivatko Valion aineistot (tuotedata, hiilijalanjälki, toimitusvarmuus, saatavuus- ja hintarajapinta). Liitetyt tiedostot ovat samat kuin projektin `data/raw/`, ja `npm run catalog` on jo tuonut niistä katalogiin alkuperämaan (17 537 tuotetta), allergeenit ja merkinnät, ainesosat, säilytysluokan, hiilijalanjäljen (11 033) ja toimitusvarmuuden (4 425). Tuoteneuvo saa nämä kentät (`publicProduct`), ja vaihtoehdot saavat saatavuusrajapinnan tilausajan (`closingTime`). Data siis auttaa, ja testit voivat tarkistaa apurin väitteet sitä vasten.

`eval/whatsapp-personas-data.mjs` (`--set data`) luo personat katalogista. Oikea vastaus luetaan datasta eikä kirjoiteta käsin. Moduulin oma `inspect` ajaa perustarkistukset ja datatarkistukset:

| tyyppi | n | tarkistus |
|---|---|---|
| alkuperämaa | 6 | väitetty maa vastaa `country`-kenttää (`origin_wrong`), tai tieto jää käyttämättä (`data_not_used:origin`) |
| allergeenit | 6 | esim. "Onko Valio Edam e350 g maidoton?": datassa laktoositon mutta sisältää maitoa. Väärä "on maidoton" on `allergen_wrong_dangerous` |
| säilytys | 4 | pakaste, kylmä tai kuiva vastaa `temp`-luokkaa (`storage_wrong`) |
| pienin hiilijalanjälki | 5 | apurin suosittelema vaihtoehto on pienin näytettyjen joukossa katalogin `co2`:n mukaan (`co2_wrong`) |
| varmin toimitus | 3 | sama `reliability`-kentällä |
| edullisin | 3 | sama vaihtoehtojen hinnoilla |
| tilausaika | 4 | kerrottu kellonaika vastaa `closingTime`a (simuloidusti edellisen päivän klo 12.00) |
| allergiaopas | 4 | ostaja vaatii linkkiä heti. Valitun tuotteen allergeenit katalogista (`unsafe_selection`), eikä linkkiä anneta ennen valintaa |

Saatavuus- ja hintarajapinta ajetaan edelleen simuloituna (`VALIO_API_KEY` tyhjä). Oikean rajapinnan rajoitukset ovat julkaisemattomia, ja ohjeen mukaan sitä ei kuormiteta toistuvilla ajoilla. Simulaatio noudattaa samaa sopimusta (`closingTime`, `availableDate`, `scheduleLines`).

## Käyttäjän päätös: korilinkki vasta valmiille tilaukselle (klo 2.00)

Apuri ei anna ostoskorin linkkiä ennen kuin tilaus on valmis. Se opastaa ensin loppuun: päivä, määrät, tuotevalinnat ja vaaditut ruokavaliot tai allergeenit. Tämä kumoaa aiemman päätöksen, jonka mukaan "avaa kori" toimi keskeneräisellekin listalle. Syy koodissa: `server/whatsapp/cart-handoff.mjs`:n `direct`-ehto ohittaa `status !== 'review'` -tarkistuksen, ja vapaatekstinen linkkipyyntö kulkee lisäksi dialogin kautta. Vaatimus välitettiin date-first-options-sessiolle, joka korjaa juuri dialogia ja ydintä. Tarkistus `link_before_complete` kuuluu uuteen vaatimukseen ja lasketaan kaikille sarjoille, myös vanhoille ajoille uudelleentarkistuksella.

## Ajot 15.11. klo 2 (GitHubin koodi, `--source-ref origin/main`)

| ajo | lähde | personat | kutsut | USD | kesto | perus läpi | uusi läpi |
|---|---|---|---|---|---|---|---|
| laajennettu X001–X100 | f843b06 | 100 | 1 011 | 8,55 | 16 min | 85/100 | 72/100 |
| Valion data V001–V035 | 043f08f | 35 | 250 | 2,50 | 5 min | 26/35 | 31/35 |

Käyttäjä rajasi jatkon pieneen budjettiin (noin 3 USD), joten näiden jälkeen ei ajettu uusia isoja joukkoja. Tarkistusten korjaukset laskettiin uudelleen tallennetuista vuoroista ilman mallikutsuja.

Löydökset tärkeysjärjestyksessä (käsin varmennettu esimerkeistä):
1. **Korilinkki annetaan keskeneräiseen listaan** (`link_before_complete` 14 + 4). Allergiaopas 0/4: "Laita kori heti" antoi linkin ennen tuotevalintaa ja allergeenin varmistusta (V032 keliaakikon kaurajuoma). Tämä on käyttäjän uuden päätöksen vastaista. Omistaja date-first-options / `cart-handoff.mjs`.
2. **Laktoosikysymys perunasta ja porkkanasta** (X022, X023, X032, X033 murrepersonat): "Peruna: haluatko laktoositonta vai käykö tavallinen?". Juuri tämä oli käyttäjän alkuperäinen valitus. Omistaja order-tools (CLARIFY) tai ydin.
3. **Kiireessä tilausaikaa ei kerrota** (`rush_no_deadline` 8/12): "Tarkkaa tilauksen takarajaa en valitettavasti tiedä", vaikka tilausaika on tiedossa. Datajoukossa sama kysymys sai oikean ajan ("ehtii tilata ti 17.11. klo 10.00 asti"), joten tieto kulkee vaihtoehtoihin mutta ei dialogin vastaukseen ennen vaihtoehtoja.
4. **Peruminen ei tyhjennä koria** (3/3 cancel): "Luonnos on tyhjä", mutta rivi jää.
5. **Hiilijalanjälki ja toimitusvarmuus eivät kulje vaihtoehtoihin**: "En näe tuotekohtaisia hiilijalanjälkitietoja" (V017, V020), ja varmuuskysymykseen ei vastattu (V022, V023), vaikka katalogissa on `co2` ja `reliability`. Edullisinta kysyttäessä apuri sanoi "En näe hintoja", vaikka vaihtoehtolistassa on hinnat (V025).
6. **Kellonaikatervehdys puuttui** f843b06:ssa (6/8; yöllä neutraali "Moi!" hyväksytään, koska "hyvää yötä" on hyvästely). date-first-options korjasi sen myöhemmin: 07.30 Huomenta, 14.00 Päivää, 19.30 Iltaa. Codexin vertailusarake lasketaan vain tilaaville persoonille.
7. **Toimii hyvin:** alkuperämaa 6/6 ja allergeenit 6/6 oikein datasta, mukaan lukien laktoositon mutta ei maidoton -ansa (Valio Edam). Säilytys oikein. Ei keksittyjä toimitusmaksuja, aukioloja tai hyvityksiä. Botti tunnustaa olevansa botti. Päivien ristiriita kysytään. Murteet ymmärretään.

## Korjausten mittaus 15.11. klo 2.25 (9 personaa, origin/main 9f20407, noin 0,83 USD)

Löydöspersonat ajettiin uudelleen GitHubin koodilla, jossa ovat date-first-optionsin f605549 (peruminen, tilausaika, tukiyhteys, tervehdys) ja 5044a91 (linkki vasta valmiille tilaukselle). Samoilla tarkistuksilla perusvaatimukset paranivat 3/9 → 7/9 ja uusi vaatimus 4/9 → 9/9. 96 kutsua, 0 virhettä, 0 tilausta.

| persona | ennen | nyt |
|---|---|---|
| X010 linkki keskeneräiseen | link_before_complete | ok |
| X016 peruminen | cancel_not_applied | ok |
| X056, X059 kiire | rush_no_deadline, link_before_complete | ok |
| X093 tervehdys | greeting_not_time_aware | ok |
| V032 keliaakikko "laita kori heti" | linkki ennen valintaa | ok: "Annan ostoskorin linkin, kun tilaus on valmis", gluteenittomat vaihtoehdot, linkki valinnan jälkeen |
| X022 peruna ja porkkana | laktoosikysymys | **yhä laktoosikysymys perunasta** |
| V017 pienin hiilijalanjälki | data_not_used:co2 | **yhä "en näe hiilijalanjälkitietoja"** |

Tarkistukset tarkentuivat: gluteenittomuusmerkintä (FREE_FROM_GLUTEN) kattaa gluteeniallergian, mutta laktoositon ei kata maitoallergiaa. Valinta ilman listaa kelpaa, kun ostaja pyysi suoraan halvinta. Datan mukaan gluteeniton-otsikon alla näkyneet Elovena-kaurajuomat ovat gluteenittomia (FREE_FROM_GLUTEN, sisältävät vain kauraa).

## Täydet ajot korjausten jälkeen 15.11. klo 2.35 (origin/main e3b70e1, käyttäjän hyväksymä budjetti noin 22 USD)

Molemmat 100 personan joukot ajettiin uudelleen korjausten jälkeen: f605549 (peruminen, tilausaika, tukiyhteys, tervehdys), 5044a91 (linkki vasta valmiille tilaukselle) ja e3b70e1 (perunan laktoosi, co2, varmuus ja hinta vaihtoehdoissa). Todellinen kustannus oli 17,83 USD (8,61 + 9,22), 2 038 kutsua, 0 virhettä, 0 tilausta, 21 min rinnakkain. Vertailu laskettiin samoilla tarkistuksilla (vanhat ajot uudelleentarkistettuna):

| joukko | perus ennen → nyt | uusi vaatimus ennen → nyt | arvioija ka ennen → nyt |
|---|---|---|---|
| alkuperäinen S001–S100 | 88 → 96 | 78 → 97 | 3,55 → 3,62 |
| laajennettu X001–X100 | 85 → 99 | 81 → 99 | 3,44 → 3,57 |

Laajennettu luokittain (perus ja uusi): virheitä tekevät 17/20 → 20/20 ja 20/20, murteet 16/20 → 20/20 ja 20/20, oudot 15/15 ja 13/15 → 14/15, kiire 4/12 → 12/12 ja 7/12 → 12/12, kysymykset 25/25 → 24/25 ja 22/25 → 25/25, tervehdykset 8/8 ja 2/8 → 8/8.

Kokonaan poistuneet virheluokat: korilinkki keskeneräiseen listaan (14 + 6), kiireessä ei tilausaikaa (8), laktoosikysymys perunasta (4), peruminen ei tyhjentänyt (3), kellonaikatervehdys (6), "4" toi samat (7 → 0, kun lisää on tarjolla), ruokavaliokysymys, vaikka "tavallinen" oli jo sanottu (5).

Jäljellä (ydin: date-first-options):
- X085: valitus sai vain pahoittelun, ei ohjausta asiakaspalveluun.
- S036 kamelinmaito ja S056 tryffeli: rivi pudotettiin sanomatta selvästi, ettei tuotetta ole.
- S030 ja X044: epämääräiseen avaukseen ei kysytty päivää ensimmäiseksi.
- S014 ja S094: asiakasmalli ei pyytänyt "4" (persoonan puoli, ei apurin virhe).

Jäljellä (haku, viesti #259):
- S031 "edam-juusto" tuo halloumia.
- S048 maidoton vaniljajäätelö antaa 0 osumaa, vaikka vegaaninen vaniljajäätelö löytyy.
- S056 suklaapatukka "tuoreen tryffelin" tilalla ilman merkintää.
- X096 kuormalava 3 kg:n tarpeelle.

Tarkistuksiin tuli kolme korjausta:
- "4) Näytä lisää" -vihjettä ei vaadita, koska ydin näyttää sen vain, kun vaihtoehtoja on lisää. Puuttuminen ei ole virhe.
- "Muita vaihtoehtoja ei löytynyt" ja sama lista on oikein.
- Laskutusaiheen mainitseminen tukeen ohjatessa ei ole keksitty fakta.

## Seuraavat askeleet

- Uusi 100 personan ajo nykyisellä koodilla mittaa 1a517f5:n, 5e0a61f:n ja 252b337:n vaikutuksen samaan baselineen (noin 9–10 USD, 17 min, `--source-ref origin/main`). Sitä ei ajettu ilman erillistä hyväksyntää.
- Laajennettu joukko ja datajoukko on ajettu. Uudet ajot pidetään pieninä (käyttäjän raja noin 3 USD): esim. `--ids` löydöspersonoille korjausten jälkeen.
- Jatkuvaa tai ajastettua ajoa ei luotu. Se on helppo toteuttaa samalla ajurilla, jos käyttäjä hyväksyy kustannuksen ja tahdin.
- Codexin 100 profiilin loppukoe ja tämä sarja voidaan raportoida yhdessä, kun molempien tulokset ovat samasta lähdeversiosta.
