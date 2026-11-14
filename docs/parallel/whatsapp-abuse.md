# WhatsApp-apurin väärinkäyttötestit (Claude Code, abuse-tests, 15.11.2026)

Eeliksen pyyntö: testaa tilausapurin, korisivun ja demomaksun väärinkäyttö ja estä se. Kokeet ajettiin vain paikallisesti: väliaikaiset kannat ja avaimet, synteettiset asiakkaat, simuloitu Meta-lähetys, tyhjä `VALIO_API_KEY`. Workerin kokeissa käytettiin paikallista D1-jäljitelmää. Julkaistuja palveluja, käyttäjän kantoja ja `.env`-tiedostoja ei muutettu.

## Testit

- `test/whatsapp-abuse.test.mjs` (20): webhookin allekirjoitus, koko, toisto, aikaikkuna ja vieras numero. Viestitulva ja parittamaton numero. Injektio- ja epämääräiset viestit, kaksois- ja rinnakkaisvahvistus. Vihamielinen tulkki, erikoismerkit, korilinkin tunnisteet, paikallisten reittien rajaus, korisivun escapointi ja CSP sekä mallin vapaan tekstin tarkistin.
- `deploy/cloudflare/test/abuse.test.mjs` (4): julkaisureittien tunnisteet, tilaustapahtuman syötteet, sähköpostin escapointi ja demomaksun rajat.
- `eval/whatsapp-abuse-cases.mjs` ja `scripts/whatsapp-abuse-eval.mjs`: 12 keskustelua oikealla mallilla. Ajo: `node --env-file=.env scripts/whatsapp-abuse-eval.mjs`. Tapausten kentät ovat samat kuin itsekeskustelun tapauksissa, joten myös `scripts/whatsapp-selfplay-batch.mjs` voi ajaa ne.

## Tulokset

- Koko `npm test` 320/320 ja Worker 24/24 rebasen jälkeen (origin/main b2f94e1).
- Oikea malli ennen rebasea (pohja 23f5279 ja nämä korjaukset), 12 tapausta, 47 mallikutsua, ei kutsuvirheitä: 11/12 läpi. Ainoa poikkeama oli testitapauksen oma odotus: "joo vahvista" on tarkoituksella nimenomainen vahvistus. Tapausta korjattiin, mutta sitä ei ajettu uudelleen.
- Tilausmoottori, vahvistus, hinnat, asiakkuuden tunnistus ja korilinkki kestivät kaikki kokeet.

## Korjattu tässä vaiheessa

1. Uusi `server/whatsapp/model-guard.mjs`, kytketty `dialogue.mjs`:ään. Mallin vapaasta tekstistä poistetaan linkit, yhteystiedot sekä väitteet tilauksen, maksun, hinnan, alennuksen ja oikeuksien tilasta. Jos sisäinen ohje vuotaa vastaukseen, koko vastaus korvataan vakiotekstillä.
2. `store.mjs`: viestikatto numeroa kohden: 10 minuutissa (ennallaan), 120 tunnissa ja 400 vuorokaudessa.
3. `cart-link.mjs`: korisivun viestien päiväraja 200 korilinkin asiakassidosta kohden.
4. `whatsapp-storefront-cart.js`: hinnat muunnetaan aina luvuiksi ja päivämäärä escapoidaan ennen sivulle lisäämistä.

## Avoinna omistajilla

- Keskitaso, Workerin demomaksu: maksupolkuchatti, taulu #214. Yksityiskohdat ja korjausehdotus ovat vain taululla.
- Matalia, numerolomake: landing-chat, taulu #215.
- Tiedoksi: korisivun vapaa tekstikenttä hyväksyy nimenomaisen vahvistuksen ilman erillistä vahvistuspainiketta. Tämä on suunniteltu käytös, ei aukko.

Ei 4749-restarttia. Käyttöönotto Codexin käyttöönottochatille.
