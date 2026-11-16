# Koodikatselmus 15.11.2026 ilta (Claude Code, ongelmakatselmointichat)

Käyttäjän kysymys: "mitä ongelmia löydät tästä aimo aista?". Katselmus ja raportti, sovelluskoodia, palvelimia, asetuksia tai kantoja ei muutettu.

## Mitä tutkittiin

- Koodi luettiin GitHubin `main`-versiosta **ad69e14** erillisessä kopiossa. Löydökset tarkistettiin uudelleen versiota **5457479** vastaan, koska siihen tuli katselmoinnin aikana 12 committia (demokello, varahinnat, hakukorjaukset, agentin jälki). Kaikki alla olevat ovat yhä voimassa versiossa 5457479, ellei toisin mainita. Viimeisin 9ae0b13 (Valion tuotetiedot vastauksiin ja korisivulle) ei koske näitä kohtia; rivinumerot ovat sen mukaiset.
- Kolme rinnakkaista osa-aluekatselmusta: Worker ja demomaksu, WhatsApp-palvelin, tilauslogiikka (gateway, keskustelu, tuotetyökalut, tulkinta). Vakavimmat kohdat tarkistettiin lisäksi itse lähdekoodista.
- Vahvistusskriptit ajettiin väliaikaisilla kannoilla, simuloiduilla hinnoilla ja satunnaisilla 127.0.0.1-porteilla. Ei Meta-, Valio-, malli- tai sähköpostikutsuja, ei yhteyttä käynnissä olevaan palvelimeen. Käyttäjän kannoista luettiin vain lukutilassa prosessi-, rivimäärä- ja summatietoja.
- **Merkinnät:** *vahvistettu* = toistettu skriptillä tai luettu täsmällinen koodipolku; *todennäköinen* = koodista päätelty, ei toistettu.

Tässä raportissa on vain uudet löydökset. Illan aiemman katselmuksen (`bot-audit-2026-11-15-ilta.md`) löydökset 1 ja 4 on korjattu käyttöönotolla (kiertävä demokello ja julkaisija). Avoinna siitä ovat yhä Mac-riippuvuus, vaihtuva pikatunneli, julkinen demomaksun linkki ja Metan viiden vastaanottajan raja.

## Testit

| Versio | Sovellus | Worker | Tulkinta | Puhekieli |
|---|---|---|---|---|
| ad69e14 | 268/270 (kaksi kelloriippuvaa) | 29/29 | 26/26 | 54/54 |
| 5457479 | **286/286** | ei ajettu uudelleen | ei ajettu uudelleen | ei ajettu uudelleen |

Kelloriippuvat testit on korjattu versiossa 5457479. Testit eivät kata mitään alla olevista vioista.

## Korkea

