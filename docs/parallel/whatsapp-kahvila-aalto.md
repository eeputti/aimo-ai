# WhatsApp-testinumeron liitos Kahvila Aaltoon

## Toteutus ja kokeen tulos

Palvelimen `WHATSAPP_DEMO_BUYER_ID=kahvila-aalto` yhdistää vain jo paritetun `WHATSAPP_DEMO_PHONE`-lähettäjän olemassa olevaan demo-ostajaan. Kyseessä on asiakkaan lähettäjänumero, ei botin vastaanottonumero. Numero säilytetään yksityisissä ympäristöasetuksissa, ei Gitissä. Muut puhelimet säilyvät erillisinä demoasiakkaina. Viesti tai selain ei voi valita asiakastunnusta.

Sama asiakastunnus kulkee WhatsApp-tilausmoottorissa, ostoslistan rajapinnassa ja paikalliskaupan asiakasvalinnassa. Olemassa olevan ostajan nimi luetaan ostajarekisteristä. Puuttuvaa kohdeostajaa ei luoda tämän asetuksen avulla eikä olemassa olevia avaimia, valtuuksia tai tilaushistoriaa muuteta.

Eristetty regressiokoe käyttää synteettisiä puhelinnumeroita ja tuote-/hintatyökaluja mutta oikeaa viestikanavaa, sääntötulkintaa, pysyvää ostoslistaa ja verkkokaupan koritallennusta. 20 litraa maitoa → neljä kuuden litran myyntierää; uusi WhatsApp-viesti 30 litraa → viisi myyntierää. Sama päivitys uudelleen ei monista rivejä. Asiakasvalinnat näyttävät Kahvila Aallon, väärä tunniste ja peruttu paritus torjutaan. Tilausta ei lähetetä. Kohdistettu sarja 46/46 läpi.

## Oikean demon käyttöönotto — vielä tekemättä

1. Molempien palvelinten omistajat päivittävät koodin. WhatsApp-palvelimen gateway-kannassa pitää olla olemassa oikea `kahvila-aalto`-demo-ostaja. Tämä ei yhdistä eri palvelinten tilaushistorioita.
2. WhatsApp-palvelimen yksityisiin asetuksiin lisätään `WHATSAPP_DEMO_BUYER_ID=kahvila-aalto`; nykyinen `WHATSAPP_DEMO_PHONE` on Eeliksen asiakkaana käyttämä lähettäjänumero. Omistaja käynnistää palvelimen uudelleen.
3. Muuttunut ostaja saa uuden luonnosnimiavaruuden. Vanhaa asiakkuutta, koria tai tarjousvahvistusta ei siirretä automaattisesti. Lähetetään uusi ostoslistaviesti ja luodaan uusi allekirjoitettu korilinkki.
4. Verkkokaupan palvelimen omistaja asettaa uuden linkin yksityiseen `WHATSAPP_CART_SOURCE_URL`-asetukseen ja käynnistää oman palvelimensa uudelleen. Tarkka synkronointiohje: [storefront-whatsapp-sync.md](storefront-whatsapp-sync.md). Linkki on määräaikainen ja luonnoskohtainen. Vanhan asiakkaan lähteeseen sidottu selainkori ei vaihdu hiljaisesti uudelle asiakkaalle: käytä ensin erillistä testi-istuntoa säilyttäen vanha kori.
5. Eelis lähettää oikeasta WhatsAppista listan ja muuttaa määrää. Kahvila Aallon verkkokaupan `/cart.html`-näkymässä pitää näkyä uusi määrä automaattisesti. Tarkistetaan erikseen oikea asiakasvalinta ennen mahdollista tilauskokeilua.

Oikeaa Meta-viestiä, Eeliksen numeroa, hänen palvelimensa kantaa tai käyttäjän localhost:4747-selainta ei tässä kokeessa käytetty. Käynnissä olevia palvelimia ei käynnistetty uudelleen. Tiimialustan MCP-viestitys palautti Internal error -virheen, joten viestin toimitusta Eeliksen Codexille ei ole vahvistettu. GitHub ja tämä raportti välittävät toteutuksen.
