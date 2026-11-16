# Katselmuksen keskustelu- ja korisivuviat #9, #10, #11, #18, #20, #21 ja #23 (Claude Code, sessio C)

16.11.2026. Lähde: `docs/parallel/code-audit-2026-11-15-ilta.md`. Työ tehtiin erillisessä worktreessä `claude/audit-c-chat-cart` origin/mainin ed16a72 päällä (mukana tilannechatin 671b9a1, joka muutti samaa `index.mjs`:ää juuri ennen tätä). Ei botin restarttia, Worker-julkaisua, Meta-, Valio- tai mallikutsuja, eikä käyttäjän kantoihin koskettu.

## Korjaukset

| # | Vika | Korjaus | Tiedostot |
|---|---|---|---|
| 9 | Korisivun yläpalkin Ostoskori- ja Toimituspäivä-linkit sekä ohituslinkki vaihtoivat URL-fragmentin, jossa korilinkin tunniste on. Sivu latautui uudelleen ja näytti "Korilinkki on vanhentunut". | Sivun sisäiset `#`-linkit vierittävät kohteeseen ja siirtävät fokuksen vaihtamatta fragmenttia. Jos fragmentti silti vaihtuu sivun elementin tunnisteeksi (esim. käsin), korilinkki palautetaan osoiteriville `history.replaceState`illa ilman uudelleenlatausta. Uusi korilinkki samassa välilehdessä lataa sivun kuten ennen. | `public/whatsapp-storefront-cart.js` |
| 10 | "hyväksyn" korisivun muutoskentässä teki tilauksen ohi TARKISTA JA TILAA -vaiheen. | Korisivun API hyväksyy vahvistustekstin (`CONFIRM`, nyt exportattu `index.mjs`:stä) vain lipulla `confirm: true`, jonka lähettää vain vihreä VAHVISTA DEMOTILAUS -painike (näkyy vasta tarkistuksen jälkeen). Kirjoitettu "hyväksyn", "tilaa", "joo tilaa" tai "vahvistan" saa 400:n ja ohjeen, eikä tilausmoottoria kutsuta. Painike ei voi lähettää muuta tekstiä. Sama lippu yksinkertaiseen korisivuun (`WHATSAPP_CART_VIEW=simple`). WhatsAppissa ja selainkeskustelussa nämä sanat avaavat jo ennestään vain korilinkin (`cart-handoff.mjs`). | `server/whatsapp/cart-link.mjs`, `server/order-conversation/index.mjs`, `public/whatsapp-storefront-cart.js`, `public/whatsapp-cart.js` |
| 11 | Pelkkä päivä tai ruokavalio katosi, jos tuotteita ei vielä ollut: luonnos tallennettiin vain riveineen. | Luonnos tallennetaan, kun siinä on päivä tai ruokavalio, vaikka rivejä ei ole. Vastaus kuittaa ne ("Toimitus pe 20.11. Huomioitu: pähkinätön. Mitä tarvitset?") eikä kysy päivää uudelleen. Ennen tuotteita ilmoitettu rajaus kulkee tuotehakuun. Kaikkien rivien poisto sulkee luonnoksen kuten ennen (pilotti X016), ja pelkkä tervehdys ei tallenna mitään. Tyhjä luonnos ei näy ostoslistana (`shoppingListView` palauttaa sille null), joten korilinkki ja kaupan synkronointi eivät muutu. | `server/order-conversation/index.mjs` |
| 18 | Yhteenvedon "Tilattava viimeistään" näytti ensimmäisen rivin rajan. | Aikaisin raja kaikista riveistä (`cutoff`-aika, nimiö `helsinkiLabel`), varalla `cutoffLabel`. | `server/order-conversation/index.mjs` |
| 20 | "sopii", "ok" tai "hyvä" laktoosikysymykseen lisäsi laktoosittomuuden, ja "käy" toisti kysymyksen. | Kysymys on "haluatko laktoositonta vai käykö tavallinen?". "sopii", "ok", "hyvä", "käy", "kelpaa" (myös "joo käy", "sopii hyvin") vastaavat jälkimmäiseen: ei vaatimusta, kysymys merkitään käsitellyksi. "joo", "kyllä", "1" ja "laktoositonta" lisäävät laktoosittomuuden kuten ennen (olemassa oleva testi). | `server/order-conversation/index.mjs` |
| 21 | Sääntötulkki teki jutustelusta tuoterivejä: "mihin mennessä pitää tilata?" → "mirin pit tila" ja esti TILAA-komennon, "onks tää halvin" → "half". | Sääntötulkki poistaa tilausaikarajakysymyksen sanat ennen jäsennystä, joten samassa viestissä olevat tuotteet ja päivä säilyvät ("mihin mennessä pitää tilata, ja 20 l maitoa"). Lisäksi pelkkä kysymys (tilausaikaraja, hintavertailu, vaihtoehdot uudelleen) ilman lukuja ei lisää rivejä millään tulkilla. `DEADLINE_QUESTION` siirtyi `interpret.mjs`:ään (re-export `index.mjs`:stä) ja tunnistaa nyt myös "milloin pitää viimeistään tilata?". | `server/order-conversation/interpret.mjs`, `server/order-conversation/index.mjs` |
| 23 | Hintojen vientireitillä ei ollut nopeusrajaa, ja välimuistissa oli yksi paikka: kaksi vuorotellen päivittyvää koria teki joka pyynnöllä uuden Valio-kutsun ja allekirjoitetun tarjouksen. | `/whatsapp/cart/api/export` sallii 30 hakua minuutissa asiakassidosta kohden (429 sen jälkeen). Välimuisti (`createExportCache`) pitää 64 paikkaa avaimella asiakas, sidos, luonnos ja revisio, poistaa vanhentuneet ja yhdistää saman avaimen samanaikaiset haut yhdeksi tarjoukseksi. Voimassaolo kuten ennen: enintään 30 s tai tarjouksen loppuun. | `server/whatsapp/cart-link.mjs`, `server/order-conversation/runtime.mjs` |

