# WhatsApp-vahvistuksen juurisyy ja kaikille avoin demo

15.11.2026, Codexin vahvistuskoodichat. Tämä on selvitys ja jatkosopimus; avoimen numeron käyttöönottoa ei ole tehty.

## Varmennettu juurisyy

- Käyttäjä tarkensi koodin puuttuvan verkkosivun lomakkeen täyttämisen jälkeen. Lomake ja ilmoittautumisseuranta eivät tee Metalle testivastaanottajan lisäystä tai koodipyyntöä. `linked` tarkoittaa paikallista demoasiakasliitosta. `approve` vain raportoi esittelijän Metassa jo tekemän hyväksynnän; se ei varmista tai ohita Metan hyväksyntää.
- Tuotannon rajatulla, vain lukevalla ilmoittautumis-API-kutsulla: 0 `pending`, 2 `linked`, 0 `ready`; kumpikaan odottava ilmoittautuminen ei sisältänyt koodia. Henkilöiden nimiä, numeroita, koodeja ja tunnuksia ei tallenneta tähän raporttiin.
- Oikeassa Meta-sovelluksessa Step 1:n testinumero vastaa paikallista Phone Number ID:tä. Vastaanottajalistalla näkyi kaksi hyväksyttyä numeroa viidestä mahdollisesta. Lista ei ollut täynnä. Numeroiden poisto ei käynnistä lomakkeelta puuttuvaa koodipyyntöä, joten poistoja ei tehty.
- Käyttäjä antoi luvan käynnistää kahden odottavan numeron koodipyynnöt. Ensimmäisen numero ja Suomen maatunnus syötettiin Metan lomakkeelle. Next-toiminnon yritys ja sen tilan lukeminen aikakatkaistiin; myös palautusyritys aikakatkaistiin. Pyynnön käynnistymistä ei voitu varmentaa. **Koodin lähetystä tai toimitusta ei saatu varmennettua. Toisen numeron pyyntöä ei aloitettu.** Mitään numeroa ei merkitty tämän perusteella valmiiksi. Tarkista Metan ajantasainen tila ennen uutta lähetystä, jotta turhia uusintoja ei synny.

## Käyttäjän tavoite ja seuraava toteutus

Käyttäjä täsmensi tavoitteeksi, että kuka tahansa voi avata WhatsApp-keskustelun automaattisesti. Käsin hoidettava testivastaanottajan vahvistus ei täytä tavoitetta. Käyttäjä kysyi halvan prepaid-liittymän soveltuvuudesta; hankintaa tai tiettyä operaattoria ei vielä valittu.

1. Rekisteröi apurille tavallinen WhatsApp Cloud API -yritysnumero. Prepaid/SIM/eSIM käy, kun numerolla voi vastaanottaa vahvistuksen tekstiviestillä tai puhelulla; pelkkä data-eSIM ei täytä tätä. Numeron pitää säilyä käyttäjän hallinnassa ja aktiivisena. Henkilökohtaista WhatsApp-tiliä ei poisteta tai siirretä.
2. Varmista rekisteröinti ja `CONNECTED`, oikea Messaging account, `messages`-tilaus, tokenin pääsy numeroon ja nykyisen taustapalvelimen kytkentä. Step 2:ssa näkyy lisäksi toinen Registered-numero eri tilillä ja webhook-tilaus pois päältä; sen soveltuvuutta tai lähetysvalmiutta ei varmennettu.
3. Vaihtoehtona Meta tarjoaa ehdot täyttäville yrityksille 555-yritysnumeroita, jotka vahvistetaan automaattisesti. Ne ovat eri asia kuin Step 1:n testinumero: näyttönimi pitää hyväksyttää, ja tavalliset hinnoittelu-/laaturajat koskevat niitä. Oma SIM ei siis ole ainoa mahdollinen reitti. Nykyisen toisen numeron tyyppi ja hyväksynnät on tarkistettava ennen päätöstä.
4. Kytke uusille demokokeilijoille automaattinen oma demoasiakasliitos: joko verkkosivun liittyminen ilman Meta-koodivaihetta tai allekirjoitetun WhatsApp-ensiviestin perusteella. Pelkkä yritysnumeron vaihto ei ohita nykyistä paikallista jäsenrekisteriä. Älä anna tuntemattomalle tulijalle toisen ostajan oikeuksia tai historiaa. Tämä ei ole Valion tuotantoasiakkuuden tunnistus.
5. Vaihda julkinen linkki oikeaan numeroon ja varmista kahdella aiemmin rekisteröimättömällä kokeilijalla WhatsApp-viesti → oma demoasiakkuus → apurin vastaus ilman esittelijän koodivaihetta. Vasta tämä todistaa tavoitellun liittymisen.

## Tarkistukset ja rajat

Luettu nykyinen GitHub-main, paikalliset asetukset paljastamatta salaisuuksia, tuotannon ilmoittautumistilat ja Metan oikea vastaanottajalista. Ei sovelluskoodin muutoksia, palvelinrestarttia, tietokantakirjoituksia, numeroiden poistoja, maksuja tai testitilauksia. Dokumenttimuutos tarkistetaan `git diff --check`-komennolla; ohjelmistotestejä ei tarvita. Tallennus erillisestä ajantasaisesta kloonista säilyttää jaetun työpuun muiden keskeneräiset työt.

Viralliset lähteet, luettu 15.11.2026:

- [Meta: Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started/)
- [Meta: yritysnumeroiden vaatimukset, rekisteröinti ja tila](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [Meta: 555 business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/#555-business-phone-numbers)
