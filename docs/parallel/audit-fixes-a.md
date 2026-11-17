# Katselmuksen korjaukset, sessio A: allergeenit, tulkinta ja demokello (16.11.2026, Claude Code)

Lähde: `docs/parallel/code-audit-2026-11-15-ilta.md`, löydökset #2, #3, #4, #5, #16, #17, #19 ja #22. Työ tehty erillisessä
worktreessä origin/mainin päällä. Ei malli-, Meta- tai Valio-kutsuja, ei restartteja, ei käyttäjän kantoja.

## Mitä muuttui

| # | Korjaus | Tiedostot |
|---|---|---|
| 2 | Uusi `server/allergens.mjs`: GS1-koodien hierarkia. Pähkinäkielto (AN) osuu mantelin, hasselpähkinän ja muiden pähkinöiden alakoodeihin, viljakielto (AW) vehnään, ohraan, kauraan, speltin, kamutiin ja ruisiin, maitokielto (AM) laktoosiin (ML). Alakoodin kielto osuu tarkentamattomaan yleiskoodiin (mantelikielto osuu tuotteeseen, jolla on vain AN), mutta ei tuotteeseen, jonka pähkinä on tarkennettu toiseksi (AN + SH). Laktoosikielto ei osu laktoosittomaksi merkittyyn maitotuotteeseen. Samaa sääntöä käyttävät mandaatti, portin haku ja tarjous, tuotetyökalut (WhatsAppin numeroitu lista ja tarjous), tulkinnan kohdistus, korvaajat, verkkokaupan korvaajat ja linkkiehdotukset. | `server/allergens.mjs`, `gateway/mandate.mjs`, `gateway/service.mjs` (vain searchProductsin suodatin), `order-tools/index.mjs`, `aimo/resolve.mjs`, `substitutes.mjs`, `storefront.mjs`, `whatsapp/link-advice.mjs` |
| 3 | "Maapähkinätön" on maapähkinä (AP): tarkempi sana tarkistetaan ensin. Erillinen "…, ei maapähkinöitä" siirtyy edelliselle riville (aiemmin katosi). Pelkkä "pähkinätön" on EU-jaon mukaan pähkinät (AN), kuten `aimo:eval` määrittelee. | `aimo/understand.mjs` |
| 4 | Mandaatin allergeenikiellossa "voi sisältää" (`ALLERGEN_MAY_CONTAIN`) ja puuttuva allergeenitieto (`ALLERGEN_DATA_MISSING`) ovat approval-tason syitä: tilaus ei vahvistu automaattisesti millään mandaatin tasolla. Sisältää-osuma on yhä este, jota ei voi ohittaa. Portin hakusuodatin `excludeAllergens` jättää pois myös "voi sisältää" -tuotteet ja tuotteet ilman allergeenitietoa, ja kertoo sen oletuksissa. | `gateway/mandate.mjs`, `gateway/contract.mjs`, `gateway/service.mjs` |
| 5 | Suomeksi pilkku on aina desimaali ("0,125 kg", "1,250 kg"), ja nolla alussa ei ole koskaan tuhansia. Englanniksi "1,000 litres" on yhä tuhat. Kieli ja päivämäärä luetaan ennen lukujen yhdistämistä. Tuotetyökalujen hakulause (`lineQuery`) tulkitaan takaisin samaksi määräksi. | `aimo/understand.mjs` |
| 16 | `clock.cycle()` kertoo kiertävän demokellon kierroksen oikeasta ajasta. Päiväraja laskee kiertävällä kellolla vain saman kierroksen tilaukset (tilaus saa kentän `clockCycle`). Tarjous saa kierroksen (`cyc`), ja edellisen kierroksen tarjous on `OFFER_EXPIRED`, vaikka demoaika näyttäisi sen olevan voimassa. WhatsAppin tallennettu tarjous vanhenee, kun kello on kiertänyt sen tallennushetken ohi. Ilman kiertoa mikään ei muutu. | `gateway/clock.mjs`, `gateway/mandate.mjs`, `order-tools/index.mjs`; tilauksen `clockCycle`, tarjouksen `cyc` ja hylkäys `verifyOffers`issa ovat A:n pyynnöstä session B commitissa 6a764ce (`gateway/service.mjs`) |
| 17 | "kasvilientä" → kasvisliemi (taivutus -ntä → -mi ja sumea vertailu perusmuodolla; aiemmin loppuosa "ilien" haki tekstiilien huuhteluaineita). Litra- tai kilotarve, jota pääryhmä ei kata samassa yksikössä, hakee sanan muistakin ryhmistä ("5 l kanalientä" löytää 1 l liemet, ei vain kilon liemijauheita). Usealla hyllyllä elävä sana järjestetään yleisimmän hyllyn mukaan ("merisuola" on suolaa ennen perunalastuja). Maku- tai mausteosa yhdyssanan alussa tekee tuotteesta maustetun ("yrttisuola", "ranskanperunamaustesuola" suolan jälkeen; samoin mansikkajogurtti perusjogurtin jälkeen). | `aimo/lexicon.mjs`, `aimo/resolve.mjs`, `aimo/match.mjs`, `order-tools/index.mjs` |
| 19 | "16.11" ja "ma 16.11" ilman loppupistettä ovat päiviä, kun kuukausi on kahdella numerolla tai edessä on viikonpäivä, eikä perässä ole yksikköä ("1.10 l") eikä edessä kelloa ("klo 11.10"). Ristiriitainen viikonpäivä näytetään oletuksena (`DATE_WEEKDAY_MISMATCH`). "Ensi viikon tiistaina" on maanantaista alkavan seuraavan viikon tiistai: sunnuntaina 15.11. ti 17.11., maanantaina 16.11. ti 24.11. | `aimo/understand.mjs` |
| 22 | "3 kennoa kananmunia" on 90 munaa (kenno 30 munaa). Munaosaston (10590) ja nimen "Vapaan kanan muna" tuotteet muuntuvat kappaleiksi (M10, L15, L180, 20 × L6), joten niitä ehdotetaan munamäärälle. Munakoiso ei ole muna. | `itemQuantities.mjs`, `aimo/understand.mjs` |

