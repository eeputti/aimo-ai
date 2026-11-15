# Kokonaiskoe 15.11.2026 (Codex, testauschat)

Käyttäjän pyyntö: testaa nykyinen kokonaisuus ja etsi vikoja. Sovellusta, julkaisuja, asetuksia tai käyttäjän kantoja ei korjattu tässä katselmoinnissa.

## Testattu versio ja ympäristö

- Ensimmäinen lähdekuva: `origin/main` **5044a91f0f111c270f843ae9aca055d0ba6fb468**, oma väliaikainen hakemisto. Katalogista kopioitu 17 546 tuotteen paikallinen aineisto; ei `.env`-tiedostoja, käyttäjän tietokantoja tai avaimia.
- Testauksen aikana tulleet **6db2708** ja **9f20407** muuttavat vain arviointia, sen testejä ja dokumentaatiota. Ne lisättiin lähdekuvaan lopulliseen sovellustestiajoon. Varsinainen palvelinkoodi säilyi samana.
- Kaikki testikirjoitukset omiin väliaikaisiin tai muistissa oleviin kantoihin. Meta, Valio, sähköposti ja maksaminen simuloitiin. Oikean mallin laajoja itsekeskusteluajoja ei toistettu toisen chatin ajon päälle.

## Varmennetut avoimet viat

### 1. Etusivun tuotteet eivät kelpaa tilauspolkuun

**Toisto oikeassa selaimessa:** etusivu → Momma ohuet piparkakut paahdettu voi 150g (`8097729`) koriin → TARKISTA JA TILAA → Tarkista hinnat ja saatavuus. Lisääminen näyttää onnistumiskuittauksen ja korissa hinnan, mutta tarjous sanoo **Tuotekoodia ei ole katalogissa**. Lähetä tilaus jää pois käytöstä.

Koneellinen vertailu vahvisti, että kaikki **36/36** `public/storefront-data.json`:n viiden etusivukokoelman tuotekoodia puuttuvat käytössä olevasta tilauskatalogista. **31** niistä on merkitty lisättäväksi koriin. Hinnat ja saldot ovat oikean kaupan aiempaa näyttödataa, mutta käyttöliittymä tarjoaa niille toimivaa tilauspolkua.

Lähteet: `public/storefront.js:85` lisää näyttötuotteen sellaisenaan; esimerkkirivi `public/storefront-data.json:52`; gateway tarkistaa katalogin `server/gateway/service.mjs:114`. Katalogituote `464306` puolestaan eteni samassa selaimessa koko tilausketjun läpi, joten kyse ei ole yleisestä tilauspalvelun kaatumisesta.

**Seuraava korjaus:** etusivun ostettavien korttien tulee käyttää katalogista ratkaistuja tuotteita ja niiden hinta-/saatavuustietoa, tai näyttötuotteiden kohdalla pitää ohjata todelliseen tuotehakuun. Tuotetta ei saa vaihtaa hiljaa toiseksi. Nykyinen selainregressio käyttää tilausvaiheessa erikseen katalogituotetta eikä huomaa tätä katkoa.

### 2. Demomaksun käyttöoikeus on saatavissa ilman tilaajan tunnistusta

Aiempi taulun #214 havainto varmennettiin uudelleen uusimmasta palvelinkoodista omalla muistissa olevalla D1-jäljitelmällä. Ilman julkaisijan tunnusta toimiva ulkopuolinen sai demomaksun käyttöoikeuden, merkitsi synteettisen tilauksen maksetuksi ja laukaisi **yhden simuloidun vahvistussähköpostin**. Rahaa ei liiku, mutta maksettu-tilaan ja sähköpostiin vaikuttamisen pitäisi kuulua tilaajalle.

Julkisessa palvelussa ei tehty maksu- tai sähköpostikutsuja. Vain luettu lista sisälsi kaksi vanhaa tilausta, joilla ei tuolloin ollut demomaksua; tästä ei päätellä vikaa korjatuksi. Yksityiskohtaista hyödyntämisohjetta tai oikeita kyvykkyyksiä ei tallenneta mahdollisesti julkiseen repoon.

**Seuraava korjaus:** demomaksun yksityinen linkki annetaan vain tilauksen omistajalle; julkiseen tilauslistaan jätetään vain sallittu tilatieto. Koko WhatsApp → maksusivu -siirtymä on muutettava samalla, jotta nykyinen siirtymä ei riipu julkisesta käyttöoikeuden jaosta.

