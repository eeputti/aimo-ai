# WhatsApp-testiversio

Tilaustilassa (`WHATSAPP_ORDERING_ENABLED=true`) apuri kerää tarpeet, kysyy ensin puuttuvan toimituspäivän ja tarjoaa käyttäjän valittavat tuotteet. Yhteenvedon kuittaus avaa yksityisen korilinkin; lopullinen vahvistus tehdään selaimen korissa saman gatewayn kautta. WhatsApp ja kori käyttävät samaa palvelimen luonnosta. Oikeaa Valio-tilausta tai maksua ei tehdä.

Ilman tilaustilan asetusta säilyy erillinen vain lukeva WhatsApp-varapolku, joka käyttää ulkoista MCP-tuotepalvelinta. Sen asetuksia ei tarvita varsinaiseen tilauspolkuun. Python-palvelimen lähde on paikallisarkistossa, ei enää tämän repon osa.

**Asiakastunnistus:** tuotannon tunnistuksen ja ostovaltuudet omistaa Valio projektin nykyisen suunnan mukaisesti. Tämän version paikallinen numerorekisteri ja kutsukoodi ovat vain eristetyn testiasiakkaan tunnistusjäljitelmä. Valion asiakasrekisteriä tai oikeaa tunnistusrajapintaa ei ole kytketty.

## 1. Meta ja testinumero

