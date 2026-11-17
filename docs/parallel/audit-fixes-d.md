# Katselmuksen korjaukset, sessio D: ilmoittautuminen (#14) ja työjono (#12)

16.11.2026, Claude Code, sessio D. Lähde: `docs/parallel/code-audit-2026-11-15-ilta.md`, rivit #12 ja #14. Pohja origin/main 5d6ae75.

> **Päivitys 17.11.2026:** Eelis pyysi poistamaan ilmoittautumisen kokonaan. Etusivu-chat poisti Workerin `/api/signups`-reitit, `signup.ts`:n, migraatiot ja seurantaskriptit testeineen (8ba07b0, Worker 76a76337). D tarkisti livenä, että `/api/signups` ja `/api/signups/invites` vastaavat 404. **Kertakoodia (`linkCode`), `verified`-tilaa ja kutsulistaa ei siis enää ole**, eikä #14:n reikää voi enää käyttää, koska reittiä ei ole. Uusi käyttäjä liittyy nyt vain ylläpitäjän kutsulla puhelun aikana: Metan testivastaanottaja ja `whatsapp:member invite`, jonka `YHDISTA`-koodin hän lähettää omasta puhelimestaan. Botin puolelle jäivät käyttämättöminä `landing_invites`, `inviteLanding`, viestityyppi `signup` ja itse ilmoittautuneiden 300 €:n raja; ne eivät haittaa ja ovat valmiina, jos itseilmoittautuminen palaa. #12:n rinnakkainen jono on käytössä ennallaan. Alla oleva teksti kuvaa tilannetta 16.11.

## #14 Ilmoittautuminen todistaa nyt numeron

**Ennen:** kuka tahansa pystyi rekisteröimään kenen tahansa numeron, ja seuranta (`scripts/whatsapp-signups.mjs watch` tai pilven tick) liitti sen heti tilaavaksi jäseneksi 6 000 €:n mandaatilla. Nopeusrajat laskettiin ennen lisäystä, joten rinnakkaiset pyynnöt ohittivat ne. Myöhempi ilmoittautuminen saman numeron kanssa ylikirjoitti nimen esittelijän listassa, ja lista näytti 100 vanhinta.

**Nyt:**

- **Kertakoodi.** `POST /api/signups` antaa selaimelle oman koodin (`linkCode`, esim. `K7Q2-9XPA`, 8 merkkiä ilman kirjaimia I, L, O ja numeroita 0, 1). Workerin `chatUrl` sisältää viimeisellä rivillä `YHDISTA K7Q2-9XPA`, joten valmis ensimmäinen viesti on sovittu "Moi! Opeta mua tilaamaan tämän kautta." ja koodi. Koodi näkyy vain saman ilmoittautumisen tunnisteella.
- **Jäsenyys vasta WhatsApp-viestistä.** Seuranta hakee uuden reitin `GET /api/signups/invites` kautta vain koodin SHA-256-tiivisteen ja tekee siitä numerokohtaisen kutsun (`landing_invites`). Jäsentä ei luoda. Kun samasta numerosta tulee tekstiviesti, jonka lopussa on `YHDISTA <koodi>`, `store.pair` vertaa lähettäjän numeroa ja koodia ja vasta silloin luo jäsenen. Saapuva viesti todistaa numeron, koodi todistaa, että sama ihminen ilmoittautui. Toisesta numerosta lähetetty koodi, väärä koodi, vanhentunut koodi, kuva tai ääniviesti ei liitä mitään.
- **Usea selain samalla numerolla.** Jokainen ilmoittautuminen saa oman kutsunsa (enintään 5 uusinta numeroa kohden). Nimen ja yrityksen ratkaisee se kutsu, jonka koodi lähetettiin, eli numeron omistajan oma ilmoittautuminen. Jo olemassa olevaa asiakasta uusi ilmoittautuminen ei korvaa: hänelle vastataan "Numerosi on jo yhdistetty".
- **Koodi ennen kutsua.** Pilvessä tick ajetaan kerran minuutissa, joten koodi voi tulla ennen kutsua. Viesti yritetään uudelleen 30, 60 ja 90 sekunnin päästä (`SIGNUP_ATTEMPTS` 4) ennen vastausta "Yhdistämiskoodia ei löytynyt".
- **Vahvistettu tila.** Kun numero on liittynyt, seuranta raportoi `verified`. Worker poistaa koodin ja tiivisteen, ja saman numeron uusi ilmoittautuminen ei saa uutta koodia.
- **Pieni raja itse ilmoittautuneille.** `ordering.mjs` (`demoMandate`, `DEMO_BUYER_LIMITS`): landing-koodilla liittynyt saa 300 € / tilaus ja 600 € / päivä ilman kuittausta. Suuremmat jäävät gatewayssa odottamaan ihmisen hyväksyntää (`SPEND_CAP_ORDER`, `SPEND_CAP_DAY`). Ylläpitäjän kutsuma testiasiakas (`YHDISTA`-koodi, `bootstrapDemoMember`) säilyy ennallaan 6 000 / 8 000 €:ssa.
- **Nopeusrajat samassa lauseessa kuin lisäys.** Osoiteraja 5/h, uusi numeroraja 3/h ja 50 odottavan raja tarkistetaan `INSERT ... SELECT ... WHERE` -lauseessa. Kymmenen samanaikaista pyyntöä samasta osoitteesta: vanha koodi päästi 10/10 läpi, uusi 5/10.
- **Esittelijän lista.** Nimi ja yritys ovat numeron ensimmäisen ilmoittautumisen, uusin ensin. Uudet kentät `signups` ja `codeSignups` näyttävät, jos useampi selain käytti samaa numeroa tai kirjoitti Meta-koodin. Seuranta varoittaa niistä terminaalissa.

