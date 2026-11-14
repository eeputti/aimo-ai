# Aimo-apuri kaikille WhatsApp-linkistä

Tilanne 14.11.2026. Tämä on toteutuspolun selvitys, ei käyttöönotto.

## Käyttäjän päätös

Kokeilijan pitää päästä jaettavasta linkistä keskustelemaan nimenomaan WhatsAppissa. Selainchat ei kelpaa korvaavaksi kanavaksi. Käyttäjällä ei tällä hetkellä ole erillistä apurin puhelinnumeroa. Henkilökohtaista numeroa ei tässä vaiheessa muuteta apurinumeroksi.

## Nykyinen toteutus

### Keskustelulinkki ja profiilin nimi

Käyttäjä toimitti apurin numeron WhatsApp-profiilikuvassa. Hänelle annettiin numeroon kohdistuva keskustelulinkki; numeroa tai linkin numerollista versiota ei kirjata repoon. Aloitustekstiksi hän pyysi **Moi! Opeta mua tilaamaan tämän kautta.** Uusi linkki avattiin oikealla WhatsAppin linkkisivulla ja koko teksti varmennettiin näkyvästä sivusta. Lähetys tapahtuu käyttäjän painaessa Lähetä WhatsAppissa; linkki ei lähetä viestiä itsestään. [WhatsApp: keskustelulinkki](https://faq.whatsapp.com/5913398998672934).

Samalla sivulla profiilin nimi on edelleen **Test Number**. Käyttäjä pyysi sen tilalle **Aimo Tilausapuri**. Nimi on erillinen WhatsApp-/Meta-profiilin asetus eikä linkin aloitusteksti. Nimimuutosta ei ole tehty tai hyväksytty tässä chatissa. Meta-asetuksia omistavalle käyttöönottokeskustelulle toimitettiin paikallinen viesti #52 ja yhteinen MCP-viesti #64: tarkista tämän testiresurssin muokkausmahdollisuus, tee sallittu nimimuutos ja lue nykyinen/pending-tila takaisin. Muokkauksen saatavuutta ei oleteta; Metan display-names-dokumentin lukuyritys palautti 429. Numeron rekisteröintiä, PINiä tai oikeuksia ei muuteta nimitoiveen perusteella.

`server/whatsapp/channel.mjs` vastaanottaa allekirjoitetut Meta-webhookit ja käyttää paikalliseen rekisteriin yhdistettyä lähettäjää. Tuntematon lähettäjä saa kutsukoodiohjeen eikä pääse malliin. `scripts/whatsapp-member.mjs` tarjoaa ylläpitäjän `invite`- ja `revoke`-komennot. `server/whatsapp/ordering.mjs` muodostaa jokaisesta numeroliitoksesta oman demoasiakkaan ja ostajan.

Metan testivastaanottajan hyväksyminen ja apurin paikallinen asiakasliitos ovat eri vaiheita. Pelkkä keskustelulinkki ei poista kumpaakaan. Nykyistä lähetysoikeuden tilaa korjataan toisessa käyttöönottokeskustelussa; tässä ei varmennettu uutta puhelinvastausta.

## Vaihtoehto A: oma WhatsApp API -numero

Suora tavoitepolku: jaettu keskustelulinkki → käyttäjä lähettää viestin → palvelin perustaa hänelle oman demoasiakkaan → sama nykyinen ostoslista- ja tilauskeskustelu.

Apurille tarvitaan hallittu numero, joka vastaanottaa vahvistus-SMS:n tai puhelun. Metan ohjeen mukainen numeron lisäys ja omistuksen vahvistus eivät yksin rekisteröi numeroa Cloud API:in: rekisteröinti pitää tehdä loppuun ja numeron tilan olla `CONNECTED`. Tilikohtaiset käyttöönottovaatimukset tarkistetaan oikeasta sovelluksesta. [Meta: numerot](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers).

Koodista puuttuu avoimen demon automaattinen asiakasliitos. Se tulee tehdä erillisellä oletuksena pois päältä olevalla asetuksella vain eristettyyn tilausdemoon. Tuotannon asiakastunnistus ja ostovaltuudet säilyvät Valion integraation vastuulla. Jokainen kokeilija tarvitsee oman sidoksen ja luonnoksen. Nykyistä kutsukoodipolkua ei poisteta yleisesti.

## Vaihtoehto B: Twilio Sandbox ilman omaa apurinumeroa

Twilion dokumentoitu Sandbox käyttää yhteisnumeroa. Kokeilijat voivat liittyä itse lähettämällä `join <sandbox-koodi>`; QR avaa esitäytetyn viestin. Oma WhatsApp Business -tili tai rekisteröity lähettäjänumero ei ole Sandboxin edellytys. Tilikohtainen saatavuus pitää silti tarkistaa: Sandbox on dokumentoitu vain **legacy Consoleen**.

Rajat: vain testikäyttö; keskustelussa näkyy Twilion numero ja logo; yksi lähtevä viesti kolmessa sekunnissa; osallistujan liittyminen vanhenee kolmessa päivässä. Viestit laskutetaan normaalin hinnaston mukaan. Tämä on mahdollinen demoratkaisu, ei tässä toimivaksi varmennettu yhteys. [Twilio: Sandbox](https://www.twilio.com/docs/whatsapp/sandbox).

**Uuden Twilio Consolen trial ei ole sama ratkaisu:** sen WhatsApp-kokeilussa vastaanottajat vahvistetaan erikseen ja tilillä voi olla enintään viisi varmennettua numeroa. Sitä ei tule luvata kaikille avoimeksi demonumeroksi. [Twilio: trial](https://www.twilio.com/docs/usage/trials/try-out-whatsapp).

Twilion hinnastossa käsittelymaksu on 0,005 USD saapuvalta ja lähtevältä viestiltä; mahdolliset muut maksut ja tilin käyttöönotto tarkistetaan ennen maksullisen palvelun tilaamista. [Twilio: hinnasto](https://www.twilio.com/en-us/whatsapp/pricing).

Twilio tarvitsee uuden webhook-/lähetyssovittimen nykyisen Meta Graph -sovittimen rinnalle sekä oman demoasiakasliitoksen. Tilin, Sandboxin saatavuuden ja kustannusten varmistaminen edeltää tämän vaihtoehdon toteutuspäätöstä. Tilin avaamista, maksullista tilausta tai sovitinta ei tehty tässä selvityksessä.

## Varmennettu ja avoinna

- Koodin asiakasportti ja nykyinen eristys luettu. Nykyisen kanavan 23 testiä ja selainvarademon kaksi testiä läpi. Selainpalvelimen testit vaativat sandboxin ulkopuolisen localhost-portin; ensimmäisen ajon porttiesto ei ollut sovellusvika.
- Ei muutoksia sovelluskoodiin, Meta-asetuksiin, henkilökohtaisiin numeroihin, salaisuuksiin, palvelimiin tai demon kantoihin. Selainchatia ei avattu julkiseksi.
- Nykyisen testinumeron keskustelulinkki ja uusi aloitusteksti on varmennettu WhatsAppin linkkisivulta. Tämä ei todista botin vastausta tai avointa käyttöä kavereille. Kaikille avoimen demon seuraava valinta on oma API-numero tai tililtä varmennettu Twilio Sandbox; kummankin jälkeen tarvitaan kanavan käyttöönotto ja oikea testi kahdelta erilliseltä kokeilijalta.