| # | Ongelma | Missä | Tila |
|---|---|---|---|
| 1 | **Yksi virheellinen HTTP-pyyntö kaataa koko WhatsApp-palvelimen.** Osoitteen jäsennys heittää poikkeuksen async-käsittelijässä ilman try/catchia, eikä prosessilla ole `unhandledRejection`-käsittelijää tai valvojaa. Palvelin kuuntelee kaikilla verkkoliitännöillä, joten pyynnön voi lähettää samasta verkosta. Tunnelin kautta toimivuus riippuu siitä, välittääkö Cloudflare polun muuttamatta. | `server/whatsapp-server.mjs:15, 29` (sama kuvio `web-demo.mjs:55`, `index.mjs:22`) | vahvistettu (prosessi päättyi koodiin 1); **korjattu** samana iltana (400/500, prosessi jatkaa), kuuntelu ja valvoja ennallaan |
| 2 | **Pähkinä- ja viljakiellot eivät tunnista alakoodeja.** Allergeenitarkistus vertaa vain täsmällistä koodia. Noin 120 tuotteella on vain mantelin, hasselpähkinän tai muun pähkinän alakoodi ilman yleiskoodia AN, ja 322:lla vain vehnän, ohran tai muun viljan koodi ilman AW:tä. Pähkinäkiellon mandaatilla mantelijuoma vahvistui ilman ihmistä, ja pähkinättömälle ehdotettiin Tobleronea ja Daimia. | `server/gateway/mandate.mjs:38`, `service.mjs:78`, `order-tools/index.mjs:129, 168, 253`, `aimo/resolve.mjs:30` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 3 | **"Maapähkinätön" tulkitaan pähkinättömäksi (AN) eikä maapähkinättömäksi (AP).** Sääntölistassa yleinen pähkinä on ennen maapähkinää, ja ensimmäinen osuma voittaa. Viesti "ei maapähkinöitä" ei tuota rajausta lainkaan. | `server/aimo/understand.mjs:47` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 4 | **Mandaatin allergeenikielto ohittaa "voi sisältää" -tiedon ja puuttuvan allergeenitiedon.** Pähkinät kieltävä ostaja sai vahvistetun tilauksen tuotteesta, joka voi sisältää pähkinää. Allergeenitieto puuttuu kokonaan 10 341 tuotteelta 17 546:sta, ja ne läpäisevät jokaisen kiellon. | `server/gateway/mandate.mjs:38` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 5 | **Desimaalipilkku ja kolme desimaalia luetaan tuhaterottimeksi:** "0,125 kg" on 125 kg ja "0,750 kg" 750 kg. WhatsAppin g→kg-muunnos ja hakulauseen muotoilu tuottavat juuri tämän muodon. Sääntöpolulla "125 g voita" sai 140 kg:n vaihtoehdot, ja valinnan jälkeen TILAA vahvisti 20 kg voita, 297 €. | `server/aimo/understand.mjs:113`, `order-tools/index.mjs:28` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 6 | **Samanaikaiset tilaukset saavat saman tilausnumeron, ja toinen ylikirjoittuu.** Numero on `COUNT(*)+1`, ja se samoin kuin idempotenssi- ja kertakäyttötarkistus luetaan ennen tuoretta hintatarkistusta (await). Kaksi ostajaa sai saman numeron, vain toisen rivi jäi, ja ensimmäisen uusinta palautti toisen ostajan tilauksen. Sama tarjous kahdella avaimella vahvistui kahdesti. MCP-erä ja eri WhatsApp-asiakkaat ajavat rinnakkain. | `server/gateway/service.mjs:356–360`, `store.mjs:27, 55` | vahvistettu; **korjattu** 16.11. (atominen numero, sitoutuminen transaktiossa, myös Turso), `audit-fixes-b.md` |
| 7 | **Yhden hylkäyksen jälkeen WhatsApp-tilaus ei mene koskaan läpi.** Idempotenssiavain on luonnos ja revisio, ja gateway palauttaa saman avaimen vanhan tilauksen sisältöä vertaamatta. Hinta muuttuu → TILAA hylätään → "näytä" hakee uuden hinnan → TILAA palauttaa vanhan hylätyn tilauksen. Tämä toistuu, kunnes asiakas muuttaa koria. | `server/order-conversation/index.mjs:395`, `gateway/service.mjs:356` | vahvistettu; **korjattu** 16.11. gatewayssa (avain sidottu tarjouksiin), `audit-fixes-b.md` |
| 8 | **Asiakkaan lähettämä linkki voi jumittaa koko palvelimen minuuteiksi.** HTML-tagien poisto on neliöllinen sivulla, jossa on paljon `<`-merkkejä ilman `>`-merkkiä. Mitattu: 160 kt kesti 10 s, joten 1 Mt:n sallittu sivu kestää noin 6 min, ja koko tapahtumasilmukka on sen ajan jumissa. Aikakatkaisu koskee vain latausta, ei jäsennystä. | `server/whatsapp/link-reader.mjs:81, 108` | vahvistettu (mittaus); **korjattu** samana iltana (lineaarinen jäsennys, 1 Mt alle 25 ms) |

## Keskitaso