**Metan testivastaanottajan kulku säilyy.** Esittelijä lisää numeron Metaan, kokeilija kirjoittaa Metan koodin sivulle ja esittelijä ajaa `approve --phone`. Eeliksen pitää tehdä toisin vain yksi asia: `approve` ei enää tee numerosta asiakasta. Se avaa Avaa WhatsApp -linkin, ja numero liittyy vasta, kun kokeilija lähettää valmiin viestin. Jos kokeilija kirjoittaa viestin itse, lopussa pitää olla `YHDISTA` ja sivulla näkyvä koodi. `list` näyttää nyt "(ei vielä testiasiakas: odottaa YHDISTA-viestiä)" ja "(testiasiakas ilman WhatsApp-vahvistusta)".

**Huomio: lomake on jo poistettu etusivulta.** Etusivu-chat poisti ilmoittautumislomakkeen Eeliksen pyynnöstä (962f0fa, Worker 2cccc9dd). Etusivu ei siis kutsu `/api/signups`-reittiä, mutta reitti on yhä livenä ja kutsuttavissa suoraan. Tämä korjaus suojaa sen. Jos lomaketta ei tarvita, reitin voi myös sulkea kokonaan; se on Eeliksen päätös.

**Ennen tätä liitetyt numerot.** Vanha seuranta liitti numerot suoraan lomakkeelta. Niitä ei poisteta eikä nollata. Seuranta raportoi ne vahvistetuiksi vasta, kun esittelijä on hyväksynyt ne Metassa (Metan koodi menee numeron omaan WhatsAppiin). Tuntemattoman numeron saa pois komennolla `remove --phone`.

## #12 Yksi hidas asiakas ei enää pysäytä muita

**Ennen:** `channel.mjs` käsitteli yhden viestin kerrallaan koko palvelimelle (`busy`-lippu). Minuuttien vuoro pysäytti kaikki, ja muiden kirjoitusindikaattori sammui 25 sekunnissa. Pilvessä saman instanssin toinen `drain` palasi heti `false`.

**Nyt:**

- **Rajattu rinnakkaisuus.** Enintään `WHATSAPP_CONCURRENCY` (oletus 4, enintään 16) eri asiakasta käsitellään yhtä aikaa. Valmistunut vuoro herättää poolin heti, joten saman numeron seuraava viesti alkaa ilman 500 ms:n odotusta.
- **Saman asiakkaan järjestys.** `store.next()` valitsee ja varaa viestin yhdellä `UPDATE ... WHERE id=(SELECT ...) RETURNING *` -lauseella. Saman numeron myöhempää viestiä ei varata, ennen kuin aiempi on valmis, ja kaksi käsittelijää (sama prosessi, toinen prosessi tai toinen pilvi-instanssi) eivät saa samaa viestiä. Tyhjäkäynnin kysely on edelleen pelkkä luku, joten jono ei pidä kirjoituslukkoa.
- **Pilven atominen varaus ja `recoverStale` säilyvät.** Käsittelyn aikaraja on sama 6 minuuttia, ja `recover()` palauttaa paikallisen restartin keskeytyneet vuorot.
- **libsql.** Sama varaus ja rinnakkaisuus on testattu Turson `file:`-kannalla kahdella instanssilla (`server/sqlite.mjs`).
- **Kirjoittaa-ilmaisin.** Pitkän vuoron ilmaisin uusitaan kuten ennen. Lisäksi täyden poolin takana odottavan viestin lähettäjä näkee ilmaisimen, ja se uusitaan noin 20 sekunnin välein. Väli on testejä varten asetus `typingRefreshMs`.
- **Pilven `drain`.** Kanava tarjoaa `channel.drain(budgetMs)`, joka ajaa poolin rinnakkain. `server/cloud.mjs` (E:n tiedosto) kutsuu vielä `processNext`-silmukkaa: se toimii, mutta yksi kutsu käsittelee jonon peräkkäin. E kytkee rinnakkaisen version.
- Samassa prosessissa olevat SQLite-transaktiot (`order-conversation/store.mjs`, `whatsapp/dialogue.mjs`, `whatsapp/store.mjs`) ovat synkronisia eivätkä pidä transaktiota auki `await`-kutsun yli, joten rinnakkaiset vuorot eivät lomitu niiden sisällä.

## Tarkistukset

