# WhatsApp-tilausapurin 100 asiakkaan itsekeskustelu (Claude Code, selfplay-100)

Tehtävä 26880afb, 15.11.2026. Eelis pyysi agentin, joka keskustelee apurin kanssa noin sadan eri asiakkaan roolissa ja tekee apurista fiksumman. Keskustelu ei kouluta perusmallia. Parannus syntyy löydöksistä, regressiotapauksista ja omistajien tarkistetuista koodi- ja promptimuutoksista.

## Rajaus ja suhde muihin töihin

- Codexin 484c55ac (`eval/whatsapp-profiles-100.mjs`) on oma 100 profiilin loppukoe: 5 ostajaa x 20 polkua, päivä melkein aina ensiviestissä, eristetty selainvahvistus loppuun asti. Codex ehdotti taululla (#118), että vältetään kaksi päällekkäistä maksullista ajoa. Tämä työ täydentää sitä vain puuttuvilla poluilla: päivä puuttuu tai vaihtuu, numeroidut vaihtoehdot ja "4" lisävaihtoehdoille, valinta numerolla, annoslasku, 15 keittiötyyppiä, slangi ja kirjoitusvirheet, kärsimätön tai epäselvä ostaja ja olemattomat tuotteet.
- Ajuri käyttää Codexin `runSelfplay`-funktiota (16c9427c, `scripts/whatsapp-selfplay.mjs`) sellaisenaan: oikea HMAC-webhook, pysyvä jono, kanava ja keskusteluydin, eristetyt kannat, simuloidut hinnat (tyhjä `VALIO_API_KEY`), ei Meta-lähetyksiä eikä tilauksia. Asiakas ja arvioija ovat deep-mallia. Codexin tiedostoihin, keskusteluytimeen tai order-toolsiin ei tehty muutoksia.

## Tiedostot

- `eval/whatsapp-personas.mjs`: 100 personaa (`PERSONAS`, S001–S100) generoidaan deterministisesti, 20 polkua x 5 muunnelmaa. Lisäksi 6 regressiota (`REGRESSIONS`, R01–R06) baseline-ajon löydöksistä. Omat tarkistukset `inspectPersona` erillään Codexin `inspectConversation`-funktiosta.
- `scripts/whatsapp-selfplay-batch.mjs`: ajaa personat lapsiprosesseissa (oletus 1 persona per prosessi, `--chunk`, `--concurrency`, `--max-calls`, `--limit`, `--offset`, `--ids`, `--set regressions|all`). Kopioi lähdekoodin ajon alussa väliaikaishakemistoon, jotta rinnakkain muokattu työpuu ei vaihdu kesken ajon. Lapsiprosessi estää muut kuin paikalliset ja mallirajapinnan pyynnöt ja laskee tokenit tarkoituksittain. `--reinspect results.json` laskee tarkistukset uudelleen tallennetuista vuoroista ilman mallikutsuja. `--dry-run` listaa personat.
- `test/whatsapp-personas.test.mjs`: 10 testiä ilman mallikutsuja. Rakenne, tuotetermien löytyminen simuloidusta hausta, jokaisen virheluokan tunnistus ja yhteenveto.
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

## Seuraavat askeleet

- Uusi 100 personan ajo nykyisellä koodilla mittaa 1a517f5:n ja 5e0a61f:n vaikutuksen samaan baselineen (noin 9–10 USD, 17 min). Sitä ei ajettu ilman erillistä hyväksyntää.
- Jatkuvaa tai ajastettua ajoa ei luotu. Se on helppo toteuttaa samalla ajurilla, jos käyttäjä hyväksyy kustannuksen ja tahdin.
- Codexin 100 profiilin loppukoe ja tämä sarja voidaan raportoida yhdessä, kun molempien tulokset ovat samasta lähdeversiosta.
