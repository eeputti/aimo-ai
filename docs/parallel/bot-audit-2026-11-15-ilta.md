# WhatsApp-botin katselmointi: miksi se tarvitsee koneen ja mikä on rikki

15.11.2026 klo 17.45–18.15, Claude Code (katselmointichat). Käyttäjän pyyntö: käy läpi kaikkien tekijöiden työ, etsi mikä mättää ja selvitä, miksi botti ei toimi pilvessä vaan vaatii koneen. Tämä vaihe on tarkistus ja raportti: sovelluskoodia, palvelimia, asetuksia tai kantoja ei muutettu.

## Miksi botti tarvitsee koneen

WhatsApp-botti ei ole pilvessä. Pilvessä (Cloudflare Worker) ovat vain landing, ilmoittautuminen, julkinen tilausnäkymä ja demomaksu. Itse keskustelu, tuotehaku, kori ja tilaukset pyörivät Eeliksen Macilla:

```text
Puhelin → Meta → Cloudflaren pikatunneli (trycloudflare.com) → Node-palvelin Macilla, portti 4749
                                                                  ├─ 5 SQLite-kantaa: data/whatsapp*.db
                                                                  ├─ katalogi data/catalog.json (17 546 tuotetta)
                                                                  └─ tilausjulkaisija → Worker (maksusivu)
```

Kaikki kolme Macin prosessia (Node-palvelin, tunneli, tilausjulkaisija) on käynnistetty käsin `nohup`-komennolla. Niitä ei käynnistetä uudelleen automaattisesti, ja Mac on asetettu nukkumaan minuutin käyttämättömyyden jälkeen (`pmset sleep 1`).

**Todiste tältä päivältä:** viimeinen käsitelty viesti oli klo 03.01. Mac siirtyi lepotilaan klo 03.17 ja sen jälkeen kymmeniä kertoja. Seuraava viesti käsiteltiin vasta klo 16.xx, kun toinen chatti oli palauttanut tunnelin uudella osoitteella ja vaihtanut sen Metan callbackiin.

## Löydökset