- Uusi `test/audit-fixes-d.test.mjs` 7/7: kaksi asiakasta rinnakkain, saman asiakkaan järjestys ja poolin koko, käynnissä oleva pool ja kirjoittaa-ilmaisin pitkän vuoron aikana ja odottavalle, restart kesken vuoron (vastaus kerran, järjestys säilyy), libsql ja kaksi instanssia, koodi vain omasta numerosta ja uusinnat ennen kutsua, Noden ja Workerin sama koodin luku.
- `test/whatsapp-signups.test.mjs` 10/10 (uusi kulku, toisen numeron väärinkäyttö, väärä ja vanhentunut koodi, usea selain, vanhat jäsenet, vanha Worker, pieni mandaatti), `test/whatsapp-signup-alerts.test.mjs` 5/5.
- `deploy/cloudflare/test/signup.test.mjs` 12/12: koodi ja tiivistelista, vahvistus, rinnakkaiset rajat, esittelijän lista, migraatio vanhaan tauluun.
- Vanhaa koodia vastaan: rinnakkaisten ilmoittautumisten testi antoi 10 kun raja on 5, ja rinnakkaisen jonon testi jäi odottamaan (`processNext` palautti `false`).
- Koko `npm test` **339/339**, Worker **52/52**, `npm run typecheck` läpi. Ensimmäinen koko ajo löysi oman virheeni: tyhjä kierros herätti poolin uudelleen tiiviissä silmukassa, ja toisen prosessin kirjoitus sai "database is locked". Korjattu ennen committia.
- Ei Meta-, Valio-, malli- tai sähköpostikutsuja, ei Worker-julkaisua, D1-migraatiota eikä botin restarttia. Käyttäjän kantoihin ei koskettu.

## Käyttöönotto (tehty 16.11.2026, E Eeliksen luvalla)

E teki kaikki viisi kohtaa (`docs/parallel/cloud-cutover.md`): migraatio D1:een, 14 ilmoittautumisriviä säilyi; Worker ja pilven botti versiosta 94c62f3, joka sisältää 14dddf8:n; seurantaa ajaa pilven minuutin tick, ja `cloud.mjs` kutsuu `load().drain(budgetMs)`. D tarkisti: 94c62f3 sisältää 14dddf8:n, `cloud.mjs` käyttää rinnakkaista `drain`ia, ja livenä `GET /api/signups/invites` vastaa ilman avainta 401 (vanha Worker 404). Alla alkuperäinen ohje.


1. **D1:** aja `signup-verify.sql`:n lauseet komennolla `cf d1 query <tietokannan ID>` hakemistossa `deploy/cloudflare` (tämä cf-versio ei tunne `d1 execute` -komentoa). Lisää viisi saraketta ja indeksin; vanhat rivit säilyvät. Toinen ajo pysähtyy virheeseen "duplicate column name" eikä muuta mitään. Uusi tyhjä kanta saa sarakkeet suoraan `signup.sql`:stä.
2. **Worker** julkaistaan ajantasaisesta origin/mainista (sisältää 962f0fa:n, ettei vanha lomake palaa). Migraatio ennen julkaisua, koska uusi `signup.ts` kirjoittaa uusiin sarakkeisiin.
3. **Seuranta** (Macin `whatsapp-signups.mjs watch` tai pilven tick) käynnistetään uudelleen uudella koodilla Workerin jälkeen. Vanhan Workerin kanssa uusi seuranta ei liitä uusia numeroita ja kertoo siitä kerran. Uusi Worker toimii myös vanhan seurannan kanssa, mutta silloin vanha seuranta liittää numerot yhä suoraan.
4. **Botti (4749):** `channel.mjs`:n ja `store.mjs`:n muutokset tulevat voimaan seuraavassa restartissa. Kanta saa automaattisesti taulut `landing_invites` ja `member_sources`. Rinnakkaisuus on oletuksena 4; `WHATSAPP_CONCURRENCY=1` palauttaa vanhan peräkkäisen käsittelyn.
5. **Pilvi:** `server/cloud.mjs`:n `drain` voi kutsua suoraan `load().drain(budgetMs)`; nykyinen silmukka toimii, mutta yksi kutsu käsittelee jonon peräkkäin.

## Rajat ja jatko

- Rinnakkaisuus tekee samanaikaisista eri asiakkaiden tilauksista todennäköisempiä. B vahvisti, että sen korjaus 6a764ce kattaa tämän: tilausnumero varataan yhdellä atomisella lauseella ennen ensimmäistä awaitia, ja tallennus on synkroninen BEGIN IMMEDIATE -transaktio. `audit-fixes-b` ja `audit-fixes-d` menevät läpi yhdessä mainissa a74054b (B:n ajo, 15/15). H vahvisti, että kuvien ja ääniviestien `media.read` pysyy ennen mallikutsua.
- Selainkeskustelun synteettiset asiakkaat (`web-chat.mjs`) saavat yhä ylläpitäjän 6 000 €:n mandaatin. Ne eivät ole oikeita numeroita, mutta raja kannattaa harkita samoin.
- Oikeaa ilmoittautumista, Metan testivastaanottajaa tai puhelimesta lähetettyä YHDISTA-viestiä ei ajettu. Kulku on testattu oikeilla moduuleilla ja simuloidulla Workerilla ja Metalla.
