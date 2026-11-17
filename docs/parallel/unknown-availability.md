# Tuntematon saatavuus: rehellinen vastaus ja vastaavat tilattavat tuotteet (17.11.2026, Claude Code)

**Havainto (Eeliksen selainkokeilu 17.11. klo 00.10):** "1000 litraa jäätelöö" keskiviikoksi, perjantaiksi ja "millo saa jäätelöö?" saivat joka kerta saman vastauksen "Saatavuutta ei saatu nyt tarkistettua … Kokeile toista päivää". Botti ei kertonut, ettei toinen päivä auta, eikä ehdottanut mitään tilalle.

**Syy:** Valion testirajapinnan osoite `junction26.valioaimo.fi` ei enää ratkea (tarkistettu 17.11.), joten botti näkee saatavuuden vain välimuistiin aiemmin tallennetuille tuotteille. Välimuistissa on 1 119 tuotteen saatavuustieto, joista 882 tuotteella "ok", mutta yhtään jäätelöä ei ole joukossa (349 jäätelötuotetta katalogissa). Tieto puuttuu siis kaikilta päiviltä.

**Muutos:**
- `storefront.mjs`: tuntemattoman saatavuuden kortti kertoo pyydettyjen tuotteiden tunnisteet (`unknownIds`). Uusi `knownAlternatives` hakee ehdokkaat tuotteista, joiden viimeisin oikea saatavuus oli "ok" (`valioApi.lastKnownOkIds`, yksi kantakysely `db.apiCache.latestAll`). Ruokavalio- ja allergeeniehdot pätevät, eikä non-food-tuotteita tarjota. Ehdokkaat järjestetään tuoteryhmän läheisyyden ja lämpötilan mukaan (enintään 150). Valitut tarkistetaan tavallisella tilattavuusehdolla. Eri mittayksikössä (1000 l → leivokset) hinta on yhdestä myyntierästä ja määrä kysytään.
- `order-tools/nearby.mjs`: nopea malli (Haiku) valitsee ehdokkaista enintään viisi samaan rooliin sopivaa ja kirjoittaa ensin pyydetyn tuotteen roolin. Ilman roolikenttää Haiku palautti jäätelölle tyhjän listan kolmesti peräkkäin, roolikentän kanssa samat leivokset kolmesti. Malli saa vain nimet ja palauttaa vain listan tunnisteita; hintaa tai saatavuutta se ei päätä. Tulos pidetään muistissa 30 min. Ilman mallia kelpaavat vain saman alaryhmän tuotteet.
- `order-tools/index.mjs`: tuntemattomalle saatavuudelle vaihtoehtorivi `exact: false, availabilityUnknown: true, alternatives: true`. Valinta vaihtaa rivin tuotteen (`replaceTerm`), ja eri mittayksikössä määrä kysytään (`askQuantity`). Viesti on nyt "En saa nyt tarkistettua saatavuutta: X. Siksi en voi luvata sitä millekään päivälle."
- `order-conversation/index.mjs`: tuntemattomalle saatavuudelle ei tehdä kiirekokeilua seuraaville päiville, eikä vastaus kehota kokeilemaan toista päivää. Toistuva tilanne saa lyhyen eri viestin. Vastaavien otsikko kertoo saatavuuden olevan tarkistamatta ja ohjeen "poista X". Valinta vaihtaa rivin tuotteen.
- `whatsapp/model-guard.mjs`: mallin vapaasta tekstistä pudotetaan virke, jossa on sisäinen sana "tilausmoottori" (botti kirjoitti "Jäätelön saatavuus selviää tilausmoottorista").

**Tarkistukset:** uusi `test/unknown-availability.test.mjs` 3/3, `whatsapp-link-substitutes` -testin viestiodotus päivitetty. `npm test` 405/411: kuusi libsql-testiä kaatuu, koska yhteisestä `node_modules`ista puuttuu `@libsql/client`. Muutos ei liity niihin. Toisto Macin välimuistikannan kopiolla, ratkeamattomalla rajapinnalla, `VALIO_FALLBACK=last-known` ja pilven demokello: ilman mallia rehellinen vastaus ja lyhyt toisto. Oikealla Haikulla ke 18.11. kaksi leivosta, pe 20.11. kolme, ja valinta "1" + "10 kpl" johti valmiiseen luonnokseen 555,50 €. Mallikutsuja noin 15, yhteensä alle 0,10 USD. Ei Meta-, tilaus- eikä julkaisukutsuja.

