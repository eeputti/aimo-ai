# Numeroliitoksen ja WhatsApp-tilauksen siirron hyväksymistesti

14.11.2026, Danielin alkuperäinen ostoslistan toteutuschatti. Käyttäjä pyysi testaamaan Eeliksen testipuhelinnumeron asiakassidoksen ja sopimaan Eeliksen Codexin kanssa, miten WhatsAppista verkkokauppaan kulkeva tilaus varmennetaan.

## Työnjako ja rajaus

| Osuus | Omistaja | Tila |
|---|---|---|
| Numeroliitoksen, asiakaserottelun, restartin ja listan siirron eristetty uusintatesti | Tämä Danielin toteutuschatti, tehtävä `c5db21ee` | Valmis: 35 läpi, 0 virhettä, 1 katalogiriippuvainen ohitettu. |
| Oikean gatewayn HTTP-loppuketju omilla väliaikaisilla kannoilla | Eeliksen Codex, tehtävä `750a63f3` | Aiemmin valmis: uusi testi 1/1, hänen koko sovellussarjansa 191/191. GitHub `c63435d`, raportti `shopping-list-order-api.md`. Ei jaeta uudelleen. |
| Eeliksen nykyisen lähettäjänumeron sidos, ajossa olevan version handoff-reitit ja sama asiakas kaupassa | Eeliksen koneen käyttöönotto-/tokenikorjauschat, nykyinen jatkotehtävä `11dc75ca` | Pyydetty MCP-viesteillä #95 ja #98; tämän pyynnön vastaanottokuittaus ja numerokohtainen tulos vielä odottavat. |
| Oikean nykyisen WhatsApp-listan vahvistus ja saman demotilauksen takaisinluku kaupassa | Sama Eeliksen käyttöönottochat yhdessä Eeliksen kanssa | Sovitetaan jo käynnissä olevaan `11dc75ca`-työhön. Ei nykyisen listan nollausta tai rinnakkaista testitilausta. |

Viestit toimitettiin tunnisteelle `eelis-chatgpt`, jota käyttää useampi Eeliksen Codex-chat. Vastaanottajan pitää nimetä suorittava chat ja kuitata osuus. Viestin toimitus ei todista vastaanottoa tai oikean puhelinkokeen suorittamista.

## Tässä ympäristössä tehty koe

Lähtöversio `origin/main fc29a0b`. Työpuu päivitettiin puhtaana fast-forwardilla, työloki ja nykyiset varaukset luettiin. Ei sovelluslähteiden muutoksia, Meta-asetuksia, salaisuuksien lukemista, käyttäjän kantoja tai käynnissä olevien palvelinten muutoksia.

```bash
node --disable-warning=ExperimentalWarning --test test/whatsapp.test.mjs test/whatsapp-ordering.test.mjs test/shopping-list-handoff.test.mjs test/shopping-list-order-api.test.mjs
```

**Tulos 36 testiä: 35 läpi, 0 virhettä, 1 ohitettu.** Ainoa ohitus on `shopping-list-order-api.test.mjs`, koska tässä kloonissa ei ole `data/catalog.json`:ia. Sen aiempi riippumaton onnistuminen on Eeliksen Codexin raportti, ei tämän ajon tulos. Handoff-testit käyttävät omaa synteettistä katalogia; Metan lähetys ja tuote-/tilauspalvelut ovat niissä testiriippuvuuksia. Oikeita Meta-, kielimalli- tai Valio-kutsuja ei tehty.

| Varmennettava asia | Tämän ajon näyttö |
|---|---|
| Liittämätön numero ei pääse ostosapuriin | Kanavatesti torjuu mallikutsun, ordering-testi torjuu luonnosmoottorin alustamisen. |
| Kutsukoodi toimii vain määritetystä numerosta | Väärä numero ei saa sidosta; oikea numero saa. Kertakäyttö, vanheneminen, yritysraja ja koodin tiivistäminen tarkistettu. |
| Automaattinen testiliitos koskee vain asetettua lähettäjänumeroa | `WHATSAPP_DEMO_PHONE`-alustus ja olemassa olevan sidoksen säilyminen tarkistettu. |
| Viestin lista kuuluu samaan asiakkaaseen selaimessa | Allekirjoitettu HTTP-webhook muodostaa listan; GET palauttaa saman luonnoksen, määrät, yksiköt ja ruokavaatimukset. Toisen testiasiakkaan lista ei peri sitä. |
| Korjaus kulkee molempiin suuntiin | Selaimen POST korjaa samaa luonnosta; seuraava WhatsApp-vuoro näyttää saman määrän. |
| Kannan uudelleenavaus säilyttää sidoksen ja listan | Kanavan restart-testi ja handoff-luonnoskannan uudelleenavaus läpi. |
| Sama viesti tai vahvistus ei aiheuta kaksoismuutosta | Meta-ID:n ja selain-UUID:n uusinnat läpi; yksi submit testitoteutukseen vasta nimenomaisesta TILAA-vahvistuksesta. |
| Vanha selainversio ei hyväksy uudempaa listaa | Väärä id/revisio ja vanhan vastauksen yhdistäminen uudempaan listaan torjutaan 409:llä. |
| Liitoksen peruminen lopettaa pääsyn | GET/POST ja vanha palvelinpuolen jäsenobjekti eivät palauta listaa; väärennetyt asiakasoikeudet eivät palauta pääsyä. |
| Saman numeron uudelleenyhdistäminen ei siirrä vanhan yrityksen ostoslistaa | Uusi regressio tässä työvaiheessa: uusi buyer/sidos, vanha asiakasvalinta ja selainvahvistus 404, vanha jäsenobjekti torjutaan. Uudessa listassa ei vanhaa tuotetta, päivää tai ruokavaatimusta. Vanhan webhookin uusinta ja restart eivät palauta vanhaa listaa. |
| Tyhjennys aloittaa uuden keskustelujakson | Vanha lista ei palaudu nollauksen, uuden listan tai restartin jälkeen. |
| Vain paikallinen testikauppa saa listan | Proxy-, tunneli- ja vieraan originin HTTP-pyynnöt torjutaan. |