| # | Ongelma | Missä | Tila |
|---|---|---|---|
| 9 | **Korisivun yläpalkin Ostoskori- ja Toimituspäivä-linkit sekä ohituslinkki rikkovat korin.** Ne vaihtavat URL-fragmentin, jossa korilinkin tunniste on. Sivu latautuu uudelleen ja näyttää "Korilinkki on vanhentunut". Odottava pyyntö ja kuittaus katoavat. | `public/whatsapp-storefront-cart.html:19, 36, 37`, `whatsapp-storefront-cart.js:4, 218` | vahvistettu (luettu); **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 10 | **Sana "hyväksyn" korisivun muutoskentässä tekee tilauksen heti** ohi TARKISTA JA TILAA -vaiheen ja vihreän vahvistuspainikkeen. | `server/whatsapp/cart-link.mjs:145`, `order-conversation/index.mjs:15` | vahvistettu; **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 11 | **Pelkkä päivä tai ruokavalio katoaa, jos tuotteita ei vielä ole.** Luonnos tallennetaan vain, kun siinä on rivejä. Botti kysyy "Mille päivälle?", vastaus "perjantaiksi" unohtuu, ja päivää kysytään uudelleen. Ennen tuotteita ilmoitettu "pähkinätön" ei rajaa myöhempiä ehdotuksia. | `server/order-conversation/index.mjs:529` | vahvistettu; **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 12 | **Yksi hidas asiakas pysäyttää kaikki.** Koko palvelimella on yksi työjono. Yksi vuoro voi kestää minuutteja (useita mallikutsuja, linkin luku), ja muiden kirjoitusindikaattori sammuu 25 sekunnissa. | `server/whatsapp/channel.mjs:134–136`, `store.mjs:88` | vahvistettu; **korjattu** 16.11. (sessio D): eri asiakkaat rinnakkain, enintään 4 kerrallaan, saman numeron viestit järjestyksessä, atominen varaus myös libsql-kannalla, odottavan kirjoitusindikaattori uusitaan; käyttöön botin seuraavassa restartissa, pilven `drain` kytketään E:n `cloud.mjs`:ssä (`audit-fixes-d.md`) |
| 13 | **Landingilta liittyneiden tilaukset eivät pääse maksusivulle eivätkä saa sähköpostia.** Julkaisija julkaisee vain `WHATSAPP_DEMO_PHONE`-numeron tilaukset, mutta jokainen vahvistettu tilaus saa "Siirry demomaksuun" -linkin. Jos `WHATSAPP_DEMO_BUYER_ID` on asetettu, sekään numero ei täsmää. Gatewayssa on nyt kolmen eri WhatsApp-ostajan tilauksia. | `deploy/cloudflare/publish-orders.mjs:15–18`, `server/whatsapp/checkout.mjs:30`, `demo-buyer.mjs:10` | vahvistettu (luettu); **korjattu** 16.11. (kaikki WhatsApp-jäsenet ja kiinnitetty ostaja), `audit-fixes-b.md` |
| 14 | **Ilmoittautuminen ei todista numeron omistusta.** Kenen tahansa numeron voi rekisteröidä, ja seuranta liittää sen suoraan tilaavaksi jäseneksi, jolla on 6 000 €:n mandaatti. Muiden ongelmien vuoksi: nopeusrajat (5/h/IP, 50 odottavaa) ohittuvat rinnakkaisilla pyynnöillä (laskenta ennen lisäystä), jo liittyneen numeron nimen, yrityksen ja Meta-koodin voi ylikirjoittaa esittelijän listassa, ja lista näyttää 100 vanhinta, joten roskarivit piilottavat uudet. | `deploy/cloudflare/src/signup.ts:124–140, 177–183`, `scripts/whatsapp-signups.mjs:85–88` | vahvistettu; **korjattu** 16.11. (sessio D): jäsenyys vasta saman numeron WhatsApp-viestistä ilmoittautumisen kertakoodilla, itse ilmoittautuneille 300 €/tilaus ja 600 €/pv ilman kuittausta, rajat samassa lauseessa kuin lisäys sekä 3/h/numero, ensimmäisen nimi pysyy ja lista uusimmasta; Worker-julkaisu ja D1-migraatio `signup-verify.sql` odottavat E:tä (`audit-fixes-d.md`) |
| 15 | **Vanha tai viimeisin tunnettu hinta kelpaa allekirjoitettuun tarjoukseen ja tilaukseen ilman merkintää.** Rajapintavirheessä välimuisti palauttaa minkä ikäisen arvon tahansa (`stale: true`), mutta gateway ei katso lippua tarjouksessa eikä tuoreessa tarkistuksessa. Viikon vanhalla hinnalla syntyi vahvistettu tilaus. Täydentää 66d23b2:n avointa `priceSource`-kohtaa. | `server/valioApi.mjs:24, 212`, `gateway/service.mjs:118–122, 338–343` | vahvistettu (ad69e14); **korjattu** 16.11. (merkintä, ikäraja, todellinen `priceSource`), `audit-fixes-b.md` |
| 16 | **Kiertävä demokello kerryttää päivärajan loputtomasti.** Kaikki tilaukset syntyvät päivälle 15.11., joten WhatsApp-ostajan 8 000 €:n päiväraja täyttyy kierroksesta toiseen. Sen jälkeen jokainen tilaus jää odottamaan hyväksyntää, jota asiakas ei voi antaa. Kellon palatessa alkuun myös jo vanhentuneet tarjoukset ovat taas voimassa. | `server/gateway/mandate.mjs:66–69`, `clock.mjs` | todennäköinen (luettu); **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 17 | **Väärä tuotetyyppi ensin:** "5 l kasvilientä" antaa vain tekstiilien huuhteluaineita (hakusana pilkkoutuu "ilien"), "merisuolaa" antaa ensin perunalastut, "suolaa" ranskanperunamaustesuolan, eikä "kanalientä" löydy, vaikka tuote on valikoimassa. | `order-tools/index.mjs:40`, `aimo/understand.mjs` | vahvistettu (5457479); **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 18 | **Yhteenvedon "Tilattava viimeistään" näyttää ensimmäisen rivin rajan, ei aikaisinta.** Tarjous vanhenee aikaisimpaan. | `order-conversation/index.mjs` (yhteenveto) | vahvistettu; **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 19 | **Päivämäärät:** "16.11" ja "ma 16.11" ilman loppupistettä eivät tunnistu, ja "ensi viikon tiistaina" tulkitaan tämän viikon tiistaiksi. | `server/aimo/understand.mjs:84, 93` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 20 | **Laktoosikysymykseen vastattu "sopii", "ok" tai "hyvä" lisää laktoosittomuuden vaatimuksen**, ja "käy" kysyy saman uudelleen sääntöpolulla. | `order-conversation/index.mjs` (tarkennus) | vahvistettu; **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 21 | **Sääntötulkki tekee jutustelusta tuoterivejä.** Valmiissa yhteenvedossa "mihin mennessä pitää tilata?" lisäsi rivin "mirin pit tila" ja esti TILAA-komennon, ja "onks tää halvin" lisäsi rivin "half". | `order-conversation/index.mjs`, `whatsapp/dialogue.mjs:185` | vahvistettu (sääntöpolku); **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 22 | **Munat:** "3 kennoa kananmunia" on 3 munaa (kenno on noin 30), eivätkä Vapaan kanan munat (M10, L15 jne.) muunnu kappaleiksi, joten niitä ei koskaan ehdoteta munamäärälle. | `server/itemQuantities.mjs:4`, `aimo/understand.mjs` | vahvistettu; **korjattu** 16.11. (sessio A, `docs/parallel/audit-fixes-a.md`) |
| 23 | **Hintojen vientireitillä ei ole nopeusrajaa, ja välimuistissa on vain yksi paikka.** Kaksi vuorotellen päivittyvää koria tekee jokaisella pyynnöllä uuden Valio-kutsun ja allekirjoitetun tarjouksen, mikä altistaa 429-virheille. | `server/whatsapp/cart-link.mjs:114–117`, `order-conversation/runtime.mjs:25–29` | vahvistettu; **korjattu** 16.11. (sessio C, `docs/parallel/audit-fixes-c.md`) |
| 24 | **Gatewayn nollauksen jälkeen tilausnumero toistuu**, ja Worker pitää uutta tilausta vanhan duplikaattina: sähköpostia ei lähetetä, ja maksusivu näyttää vanhan tilauksen rivit ja summan. | `gateway/service.mjs:360`, `deploy/cloudflare/src/index.ts`, `demo-payment.ts:55` | todennäköinen; **korjattu** 16.11. (laskuri säilyy nollauksessa, Worker korvaa uudemmalla), `audit-fixes-b.md` |
| 25 | **Vahvistettu tilaus, jonka summa puuttuu, jumittaa maksun ja julkaisijan.** Reitti palauttaa pysyvästi 503, sähköpostia ei lähetetä, ja julkaisijan kierros keskeytyy joka 5. sekunti. | `deploy/cloudflare/src/demo-payment.ts:50–52`, `publish-orders.mjs` | vahvistettu; **korjattu** 16.11. (ei maksua ilman summaa, julkaisija eristää virheet), `audit-fixes-b.md` |

