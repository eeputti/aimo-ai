# WhatsApp-lomakkeen sähköposti-ilmoitukset

15.11.2026, Codexin ilmoituschat. Käyttäjä pyysi sähköpostin itselleen jokaisesta uudesta kokeilijasta, jotta hän voi hoitaa testivastaanottajan hyväksynnän itse. Vastaanottaja vahvistettiin käyttäjän antamasta osoitteesta ja Gmail-profiilista; osoitetta tai ilmoittautujien henkilötietoja ei tallenneta lähdekoodiin.

## Käytössä oleva ratkaisu

- Codexin tähän chattiin sidottu heartbeat **WhatsApp-kokeilijat sähköpostiin** (`whatsapp-kokeilijat-s-hk-postiin`) luotiin ACTIVE-tilaan, tarkistus viiden minuutin välein. Se käyttää jo yhdistettyä Gmail-pluginia ja käyttäjän omaa vastaanottajaosoitetta. Koneen ja Codexin on oltava käynnissä ja Gmail-yhteyden käytettävissä; tämä ei ole Cloudflaren itsenäinen sähköpostilähetin.
- `scripts/whatsapp-signup-alerts.mjs scan --to EMAIL` lukee vain julkisen demon ylläpitäjälle rajatut `pending`- ja `linked`-listat. Avaimet pysyvät olemassa olevissa ympäristötiedostoissa. Ilmoitus sisältää nimen, numeron, yrityksen ja Metan lisäysohjeen. Käyttäjän toimittamia vahvistuskoodeja ei kopioida sähköpostiin.
- Erillinen `data/whatsapp-signup-alerts.db` säilyttää numeron tiivisteen, odotusjakson tunnisteen, lähetysvarauksen ja Gmailin viestitunnisteen; tiedosto 0600 ja Gitin ohittama. Saman odottavan numeron uusintalomake tai prosessin uudelleenkäynnistys ei synnytä uutta sähköpostia. Jonosta poistumisen jälkeen syntyvä uusi ilmoittautuminen voi aloittaa uuden odotusjakson.
- Lähetys varataan ennen Gmail-kutsua (`reserve --key KEY`) ja kuitataan vasta onnistuneen lähetyksen viesti-ID:llä (`ack --key KEY --message-id ID`). Epäselväksi jäänyt lähetys menee `reconcile`-listaan: automaatio etsii tarkan ilmoitustunnisteen lähetetyistä eikä lähetä sokkona uudelleen. Ulkoisen sähköpostin ja paikallisen tietokannan yhteistä transaktiota ei ole, joten epäselvä toimitus voi vaatia tarkistuksen.
- Apuri on asennettu myös käyttäjän alkuperäiseen projektikansioon samasisältöisenä, jotta ajastus käyttää pysyvää projektipolkua eikä tilapäiskloonia. Muut jaetun työpuun tiedostot säilyvät ennallaan.

## Varmennukset

- Uudet testit **5/5**: saman numeron toistot, uusi odotusjakso, uudelleenkäynnistyksen kestävyys ja lähetysvaraus, HTML-suojaus/koodien poisjättö sekä koko lukutilanne ilman osittaista päivitystä verkkovirheessä. Syntaksi ja `git diff --check` läpi. Testit käyttävät fiktiivisiä numeroita, muistia tai omia tilapäisiä kantoja.
- Oikealta sivulta jo odottaneet kaksi ilmoittautumista luettiin ja niiden ilmoitukset lähetettiin käyttäjän pyynnöstä Gmail-pluginilla. Molemmat luettiin takaisin: oikea vastaanottaja, sisältö, `SENT` ja **INBOX**. Ei väitettä, että käyttäjä olisi itse lukenut viestit. Henkilöitä, numeroita ja Gmailin viestitunnisteita ei tallenneta tähän dokumenttiin.
- Lähetykset kuitattiin vasta Gmailin onnistuneiden vastausten jälkeen. Oikean palvelun uusintaskannaus: **0 uutta / 0 epäselvää** ilmoitusta. Automaatio luotiin onnistuneesti; seuraavaa itsenäistä ajastuskierrosta ei vielä väitetä suoritetuksi tässä käyttöönottovarmennuksessa.

## Rajat ja muut selvitetyt vaihtoehdot

- Sähköposti ei lisää testivastaanottajaa, hyväksy Metan koodia tai avaa verkkosivun WhatsApp-linkkiä automaattisesti. Käyttäjä hoitaa Metan vahvistuksen, minkä jälkeen nykyisellä `scripts/whatsapp-signups.mjs approve --phone ...` -komennolla avataan sivun linkki. Nykyinen testinumero sallii enintään viisi hyväksyttyä vastaanottajaa.
- Cloudflaren nykyisessä Workerissä on DB, SYNC_TOKEN ja demomaksuasetus, mutta ei sähköpostibindingiä tai Resend-avainta. Verkkotunnusten luku ei ole liittimellä sallittu. Uutta domainia, sähköpostipalvelutiliä, laskutusta tai maksullista liittymää ei perustettu. Käyttäjä kieltäytyi uuden SIM/eSIMin ostamisesta tässä vaiheessa.
- Tilillä jo olevan toisen Metan numeron lukutulos: `account_mode=LIVE`, `VERIFIED`, `CONNECTED`, `CLOUD_API`, mutta `name_status=AVAILABLE_WITHOUT_REVIEW`. Nykyisen tokenin oikeudet ovat vain `whatsapp_business_messaging` ja `public_profile`; terveys-/tilinhallintaluvut estyivät. Meta edellyttää 555-yritysnumerolle näyttönimen hyväksyntää. Numeroa ei vaihdettu käyttöön eikä lähetysvalmiutta väitetä varmennetuksi. Tämä reitti jää jatkoksi, jos halutaan testilistan sijaan kaikille avoin WhatsApp-numero.
- Ei muutoksia Workeriin, käyttäjien tilaus-/jäsenkantoihin, Meta-hyväksyntöihin, palvelimiin tai julkisiin linkkeihin. Ei numeroiden poistoa, tilauksia tai uusia malli-/Valio-kokeita.

Viralliset lähteet: [OpenAI: ajastetut tehtävät ja paikallisen koneen vaatimus](https://learn.chatgpt.com/docs/automations?surface=app), [Meta: 555-yritysnumerot](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/#555-business-phone-numbers).
