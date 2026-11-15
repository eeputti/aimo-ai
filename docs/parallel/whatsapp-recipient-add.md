# Uuden WhatsApp-testivastaanottajan lisääminen

15.11.2026, Codexin numeronlisäyschatti. Käyttäjä pyysi yhden uuden numeron lisäämistä, jotta sillä voi keskustella WhatsApp-apurin kanssa. Henkilökohtaista numeroa tai vahvistuskoodia ei kirjata Gitiin.

- Nykyisen `.env` / `.env.whatsapp` -asetuksen WhatsApp-kanta tarkistettu lukutilassa ennen muutosta. Numero puuttui `members`-taulusta. Sillä oli kaksi aiempaa epäonnistunutta viestitapahtumaa (`META_HTTP_400`); niitä ei palautettu jonoon.
- Numero lisätty olemassa olevalla `bootstrapDemoMember`-toiminnolla omaksi testikeittiön testijäseneksi. Ei muutoksia asetustiedostoihin, tuotantotunnistukseen tai nykyisten jäsenten liitoksiin.
- Takaisinluku: jäseniä 2 → 3, uusi jäsen löytyy, jokaisen aiemman jäsenrivin kaikki kentät säilyivät täsmälleen. Palvelinta ei käynnistetty uudelleen. Luonnoksia tai tilauksia ei muokattu.
- Oikean Meta-sovelluksen **Step 1. Try it out → Recipient → Manage phone number list** -näkymässä oli vain aiempi vastaanottaja. Uusi numero syötettiin Suomen maatunnuksella. Meta näytti ilmoituksen WhatsApp-koodin lähettämisestä; tämä ei todista koodin toimitusta.
- **Käyttäjän korjaus:** koodia ei saapunut. Vastaanottajalista luettiin uudelleen: siinä oli yhä vain aiempi numero. Numeron lisäys avattiin uudelleen samalla oikealla maatunnuksella/numerolla. Metan sallima **Resend code** näytti jälleen `Code sent successfully`, mutta ei avannut SMS-/puheluvalintaa, ja ohje sanoo edelleen viisinumeroisen koodin tulevan WhatsAppiin. Käyttäjältä kysyttiin, vastaako numero kyseisen WhatsApp-tilin profiilinumeroa. Koodin saapumista ei päätellä Metan onnistumisilmoituksesta.
- **Lopputulos:** käyttäjä vahvisti tämän jälkeen numeron toimivan. Toimivuus on siis käyttäjän puhelimesta varmentama; tässä chatissa ei syötetty vahvistuskoodia eikä selvitetty, mikä ratkaisi alkuperäisen koodiviiveen. Uusia koodeja tai testiviestejä ei pyydetä tämän vahvistuksen jälkeen.
- **Riippumaton takaisinluku käyttäjän vahvistuksen jälkeen:** testijäsen löytyy edelleen, ja numeron kolme viimeisintä oikeaa viestiä ovat `done`, kukin ensimmäisellä yrityksellä, `error=null`, Metan vastaustunniste tallennettu. Ei viestisisältöjen julkaisua tai manuaalisia testilähetyksiä.

Tämä on asetus-/jäsenrekisterimuutos, ei sovelluskoodin muutos. Varmennus tehtiin tietokannan takaisinluvulla ja Metan oikealla käyttöliittymällä; sovellustestien toistoa ei tarvita. Salaisuuksia sisältämätön paikallinen tarkistustulos on `/private/tmp/aimo-whatsapp-ops/recipient-add-verification.json`.

`TYOLOKI.md` ja yhteisen työpuun Git-kirjoitukset ovat toisten aktiivisten vaiheiden omistuksessa. Tämä raportti toimitetaan niiden omistajalle samaan loki-/GitHub-vaiheeseen; rinnakkaisiin tiedostoihin tai indeksiin ei kosketa.
