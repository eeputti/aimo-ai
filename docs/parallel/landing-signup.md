# Landing page ja WhatsApp-numerolomake (Claude Code, landing-chat)

15.11.2026. Eeliksen pyyntö: Workers-demosta landing page, jossa kokeilija antaa puhelinnumeronsa ja pääsee keskustelemaan apurin kanssa WhatsAppissa. Testiversio: Metan testinumero vaatii yhä, että jokainen numero hyväksytään Metassa käsin (enintään viisi vastaanottajaa).

## Mitä tehtiin

- `https://aimo-order-demo.aimo-demo-41cfac.workers.dev/` on nyt landing page (`deploy/cloudflare/index.html`, `public/landing.*`). Tilausnäkymä siirtyi osoitteeseen `/tilaukset.html` (Cloudflare ohjaa sen muotoon `/tilaukset`) sisältöä muuttamatta.
- `deploy/cloudflare/src/signup.ts` ja uusi D1-taulu `signups` (`signup.sql`, lisäävä, ajettu tuotantoon): lomake → tila `pending` → `linked` → `ready`. Selain näkee vain oman ilmoittautumisensa tilan omalla satunnaisella tunnisteellaan. Numerot, nimet ja Metan koodit näkee vain julkaisuavaimella (`SYNC_TOKEN`) eli WhatsApp-palvelimen kone. Saman sivun Origin vaaditaan, 5 ilmoittautumista tunnissa per IP, enintään 50 odottavaa, rivit poistetaan 7 päivän jälkeen.
- `scripts/whatsapp-signups.mjs` ajetaan WhatsApp-palvelimen koneella. Se hakee Workerilta odottavat numerot (Worker ei koskaan ota yhteyttä koneeseen, joten tunnelin vaihtuminen ei haittaa), liittää uuden numeron omaksi testiasiakkaaksi samalla `invite`/`pair`-polulla kuin `WHATSAPP_DEMO_PHONE` ja näyttää terminaalissa ja macOS-ilmoituksena, mitä esittäjän pitää tehdä Metassa. Aiemmin YHDISTA-koodilla liitetty numero säilyttää korinsa ja historiansa ja on heti valmis. WhatsApp-linkki luetaan Metasta (`display_phone_number`), joten apurin numeroa ei ole Gitissä.
- Käyttäjän lisäpyyntö: kokeilija kirjoittaa Metalta tulleen vahvistuskoodin suoraan sivulle. Koodi näkyy vain esittäjän terminaalissa, ja se poistetaan hyväksynnän yhteydessä.

## Esittäjän ohje

Käynnistä seuranta projektin juuressa ja jätä se auki:

```bash
node --env-file-if-exists=.env --env-file-if-exists=.env.whatsapp --env-file=deploy/cloudflare/.env.publisher scripts/whatsapp-signups.mjs watch
```

1. Kun ruudulle tulee **Uusi kokeilija**, lisää numero Metaan: API Setup, To, Manage phone number list, Add phone number.
2. Meta lähettää koodin kokeilijan WhatsAppiin. Kun kokeilija kirjoittaa sen sivulle, koodi näkyy terminaalissa. Syötä se Metan ikkunaan.
3. Kun numero näkyy Metassa vahvistettuna, aja terminaalin näyttämä `approve --phone +358…` -komento. Sivu näyttää kokeilijalle **Avaa WhatsApp** -napin.
4. Demon jälkeen: `remove --phone +358…` poistaa testiasiakkaan, keskustelun ja Workerin rivit. Poista numero myös Metan listalta.

`list` näyttää odottavat, hyväksyntää odottavat ja valmiit numerot. Kun apurilla on oma rekisteröity numero, aseta `WHATSAPP_SIGNUP_AUTO_READY=true`, jolloin vaiheet 1–3 jäävät pois.

## Tarkistukset

- Workerin testit **20/20** (uudet 6: numeron normalisointi, tilaketju, tunnisteen ja julkaisuavaimen vaatimus, virheelliset lomakkeet, vieras Origin, vaaralliset linkit, IP-raja, koodin reitti ja yritysraja, poisto ja säilytysaika), `typecheck` ja `build` läpi uusimman origin/mainin (71953d1) päällä erillisessä työpuussa.
- Läppärin skriptin testit **4/4**: uusi numero liitetään kerran eikä hyväksyntää ohiteta uusinnassa, aiempi jäsen säilyttää sidoksensa, auto-ready, virheellinen numero, koodin näyttäminen kerran, linkin muodostus ja Meta-haku, API:n tunniste.
- Selain (paikallinen testipalvelin oikealla `handleSignup`-koodilla ja tuotannon CSP:llä): lomake → liitos väliaikaiseen kantaan → koodi → hyväksyntä → Avaa WhatsApp, 1280 ja 375 px, ei vaakaylivuotoa. Löytyi ja korjattiin: `hidden` ei piilottanut nappia.
- Julkaisu: D1-taulu kuivaharjoitus → ajo → takaisinluku, `cf deploy --dry-run`, julkaisu versio `17bb1f8f-b928-44a5-9679-be79d33cf330`. Tuotannon Worker: `/`, `/tilaukset`, `/healthz`, `/api/orders` ja demomaksusivu vastaavat, autentikoimaton lista 401, vieras Origin 403.
- Tuotannon ketju keksityllä numerolla ja väliaikaisella WhatsApp-kannalla: pending → linked → koodi terminaaliin → approve → ready ja oikea wa.me-linkki Metasta → remove → 404, rivejä ei jäänyt. Oikeaan `data/whatsapp.db`-kantaan, Metaan tai käynnissä olevaan WhatsApp-palvelimeen ei koskettu.

## Rajat ja avoimet

- Metan testivastaanottajan lisäys on edelleen käsin, ja raja on viisi numeroa.
- Rinnakkainen numeronlisäyschatti (b6c44c4b) raportoi, ettei Metan vahvistuskoodi saapunut WhatsAppiin, vaikka Meta näytti Code sent successfully. Jos koodi ei tule perille, vaihe 2 ei etene. Tätä ei ole ratkaistu tässä vaiheessa.
- Seurantaa ei ole käynnistetty oikeaa kantaa vasten; se tehdään esittäjän koneella. Juuren `package.json` oli toisen chatin varauksessa, joten npm-skriptiä ei lisätty.
- Tilausnäkymän "Kopioi näkymän linkki" kopioi juuriosoitteen eli nyt landing pagen.
