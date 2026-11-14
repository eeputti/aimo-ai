# WhatsApp-tilaus paikalliseen verkkokauppaan

Paikallisessa demossa tilausapuri ja verkkokauppa käyttävät samaa testiasiakasta ja samaa gatewayn tilauskirjausta. Oikean Aimo-verkkokaupan testitiliä tai sen asiakasnumeron ja puhelinnumeron liittämistä ei tarvita. Tämä ei lähetä oikeaa Valio-tilausta.

## Käyttö

Käynnistä nykyinen WhatsApp-palvelin `npm run whatsapp` normaaleilla tilaustilan asetuksilla (`WHATSAPP_ORDERING_ENABLED=true`, omat WhatsApp-kannat). Älä käynnistä toista workeria samoihin kantoihin. Jo käynnissä olevan vanhan version päivittäminen tarvitsee käyttöönoton omistajan tekemän yhden restartin; pelkkä sivun päivitys ei lataa uusia palvelinreittejä.

Kun palvelin on projektin nykyisessä paikallisessa portissa 4749:

1. Avaa [testikaupan tilaukset](http://localhost:4749/?shop=orders).
2. Avaa apuri saman näkymän **Avaa tilausapuri** -linkistä tai osoitteesta [localhost:4749/demo](http://localhost:4749/demo). Myös oikeasta WhatsAppista hyväksytyt tilaukset näkyvät tässä, kun Metan kuljetus toimii.
3. Pyydä esimerkiksi `20 l maitoa ja 5 l kermaa maanantaiksi`, täydennä ruokavalio, valitse tuotteet ja tarkista yhteenveto. Vahvista `TILAA`.
4. Kaupan **Ostaja**-valikosta valitaan sama testiasiakas: selaindemossa **Testikeittiö (selaindemo)**, puhelinkanavassa sille aiemmin yhdistetty testiasiakas. Tilaus päivittyy avoimeen tilausnäkymään noin kolmessa sekunnissa. Tilausnumero, tuotteet, summa, toimituspäivä, tila ja päätösketju tulevat samasta gatewaysta.

Testiasiakas syntyy kaupan valikkoon ensimmäisellä apuriviestillä. `WHATSAPP_DEMO_PHONE` valitsee sille jo olemassa olevan testiliitoksen oletusasiakkaaksi; uutta puhelinnumeroa tai oikeaa Aimo-asiakkuutta ei luoda. Selaindemolla ja oikealla puhelimella on eri luonnokset ja testiasiakkaat. Jos valikossa on molemmat, valitse käyttämäsi kanavan asiakas.

## Toteutus ja rajat

- `server/whatsapp-server.mjs` lataa olemassa olevan kaupan HTTP-käsittelijän vain paikalliselle pyynnölle tilaustilassa. Sama prosessi käyttää samoja tuotetyökaluja, gateway-yhteyttä, allekirjoitusavainta ja tilauskantaa. Tilausta ei kopioida tai lähetetä toiseen paikalliseen kantaan.
- Upotettu `server/index.mjs` ei käynnistä omaa palvelinta, WhatsApp-workeria, keittiön alustusta tai automaattisia malli-/hintakutsuja. Hakua ja tarjouksia voi käyttää kaupassa normaalisti.
- `server/local-shop.mjs` lukee aktiivisen testiliitoksen vain luku -yhteydellä ja yhdistää sen jo luotuun demo-ostajaan. Puhelinnumeroa tai API-avainta ei palauteta asiakaskontekstin vastauksessa. Numeron yhdistäminen tai jonon palauttaminen ei kuulu kaupan avaamiseen.
- Kauppa toimii vain palvelinkoneella. Tunneli-/välityspalvelinpyynnöt sekä vieraan sivuston pyynnöt torjutaan. Webhook ja nykyinen `/healthz` säilyvät ennallaan. Testikaupan nollaus ja konsolin testiskenaariot on estetty, jotta ne eivät poistaisi tai sekoittaisi apurin tilauksia.
- Tavallinen localhost-verkkokauppa ja sen `data/gateway.db` / `data/aimo.db` säilyvät erillään. WhatsAppin olemassa oleva eristysvaatimus on yhä voimassa.
- Tämä on paikallinen demo, ei tuotannon kirjautuminen. Oikea Valio-liitäntä tarvitsee vahvistetun asiakas- ja toimituspaikkatunnistuksen, tilausoikeudet sekä dokumentoidun tilauksen vastaanottavan rajapinnan. Nykyisessä challenge-OpenAPI:ssa on hinta- ja saatavuuskutsut, mutta ei tilausendpointia. Ulkoisen kaupan vastaanottamaa tilausta ei saa kuitata valmiiksi pelkän paikallisen `confirmed`-tilan perusteella.

## Tarkistus

`node --disable-warning=ExperimentalWarning --test test/local-shop.test.mjs` käynnistää oikean WhatsApp-palvelimen satunnaiseen porttiin omilla väliaikaisilla kannoilla, simuloiduilla tuotteilla ja ilman malli-/Meta-/Valio-kutsuja. Se varmistaa saman tilauksen näkymisen molemmissa kanavissa, uusintojen turvallisuuden, hyväksynnän, päätösketjun, nollauseston, paikallisuusrajauksen ja vain lukevan tilan säilymisen.