| # | Vakavuus | Mikä on vialla | Todiste | Korjaus |
|---|---|---|---|---|
| 1 | Kriittinen | **Klo 17 jälkeen mitään ei voi tilata.** Valion testirajapinta on jäädytetty: toimitus aina ma 16.11. ja tilausraja su 15.11. klo 17.00, pyydetystä päivästä riippumatta. `DEMO_NOW` ei ole asetettu, joten botti käyttää oikeaa kelloa. | Kaksi saatavuuskutsua klo 17.47 (pyydetty 17.11. ja 18.11.) → päivä 16.11., raja 15.11. 17.00. Hintavälimuistin 322 Stock-riviä: raja 15.11. 17.00; 465 Terminal-riviä: rajat jo 10.–13.11. `server/gateway/service.mjs:122` ja `server/storefront.mjs:26` hylkäävät umpeutuneen. | Heti: `DEMO_NOW=2026-11-15T09:00:00+02:00` `.env.whatsapp`:iin ja restart. Kello kulkee eteenpäin käynnistyksestä, joten tämä antaa noin 8 tuntia. Pysyvään ajoon tarvitaan kellon kierto (pieni muutos `server/gateway/clock.mjs`:ään) tai simuloitu hintatila. |
| 2 | Kriittinen | **Kaikki pyörii Macilla ilman automaattista uudelleenkäynnistystä.** Lepotila, kannen sulkeminen, verkon katko tai uudelleenkäynnistys pysäyttää botin. | Prosessit 77774 (Node), 77519 (tunneli) ja 76578 (ilmoittautumisseuranta) `nohup`-ajoina, ei launchd-palvelua. `pmset sleep 1`. Ajossa oleva koodikopio `/private/tmp/aimo-whatsapp-runtime-3bee913` ja tunnelin ohjelma `/private/tmp/aimo-whatsapp-tools/`; macOS tyhjentää `/private/tmp`:n uudelleenkäynnistyksessä. | Pilveen siirto (alla). Jos Mac jää: launchd-palvelut, `caffeinate`, koodikopio pois `/private/tmp`:stä. |
| 3 | Korkea | **Tunnelin osoite vaihtuu joka käynnistyksellä.** Metan callback ja `WHATSAPP_PUBLIC_URL` pitää vaihtaa käsin, ja jo lähetetyt korilinkit lakkaavat toimimasta, koska ne osoittavat vanhaan tunneliin. | Pikatunneli `mind-bristol-expects-wit.trycloudflare.com` (vaihdettu klo 16.39). Lokissa yhteyskatkos klo 17.16 (`no recent network activity`), joka palautui itsestään. | Pysyvä osoite: pilvipalvelin, nimetty Cloudflare-tunneli omalla domainilla tai Worker-välityspalvelin. |
| 4 | Korkea | **Tilausjulkaisija ei ole käynnissä.** WhatsAppin maksunappi vie Workerin sivulle `/demo-payment.html#AGW-…`, joka hakee tilauksen Workerin kannasta. Ilman julkaisijaa uusi vahvistettu tilaus ei päädy sinne, joten maksusivu ei löydä sitä. | Julkaisija oli käynnissä klo 02.45 (`docs/parallel/whatsapp-links-rollout.md`), nyt `ps` ei löydä `publish-orders`-prosessia. Klo 16.39–16.42 palautettiin vain tunneli ja Node. | Käynnistä `deploy/cloudflare/publish-orders.mjs --watch --order-events` uudelleen, ja pilviajossa samaan palveluun. |
| 5 | Korkea | **Ajossa oleva botti on vanhempi kuin GitHub.** Puuttuu 025fabf: valitusten ohjaus asiakaspalveluun, ilmoitus poistetusta tuotteesta ja päivä ensin -korjaus. | Ajossa snapshot 3bee913; `server/order-conversation/index.mjs` ja `server/whatsapp/dialogue.mjs` eroavat origin/mainista (ad69e14). | Restart uusimmasta commitista samalla kertaa kuin löydös 1. |
| 6 | Keskitaso | **Demomaksun linkki on julkisessa tilauslistassa.** Kuka tahansa voi merkitä minkä tahansa demotilauksen maksetuksi ja laukaista vahvistussähköpostin. Rahaa ei liiku. Aamun kokonaiskokeen löydös 2 on yhä auki koodissa. | `deploy/cloudflare/src/index.ts:106–115` lisää `describeDemoPayment`-tuloksen jokaiseen tilaukseen; `demo-payment.ts:67–72` palauttaa allekirjoitetun maksulinkin. Reitti ei vaadi tunnistusta. | Poista `demoPayment.url` julkisesta listasta; anna linkki vain WhatsAppin kautta tilauksen tekijälle. |
| 7 | Keskitaso | **Vain käsin hyväksytyt numerot voivat käyttää bottia.** Metan testinumerolle voi viestiä enintään viisi esittelijän Metassa hyväksymää vastaanottajaa. Landing-lomake ei hyväksy ketään. | `docs/parallel/whatsapp-verification-diagnosis.md`. | Oma WhatsApp-yritysnumero (prepaid käy) tai Metan 555-numero. |
| 8 | Matala | **Kaksi testiä riippuu seinäkellosta.** Illalla tervehdys on "Iltaa!" eikä "Moi!", ja klo 10 jälkeen tilausraja on umpeutunut. | GitHubin uusin koodi 268/270: `test/whatsapp-dialogue.test.mjs:133`, `test/whatsapp-pilot-fixes.test.mjs:51`. Sovellus toimii oikein; testit eivät kiinnitä kelloa. | Kiinnitä aika testeissä. |
| 9 | Matala | **Yön vastausvirheiden syy ei tallennu.** Viisi vastausta jäi lähettämättä klo 00.56–03.01 (`META_HTTP_400`, kolme yritystä kukin). Kantaan tallentuu vain HTTP-koodi. | `inbox.error`-sarake. | Tallenna Metan virhekoodi (esim. 131047) virheen yhteyteen. |
| 10 | Matala | **Yhteinen työkansio on jäljessä.** `main` on 52 committia jäljessä GitHubista, ja siinä on 43 commitoimatonta tiedostoa. `services/team-mcp` on poistettu GitHubista. | `git status` klo 17.44. | Uusimman koodin ajo tehdään erillisestä kopiosta; vanhaa työpuuta ei käynnistetä palvelimeksi. |

