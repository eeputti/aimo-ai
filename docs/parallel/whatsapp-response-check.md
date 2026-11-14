# WhatsAppin vastaamattomuuden tarkistus 14.11.2026 klo 22.29

Käyttäjä pyysi varmistamaan, vastaako WhatsApp, ja selvittämään syyn, jos vastausta ei tule. Tämä on riippumaton tilannekuva; tokenin korjaaminen kuuluu jo käynnissä olevaan käyttöönottotyöhön.

- Käytössä oleva 4749-listener on PID 47387, hakemistossa `/private/tmp/aimo-whatsapp-runtime-27ee93b5e`. Paikallinen ja nykyisen julkisen tunnelin `/healthz` palauttivat HTTP 200 sekä `ok:true`, `channel:whatsapp`, `mode:ordering-demo`.
- Käynnistysasetusten osoittama WhatsApp-kanta avattiin vain lukevana. Viesti saapui **14.11.2026 klo 22.25.59 Suomen aikaa**. Vastaus on muodostettu ja tallessa, mutta kaikki kolme lähetysyritystä epäonnistuivat `META_HTTP_401`:een. Metan hyväksymää vastauksen viestitunnistetta ei ole. Sama virhe on klo 22.03 ja 22.11 saapuneilla viesteillä. Viimeisin jonossa Metan hyväksymäksi merkitty vastaus on klo 21.58.34; tämä merkintä ei todista puhelintoimitusta.
- Nykyisillä paikallisilla asetuksilla tehty Metan vain lukeva numerotunnistekysely palautti **HTTP 401, OAuthException 190 / 463**. Virhe kertoo session päättyneen `14-Nov-26 12:00:00 PST`, eli **14.11.2026 klo 22.00 Suomessa**. Tunnusta, numerotunnistetta tai viestisisältöjä ei tulostettu raporttiin.
- **Johtopäätös:** vastaanotto ja vastausten muodostus toimivat, mutta vanhentunut Meta-käyttötunnus estää lähetyksen. Palvelimen tai tunnelin terveystarkistus ei yksin todista WhatsApp-vastausten toimivuutta.

Ei viestilähetyksiä, jonon uusintoja, credential-muutoksia, restarteja, tilauskutsuja tai demo-/asiakastietojen nollauksia. Sovelluskoodi ei muuttunut, joten regressiosarjaa ei toistettu. Tarkistuksina nykyinen jonotila, prosessi/hakemisto, kaksi terveystarkistusta, Metan oma virhevastaus sekä dokumenttidiff.

Seuraava askel: jo varattu token-korjauschat jatkaa hyväksytyn uuden palvelintokenin luontia ja käyttöönottoa. Sen jälkeen tarvitaan oikean uuden WhatsApp-viestin lähetys- ja puhelintoimitusvarmennus. Paikallisen taulun klo 22.29 päivityksen mukaan käyttäjän tokeninluontihyväksyntä on jo saatu; tässä chatissa ei pyydetä sitä uudelleen eikä muuteta toisen työn asetuksia.
