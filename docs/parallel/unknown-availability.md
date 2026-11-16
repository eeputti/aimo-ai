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

**Avoinna:**
- Käyttöön vasta Vercel-julkaisussa (sessio E, Eeliksen luvalla).
- Pilven demokello on su 15.11., joten "huomenna" on bottille ma 16.11., vaikka oikeasti on ti 17.11. (oma sessio "Huomisen päivämäärä").
- "10 kpl" tulkitaan myyntieriksi (10 laatikkoa), ei kappaleiksi: vanha käytös.
- Kun viimeinen rivi poistetaan, luonnoksen toimituspäivä unohtuu.
- `TYOLOKI.md` oli toisen session varauksessa, joten tätä merkintää ei kirjattu lokiin.
