# Erillisen live-demon vasteajan parannus 17.11.2026

Muutos koskee vain `deploy/selfhost-demo`-demopolkua. Normaali WhatsApp-agentti, sen asiakkuudet, tuotantotulkki ja verkkokauppa eivät muuttuneet. Sama paikallinen Qwen3 8B, konteksti 4096 ja CPU-palvelin jäivät käyttöön.

## Havaittu viive

Ollaman oikean ajon lokissa viimeisimmän mallipyynnön promptin käsittely oli 76 976 ms / 1729 tokenia ja generointi 52 542 ms / 131 tokenia: yhteensä noin 129,5 s. Generointinopeus 2,47 tokenia/s. Kahden CPU-ytimen laskenta hallitsee viivettä. Aiempi lämpimän mallin määrämuutos oli noin 43,2 s. Nämä eri syötteiden havainnot eivät ole kontrolloitu ennen/jälkeen-mallivertailu.

## Toteutus

- Selkeät yksittäisen olemassa olevan rivin määrämuutokset ja poistot käsitellään pienellä rajatulla tulkilla ennen mallikutsua. Esimerkiksi `Muuta maidon määrä 30 litraan.` tai `Poista maito.` Yhdistetyt ja epäselvät viestit palautuvat samalle mallille. Uusia tuotteita ei lisätä tällä tulkilla.
- Kohderivin ja yksikön pitää olla yksiselitteiset. Tuotteen muunnoksia tai pakkauskokoja ei arvata. Negatiiviset, nollat, murto-osaiset kappaleet, epäselvä tuhaterotin ja yhteensopimaton yksikkö eivät käytä tätä polkua. Maitoa ei kohdisteta kaurajuomaan tai tuntemattomaan maitoerikoistuotteeseen.
- Vain määrä tai poisto välitetään nykyiselle keskustelumoottorille. Päivä, allergiat, ruokavalio ja valittu tuote säilyvät sen normaalissa käsittelyssä.
- `DEMO_KEEP_ALIVE=30m` pitää mallin muistissa pidempään viimeisen mallikutsun jälkeen (sallittu 1m–60m). Pieni korimuutos ei itsessään lataa tai lämmitä mallia. Ollama voi myöhemmin vapauttaa mallin muisti-/palvelutilanteen mukaan. Tyhjä latauspyyntö vahvisti tämän ajon 30 minuutin säilytysajan ilman generointia; oikean mallin uutta keskusteluvastausta ei tarvittu kokeeseen.
- `DEMO_FAST_EDITS=false` poistaa nopean tulkin, jolloin myös määrämuutokset kulkevat alkuperäisen mallipolun kautta.

## Mittaukset

| Reitti ja synteettinen muutos | Palvelimen käsittely | HTTP-reitin kokonaisaika |
|---|---:|---:|
| Eristetty paikallinen demo, 30 L → 24 L | 48 ms | 69 ms |
| Eristetty paikallinen demo, 24 L → 30 L | 4 ms | 6 ms |
| Julkaistu Site → D1 → runner → live-demopalvelin, 30 L → 24 L | 42 ms | 3253 ms |
| Sama julkaistu reitti, 24 L → 30 L | 5 ms | 2952 ms |

Kaikissa neljässä määrämuutoksessa **0 mallikutsua**, yksi maitorivi ja sama laktoosittomuus sekä toimituspäivä. Julkaistun reitin kokeessa myös valittu tuote säilyi, samalla request-id:llä uusittu pyyntö palautti saman työn, ja alkuperäinen 30 litran testimäärä palautettiin. Julkaistun reitin aika sisältää HTTP-pyynnöt ja jonon pollauksen; se ei mittaa selaimen piirtämistä. Koe tehtiin aiemmassa erillisessä `service-test`-nimiavaruudessa, ei oikean käyttäjän korilla.

Nopea tulkki ohittaa mallin näissä tilanteissa. Tulos ei osoita mallin itsensä nopeutuneen eikä kaikkien viestien valmistuvan kolmessa sekunnissa. Poistopolku on yksikkötesteissä; sen julkaistun sivun vasteaikaa ei erikseen mitattu.

## Käyttöönoton jatkuvuus

Live-demon aiempi välitysprosessi oli pysähtynyt. Se käynnistettiin irrotettuna prosessina uudelleen. Muistissa olleen runner-tunnuksen tilalle asetettiin uusi Sites-runtime-salaisuus ja otettiin käyttöön sama lähdeversio 2, commit `961990ac3634cd61e15a0f7fab1f3305c0920a11`. Sites-julkaisu `appgdep_6afc8c7258648191b36967f27a17c7d4` onnistui. URL ja omistajan yksityinen yleisö säilyivät.

Tarkka viestityön id yhdistää Sites-käyttäjän paikalliseen `turn_results.message_id`-tunnukseen. Näin kahden aiemman käyttäjän istunnot voitiin säilyttää runnerin muistiin annetulla alias-kartalla ilman tietokannan uudelleenkirjoitusta. Päällekkäinen tai virheellinen alias torjutaan. Tätä karttaa pitää käyttää myös tämän runner-salaisuuden seuraavassa käynnistyksessä tai muodostaa se uudelleen samoista työn tunnuksista; pelkkä HMAC uudella salaisuudella avaisi eri korin. Salaisuuksia, istuntotunnuksia tai käyttäjän viestejä ei ole tässä raportissa tai lähdekoodissa.

Paikallinen sovellus sulkeutui hallitusti ja käynnistyi samasta demotilasta. Sen `drafts`- ja `turn_results`-taulujen rivisisältöjen SHA-256-tiivisteet täsmäsivät ennen/jälkeen: 2 luonnosta ja 4 tulosta, kaikki muuttumatta. Mallikontti jäi käyntiin. Tämän jälkeen tehtiin vain erillisen testi-istunnon muutokset. Live-palvelimen asetukset vahvistettiin `/api/status`-vastauksesta: `fastEdits=true`, `keepAlive=30m`, `isolated=true`, `sendsOrders=false`.

## Tarkistukset ja rajat

- Kohdistettu HTTP-/nopea tulkki-/istuntotunnustestisarja 8/8 läpi.
- Koko `npm test`: 478 testiä, 395 läpi, 0 virhettä, 83 katalogia tarvitsevaa ohitusta.
- Compose-asetusten validointi ja `git diff --check` läpi.
- Selain-QA jätettiin tekemättä hallitun Sites-ympäristön ohjeen mukaisesti, koska `cua_repl` ei ollut saatavilla. Oikea julkaistu HTTP-/jonopolku testattiin.
- Ei uusia henkilökohtaisia maksullisia mallikutsuja. Ei GPU-koetta, mallin hienosäätöä tai 14B-/32B-mallin vaihtoa.

Uusien vapaamuotoisten tilausten suurin nopeutus vaatisi mallille GPU-palvelimen. Nykyinen malli ja runner toimivat väliaikaisella pilvitestikoneella, jonka pysähtyminen katkaisee malliyhteyden; nämä muutokset eivät tee siitä pysyvää tuotantopalvelinta.