## Oikean Eelis-puhelimen kokeen portit

Tätä osuutta ei voi suorittaa tästä erillisestä Linux-kloonista: Eeliksen todellinen puhelin, prosessi ja kannat ovat hänen palvelinkoneellaan.

1. **Tunnista nykyinen prosessi ja versio vain lukemalla.** `/healthz` ei yksin todista oikeaa koodiversiota tai Meta-toimitusta. Raportin mukaan toimiva puhelinkanava käynnistettiin `27ee93b`-snapshotista; listan siirto tuli vasta `4d57190`:ssa. Varmista, että `GET /api/assistant/whatsapp-list` toimii eikä palauta vanhan version 404:ää. Mahdollisen koodipäivityksen ja yhden hallitun restartin tekee vain nykyinen käyttöönoton omistaja, säilyttäen samat viisi kantaa ja nykyisen listan.
2. **Varmista numero → asiakas.** Vertaa yksityisesti Eeliksen omaa lähettäjänumeroa nykyisen WhatsApp-kannan aktiiviseen `members`-sidokseen. Botin numero tai `WHATSAPP_PHONE_NUMBER_ID` ei ole asiakkaan lähettäjänumero. Vertaa saman sidoksen buyerId:tä listan GETiin ja paikallisen kaupan asiakaskontekstiin. Raportoi vain täsmää/ei täsmää ja tarvittavat lyhyet luonnos-/tilausviitteet, älä numeroita tai avaimia. Jos sidosta ei ole, omistaja käyttää nykyistä kutsukoodipolkua tai sovittua testialustusta; älä luo uutta sidosta vanhan päälle varmuuden vuoksi.
3. **Varmista oikea viestitoimitus.** Eelis lähettää itse uuden viestin testinumeroon ja kuittaa vastauksen näkyvän puhelimessa. Palvelimella vastaanoton ja Metan hyväksymän vastauksen tunnisteen pitää täsmätä tähän viestiin. Aiempi onnistunut puhelinkuittaus on kirjattu klo 23.01 viestin jälkeen, mutta se ei vielä varmista verkkokauppasiirtoa.
4. **Jatka nykyistä listaa.** Käytä Eeliksen nykyisiä tuotteita ja määriä. Esimerkkisarja `20 l maitoa ja 5 l kermaa maanantaiksi` → `laktoositon` → `maitoa 30 litraa` on tarkoitettu vain erilliseen uuteen testiluonnokseen, jos nykyisen listan omistaja on niin päättänyt. Ei automaattista tyhjennystä.
5. **Avaa sama lista kaupassa.** Palvelinkoneella `http://localhost:4749/assistant.html`, oma testiasiakas, Päivitä lista → Jatka listaa ostosapurissa. Vertaile luonnos-ID, revisio, tuotteet, määrät/yksiköt, ruokavaatimukset ja toimituspäivä. Varmista, että määräkorjaus näkyy myös toisessa kanavassa. Ennen TILAA-viestiä tilausmäärä ei kasva.
6. **Vahvista kerran.** Testaaja valitsee tuotteet ja näkee hinnat, toimituksen ja yhteenvedon ennen nimenomaista TILAA-viestiään. Jos mandaatti vaatii erillisen hyväksyjän, tila pysyy `pending_approval`, kunnes se hyväksytään nykyisessä kaupassa. Varmista yksi gatewayn demotilaus samalla ostajalla ja nykyisillä listatiedoilla osoitteessa `http://localhost:4749/?shop=orders`. Ei Valion tuotantotilausta.
7. **Kuittaa näyttö.** Omistaja kirjaa ajokoodin SHA:n, kellonajat, vastaanottokuittauksen, asiakassidoksen täsmäämisen, luonnos-/tilausviitteet, tilan ja ehjän audit-ketjun. Uusintatapahtumien kaksoistilausvarmennus on jo tehty eristetyssä HTTP-e2e:ssä; oikeaa ostoslistaa ei tarvitse lähettää uudelleen tämän vuoksi.

## Hyväksymistulos

**Automaattinen numeroliitos/listasiirto: läpi tässä ympäristössä yllä olevin rajauksin.** Oikean gatewayn ketju: aiemmin läpi Eeliksen Codexin erillisessä kokeessa. **Eeliksen tämänhetkinen numero → nykyinen lista → käytössä oleva verkkokauppa → yksi vahvistettu tilaus: odottaa käyttöönottochatin nimettyä tulosta.** Pelkkää testikoodia, viestin toimitusta MCP:hen tai aiempaa puhelinvastausta ei merkitä tämän koko ketjun läpäisyksi.
