# Korisivulla yksi nappi SIIRRY MAKSAMAAN

16.11.2026 ilta, Claude Code (maksusiirtymä-chat), varaus 9f75e7df.

## Käyttäjän pyyntö

Eelis halusi, että tilaus menee läpi yhdellä napin painalluksella ja että napissa lukee "Siirry maksamaan" eikä "Tarkista ja tilaa". Pyyntö välitettiin ensin sessiolle C, koska se muokkasi samaa vahvistuspolkua (katselmus #10). C pushasi f848556, vapautti tiedostot ja palautti muutoksen tälle chatille.

## Muutos

- `public/whatsapp-storefront-cart.html/js`: TARKISTA JA TILAA ja sen jälkeen näkynyt vihreä VAHVISTA DEMOTILAUS on korvattu yhdellä SIIRRY MAKSAMAAN -napilla.
  - Painallus pyytää ensin yhteenvedon (`näytä`). Se tekee tuoreen tarjouksen samasta luonnoksen versiosta, jota tilausmoottori vaatii ennen vahvistusta. Heti perään lähtee vahvistus `TILAA` lipulla `confirm: true`.
  - C:n #10-sääntö säilyy: muutoskenttään kirjoitettu "hyväksyn" tai "tilaa" ei tee tilausta.
  - Vahvistettu tilaus siirtyy suoraan demomaksusivulle (`/demo-payment.html#<tilausnumero>`). Sen Hyväksy demomaksu -painike on viimeinen vaihe, eikä rahaa veloiteta. Demomaksusivu odottaa uutta tilausta noin 12 sekuntia, ja julkaisija välittää tilauksen 5 sekunnin välein.
  - Nappi on käytössä vain valmiille korille (toimituspäivä, tuotteet ja määrät kunnossa). Keltainen huomio kertoo puutteet kuten ennenkin.
  - Hyväksyntää odottava tilaus jää sivulle ilman maksua.
  - Kesken jäänyt vahvistus uusitaan samalla viestitunnisteella, joten tilaus ei synny kahdesti.
  - Takaisin palatessa näkyvät kuittaus ja Siirry demomaksuun -linkki, eikä sivu siirry uudelleen.
  - Jos yhteenveto ei ole valmis, apurin vastaus näytetään. Vastauspaneelin otsikko on nyt "Apurin vastaus".
- `server/whatsapp/cart-link.mjs`: vain virheteksti: "Tilausta ei tehty. Tilaa painamalla SIIRRY MAKSAMAAN."
- `deploy/cloudflare/public/ostoskori.html`: Workersin tyhjän korikuoren nappi samalla tekstillä.
- `docs/ordering-demo.md`: vaihe 7 kuvaa uuden napin.
- Testit: `test/whatsapp-storefront-cart.test.mjs`, `test/audit-fixes-c.test.mjs` ja `deploy/cloudflare/test/cart-page.test.mjs` odottavat uutta tekstiä.

## Tarkistukset

- Korin, korilinkin, vahvistussäännön, korisiirron ja väärinkäytön testit 45/45, myös koko korin tilaustesti oikealla katalogilla.
- Koko `npm test` 333/338. Viisi Turso/libsql-testiä kaatuu, koska yhteisestä `node_modules`ista puuttuu `@libsql/client`. Ei liity tähän muutokseen.
- Workerin testit 54/54 ja `git diff --check` läpi.
- Selaimessa eristetty palvelin: omat väliaikaiset kannat, simuloidut hinnat, ei mallia eikä Metaa. Paikallinen välitys asetti Origin-otsakkeen julkiseksi testiosoitteeksi, koska korin API hyväksyy POSTin vain siitä.
  - Yksi painallus tuotti tilauksen AGW-20261114-0001 tilassa confirmed ja käynnisti siirtymän `/demo-payment.html#AGW-20261114-0001`. Testissä siirtymä pysäytettiin ennen sivulta poistumista.
  - Palvelimella oli tasan yksi tilaus.
  - Uudelleenlataus näytti kuittauksen ilman uutta siirtymää.
  - Keskeneräisellä korilla (päivä puuttuu) nappi oli pois käytöstä ja huomio kertoi puutteet.
- Oikeaa demomaksusivua ja puhelinta ei kokeiltu.

## Käyttöönotto

Korisivu tulee botilta, joten muutos näkyy vasta botin seuraavassa sovitussa restartissa tai pilvijulkaisussa. Workersin `ostoskori.html` tarvitsee Worker-julkaisun. Kumpaakaan ei tehty tässä työvaiheessa.
