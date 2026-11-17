# Aimon ostosapurin white label -palvelu

Suositus 17.11.2026. Tulkinta: palvelu myydään eri yrityksille niiden omalla brändillä ja taustajärjestelmillä. Tämä on ehdotus tuotteistamisesta ja arkkitehtuurista, ei toteutettu monen yrityksen tuotantopalvelu tai käyttäjän hyväksymä käyttöönotto.

## Lähtöpäätös

**Yksi ylläpidetty koodipohja, aluksi yrityskohtaiset käyttöönotot ja tietokannat, kielimallit API:sta palvelua myyvän yrityksen laskutuksella.** Ensimmäiset 2–3 maksavaa pilottia samalta toimialalta. Jaettu SaaS-ajoympäristö automatisoidaan käytön ja toistuvien tarpeiden varmistuttua. Oma GPU säilyy myöhempänä mallivaihtoehtona.

Alkuvaiheen yrityskohtainen käyttöönotto tarkoittaa samaa versiota samasta sovelluspaketista, mutta omia prosesseja/kontteja, tietokantoja ja tunnuksia. Koodi ei haarautuisi jokaiselle asiakkaalle. Palvelut voivat toimia samalla hallitulla pilvi-infrastruktuurilla, kun eristys ja kapasiteetti on sovitettu tarpeeseen; jokaiselle yritykselle ei tarvita GPU-konetta.

## Mitä yritys ostaa

Omalla nimellä toimivan WhatsApp-tilausapurin, joka kokoaa asiakkaan viesteistä tarkistettavan ostoslistan ja siirtää sen yrityksen omaan verkkokauppaan. Pakettiin kuuluvat tuotetiedot, asiakasliitokset, sovitut tilausvaltuudet, seuranta ja ylläpito. Ostoskorin siirtäminen, ostajan hyväksyntä ja tilauksen lähettäminen ovat erillisiä vaiheita.

| Osa | Yhteinen tuote | Yrityskohtainen osa |
|---|---|---|
| Käyttöliittymä | Sama toiminnallisuus ja päivitettävä ohjelmisto | Logo, värit, nimi, tekstit ja verkkotunnus |
| WhatsApp | Viestien käsittely ja virheistä palautuminen | Yrityksen oma numero ja sille myönnetyt käyttöoikeudet |
| Agentti | Tulkinta, työkaluskeemat ja tilauksen tarkistukset | Ohjeet, kieli, palvelulupaukset ja hyväksymissäännöt |
| Tuotteet ja kauppa | Yhteinen liitäntäsopimus | Katalogi, asiakaskohtaiset hinnat, saatavuus ja ostoskorirajapinta |
| Tiedot | Sama tietomalli | Asiakkaat, keskustelut, korit, tilaukset ja historiat erillään |
| Mallipalvelu | Yhteinen Anthropic/Ollama-sovitus | Mallivalinta, käyttöraja ja kustannusseuranta |

Yritysasiakas tarkoittaa palvelun ostavaa organisaatiota (`tenant`). Sen sisällä voi olla useita kaupan ostajia ja heidän työntekijöitään. Nykyinen yksittäinen `buyerId` ei sellaisenaan määritä koko palveluasiakkaan tietorajaa.

## Mallit ja kustannukset

Palvelua myyvälle yritykselle oma Anthropic-organisaatio, laskutus ja palveluavaimet. Pilottiyrityksille voidaan varata omat workspacet, avaimet ja kulurajat yhteisen laskutuksen alle. Workspacet auttavat API-kulujen ja käyttöoikeuksien erottelussa; sovelluksen oma tietojen eristys toteutetaan lisäksi. Asiakkaalle voidaan myöhemmin tarjota vaihtoehdoksi oma API-organisaatio/avain tai erillinen mallipalvelu sopimuksen mukaan.

Mallit valitaan tilaustestien perusteella: edullinen tehtävään riittävä malli perustulkintaan ja tarvittaessa vahvempi vaikeisiin pyyntöihin. Varmasti tunnistetut yksinkertaiset korimuutokset voidaan tehdä ohjelmalogiikalla. Katalogi, hinnat, saatavuus ja tilausoikeudet tulevat työkaluista. Asiakkaan ohje tai mallin vastaus ei saa muuttaa palvelinpuolen käyttöoikeuksia.