## Jatko 17.11.: #4 myös WhatsApp-asiakkaan omalle allergiakiellolle (itsepeli V033)

V-itsepelissä maitoallergiselle lapselle tarjottiin ensin jäätelöä, jolta allergeenitieto puuttui, ja asiakkaan valinta vahvistui ilman ihmistä. Syy oli se, että portin mandaatti ei nähnyt keskustelussa annettua allergiaa. Nyt allergeenivapaaksi todennetut vaihtoehdot tulevat ensin, kun kielletty allergeeni esiintyy haun tuotteissa (bbcd3cd). Lisäksi `place_order` ottaa valinnaisen `excludeAllergens`-kiellon, jonka `evaluateMandate` arvioi kuten mandaatin kiellon: "voi sisältää" tai puuttuva tieto vie ihmisen hyväksyntään. Testit: `test/whatsapp-diet-allergy.test.mjs`.

## Tarkistukset

- Uudet `test/audit-fixes-a.test.mjs` (11) ja `test/audit-fixes-a-clock.test.mjs` (4). Ajettu origin/mainin koodia vasten (vain uusi `allergens.mjs` lisättynä): kaikki löydöstestit epäonnistuivat, hierarkian oma yksikkötesti meni läpi. Demokellon kaksi ensimmäistä testiä kaatuvat vanhalla koodilla puuttuvaan `clock.cycle`-funktioon; käytöksen todistavat kolmas (vanha tarjous vahvistui kierroksen jälkeen) ja neljäs (WhatsAppin tarjous ei vanhentunut).
- `npm test` **365/365** origin/mainin a74054b päällä (sessioiden B, D ja H korjaukset mukana). `npm run aimo:eval` **26/26**, `npm run aimo:eval:spoken` **54/54**, 0 mallikutsua. `git diff --check` läpi.
- Välivaiheessa "pähkinätön → AN ja AP" rikkoi `aimo:eval`-tapauksen "nut-free cookies" (odotus AN), joten palautettiin AN:ään.

## Rajat ja huomiot

- Kasvisliemelle ei ole simuloidusti tilattavaa litratuotetta ma 16.11. (ainoa, Puljonki 1 l, on Terminal-tuote). Haku kertoo nyt, ettei tilattavaa ole, eikä tarjoa huuhteluaineita. Liemijauheen "5kg/333L" tuottomäärää ei muunneta litroiksi.
- Tilaukset ilman `clockCycle`-kenttää (ennen tätä korjausta) eivät kiertävällä kellolla kuluta päivärajaa, koska niiden kierrosta ei voi päätellä. Ilman kiertoa ne lasketaan kuten ennen.
- Kiertävän kellon tarjoukset, jotka on myönnetty ennen tätä korjausta (ei `cyc`-kenttää), vanhenevat heti käyttöönoton jälkeen. Tarjous on voimassa 15 min, joten vaikutus on hetkellinen.
- Allergeenisääntö kattaa EU:n 14 allergeenin alakoodit (pähkinät, gluteeniviljat, laktoosi). Datan muut koodit (esim. NW, NK, PO) ovat ennallaan.
- Mandaatin "voi sisältää" ja puuttuva tieto vievät hyväksyntään myös autonomisella tasolla. Pähkinäkiellon ostajan hakutuloksissa ne näkyvät yhä, koska tilaus on mahdollinen ihmisen hyväksynnällä.

## Käyttöönotto

Kaikki korjaukset ovat palvelinkoodia, joten ne tarvitsevat session E:n käyttöönoton (botti 4749 ja tuleva Vercel). Erityisesti:
- **#2, #3, #4, #5, #17, #19, #22:** WhatsApp-botin (tilauskeskustelu, tuotetyökalut, tulkinta) ja gatewayn restart uudella koodilla.
- **#16:** vaikuttaa vain, kun `DEMO_NOW_LOOP_MINUTES` on päällä (nyt `.env.whatsapp`:ssa 420). Pilvessä usean instanssin kierros on yhteinen vain, jos `DEMO_NOW_ANCHOR` on asetettu.
- Workeriin tai D1:een ei tullut muutoksia.