## Testit

- Uudet `test/audit-fixes-c.test.mjs` (7) ja `test/audit-fixes-c-chatter.test.mjs` (2, oikea `data/catalog.json`, ohitetaan ilman sitä). Testit #11, #18, #20 ja #21 kaatuvat ennen korjausta olleella `index.mjs`:llä (tarkistettu väliaikaisella kopiolla), ja #21 toistaa katselmuksen rivit "mirin pit tila" ja "half" vain oikealla katalogilla. #10 ja #23 testaavat oikeaa korilinkkireittiä HTTP:n yli.
- Korilinkin, korisivun ja väärinkäytön testien TILAA-pyynnöt lähettävät nyt lipun `confirm: true` kuten painike.
- Koko `npm test` **319/319** worktreessä (`npm ci`, katalogi linkkinä yhteisestä kansiosta).

## Selainkoe

Oma eristetty WhatsApp-palvelin (`server/whatsapp-server.mjs`) väliaikaisilla kannoilla, simuloiduilla hinnoilla ja `DEMO_NOW`-kellolla, edessä paikallinen välityspalvelin, joka antaa julkisen alkuperän Origin-otsakkeeksi kuten tunneli. Kori koottiin palvelimen `/demo/chat`-reitillä. Selaimena sovelluksen oma selainpaneeli.

- **1280 px:** yläpalkin Toimituspäivä ja Ostoskori sekä ohituslinkki (Enter) vierittävät kohteeseen, fokus siirtyy, korilinkki pysyy osoiterivillä, kori pysyy näkyvissä eikä sivua ladata uudelleen (verkkolokissa yksi sivupyyntö). Käsin vaihdettu fragmentti `#wa-days` palauttaa korilinkin. "hyväksyn" muutoskentässä: ilmoitus "Tilausta ei tehty. Vahvista tilaus painamalla TARKISTA JA TILAA ja sen jälkeen vihreää VAHVISTA DEMOTILAUS -painiketta.", ei tilausta, teksti jää kenttään. TARKISTA JA TILAA → yhteenveto → VAHVISTA DEMOTILAUS → "Demotilaus vahvistettu" (väliaikaisen kannan demotilaus). Ei vaakaylivuotoa.
- **375 px:** uusi korilinkki samassa välilehdessä lataa uuden korin, yläpalkin linkit toimivat samoin, ei vaakaylivuotoa.
- Konsolissa ei JavaScript-virheitä. Ainoat virherivit ovat tuotekuvien 404 (eristetyn kokeen tyhjä kuvavälimuisti, sivu näyttää pakkauskuvakkeen) ja odotettu 400 "hyväksyn"-yritykselle.

## Rajat ja jatko

- Käyttöön vasta botin seuraavassa sovitussa restartissa (sessio E). Korisivun JavaScript tarjoillaan levyltä, mutta palvelin ajaa snapshotia, joten myös sivu vaihtuu vasta restartissa.
- Restartin jälkeen vanhalla sivulla jo auki olevan korin vahvistuspainike lähettää TILAA ilman lippua ja saa 400:n; sivun päivitys korjaa sen.
- Mallitulkki voi edelleen tulkita kysymyksen tilausmuutokseksi; pelkän kysymyksen rivilisäykset suodatetaan, mutta muita mallin ehdottamia muutoksia ei.
- Katselmuksen muut kohdat kuuluvat sessioille A, B ja D.