## Matala

- 👍-reaktio valmiiseen yhteenvetoon saa virheviestin. "Yhdistä asiakaspalveluun" tulkitaan yhdistämiskoodiksi. Heti yhdistämisen jälkeen lähetetty viesti katoaa (`channel.mjs:37, 165`, `store.mjs:81, 84`).
- Mallikuluille ei ole kokonaiskattoa, vain numerokohtaiset rajat, ja rajan ylittävät viestit katoavat ilman vastausta (`store.mjs:7–8`).
- Pyynnön kokoraja ei katkaise lähetystä, joten yhteys voi lähettää tavuja Noden aikakatkaisuun asti (`channel.mjs:10–16`).
- Suostumustekstin 7 päivän poisto ei toteudu: Worker siivoaa vain uuden ilmoittautumisen yhteydessä, eikä Noden `landing_signups`-tauluja tai jäseniä poisteta koskaan.
- Vahvistussähköpostin "VIEW YOUR ORDER" vie landingille, ei tilausnäkymään (`email.ts:20`).
- Esittelijän oma puhelinnumero näytetään kenelle tahansa, joka täyttää lomakkeen kelvollisen näköisellä numerolla (`signup.ts:101–108`).
- Yksi `SYNC_TOKEN` hoitaa julkaisun, ilmoittautumislistan ja maksulinkkien HMAC:n, ja tilaustapahtuman sähköpostin vastaanottajaa ei rajata. Vuoto mistä tahansa kolmesta prosessista avaa kaiken.
- Korilinkit allekirjoitetaan Metan App Secretillä (erillisellä etuliitteellä). Salaisuuden vaihto mitätöi kaikki linkit (`cart-link.mjs:46`).
- Odottavan tilauksen hyväksyntä ei tarkista hintaa tai saldoa uudelleen (`service.mjs:538`).
- `/healthz` ilmoittaa aina `demoPayments: true`. Viitteellinen ostaja-agentti käyttää UTC-päivää (`buyerAgent.mjs:52`).
- Kaupalliset fontit Matter ja National 2 ovat julkisessa repossa ja Workerin julkisissa tiedostoissa: lisenssiriski.

## Korjausjärjestys demon kannalta

1. **#1** (try/catch ja 400, `listen` vain 127.0.0.1:ään, valvoja) ja **#8** (lineaarinen tagien poisto tai tiukempi kokoraja). Koodikorjaus tehty: try/catch ja lineaarinen jäsennys; kuuntelurajaus ja valvoja kuuluvat käyttöönottoon.
2. **#2–#4** allergeenit: koodihierarkia AN/AW-alakoodeille, AP ennen AN:ää, "voi sisältää" ja puuttuva tieto ainakin hyväksyntään.
3. **#5** desimaalit ja **#7** idempotenssiavain (sisältöön tai tarjoukseen sidottu).
4. **#9** korisivun linkit ja **#11** päivän tallennus ilman rivejä: näkyvät heti demossa.
5. **#6** tilausnumeron atominen varaus, **#13** julkaisijan ostajavalinta ja **#16** kellon kierron vaikutus päivärajaan.

Vahvistusskriptit ovat tämän chatin väliaikaisessa hakemistossa, eivät Gitissä. Yksityiskohtaisia hyödyntämisohjeita ei kirjata julkiseen repoon.
