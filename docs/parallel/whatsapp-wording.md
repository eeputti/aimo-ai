# WhatsAppin tuoterivit selkokielelle (17.11.2026)

Eelis kuvakaappauksen kanssa: tilausluonnoksen rivi "PP PERUNA 1KG ANNABELLE: 2 kpl (2 kg), 1,52 €" ei kerro selvästi, paljonko tulee yhteensä. "Tä oli vaa esimerkki. Haluun et tä botti on fiksu."

## Mitä muuttui

Uusi `server/order-conversation/wording.mjs` muotoilee tuoterivit. Se on vain esitystapa: nimi, määrät, hinnat ja vertailuhinta tulevat Valion datasta ja tarjouksesta sellaisinaan, eikä mitään arvata.

- **Tuotenimi:** isoin kirjaimin kirjoitettu tukkunimi muuttuu luettavaksi, esim. "PP PERUNA 1KG ANNABELLE" → "PP peruna 1 kg annabelle". Vokaalittomat lyhenteet (PP, RST, B&J) ja UHT, ESL, MSC jne. pysyvät isoina. Toimittajan oma nimi, jossa on jo pieniä kirjaimia, säilyy ennallaan. Katalogissa on 3 081 tällaista nimeä 17 546:sta; testi käy ne kaikki läpi ja varmistaa, että vain kirjainkoko ja koon välilyönti muuttuvat.
- **Määrä:** myyntierät, yhden koko ja määrä yhteensä: "4 laatikkoa à 5 l, yhteensä 20 l", "5 rasiaa à 10 munaa, yhteensä 50 munaa". Nimessä jo näkyvää kokoa ei toisteta ("2 kpl, yhteensä 2 kg"). Kiloittain myytävä on vain "12 kg".
- **Pyöristys:** kun pakkauskoot vievät yli pyydetyn, luonnos kertoo sen: "3 säkkiä à 2 kg, yhteensä 6 kg (pyysit 5 kg)". Vaihtoehtolistassa ei, koska sen otsikko näyttää jo pyydetyn määrän.
- **Kilohinta:** luonnoksen rivi näyttää Valion vertailuhinnan, kun se on samassa yksikössä kuin tilattu määrä: "1,52 € (0,76 €/kg)". Litroina tilatulle maidolle ei näytetä kilohintaa.
- Samat nimet näkyvät luettavina myös "Luonnoksessa nyt" -listassa ja hinta-, hiilijalanjälki- ja toimitusvarmuusvertailuissa.

Esimerkki oikealla katalogilla (simuloidut hinnat):

```
*Tilausluonnos*, toimitus ma 16.11., Testikeittiö
1. Valio Eila® kevytmaitojuoma 1 l laktoositon: 4 laatikkoa à 5 l, yhteensä 20 l, 178,60 €
2. Valio Keittiön kuohukerma 2 dl: 5 laatikkoa à 1 l, yhteensä 5 l, 27,55 €
```

## Tarkistukset

- Uusi `test/whatsapp-wording.test.mjs` 5/5: nimet, määrät, pyöristys, kilohinta ja kaikki katalogin isoin kirjaimin kirjoitetut nimet.
- Viiden vanhan keskustelutestin odotukset päivitetty uuteen rivimuotoon (vain tekstimuoto, ei käytöksen muutosta).
- `npm test` 405/405. `ordering-e2e` tulostettuna koko keskustelu oikealla katalogilla.
- Ei mallikutsuja, Meta- tai Valio-kutsuja. Ei restarttia: botti saa muutoksen seuraavassa käyttöönotossa.

## Ei tässä

- Laatikon sisältö jää sanomatta, kun nimi kertoo yksittäisen pakkauksen ("kuohukerma 2 dl: 5 laatikkoa à 1 l"). Laatikon kappalemäärä ei kulje vaihtoehdon tiedoissa.
- Korisivu ja "Ostoskorissasi nyt" -kuittaus (cart-presentation.mjs) käyttävät ostajan omia sanoja eivätkä muuttuneet.
