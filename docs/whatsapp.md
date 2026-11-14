# WhatsApp-testiversio

WhatsApp on nykyisen Tilausapurin toinen viestikanava: sama malliasiakas ja sama Danielin Python-MCP-tuotepalvelin. Tämä versio hakee tuotteita, hintoja, toimitusaikoja ja korvaajia. Se ei tee tilauksia, muuta verkkokaupan koria, käsittele maksuja, avaa tukipyyntöjä tai lähetä ajastettuja ilmoituksia. Tilauksen tekemiseen tarvitaan erillinen gateway-integraatio ja hyväksyntäpolku.

**Asiakastunnistus:** tuotannon tunnistuksen ja ostovaltuudet omistaa Valio projektin nykyisen suunnan mukaisesti. Tämän version paikallinen numerorekisteri ja kutsukoodi ovat vain eristetyn testiasiakkaan tunnistusjäljitelmä. Valion asiakasrekisteriä tai oikeaa tunnistusrajapintaa ei ole kytketty.

## 1. Meta ja testinumero

1. Luo [Meta App Dashboardissa](https://developers.facebook.com/apps) sovellus WhatsApp-käyttötapauksella ja yhdistä yritysportfolion WhatsApp Business -tiliin.
2. Avaa **API Setup**, valitse testinumero ja lisää testiin osallistuvat vastaanottajanumerot Metan ohjeiden mukaan. Lähetä ensin Metan oma testiviesti ja vastaa siihen.
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

Jatkokysymys samassa keskustelussa käyttää tallennettua historiaa. Tunnistamaton numero saa yhdistämisohjeen; sille ei tehdä mallikutsuja. Tässä versiossa yksi numero kuuluu yhteen henkilöön ja yritykseen. Yhdistäminen ei anna osto-oikeuksia: kaikki käyttäjät ovat vain tietoja hakevia testaajia. Yritystunniste erottelee keskustelut, mutta ei vielä vaihda Valion asiakaskohtaista hinnoittelua tai anna pääsyä yrityksen tilauksiin.

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