## Testauksen aikana korjattu WhatsAppin käyttöönottopuute

Ensimmäinen vain lukeva tarkistus: portin **4749** ainoa listener oli **PID 13329** ja sen työhakemisto `/private/tmp/aimo-whatsapp-runtime-777b5a45e`. HTTPS-tunnelin ja paikallisen palvelimen `/healthz` vastasivat 200 / `ordering-demo`. Kahdeksan keskustelu-, haku-, kori- ja kanavamoduulin tiivisteet erosivat testatusta GitHub-versiosta.

Saman käynnissä olevan snapshotin moduulit toistettiin **erillisillä muistissa olevilla luonnoksilla**, ei oikeilla asiakkailla:

| Koe | Käytössä olevan snapshotin moduulit | Uusin GitHub-koodi |
|---|---|---|
| Lisää maito, poista kaikki rivit | Vastaus "Luonnos on tyhjä", mutta aktiiviseen luonnokseen jää **1 rivi** | Aktiivisia rivejä **0** |
| Pyydä suoraan linkki keskeneräiseen koriin | Linkki luodaan | Linkkiä ei luoda |

Myös hakujärjestyksen, tilausaikarajan, tukiyhteyden, kellonaikatervehdyksen ja väärinkäyttösuojan myöhemmät muutokset puuttuvat snapshotista. Näiden kaikkien käyttäytymistä ei ajettu oikealla puhelimella tässä työssä.

**Korjattu toisessa chatissa testauksen aikana:** `0b06d9d` dokumentoi julkaisuchatin tekemän 9f20407-käyttöönoton. Riippumaton loppuvarmennus: ainoa 4749-listener **PID 39055**, työhakemisto `/private/tmp/aimo-whatsapp-runtime-9f204077a`, kaikki kahdeksan verrattua moduulia täsmäävät testattuun GitHub-versioon. Uuden ajossa olevan snapshotin eristetyssä kokeessa rivien poisto jättää **0 riviä** eikä keskeneräiseen koriin synny linkkiä. Paikallinen ja julkinen health 200 / `ordering-demo`. Tämä ei enää ole avoin käyttöönottovika. Oikean puhelimen uusi loppukoe jää tekemättä tässä katselmoinnissa.

## Läpäisty varmennus

- Sovelluksen testit: alkuajo **329/329**, lopullinen 9f20407-arviointiversio **330/330**, ei ohituksia.
- Worker-testit **26/26**, mukaan lukien tilausten julkaisu, maksun keskeytys/uusinta, sähköpostin kertatoimitus, ilmoittautuminen ja väärinkäyttörajat. Nämä eivät kata yllä kuvattua omistajuusvikaa.
- Team MCP **62/62**.
- Tulkinta **26/26**, puhekielinen tuotehaku **54/54**, yhteensä **80/80**, ei mallikutsuja.
- Worker `typecheck` ja `build` läpi. Paikallisen portin avausta vaativat testit ajettiin niille myönnetyllä oikeudella.
- Oikea selain, oma simuloitu palvelin: tuotehaku `464306` → kori → tarjous → ihmishyväksynnän odotus → hyväksyntä → vahvistettu tilaus → **Päätösketju: ehjä**. Palvelimen takaisinluku: **1 confirmed-tilaus**. Selaimen error/warn-loki tyhjä.
- Julkinen landing, tilausnäkymä, terveysreitti ja maksusivu vastasivat 200. Julkinen tilausnäkymä näytti kaksi aiempaa tilausta.

## Rajat ja muut havainnot

- `localhost:4747` ei vastannut (ECONNREFUSED). WhatsAppin erillinen 4749-palvelin vastasi; tämän perusteella ei väitetä sen oman korisivun olevan rikki.
- Landingin testinumerolle liittyminen edellyttää edelleen demon esittelijän Meta-hyväksyntää. Sivu kertoo tämän; itsenäistä oikean puhelimen liittymistä ei testattu eikä väitetä toimivaksi.
- Tämä ei ole lupaus kaikkien mahdollisten keskustelujen toimivuudesta. Todellista Meta-toimitusta, uusia kielimallikeskusteluja, oikeaa Valio-API:a, sähköpostin toimitusta ja koko julkista maksuketjua ei kokeiltu uusilla asiakkailla.
- Yhteisen kansion ennen testiä olemassa olleet keskeneräiset muutokset säilytettiin. Raportti ja työloki tallennetaan erillisestä kloonista; sovelluskoodin muutokset ja julkaisut jäävät omistajille.