**Julkaistu Eeliksen luvalla ("Yes, deploy") 17.11. klo 9.08:** Vercel `aimo-whatsapp`, julkaisu `aimo-whatsapp-7fkukca7d`. Tilannevedos `/private/tmp/aimo-vercel-7262563` oli silloinen tuotanto 8b29cff, jonka päälle oli poimittu 56fe2df ja testin kirjainkokokorjaus (32c5c0b). Koko mainia ei julkaistu, koska bdee619 (henkilökohtaiset tilauslinkit) pitää julkaista yhtä aikaa Workerin kanssa. Sessio E vahvisti, ettei sillä ollut julkaisua kesken. Sessio H julkaisee koko mainin (botti ja Worker) tämän päälle, ja se sisältää saman korjauksen; asiasta ilmoitettiin H:lle ja E:lle. Vedos erosi edellisestä tuotantovedoksesta vain tämän korjauksen osalta. Vedoksen testit 397/403, ja kaatuvat ovat samat kuusi libsql-testiä. Varmennettu: `/healthz` `host: cloud` ja webhookin GET-vahvistus 200 haasteineen. Selainkeskustelu live-sivulla (oma testiasiakas, ei tilausta): "tarviin 1000 litraa jäätelöä keskiviikoksi" sai vastaukseksi kaksi tilattavaa leivosta, tiedon tarkistamattomasta saatavuudesta ja ohjeen "poista jäätelö". "millo saa jäätelöö?" sai mallin vastauksen ja saman listan, ei kehotusta kokeilla toista päivää.

**Avoinna:**
- Pilven demokello poistettiin jo 8b29cff:n julkaisussa klo 0.26 (`docs/parallel/whatsapp-real-date.md`), eli "huomenna on maanantai 16.11." -sekaannus koski vain sitä edeltänyttä kokeilua.
- Korjattu (Eeliksen pyyntö "korjaa toi perjantai-päivänvaihto myös"), katso alla.

## Jatko 17.11. aamulla: päivävastaus valintalistan aikana ja valitsijan uusinta

**Havainto:** live-kokeessa "perjantai?" sai valintalistan aikana dialogimallilta vastakysymyksen "Tarkoitatko toimitusta perjantaille 20.11.?", eikä päivä vaihtunut. Syy: vain numerot, "näytä lisää" ja "halvin" ohittavat dialogimallin (`CONTROL`), ja malli luki kysymysmerkin kysymykseksi (route chat).

**Muutos:**
- `whatsapp/dialogue.mjs`: `isDateOnly` tunnistaa viestin, jossa on pelkkä toimituspäivä ja enintään muutama täytesana: "perjantai?", "entä torstaiksi", "pe 20.11.", "huomiseks sit", "käykö keskiviikko?", "siirretään perjantaille". Sellainen viesti menee suoraan tilausmoottorille kuten numerovalinta, ilman mallikutsua. Viestit, joissa on muutakin sisältöä ("perjantaina tarvitaan 10 l maitoa", "miksi perjantai?", "millo saa jäätelöö?"), kulkevat ennallaan.
- `order-tools/nearby.mjs`: sama valitsijan kysymys antoi jäätelölle leivokset kahdesti kolmesta ja kerran tyhjän listan. Tyhjä tulos kysytään nyt kerran uudelleen, eikä sitä tallenneta 30 minuutin välimuistiin.

**Tarkistukset:** `test/unknown-availability.test.mjs` 4/4: uusi testi tarkistaa, että valintalistan aikana "perjantai?" menee tilausmoottorille, dialogimallia ei kutsuta eikä vastakysymys näy, ja että tunnistus erottaa päivävastauksen muista viesteistä. `npm test` 427/427. Oikealla mallitulkilla (Haiku, oikea päivämäärä ti 17.11., välimuistikannan kopio, ratkeamaton rajapinta) luonnoksen päivä vaihtui ke 18.11. → "perjantai?" pe 20.11. → "entä torstaiksi" to 19.11., ja jokaiselle päivälle näytettiin tilattava leivos. Ei Meta-, tilaus- eikä julkaisukutsuja.

**Käyttöönotto:** tarvitsee botin Vercel-julkaisun. Worker ei muutu.
- "10 kpl" tulkitaan myyntieriksi (10 laatikkoa), ei kappaleiksi: vanha käytös.
- Kun viimeinen rivi poistetaan, luonnoksen toimituspäivä unohtuu.
- `TYOLOKI.md` oli toisen session varauksessa sekä korjauksen että julkaisun aikaan, joten merkintä on vain tässä raportissa.