## Muiden tekijöiden työ

- Danielin 15.11. commitit ovat dokumentteja ja demovideoita. Koodiin ne eivät koske.
- Peetun (Wonderlust-gi) viisi committia 14.11. ovat tilausvahvistuksen sähköpostipohja. Pohjaa käyttää Workerin vahvistussähköposti.
- Aleksin kolme committia 14.11. ovat varademo ja koordinaattorin tarkistus. Ne arkistoitiin GitHubista commitissa b6f1efd.
- Kaikki keskustelu-, haku-, kori- ja Worker-koodin muutokset ovat Eeliksen tunnuksella tehtyjä AI-chattien vaiheita. Niiden testit (268/270) menevät läpi kahta kelloriippuvaa testiä lukuun ottamatta.

## Pilveen siirron vaihtoehdot

| Vaihtoehto | Mitä tarvitaan | Toimiiko ilman Macia | Hinta | Työ |
|---|---|---|---|---|
| **A. Fly.io-kontti (suositus)** | Valmis `deploy/whatsapp/Dockerfile`, yksi aina päällä oleva kone ja 1 Gt:n levy kannoille, allekirjoitusavaimelle ja katalogille. Pysyvä `https://<nimi>.fly.dev`, Metan callback vaihdetaan kerran. Julkaisija samaan koneeseen. | Kyllä | Noin 3–5 $/kk, luottokortti; tarkista hinta | 1–2 h, Dockerfileä ei ole vielä koskaan rakennettu |
| B. Pieni VPS (esim. Hetzner) | Sama kontti, Docker Compose, TLS-välityspalvelin, palvelimen ylläpito | Kyllä | Noin 4–5 €/kk | 2–3 h |
| C. Mac jää, mutta vakaammin | launchd-palvelut kolmelle prosessille, `caffeinate`, koodi pois `/private/tmp`:stä, pysyvä osoite Worker-välityspalvelimella | Ei: Macin pitää olla auki ja verkossa | 0 € | 30–60 min |
| D. Koko botti Cloudflare Workersiin | SQLite → D1, katalogi → R2/KV, jonot, uudelleenkirjoitus | Kyllä | Pieni | Päiviä |

Render ja muut nukahtavat ilmaistasot eivät sovi: Meta odottaa nopeaa vastausta, ja kannat tarvitsevat pysyvän levyn.

Kaikissa pilvivaihtoehdoissa tarvitaan lisäksi:

- Yksi palvelinprosessi kantaa kohden. Mac pysäytetään ennen kuin pilviversio käynnistetään, ja kannat siirretään sen jälkeen.
- Katalogi on haasteen rajoitettua aineistoa. Se saa olla vain yksityisellä levyllä, ei kontin imagessa eikä GitHubissa. Varmista, että haasteen ehdot sallivat tämän.
- Löydös 1: jäädytetyllä rajapinnalla pysyvä pilviajo tarvitsee demokellon, joka ei kulje tilausrajan yli. Vaihtoehto on simuloitu hintatila, mutta silloin hinnat eivät ole Valion dataa.

## Tarkistukset

- Luettu GitHubin `main` (ad69e14) erillisessä kopiossa, `TYOLOKI.md`, aamun kokonaiskoe ja Meta-vahvistuksen selvitys.
- `npm test` uusimmalla koodilla erillisessä kopiossa ilman avaimia ja simuloiduin palveluin: 268/270, kaksi kelloriippuvaa virhettä (löydös 8).
- Vain luku -tarkistukset: prosessit, portit, `pmset`, terveysreitit (paikallinen 200, tunneli 200 `ordering-demo`, landing 200), kantojen rivimäärät ja virhekoodit (ei viestien sisältöä tai numeroita), hintavälimuistin tilausrajat.
- Kaksi saatavuuskutsua haasteen testirajapintaan löydöksen 1 varmistamiseksi.
- Ei restartteja, asetusmuutoksia, viestejä, tilauksia, Meta-muutoksia tai kantakirjoituksia.
