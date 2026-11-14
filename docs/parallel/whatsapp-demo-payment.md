# WhatsAppista demomaksuun (Eeliksen maksupolkuchatti)

## Käyttäjän päätös 14.11.2026

WhatsApp toimii tilausapurina: viesteistä kootaan ostoskori, asiakas tarkistaa tuotteet ja toimituspäivän, tilaus näkyy hostatussa tilausnäkymässä, maksulinkki avaa maksusivun ja onnistuneen maksun jälkeen lähetetään sähköpostivahvistus. Käyttäjä valitsi nimenomaisesti **demomaksun ensin**, ilman rahansiirtoja.

Tilausgatewayn `confirmed` tarkoittaa edelleen tallennettua demotilausta. Maksun tila on erillinen `pending` / `paid`; sitä ei pidä tulkita oikean maksun tai Valio-toimituksen todisteeksi. Korin `ok` → selaimen tarkistus -polku on erillisen, valmistuneen korilinkkichatin työ commitissa `445bee8`.

## Tässä vaiheessa toteutettu

- `deploy/cloudflare/src/demo-payment.ts`: D1:een tallentuva demomaksu, serveriltä luettu muuttumaton summa, HMAC-rajattu linkki, 24 tunnin maksuaika, keskeytys, hyväksyntä ja maksun jälkeisen sähköpostin callback.
- `deploy/cloudflare/demo-payment.sql`: uuden taulun erillinen lisäävä migraatio. Sama `CREATE TABLE IF NOT EXISTS` sisältyy puhtaan asennuksen `schema.sql`:ään.
- `deploy/cloudflare/public/demo-payment.html`, `.js`, `.css`: suomalainen puhelin- ja tietokonesivu. Tuotteet, toimituspäivä, tilausnumero, veroton demomaksusumma ja vahvistusviestin tila. Kortti- tai pankkitietoja ei kerätä.
- Hostatun listan `public/app.js`: tunnistaa valinnaisen `demoPayment`-kentän, näyttää odottavan/hyväksytyn demomaksun ja oman maksulinkin. Vanha tilausdata toimii ilman kenttää. Ulkopuolista maksulinkkiä ei hyväksytä.
- Maksusivu hyväksyy myös aloituslinkin `/demo-payment.html#AGW-YYYYMMDD-NNNN`: se odottaa enintään kahdeksan hakukertaa `/api/orders`-vastauksesta juuri kyseisen tilauksen maksulinkkiä ja vaihtaa fragmenttiin palvelimen allekirjoittaman kyvykkyyden. Julkaisijan avainta ei tuoda WhatsAppin selainkoriin.

## Rajapinta ja vielä puuttuva kytkentä

**Workerin `src/index.ts`, `cloudflare.config.ts`, `test/order-events.test.mjs` ja `docs/order-events.md` olivat paikallisella taululla Claude Coden tehtävän `4f595c97` varauksessa. Niitä ei muokattu tässä chatissa. Integraatiopyynnöt paikallisissa viesteissä 91, 94 ja 100; vastausta ei vielä saatu.**

Omistajan kytkentä:

1. Lisää moduulista importit `registerDemoPayment`, `demoPaymentEmailAllowed`, `describeDemoPayment`, `handleDemoPayment`.
2. `/api/order-events`: tallenna tapahtuma nykyiseen tapaan ja kutsu **ennen** `deliverEmail`-kutsua `await registerDemoPayment(env, event.order.orderId)`. Kutsua tarvitaan myös saman tapahtuman uusinnassa, jotta keskeytynyt rekisteröinti voidaan täydentää.
3. `deliverEmail`: tarkista ennen lähetystä `await demoPaymentEmailAllowed(env, orderId)`. Jos se on false, palauta `awaiting_demo_payment` muuttamatta sähköpostin tilaa. Tarkistus on voimassa myös silloin, kun uusien maksujen luontiasetus on myöhemmin pois päältä. Vanhoja jo lähetettyjä tilauksia ei siirretä maksuodotukseen.
4. `/api/orders`: lisää kunkin synteettisen demotilauksen projektioon `demoPayment: await describeDemoPayment(env, order.orderId, url.origin)`, jos tulos ei ole null. Alkuperäistä snapshotia ei tarvitse muuttaa.
5. Ennen lopullista 404-vastausta kutsu `handleDemoPayment(request, env, orderId => deliverEmail(env, orderId, url.origin))` ja palauta sen vastaus, jos se ei ole null. GET lukee tilauksen; saman alkuperän POST `{simulate:'success'}` hyväksyy ja `{simulate:'cancel'}` jättää odottamaan. Callback käyttää nykyistä lähetyksen varausta/idempotenssia.
6. Lisää valinnainen `DEMO_PAYMENTS_ENABLED` Workerin env-asetuksiin. Oletus on pois päältä. Ennen asetuksen `true` käyttöönottoa aja lisäävä migraatio ja varmista koko integroidun reitin testit. Vain moduulin testejä ei saa esittää koko reitin varmennuksena.
7. Julkaisijan nykyinen `pushOrderEvents` käsittelee tuntemattoman `awaiting_demo_payment`-tuloksen lopullisena tallennuksena, joten se ei lähetä jatkuvasti odottavaa tilausta. Maksusivun uusinta voi jatkaa keskeytynyttä sähköpostilähetystä maksua toistamatta. Nykyinen sähköpostin 3 yrityksen raja säilyy.
8. WhatsApp-korin vahvistuksen jälkeen tarvitaan palvelimen palauttama rakenteinen `orderId` ja siirtyminen oikean hosting-alkuperän `/demo-payment.html#ORDER_ID`-osoitteeseen. Pyyntö korilinkkichatille yhteisen MCP-taulun viestissä 129. Koriin ei tässä vaiheessa lisätty uutta siirtymää tai asetusta, eikä niiden varattuja tiedostoja muokattu.

