# Julkinen WhatsApp-linkki — Eeliksen selvityschat

14.11.2026. Omistus: `docs/whatsapp-public-demo.md` ja tämä raportti. Sovelluskoodiin ei tehty muutoksia.

## Linkki varmennettu, aloitus päivitetty ja nimitoive välitetty

Käyttäjän kuvasta varmennettiin apurin testinumero ja muodostettiin hänelle keskustelulinkki. Numerollista linkkiä ei kirjata Gitiin. Uusi käyttäjän pyytämä aloitus **Moi! Opeta mua tilaamaan tämän kautta.** varmennettiin oikealla WhatsAppin linkkisivulla; sivu avattu käyttäjän nykyiseen in-app-välilehteen. Viestiä ei lähetetty. Sivulla näkyy edelleen **Test Number**, tavoitenimi **Aimo Tilausapuri**. Nimitoive ja testiresurssin muokkausmahdollisuuden tarkistus välitettiin varattujen Meta-asetusten omistajalle: paikallinen viesti #52, yhteinen MCP-viesti #64. Ei väitetä nimeä muutetuksi tai muutosta hyväksytyksi. Metan ohjesivu palautti 429; tarkkaa testinumeron nimirajoitusta ei päätellä siitä. Ei uusia kooditestejä tähän linkki-/dokumenttivaiheeseen, vaan oikean sivun näkyvä teksti varmennettu.

Käyttäjän päätös: kuka tahansa jaetusta linkistä nimenomaan WhatsAppiin; selainchat hylätty. Ei erillistä apurinumeroa käytettävissä. Henkilökohtaisia puhelinnumeroita ei kirjata repoon.

Selvitys, lähteet, nykyiset portit ja toteutuspolut: [whatsapp-public-demo.md](../whatsapp-public-demo.md). Oma API-numero tarjoaa suoran keskustelulinkin. Twilion legacy Sandbox on mahdollinen yhteisnumeroon ja itse lähetettävään liittymisviestiin perustuva demovaihtoehto; tilin saatavuus ja kustannukset on vielä tarkistettava. Uuden Twilio Consolen trialin viiden varmennetun vastaanottajan raja ei ratkaise avointa demoa. Kumpaakaan vaihtoehtoa ei otettu käyttöön tai valittu käyttäjän puolesta.

Tarkistukset: `test/whatsapp.test.mjs` 23/23 ja `test/whatsapp-web-demo.test.mjs` 2/2 läpi. Jälkimmäinen uusittiin oikeuslaajennuksella, koska sandbox esti localhost-portin. Ei live-Meta-, malli- tai Valio-kutsuja. Ei palvelinrestartia, tilauksia, numeroiden yhdistämisiä tai salaisuuksien muutoksia.

`TYOLOKI.md` on toisella chatilla varattuna sekä paikallisella että yhteisellä taululla. Kirjaus-/integrointipyyntö lähetetty yleislokin/Gitin omistajille. Tätä raporttia ei saa tulkita julkaistuksi koodiksi tai toimivaksi puhelindemoksi. Seuraava askel: valitse käyttöön saatava numero-/tilivaihtoehto ja varmista sen oikea vastaanotto/lähetys ennen avoimen asiakasliitoksen toteutusta.
