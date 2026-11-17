# Erillisen mallidemon tarkistukset 17.11.2026

Kaikki uusi demokoodi on deploy/selfhost-demo-hakemistossa. Nykyisen palvelun koodia, asetuksia, kantoja tai Meta-liitosta ei muutettu. Demo hyödyntää nykyistä keskustelumoottoria kirjastona. Oletus qwen3:14b on palvelimelle tarkoitettu kokeiluehdokas, ei valmiiksi varmennettu tuotantomalli.

## Ohjelmiston tarkistukset

- Demon kaksi automaattista testiä läpi: puhdas lapsiprosessin ympäristö, vieraan tilahakemiston torjunta, tuotevalinta, 20→30 l yhdelle riville, viestin uusinnan idempotenssi, selainistuntojen eristys, mallikatkon säilyttämä kori, tilaamisen esto ja restartin yli säilyvä oma kanta. Näissä mallivastaukset on käsikirjoitettu.
- Oikean mallin hakusana laktoositonta maito lisättiin regressioksi. Demohaussa hyödynnetään nykyisen katalogikirjaston tokenize/stems-toimintoja, ei vain tarkkaa merkkijonovertailua.
- Chromium: sivu avautuu, valittu malli näkyy, viesti lisää 20 l, numerovalinta valitsee tuotteen, määränmuutos näyttää 30 l yhdellä rivillä, reload säilyttää korin ja toinen selainkonteksti on tyhjä. Ei sivun JavaScript-virheitä. Mallivastaukset tässäkin käsikirjoitettuja, joten tämä ei ole 14B-mallin laatutesti.
- Laaja npm test: 471 testiä, 388 läpi, 0 virhettä, 83 katalogiriippuvaista ohitusta. git diff --check ja uuden koodin syntaksit läpi.
- Oma Compose ja NVIDIA-overlay validoitu ilman tuotannon asetuksia. GPU-ajoa ja koko 14B-Compose-ketjua ei käynnistetty.

## Oikea Qwen3:8b-koe

Ollama 0.40.16, malli qwen3:8b, tunniste 500a1f067a9f ja noin 5,2 GB Q4-painot. Eristetty CPU-kontti, pilvi-inferenssi pois, vain loopback-portti. Painot ladattiin tmpfs:ään tämän testiympäristön levyrajan vuoksi.

Ensimmäiset latausyritykset päättyivät muistirajaan ennen vastausta. Demo palautti käsittelyvirheen ja tyhjän korin. Onnistuneessa kokeessa konteksti oli 4096, mmap käytössä ja CPU-repack poistettu käytöstä testikontin llama-serveriltä (LLAMA_ARG_REPACK=0); mallikutsun raja 300 s. Nämä olivat testiympäristön asetukset. Demopaketti ei muuta Ollaman binaareja.

1. **20 litraa laktoositonta maitoa perjantaiksi. Ei muita ruokavaliorajoituksia.** Oikea tulos: yksi maitorivi, 20 L, FREE_FROM_LACTOSE ja toimitus 20.11.2026. Noin 140 s. Hakusanaksi tuli laktoositonta maito, jonka vuoksi demon alun perin liian tarkka haku ei löytänyt tuotetta.
2. Demohaun korjaus ja demopalvelimen restart säilyttäen kokeen oma luonnos. Valintanäkymän päivitys näytti laktoosittoman maitopakkauksen, noin 36 s.
3. **Muuta maidon määrä 30 litraan.** Sama luonnos ja yksi rivi, 30 L, sama toimituspäivä ja sama laktoosittomuusrajaus. Noin 36 s.
4. Numerovalinta **1** valitsi Laktoositon maito 6 × 1 l -demotuotteen: listan tila review, yksi 30 L rivi ja viisi myyntipakkausta. Numerovalinta käsiteltiin sovelluskoodissa ilman uutta mallikutsua.
5. **Poista maito.** Rivi poistui ja lista tyhjeni, noin 41 s.

Koe sisälsi hakukorjauksen ja restartin kesken polun. Se osoittaa toimivan perusketjun tässä erillisessä demossa; se ei ole sama 12 tapauksen laatukoe kuin aiempi 0.6B-/1.7B-arviointi. Tuloksesta ei päätellä koko agentin laatua. CPU-viiveet eivät ole GPU-palvelimen suorituskykyarvio. 14B-/32B-mallit ja GPU-ajo ovat edelleen testaamatta.

Tässä ei käytetty Metaa, Valion rajapintaa tai henkilökohtaisia maksullisia tekoäly-API-avaimia. Tuotteet, hinnat ja asiakkuus olivat vain demon testitietoja. Kokeen palvelimet pysäytettiin; mitään ei julkaistu nykyisen palvelun tilalle.

## Docker-paketti

Build käytti tämän ympäristön julkista CA-varmennetta BuildKit-secretinä; TLS-tarkistusta ei poistettu. Käynnistyskoe löysi lähdetiedostojen omistajuuspuutteen node-käyttäjälle. Korjaus käyttää COPY --chown=node:node -omistajuutta vain tämän demon imagessa.

Useat vfs-rakennuskerrokset täyttivät testiympäristön levyn. Vapautettiin käyttämätöntä Docker-rakennusvälimuistia sekä poistettiin vain oma aiempi pysäytetty mallikokeen kontti, jonka tulokset olivat jo GitHubissa. Nykyisen sovelluksen kantoja tai Docker-levyjä ei poistettu. Korjattu image rakennettiin ja käynnistettiin node-käyttäjänä read-only-juuritiedostojärjestelmällä ja erillisellä kirjoitettavalla demotilalla. Sivun HTTP 200 sekä status (qwen3:14b, eristetty tila, tilauslähetys estetty, puuttuva malli ilmoitettu) varmennettiin. Tämä konttikoe ei tehnyt mallikutsua. Testikontti pysäytettiin ja poistettiin.