Edellisen laskelman oletuksilla **10 yritystä × 1000 Sonnet 5.5 -mallikutsua kuukaudessa = noin 110 $ API-kuluja yhteensä** (3000 syöte- ja 500 tulostokenia/kutsu). Jos kukin asiakasviesti tarvitsisi kolme tämän kokoista kutsua, 10 × 1000 viestin vastaava laskelma olisi 330 $. Nämä ovat käyttöoletuksia, eivät mitattuja asiakaskuluja. Palvelimet, WhatsApp, integraatiot ja ylläpitotyö tulevat lisäksi. [Hintalaskelma ja lähteet](gpu-api-costs.md).

Omaa GPU:ta arvioidaan vasta kokonaiskäytön, ruuhkahuippujen ja laadun perusteella. Jaettu GPU voi palvella useita yrityksiä, mutta vaatii yrityskohtaisen jonotuksen, kapasiteettirajat ja samat tietorajat kuin API-ratkaisu. Nykyisellä Qwen3 8B/14B -kokeella ei ole osoitettu Claudea vastaavaa tilauslaatua tai monen käyttäjän GPU-kapasiteettia. Erillinen asiakasympäristö omalla mallilla voidaan myöhemmin hinnoitella kaikkine palvelin- ja ylläpitokuluineen.

## Nykyisestä koodista nähty lähtötilanne

- `server/whatsapp/runtime.mjs` lukee ympäristöstä yhden `WHATSAPP_PHONE_NUMBER_ID`-numeron ja sen tokenin. `channel.mjs` hyväksyy viestejä vain määritetyn numeron tunnukselle. Tämä sopii ensimmäisten asiakkaiden erillisiin käyttöönottoihin.
- `server/whatsapp/ordering.mjs` erottaa keskustelua numerotunnuksella, asiakkaalla ja binding-versiolla sekä tarkistaa ostajan oikeuksia. Asiakasliitoksia varten on nimenomaisesti demoadapteri; tuotannon asiakkuus ja valtuus liitetään oikeaan asiakasjärjestelmään.
- `server/order-conversation/store.mjs` tallentaa luonnokset ja viestitulokset tietokantaan keskustelun/viestin tunnuksella. Tauluissa ei ole erillistä palveluasiakkaan `tenant_id`-saraketta.
- `server/config.mjs` määrittää mallin ja Valio-yhteyden prosessin tasolla. Asiakaskohtainen käyttö-, laskutus- ja brändihallinta sekä monen yrityksen läpi kattavasti varmennettu eristys eivät käy ilmi näistä osista.

Nämä ovat kohdistetun koodikatselmuksen havaintoja, eivät koko järjestelmän tietoturva-auditointi. Nykyisten ostaja- ja käyttäjärajausten olemassaolo ei yksin osoita white label -palvelun valmiutta.

## Ensimmäinen kaupallinen versio

1. Valitaan yksi toistuva käyttötapaus ja 2–3 pilottiyritystä. Määritetään tarkasti ostoskorin siirto, käytettävät integraatiot ja tilauksen vahvistus. Tuote- ja brändiaineiston käyttöoikeudet sovitaan asiakkaan kanssa.
2. Saman sovelluspaketin yrityskohtainen julkaisu pysyvään pilviympäristöön. Omat kannat ja salaisuudet, yrityksen kirjautuminen, oma WhatsApp-numero sekä asiakkaan verkkokaupan oikea rajapinta. Nykyistä demotilaa tai henkilökohtaisia AI-avaimia ei siirretä kaupalliseksi asiakastilaksi.
3. Yrityksen brändi ja rajapintaliitäntä erotetaan versionhallittavaksi asetukseksi. Asiakkaan työntekijä hallitsee omaa yritystään ja ostaja näkee vain omat tietonsa. Yritysten lokit, välimuistit, tiedostot ja hakemistot erotetaan tietokantojen lisäksi.
4. Lisätään käyttö- ja kustannusloki sekä palvelinpuolen kulurajat. Kirjataan yritys, kutsun tunnus, malli/versio, input/output/cache-tokenit, hinta ja hinnastoversio sekä virheet/uusinnat. Käyttöpaketti ja ruuhkarajat erotetaan mallipalvelun organisaation kokonaisrajasta.
5. Koestetaan ostoslista → oikean ostajan kori → sovittu hyväksyntä. Eristyskokeessa sama henkilö käyttää kahta yritystä, samat viestitunnukset esiintyvät eri yrityksissä, ja ristikkäiset kori-/tiedosto-/API-pyynnöt torjutaan. Varmistetaan myös palautuminen, varmuuskopion palautus ja käsin tehtävä virhetilanteen jatko.
6. Vasta toistuvien tarpeiden ja maksavien pilottien jälkeen automatisoidaan onboarding, laskutus ja yhteinen ajo. Vastaanottavan WhatsApp-numeron tunnus ja varmennettu kirjautuminen ratkaisevat yrityksen palvelimella; mallin tuottama tenant-id tai käyttäjän vapaateksti ei saa valita asiakkaan tietorajaa.

