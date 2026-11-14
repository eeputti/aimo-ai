# WhatsApp: toimituspäivä ensin ja numeroidut tuotevaihtoehdot (Claude Code, päivä ensin -chat)

Tehtävä 9701523c. Eeliksen pyyntö 15.11.2026 klo 00.30: apuri kysyy ensin toimituspäivän, näyttää tuotevaihtoehdot selkeästi numeroituina ("1 2 3, tai 4 niin haen lisää vaihtoehtoja, jotka voisi toimittaa") ja heittää fiksusti yhden olennaisen idean kerrallaan.

## Käytös

1. **Toimituspäivä ensin ja yksin.** Kun tilaus alkaa ilman päivää, ensimmäinen kysymys on vain `Mille päivälle toimitus? Haen sen jälkeen sille päivälle toimitettavat vaihtoehdot.` Mainitut tuotteet tallentuvat luonnokseen ja kuitataan lyhyesti (`Joo, päivitin ostoskorin!` + `Ostoskorissasi nyt:`). Ennen päivää ei kysytä määriä, ruokavaliota eikä tuotevalintaa, eikä tuotehakua tehdä. Annettua päivää ei kysytä uudelleen. Asiakkaan valitsema päivä säilyy (gatewayn päiväkorjaus `f7f7222`).
2. **Yksi tuoterivi kerrallaan, numeroituna.** Esimerkki:
   ```
   Toimitus ma 16.11., hinnat alv 0 %.
   *Kananmunat 50 kpl:*
   1) Kieku M10 kananmuna, 5 rasiaa (50 munaa), 13,90 €
   2) Munax M10 kananmuna, 5 rasiaa (50 munaa), 14,50 €
   3) Edullinen M10 kananmuna, 5 rasiaa (50 munaa), 12,40 €
   4) Näytä lisää vaihtoehtoja
   Vastaa 1, 2 tai 3. Sen jälkeen valitaan kerma.
   ```
   Määrä näkyy myyntieränä ja asiakkaan omassa yksikössä (`quantity.basis`, `server/itemQuantities.mjs`). Hinnat ja saatavuus tulevat tuotetyökaluista. Codexin pakkaus- ja luomuhuomautukset säilyvät listan alla.
3. **Lisää vaihtoehtoja.** Viimeinen numero (tai "näytä lisää", "muita vaihtoehtoja", "onko muita?") hakee seuraavat samalle päivälle tilattavat vaihtoehdot ilman toistoja. Kun lisää ei ole, se sanotaan ja sama lista näytetään uudelleen ilman lisärivinä. Numero viittaa aina viimeksi näytettyyn listaan; virheellinen numero näyttää saman listan ilman uutta hakua. Numerot, "näytä lisää" ja "halvin" ratkaistaan koodissa ilman mallikutsua. Nimellä ja puhekielellä valinta kulkee edelleen tulkin kautta (`more`-operaatio lisätty skeemaan).
4. **Rehellinen lista ja numeroitu tarkennus.** Jos yksikään tilattava vaihtoehto ei ole pyydetty tuote, lista alkaa `Tarkkaa osumaa ei löytynyt: X. Lähimmät tilattavat vaihtoehdot:`. Laktoositarkennus on numeroitu kuten vaihtoehdot (`1) laktoositon`, `2) tavallinen käy`), joten pelkkä numero kelpaa vastaukseksi.
5. **Fiksu ehdotus.** Enintään yksi lisäidea luonnosta kohden (`state.suggestedFor`), ei saman tuotteen varianttia (`sameFamily`: ruokakerma kerman rinnalla ei ole idea) eikä toistuvaa lisämyyntiä valmiin listan muokkauksen jälkeen.

## Tuotetyökalut (`server/order-tools/index.mjs`)

- `suggest({ exclude, limit })`: `exclude[ref]` = jo näytetyt tunnisteet → seuraava sivu. Ensimmäinen sivu nostaa halvimman tavallisen vaihtoehdon kolmen joukkoon; lisäsivut jatkavat järjestystä, joten syrjäytynyt vaihtoehto ei katoa. `more` kertoo, onko näyttämättömiä. Loppu: `NO_MORE_OPTIONS`.
- Codexin pyyntö #125: laktoositarkennus vain, jos ainakin yhdessä oikeassa vaihtoehdossa on tunnettu maitoainesosa (AM). Kananmunilla ei kysytä.
- Codexin itsepelilöydös #138/#147: "maustamaton ruokakerma" tarjosi ensin halvimman sipulikerman. Nyt maustamaton/ilman makua/luonnollinen rajaa maustetut pois kaikilta sivuilta; jos vain maustettuja on, puute kerrotaan. Ilman ehtoa maustettu järjestetään perustuotteiden jälkeen, ja halvimman nosto koskee vain tavallisia. Ostajan itse pyytämä maku ("mansikka vanilja jogurtti") ei ole poikkeama.