1. Luo [Meta App Dashboardissa](https://developers.facebook.com/apps) sovellus WhatsApp-käyttötapauksella ja yhdistä yritysportfolion WhatsApp Business -tiliin.
2. Avaa **API Setup** tai uuden näkymän **Customize → Basic setup → Step 1. Try it out**. Valitse testinumero, lisää omat testivastaanottajat numerolistaan ja vahvista ne Metan lähettämillä koodeilla. Testinumerolta voi lähettää enintään viidelle vahvistetulle vastaanottajalle. Kaikille avoimeen demoon tarvitaan myöhemmin oma yritysnumero, jonka omistus voidaan vahvistaa SMS:llä tai puhelulla. Valitse yhteystestiksi **Hello World**, lähetä se ja vastaa siihen omassa WhatsAppissasi. Apurin viestit kulkevat Metasta palvelimelle; apurilla ei tarvitse olla omaa fyysistä puhelinta.
3. Tallenna **Phone number ID** (tekninen tunniste, ei puhelinnumero) ja käyttöoikeustoken palvelimen salaisiin ympäristöasetuksiin. Testin tilapäinen token vanhenee; pidempään käyttöön luo system user -token tarvittavin `whatsapp_business_messaging`-oikeuksin. Tilin/numeron hallinta voi vaatia lisäksi `whatsapp_business_management`-oikeuden.
4. Ota sovelluksen **App Secret** asetuksiin ja luo erillinen satunnainen webhookin verify token, esimerkiksi `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

Ylläpitäjän kehittäjätili ja tuotantokäytön yritys-/numero-/julkaisuvaatimukset ovat eri asia kuin käyttäjän yhdistäminen agenttiin. Noudata oman Meta-sovelluksen näyttämiä vaatimuksia. Älä syötä avaimia WhatsApp-keskusteluun tai commitoi niitä.

## 2. Palvelin

Node 22.13+ ja `npm ci`. Täytä `.env` tai hostingin ympäristöasetukset:

```dotenv
ANTHROPIC_API_KEY=<nykyisen agentin avain>
ASSISTANT_MCP_URL=https://<oma-tuotepalvelin>/mcp
ASSISTANT_MCP_TOKEN=<nykyisen tuotepalvelimen tunnus>
WHATSAPP_PHONE_NUMBER_ID=<Metan tekninen numerotunniste>
WHATSAPP_ACCESS_TOKEN=<Metan token>
WHATSAPP_APP_SECRET=<Meta-sovelluksen salaisuus>
WHATSAPP_VERIFY_TOKEN=<itse luotu satunnainen tunnus>
WHATSAPP_API_VERSION=<tuettu versio, esimerkiksi v23.0>
WHATSAPP_SUPPORT_CONTACT=<oikea asiakaspalvelun puhelin, sähköposti tai URL>
WHATSAPP_DB=/var/data/whatsapp.db
```

`WHATSAPP_DB` on valinnainen; oletus on projektin `data/whatsapp.db`. Sen pitää olla pysyvällä levyllä. Muuten uudelleenjulkaisu voi hävittää numeroiden yhdistämiset, keskustelut ja viestijonon. Älä käytä yllä olevaa `/var/data`-esimerkkiä paikallisesti ilman kyseistä levyä.

**Erillinen palvelin, suositus ensimmäiseen kokeiluun:**

```bash
npm run whatsapp
```

Palvelin ei tarvitse verkkokaupan paikallista katalogia tai demo-tilauskantoja. Se käyttää nykyistä etä-MCP-palvelinta. Oletusportti 4748; `WHATSAPP_PORT` ohittaa `PORT`-muuttujan. Hostingissa käytä sen osoittamaa `PORT`-arvoa ja jätä `WHATSAPP_PORT` asettamatta. Terveystarkistus on `/healthz`; se kertoo viestipalvelimen olevan käynnissä, ei testaa mallia tai Metan tokenia.

**Vaihtoehtoisesti nykyisen sivuston samassa palvelimessa:** aseta `WHATSAPP_ENABLED=true` ja aja tavallinen `npm start`. Sivuston muut käynnistysvaatimukset säilyvät. Ominaisuus on oletuksena pois päältä eikä vaadi muilta kehittäjiltä Meta-asetuksia.

Käytä vain yhtä WhatsApp-worker-prosessia kutakin tietokantaa kohti. Älä aja erillistä WhatsApp-palvelinta ja sivuston WhatsApp-workeria samanaikaisesti samalla kannalla.

### Tilausdemo (valinnainen)

Oletuksena kanava on vain lukeva. `WHATSAPP_ORDERING_ENABLED=true` vaihtaa `npm run whatsapp` -palvelimen tilauskeskusteluun: luonnos, vaihtoehdot, yhteenveto ja yksityinen korilinkki; demotilaus vahvistetaan erikseen korissa. Oikeaa Valio-tilausta ei lähetetä. Keskustelun kulku on tiedostossa [ordering-demo.md](ordering-demo.md).

```bash
WHATSAPP_ORDERING_ENABLED=true
GATEWAY_DB=/var/data/whatsapp-gateway.db
AIMO_DB=/var/data/whatsapp-prices.db
WHATSAPP_DRAFT_DB=/var/data/whatsapp-drafts.db
WHATSAPP_QUOTE_DB=/var/data/whatsapp-quotes.db
WHATSAPP_DEMO_PHONE=<valinnainen: yksi Metassa vahvistettu testinumero>
WHATSAPP_DEMO_PERSON=<valinnainen: testaajan nimi>
```

- `GATEWAY_DB` ja `AIMO_DB` ovat pakollisia, eivätkä ne saa osoittaa verkkokaupan `data/gateway.db`- tai `data/aimo.db`-kantaan. Palvelin ei käynnisty muuten. Näin demotilaukset ja hintavälimuisti pysyvät erillään verkkokaupan tilauksista. Suositeltu käynnistys on erillinen `npm run whatsapp` ja omat tietokannat.
- `WHATSAPP_DRAFT_DB` ja `WHATSAPP_QUOTE_DB` ovat valinnaisia; oletukset ovat `data/whatsapp-drafts.db` ja `data/whatsapp-quotes.db`. Pidä ne pysyvällä levyllä, jotta luonnos säilyy uudelleenkäynnistyksessä.
- Tilauspolku tarvitsee paikallisen katalogin (`npm run catalog`), toisin kuin vain lukeva kanava. `ASSISTANT_MCP_URL` ja `ASSISTANT_MCP_TOKEN` eivät ole tarpeen tässä tilassa.
- `VALIO_API_KEY` tuo oikeat hinnat ja saatavuuden, ilman sitä ne simuloidaan. `ANTHROPIC_API_KEY` ottaa käyttöön mallitulkin vapaalle puhekielelle, ilman sitä viestit tulkitaan säännöillä. Gatewayn allekirjoitusavain luetaan muuttujasta `GATEWAY_PRIVATE_KEY_PEM` tai luodaan `data/`-hakemistoon.
- `WHATSAPP_DEMO_PHONE` yhdistää yhden numeron testiasiakkaaksi käynnistyksessä ilman kutsukoodia. Olemassa oleva yhdistäminen säilyy. Muut numerot yhdistetään kohdan 4 kutsulla. Jokainen yhdistetty numero saa oman demo-ostajan (hyväksyntä vain poikkeuksissa, 6 000 € per tilaus). Tämä on testitunnistus, ei Valion asiakastunnistus.
- Asetukset voi pitää erillisessä `.env.whatsapp`-tiedostossa: `npm run whatsapp` ja `npm run whatsapp:member` lukevat sen `.env`:n jälkeen, ja sen arvot ohittavat `.env`:n arvot. Tiedosto on Gitin ohittama.
- `/healthz` palauttaa tilaksi `ordering-demo`, kun tilausdemo on päällä, muuten `read-only-test`.

**Selaimen varademo:** tilaustilassa palvelin tarjoaa osoitteessa `http://localhost:<portti>/demo` saman tilauskeskustelun selaimessa, omalla testiasiakkaalla ja ilman Metaa. Se toimii vain palvelinkoneen omasta selaimesta; tunnelin kautta pyyntö torjutaan, koska sivu tekee malli- ja hintakutsuja ilman kirjautumista.

Jos viestin käsittely epäonnistuu, sama viesti yritetään uudelleen samalla Metan viestitunnisteella (enintään kolme kertaa, 30 ja 60 sekunnin välein). Tilauskeskustelu palauttaa uusinnalle saman tuloksen, joten uusinta ei tee toista tilausta.

### Kuvat ja ääniviestit (tilaustilassa)

- **Kuva** ostoslistasta, lähetteestä, hyllystä tai reseptistä (JPG, PNG tai WebP, enintään 5 Mt; myös kuvana lähetetty tiedosto) haetaan Metan media-API:sta samalla `WHATSAPP_ACCESS_TOKEN`illa ja luetaan Clauden kuvantulkinnalla (`FAST_MODEL`). Koodi kirjoittaa luetuista tuoteriveistä tavallisen tilausviestin samaan keskusteluun, ja asiakas saa ensin lyhyen viestin siitä, mitä luettiin. Kuvan teksti on dataa: mallin vapaata tekstiä ei näytetä eikä välitetä, ja ohjaussanat (tilaa, peru, tyhjennä, unohda ohjeet) pudotetaan tuoteriveistä. Toimituspäivää ei lueta kuvasta, se kysytään.
- **Ääniviesti** (enintään 1 Mt, noin 5–10 minuuttia) litteroidaan vain, jos `WHATSAPP_TRANSCRIBE` on asetettu (`groq`, `openai` tai paikallinen `command`). Oletuksena botti kiittää ja pyytää kirjoittamaan. Litteroinnin jälkeen asiakas näkee, mitä kuultiin. Pelkkä vahvistus tai peruutus ("tilaa", "peru") ääniviestinä ei tee mitään, vaan pyytää kirjoittamaan sen.
- Metan webhookiin ei tarvita muutoksia: kuvat ja äänet tulevat samassa `messages`-kentässä. Muut liitteet (PDF, tarra, video) saavat vastauksen, joka kertoo tuetut muodot.
- Luettu teksti tallentuu tauluun `wa_media_reads` viestitunnisteella, joten uusinta ei lue kuvaa uudelleen. Rivit poistetaan jonon mukana seitsemän päivän jälkeen tai kun viesti perutaan.

## 3. Webhook

Anna palvelimelle julkinen HTTPS-osoite. Paikalliseen kokeiluun käy esimerkiksi `cloudflared tunnel --url http://localhost:4748`; vaihtuva tunneliosoite pitää päivittää Metaan. Suoraan localhostiin Meta ei pääse.

Metan webhook-asetukset:

- Callback URL: `https://<palvelin>/webhooks/whatsapp`
- Verify token: sama arvo kuin `WHATSAPP_VERIFY_TOKEN`
- Tilaa WhatsApp Business -tilin **messages**-tapahtumat. Pelkkä onnistunut URL-vahvistus ei vielä tilaa viestejä; varmista sovelluksen tilaus oikealle WhatsApp Business -tilille.

GET-vahvistus vastaa Metan `hub.challenge`-arvolla. POST-viestien `X-Hub-Signature-256` tarkistetaan alkuperäisistä tavuista App Secretillä ennen JSONin käsittelyä. Vain asetetun Phone number ID:n tapahtumat käsitellään. Toimitus-/lukukuittaukset eivät käynnistä mallia.

## 4. Henkilön ja numeron yhdistäminen

Testissä ylläpitäjä luo kutsun palvelimen komentoriviltä. Aja komento samalla koneella ja samalla `WHATSAPP_DB`-asetuksella kuin viestipalvelin:

```bash
npm run whatsapp:member -- invite --phone +358401234567 --company "Ravintola A" --person "Anna"
```

Komento tulostaa satunnaisen kertakäyttökoodin. Toimita se vain kyseiselle henkilölle luotettavaa kanavaa pitkin. Koodi on voimassa 10 minuuttia ja sidottu annettuun puhelinnumeroon. Käyttäjä lähettää **agentin testinumeroon**:

```text
YHDISTA <koodi>
```

Odota onnistumisviestiä. Lähetä sitten esimerkiksi:

```text
Tarvitsen 60 kananmunaa maanantaiksi. Mitä vaihtoehtoja löytyy?
```

Jatkokysymys samassa keskustelussa käyttää tallennettua historiaa. Tunnistamaton numero saa yhdistämisohjeen; sille ei tehdä mallikutsuja. Tässä versiossa yksi numero kuuluu yhteen henkilöön ja yritykseen. Yhdistäminen ei anna osto-oikeuksia: tilaustilassa käyttäjät voivat vahvistaa vain eristettyjä demotilauksia oman testiasiakkuutensa valtuuksilla. Yritystunniste erottelee keskustelut, mutta ei vielä vaihda Valion asiakaskohtaista hinnoittelua tai anna pääsyä yrityksen tilauksiin.

Yhteyden poistaminen:

```bash
npm run whatsapp:member -- revoke --phone +358401234567
```

Tämä poistaa yhteyden ja kutsun, poistaa henkilön keskustelumuistin ja peruu jonossa olevat vastaukset. Jo Meta-rajapintaan lähetettyä viestiä ei voi perua. Ylläpitoreittejä ei ole avattu verkkoon. Tuotannossa tämä testirekisteri korvataan Valion vahvistamalla lähettäjä–asiakkuus–käyttöoikeus-sovittimella; omaa rinnakkaista asiakaskirjautumista ei tässä suunnitella.

## Toiminta ja rajat

- Webhook tallentaa viestin SQLite-jonoon ja kuittaa vastaanoton ennen hidasta agenttikutsua. Yksi worker käsittelee jonon järjestyksessä. Käsittely jatkuu prosessin uudelleenkäynnistyksen jälkeen.
- Saapuvan viestin ID estää saman tapahtuman kaksoiskäsittelyn. Enintään 10 viestiä numerolta minuutissa tallennetaan; ylimääräiset kuitataan mutta jätetään käsittelemättä. Koodiyrityksiä sallitaan enintään 5 / 15 minuuttia. Rajat suojaavat testipalvelua; tämä ei ole suuren liikennemäärän jonoratkaisu.
- Mallille annetaan WhatsAppissa vain nimetyt lukutyökalut. Uudet MCP-työkalut eivät tule automaattisesti käyttöön. Verkkosivun nykyinen työkalukäytäntö ja taulukkomuotoinen vastaus säilyvät.
- Tämä ensimmäinen testikanava tunnistaa puhelinnumerolliset lähettäjät (`messages[].from`). Pelkän business-scoped user ID:n (BSUID) käyttäminen ilman puhelinnumeroa on jatkotyö Valion tunnistussovittimen kanssa; sellaisia viestejä ei ohjata mallille tässä versiossa.
- Viestit ovat tekstiä, enintään 4000 merkkiä. Äänet, kuvat ja liitteet saavat tekstiohjeen. Mallin vastaus muotoillaan WhatsAppiin, tarvittaessa lyhennetään alle 4096 merkkiin.
- Viesti `tuki`, `apua`, `help` tai `asiakaspalvelu` palauttaa määritellyn ihmisen yhteystiedon. Testiversio ei väitä avanneensa tukipyyntöä.
- MCP-palvelimen `/healthz`-osoitetta kutsutaan ennen WhatsAppin mallikutsua kylmäkäynnistyksen varalta.
- Mallivirheestä palautetaan hallittu virheviesti. Lähetysvirhettä yritetään enintään kolmesti, tallennettua vastausta käyttäen. Metan lähetysrajapinta ei takaa tässä toteutuksessa exactly-once-toimitusta: jos vastaus ehti lähteä mutta kuittaus katosi, uusinta voi lähettää saman vastauksen uudelleen. Testiversio ei tee tilauksia.
- Vain alle 23 tuntia vanhat asiakasviestit käsitellään ja niihin vastataan; tunti jätetään turvamarginaaliksi Metan 24 tunnin palveluikkunaan. Ajastettuja viestejä tai viestipohjia ei tässä versiossa lähetetä. Niille tarvitaan erillinen suostumus- ja template-toteutus.
- Tietokanta sisältää puhelinnumerot, yritys-/henkilöliitokset, viestit ja vastaukset. Kutsukoodista tallennetaan vain SHA-256-tiiviste myös viestijonoon. Tietokantatiedoston käyttöoikeus on 0600; käytä hostingin levyn salausta ja rajattuja ylläpito-oikeuksia. Kanta ei ole sovellustasolla salattu.
- Muistissa pidetään enintään 20 viimeistä keskusteluviestiä per yhdistäminen. Seitsemää päivää vanhemmat viestit ja jonotapahtumat poistetaan käynnistyksessä ja tunnin välein. Numero-/henkilöliitos säilyy, kunnes ylläpitäjä poistaa sen. Tyhjennys ei poista Metan, kielimallipalvelun tai varmuuskopioiden tietoja.

## Tarkistukset

```bash
node --disable-warning=ExperimentalWarning --test test/whatsapp*.test.mjs test/assistant-whatsapp.test.mjs
```

Testit eivät soita Metaan, MCP-palvelimeen tai kielimallin oikeaan APIin. Ne kattavat HTTP-vastaanoton, allekirjoituksen, koodit, muistierottelun, uudelleenkäynnistyksen, duplikaatit, perumisen, lähetysvirheet ja oikean SDK:n mallipyyntöjen muodostuksen. Aito WhatsApp-puhelintesti vaatii omat Meta-asetukset ja testivastaanottajan.

## Vianetsintä

- **URL-vahvistus epäonnistuu:** tarkista HTTPS, reitti ja verify token. Se on eri tunnus kuin access token.
- **Vahvistus onnistuu, mutta viestejä ei tule:** tarkista `messages`-tilaus, sovelluksen WABA-tilaus, testivastaanottajan vahvistus sekä Phone number ID. Pelkkä Metan testitapahtuma ei todista oikean numeron kytkentää.
- **Viesti jonossa mutta vastaus ei lähde:** tarkista access tokenin voimassaolo/oikeudet ja että lähettäjä on sallittu testivastaanottaja. `inbox`-taulun `state`, `attempts` ja `error` kertovat tilanteen; niitä ei julkaista terveystarkistuksessa.
- **Tuotehaku epäonnistuu:** tarkista nykyisen agentin ympäristöasetukset, MCP-yhteys ja mallipalvelu. Uusia tilauksia ei synny virhetilanteessa.
- **Palvelu on hidas:** erillinen viestipalvelin ja MCP-palvelin on pidettävä tavoitettavina. Nukkuva hosting hidastaa webhookeja ja mallin työkalukutsuja.

Lähteet: [Meta: käyttöönotto](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started/), [webhookien vahvistus](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/), [WhatsAppin viestintäkäytäntö](https://business.whatsapp.com/policy), [MCP-työkalujen rajaus](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector).