Palvelun ensiversio kattaa viestit ja ostoskorin. Käyttäjän aiempi rajoitus säilyy mahdollisessa puheluversiossa: vain asiakas aloittaa puhelun.

## Myöhempi yhteinen SaaS-ajo

EU-alueelle hallittu taustapalvelu, kestävä viestijono/worker ja esimerkiksi hallittu PostgreSQL. Keskitetty yritysrekisteri määrittää verkkotunnuksen, vastaanottavan numeron, salaisuuksien viitteet, integraatiot ja palvelupaketin. Samat asetukset ohjaavat verkkosivua ja WhatsAppia.

Jaetuissa tauluissa yritystunnus on mukana myös yksilöivissä avaimissa, idempotenssissa, jonotöissä ja kaikissa tallennus-/hakupoluissa. PostgreSQL:n rivikohtaiset käytännöt (RLS) voivat täydentää sovelluksen tarkistuksia; sovellusroolin on oltava rajattu niin, ettei se ohita käytäntöjä. Eristys pitää testata myös ylläpitotyökaluista ja taustatöistä. Yrityskohtaiset tietokannat voidaan säilyttää, jos ne ovat käyttömäärän ja sopimusten kannalta järkeviä.

WhatsApp-asiakkaiden liittyminen voidaan automatisoida Metan Embedded Signupilla. Se liittää asiakkaan omistaman numeron ja muut tarvittavat resurssit palveluun asiakkaan antamilla oikeuksilla. Käytettävä liittymisversio ja Tech Provider-/kumppanipolku tarkistetaan käyttöönotossa; pelkkä nykyinen testinumero ei muodosta monen yrityksen tuotantoliittymistä.

EU-palvelin ei yksin määritä API-mallin tietojen käsittelypaikkaa. Mallipalvelun inferenssialue, tallennusalue ja säilytysasetukset sekä asiakkaan vaatimukset tarkistetaan erikseen; asiakkaalle luvataan vain toteutettu ja sopimuksilla katettu ratkaisu.

## Hinnoittelurakenne

Suositus on **käyttöönottomaksu + kuukausimaksu + määritelty käyttöpaketti ja lisäkäytön hinta**. Asiakaskohtaiset verkkokauppa-/ERP-integraatiot ja tuontityö hinnoitellaan käyttöönottoon. Kuukausimaksu kattaa sovitut ominaisuudet, ylläpidon ja tuen. Viesti-/tilauskohtainen asiakashinta voidaan pitää ymmärrettävänä, kun sisäinen kustannusseuranta mittaa kaikki mallikutsut ja muut muuttuvat kulut.

Hinnalle ei aseteta tässä markkinaväitteeksi esitettyä euromäärää. Ensimmäisten pilottien avulla mitataan asiakkaan säästämä työ, tilausvirheiden vaikutus, integraatioon kulunut aika, todellinen tukityö ja mallikulut. Näillä määritetään kannattava paketti. Malli-API:n kustannus ei yksin ole koko palvelun omakustannus tai asiakkaan saama arvo.

## Lähteet ja rajaukset

- [Anthropic-workspacet, avaimet ja kulurajat](https://platform.claude.com/docs/en/manage-claude/workspaces).
- [Anthropicin tietojen käsittely- ja tallennusalueet](https://platform.claude.com/docs/en/manage-claude/data-residency).
- [Metan Embedded Signup ja asiakasresurssien omistus](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/).
- [PostgreSQL:n rivikohtaiset käyttöoikeuskäytännöt](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Ei pilvipalvelimen tilausta, uusia asiakkuuksia, avaimia tai mallikutsuja. Ei nykyisen WhatsApp-tuotannon, live-demon tai tietokantojen muutoksia. Käyttäjältä ei ole saatu tilausta koko SaaS-muutoksen toteuttamiseen; tämä kirjaa suosituksen ja ensimmäisen rajattavan toteutusvaiheen.