Tilausnäkymä on jo tarkoituksella julkinen synteettinen demo. Myös sen `demoPayment.url` on jaettava demokyvykkyys: kuka tahansa näkymän näkevä voi hyväksyä näytetyn **demomaksun**. Maksulinkki ei anna julkaisuoikeutta tai paljasta sähköpostiosoitetta. Tuotanto edellyttää asiakaskohtaista pääsyä, oikeaa maksupalvelua ja palvelimen varmentamaa maksutapahtumaa; pelkkää selaimen paluulinkkiä ei käytetä maksutositteena.

## Tarkistukset

- `node --test deploy/cloudflare/test/demo-payment.test.mjs`: **4/4**. Odotus, keskeytys, muuttumaton summa, rinnakkaiset hyväksynnät, sama `paid_at`, yksi callbackin idempotentti vahvistus, väärä allekirjoitus/alkuperä/tilaus, vanhentuminen, maksun säilyminen lähetyshäiriössä, vanhat lähetetyt tilaukset ja asetuksen sulkeminen.
- `npm --prefix deploy/cloudflare test`: työpuu **13/13**, rajattu aiotun commitin kopio **12/12** (toisen chatin keskeneräiset Resend-muutokset jätetty pois). Nykyinen Worker lähettää edelleen vanhan polun vahvistukset suoraan; tämän testin läpäisy ei tarkoita maksuvartion olevan siinä käytössä.
- `npm --prefix deploy/cloudflare run typecheck` ja `run build`: läpi työpuussa sekä rajatussa aiotun commitin kopiossa. Eristetyn tyyppigeneroinnin ensimmäinen ajo pysähtyi sandboxin paikalliseen porttikieltoon; sama tarkistus läpäisi oikeuslaajennuksella. `node --check` ja `git diff --check`: läpi.
- Eristetty oikea Chrome ja muistissa oleva SQLite, simuloitu sähköpostilähetys: 1280 px / 375 px, ei vaakaylivuotoa tai JavaScript-virheitä. Tilauskortti → maksusivu, pelkän tilausnumeron siirtymä → allekirjoitettu linkki, keskeytys → ei sähköpostia, hyväksyntä → yksi simuloitu sähköposti, reload → sama maksettu tilaus, takaisin listaan → maksettu merkintä ja puuttuva linkki → ei tilaustietoja. Tilapäinen tarkistusskripti `/private/tmp/aimo-check-demo-payment.mjs`, kuvat `/private/tmp/aimo-demo-payment-desktop.png` ja `-mobile.png`.
- Workers-toteutuksessa käytetty projektin `workers-best-practices`-ohjetta ja tarkistettu [D1:n prepared statement -rajapinta](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

## Käyttöönottotila

Moduuli, sivu ja valinnainen listan esitys on toteutettu. Worker-reititys, sähköpostivartion kytkentä, WhatsApp-korin maksusiirtymä, migraation ajo ja julkaisu ovat **vielä tekemättä**. Käyttäjän WhatsApp-palvelinta/julkaisijaa ei uudelleenkäynnistetty, tilauskantoja ei muokattu eikä oikeaa sähköpostia lähetetty tässä chatissa.

Yhteinen etä-MCP-taulu vastasi kesken työn 502 ja myöhemmin 530/1033; paikallinen CLI-taulu oli käytössä. Etätaulun loppukuittausta ei väitetä onnistuneeksi ilman vastausta.
