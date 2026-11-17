# Agentin vastausten parantaminen ja mallin hienosäätö

## Mitä kouluttaminen tarkoittaa tässä projektissa

Nykyinen agentti koostuu valmiista kielimallista, tehtäväohjeista, keskustelun tilasta, tuotetyökaluista ja sovelluksen tarkistuksista. Keskustelu agentin kanssa tai selfplay-ajon suorittaminen ei muuta mallin painoja. Testiajo löytää virheitä, mutta niiden korjaaminen vaatii ohjeen, koodin tai mallin muutoksen.

Parannuskeinot järkevässä järjestyksessä:

1. **Arviointiaineisto ja toistettava lähtötaso.** Valitaan synteettiset tai luvallisesti kerätyt ja anonymisoidut esimerkit oikeista ongelmista. Tarkistetaan oikea korin lopputila, määrät, yksiköt, toimituspäivä ja rajoitteet. Erikseen arvioidaan vastauksen selkeys ja tarpeelliset tarkennukset.
2. **Ohjeet, esimerkit ja sovelluskoodi.** Mallille muutama tarkistettu esimerkki, selkeä tehtävän rajaus ja oikea keskustelutila. Laskutoimitukset, hinnat, saatavuus ja tilausluvat pysyvät koodissa. Kaikkien ongelmien ratkaisu ei ole uusi kehote: esimerkiksi skeeman vastainen JSON torjutaan validoinnilla.
3. **Sopivan perusmallin valinta.** Mitataan kahta tai useampaa palvelimeen sopivaa avointa mallia samalla testiaineistolla ja samoilla aikakatkaisuilla. Pienen mallin puutteellinen suomen taito voi vaatia suuremman mallin ennen mitään koulutusta.
4. **LoRA-/QLoRA-hienosäätö tarvittaessa.** Valmista avointa mallia voidaan hienosäätää omilla hyväksytyillä syöte–vastauspareilla. Esimerkiksi puhekieliset ostopyynnöt, korjausviestit ja lyhyet tarkennukset sopivat aineistoon. Tämä on erillinen GPU:ta, koulutusajuria ja lisenssin tarkistuksen vaativa työ; Ollaman ajaminen ei itsessään tee hienosäätöä.

Hienosäädetty adapteri tai yhdistetyt painot viedään valitun mallin tukemalla tavalla ajopalveluun. Ollama- ja GGUF-yhteensopivuus pitää varmistaa juuri valitulle malliperheelle ja koulutustavalle; mikä tahansa adapteri ei lataudu mihin tahansa malliin.

## Aineisto ja arviointi

Aloitukseen kootaan esimerkiksi muutama sata laadukasta esimerkkiä, mutta määrä ei yksin takaa tulosta. Jokainen esimerkki sisältää aiemman korin/olennaisen keskustelutilan, uuden viestin ja ihmisen tarkistaman tavoitevastauksen tai rakenteiset muutokset. Myös epäselvät pyynnöt, puuttuvat määrät, negatiiviset esimerkit ja tilanteet, joissa ei saa lisätä tuotetta, ovat mukana. Tuotehintoja tai saatavuutta ei opeteta pysyvinä faktoina mallin painoihin.

Jaetaan aineisto harjoittelu-, kehitys- ja lopputestijoukkoon kokonaisina keskusteluina ja tapausperheinä. Saman keskustelun muunnelmia ei päästetä eri jakoihin. Tässä lisätty `eval/ollama-interpret-cases.mjs` on arviointiaineisto: jos sen vastaukset myöhemmin annetaan koulutukseen tai promptiesimerkeiksi, tarvitaan uusi riippumaton loppukoe.

Mallin itse generoima vastaus ei ole automaattisesti oikea koulutusesimerkki. Selfplay voi tuottaa ehdokkaita; väärän määrän, kadonneen allergiarajauksen tai keksityn tuotteen sisältävää vastausta ei opeteta oikeana. Automaattiset sisältötarkistukset ja ihmisen arvio täydentävät toisiaan.

Ennen tuotantoon siirtoa verrataan perusmallia, ohjemuutosta ja mahdollisesti hienosäädettyä mallia samoilla erillisillä testeillä. Seurattavat asiat: oikean korin osuus, väärät lisäykset/poistot, yksikkövirheet, rajoitteiden säilyminen, turhat tarkennukset, vasteaika ja resurssitarve. Hienosäätö voidaan hyväksyä vasta mitatun parannuksen jälkeen, ja vanha versio säilytetään palautusta varten.

## Nyt ajettava arviointi

```bash
AIMO_MODEL_PROVIDER=ollama OLLAMA_BASE_URL=http://127.0.0.1:11434 OLLAMA_MODEL=qwen3:8b \
  node scripts/ollama-eval.mjs --repeat 2 --out /tmp/aimo-ollama-report.json
```

Ajuri tekee 12 tulkintakoetta per toisto tuotannon `createModelInterpreter`-ohjeella ja skeemalla. Sääntövarapolku ei saa läpäistä mallin koetta. Malli ei arvioi itseään. Ajuri ei koske Metaan, Valion rajapintaan, asiakasdataan, tilauksiin tai tietokantoihin. Henkilökohtaisia maksullisia API-avaimia ei käytetä. Tämä rajattu tulkintakoe ei vielä mittaa koko WhatsApp-keskustelun sujuvuutta.

Projektissa on jo laajempi `whatsapp-selfplay-batch.mjs`-arviointi. Sen nykyinen käynnistys edellyttää Anthropic-avainta ja osa asetuksista/kustannusarvioista on Anthropic-kohtaisia, joten sitä ei tässä väitetä avaimettomaksi Ollama-koulutusputkeksi.

Painojen koulutusta, asiakkaiden keskustelujen keräämistä tai automaattista mallin vaihtoa ei ole tässä aloitettu.

Kokeiden toteutuneet tulokset ja rajaukset: [paikallisten mallien arviointi](evaluations/ollama-20261117.md). Näitä virheellisiä vastauksia ei käytetä hyväksyttyinä koulutusesimerkkeinä.