## Muuttuneet tiedostot

Omat: `server/order-tools/index.mjs`, `test/order-tools.test.mjs`, uusi `test/whatsapp-date-first-options.test.mjs`, tämä raportti.
Codexin vapauttamat ydintiedostot (97c238ef): `server/order-conversation/index.mjs`, `interpret.mjs`, `server/whatsapp/dialogue.mjs`, `cart-presentation.mjs`.
Vanhojen testien odotukset päivitetty uuteen käytökseen (kahden rivin "1 1" on nyt kaksi vastausta, päivä kysytään ensin, uusi `1) nimi, määrä, hinta` -muoto): `test/order-conversation.test.mjs`, `ordering-e2e`, `shopping-list-order-api`, `shopping-list-handoff`, `whatsapp-cart-link`, `whatsapp-dialogue`, `local-shop`.

## Tarkistukset

- Uusi `test/whatsapp-date-first-options.test.mjs` 8/8: sivutus (halvin ensimmäisellä sivulla, syrjäytynyt ei katoa, `NO_MORE_OPTIONS`), päivä ensin yksin ilman hakua, määrät vasta päivän jälkeen, tarkka vaihtoehtoteksti, 4 / näytä lisää / onko muita / virheellinen numero / halvin ilman tulkkia, päivän vaihto hakee alusta, WhatsAppin päiväkuittaus, lisäidean rajat, maustamaton-ehto, "ei tarkkaa osumaa" ja numeroitu laktoositarkennus. `test/order-tools.test.mjs` 11/11 (uusi AM-ehto).
- Koko sarja puhtaassa worktreessa (`origin/main` 8989a2f + tämä vaihe): 251/251, 0 ohitettua. Yhteisessä työpuussa muiden keskeneräisine tiedostoineen 263/264; ainoa virhe on maksupolun seuraamaton `test/whatsapp-checkout.test.mjs`, joka odottaa vahvistustulokseen `orderId`:tä (pyyntö #133, ei tämän muutoksen regressio).
- Sääntötulkki oikealla katalogilla ilman mallia: 50 kananmunaa → päivä ensin → maanantain 2 vaihtoehtoa → 4 kertoo ettei lisää ole; maustamaton ruokakerma ei näytä maustettuja.
- Oikea malli (`node --env-file=.env`, tyhjä `VALIO_API_KEY`, väliaikaiset kannat ja allekirjoitusavain, ei Metaa, ei vahvistusta): kolme keskustelua, 14 vuoroa, 22 mallikutsua, 0 virhettä. Ilman päivää → vain päiväkysymys ja kuittaus; "maanantaiksi" → numerolista; "4" ilman lisärivejä → "Muita vaihtoehtoja … ei löytynyt" ja sama lista (1 ms, ei mallia); "2" → oikea rivi yhteenvetoon. Päivä ensiviestissä → lista suoraan; "halvin" → halvin muna, sitten maustamattomat kermat (ei sipulia); "1" → oikea yhteenveto. Maito ja voi: päivä → määrät → laktoositarkennus → lista → "näytä lisää" → kolme uutta ilman toistoja (9 ms) → "1" valitsi toisen sivun ensimmäisen. Löydös: laktoosikysymykseen vastattu "1" toisti kysymyksen; korjattu numeroimalla tarkennus (1 laktoositon, 2 tavallinen käy). Uusinta (maito ja voi, 7 vuoroa, 11 mallikutsua, 0 virhettä): `2` → maitolista, `1` → voin numeroitu tarkennus, `1` → laktoosittomat voit, `1` → yhteenveto. Yhteensä 4 keskustelua, 21 vuoroa, 33 mallikutsua, 0 virhettä.

## Rajat ja jatko

- Ei Meta-lähetyksiä, oikeita Valio-kutsuja, tilauksia eikä 4749-palvelimen restarttia. Käyttöönotto kuuluu Codexin käyttöönottochatille.
- Selfplay-100:n hakulöydökset (#152: olemattomat tuotteet saavat lähimmän osuman ilman merkintää, väärä tuotetyyppi kärjessä kuten kanafilee → stroganoff, sipulinippu ei kata kilomäärää) ovat pääosin storefront-haun järjestyksessä eivätkä kuulu tähän vaiheeseen.
- Jatkocommit: vahvistus palauttaa rakenteisen `orderId`:n ja `orderStatus`-tilan (maksupolku #133/#159/#165); uusi TILAA säilyttää `pending_approval`-tilan; vanha luonnos ilman tilaa ei saa tunnusta. Ensiviestin "tavallinen käy" kirjataan `no_preference`-operaationa (100 profiilin #161). Testit 10/10, puhdas worktree 253/253, yhteinen työpuu 266/266.
- Selainkorin linkkikonteksti (#163, `dialogue.mjs`/`ordering.mjs`) jää Codexin itsekeskusteluchatille; `dialogue.mjs` vapautetaan sille.
