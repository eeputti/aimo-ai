# WhatsApp-tilausapuri: neljän ihmisen rinnakkaistyö

Käyttäjän päätös 14.11.2026: neljä ihmistä kehittää samaan aikaan, kukin omien AI-chattiensa kautta. Numerot 1–4 ovat vastuualueita, eivät nimettyjä henkilöitä. Jokainen lukee ensin `AGENTS.md`, uusimman `TYOLOKI.md`:n ja tämän tiedoston. Tämä jako jatkaa olemassa olevaa toteutusta, ei aloita neljää erillistä agenttia alusta.

## Lähtötilanne

Commitissa `eda2d62` on jo vain lukeva WhatsApp-testikanava: webhook, pysyvä SQLite-jono, numeron testiyhdistäminen, keskusteluhistoria ja nykyisen MCP-apurin vastaukset. Meta-asetuksia ja oikeaa puhelintestiä ei ole vielä kytketty. Rakenteinen tilausluonnos ja tilaaminen WhatsAppista puuttuvat. Valio vastaa tuotannon asiakastunnistuksesta; sen todellinen rajapinta ei ole vielä tiedossa. Challenge-API ei ota vastaan oikeita tilauksia.

## Vastuut ja tiedostojen omistus

| Henkilö | Vastuu ja valmis tulos | Saa muuttaa |
|---|---|---|
| **1: WhatsApp ja yhdistäminen** | Nykyinen testikanava käyttöön, julkinen HTTPS, asetukset, muiden kolmen moduulin kytkentä ja yksi toimiva palvelin. Omistaa kokonaisuuden käyttöönoton. | `server/whatsapp/**`, `server/whatsapp-server.mjs`, `scripts/whatsapp-member.mjs`, `server/index.mjs`, `server/config.mjs`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `README.md`, `SUUNNITELMA.md`, `TYOLOKI.md`, `AGENTS.md`, `TYONJAKO.md`, `docs/whatsapp.md`, `test/whatsapp*.test.mjs`, `docs/parallel/1.md`. |
| **2: Keskustelu ja tilausmuisti** | Ostoslista säilyy viestien välillä; puuttuvat tiedot kysytään, korjaukset kohdistuvat oikealle riville ja käyttäjä valitsee tuotteet sekä hyväksyy yhteenvedon. | Uusi `server/order-conversation/**`, `server/assistant.mjs`, `server/aimoAgent.mjs`, uudet `test/order-conversation*.test.mjs`, `test/assistant-whatsapp.test.mjs`, `docs/parallel/2.md`. |
| **3: Tuotteet ja tilauksen toteutus** | Oikeat vaihtoehdot, pakkaukset, hinta/saatavuus valitulle päivälle, tarkistettava tarjous ja hyväksytyn demotilauksen tallennus kerran. | Uusi `server/order-tools/**`, `server/gateway/**`, `server/storefront.mjs`, `server/valioApi.mjs`, `server/catalog.mjs`, `server/itemQuantities.mjs`, `server/aimo/**`, uudet `test/order-tools*.test.mjs`, `docs/parallel/3.md`. |
| **4: Valio-asiakkuus ja kokonaisuuden testit** | Asiakassovitin, selvästi merkitty testiasiakas, toimituspaikat/oikeudet sekä toistettava päästä päähän -testi ja lyhyt demokäsikirjoitus. | Uusi `server/customer-context/**`, uudet `test/customer-context*.test.mjs`, `test/ordering-e2e*.test.mjs`, `scripts/ordering-e2e*.mjs`, `docs/ordering-demo.md`, `docs/parallel/4.md`. |

Muiden omistamia tiedostoja saa lukea. Tarvittava muutos niihin pyydetään omistajalta oman tilannetiedoston kautta; niitä ei muokata rinnakkain omin päin. Jokainen kirjoittaa omat testinsä ja raportoi tulokset. Henkilö 4 omistaa osien yhteiset testit, ei muiden toteutusten korjaamista ilman työnjaon muutosta.

## Yhteinen rajapintasopimus v1

Tämä on ensimmäisen toteutuksen sopimus. Moduulit voi tehdä riippuvuudet injektoiden ja testivastauksilla, vaikka muiden työ olisi kesken. Henkilö 1 omistaa sopimuksen muutokset ja ilmoittaa muutoksen kaikille ennen sen käyttöönottoa.

### Asiakkuus, henkilö 4

`createCustomerResolver(deps)` palauttaa `resolveCustomer({ sender })`-funktion.

- `sender`: `{ provider: 'whatsapp', businessPhoneId, phone?, userId? }`. `phone` kansainvälisinä numeroina ilman plusmerkkiä nykyisen kanavan käytännön mukaan; `userId` Metan BSUID silloin kun se on saatavilla. Käytettävissä olevat tunnisteet tulevat varmennetusta kanavatapahtumasta.
- Tulos: `{ status: 'identified' | 'unknown' | 'ambiguous' | 'unavailable', customer? }`.
- `customer`: `{ customerId, buyerId, bindingVersion, companyName, personName?, deliverySites: [{ id, label }], permissions: { readProducts, placeOrders }, source: 'demo' | 'valio' }`.
- Tunnistus ja oikeudet tulevat sovittimesta. Malli tai asiakkaan viesti ei saa muodostaa niitä. `buyerId` yhdistetään gatewayn ostajaan vain palvelimella. Avaimia ei palauteta mallille. Epäselvä asiakkuus ei anna pääsyä asiakastietoihin tai tilaamiseen.
- Demossa käytetään erikseen asetettua fiktiivistä asiakasta ja eristettyä demo-ostajaa. Oikeaa Valio-yhteyttä ei väitetä toimivaksi. Ei rakenneta omaa tuotantokirjautumista eikä oleteta Valion tarjoavan tiettyä URL:ia. Nykyinen testiyhdistäminen voidaan säilyttää demotunnistuksen lähteenä; henkilö 1 tekee siihen tarvittavan kytkennän.

### Keskustelu, henkilö 2

`createOrderingConversation({ store, tools, interpretTurn, now })` palauttaa `handleTurn({ messageId, conversationId, customer, text, receivedAt })`-funktion.

- `customer` on yllä kuvattu taustapalvelun tulos. `conversationId` rajataan yritysnumeroon, asiakkaaseen ja sidoksen versioon. Henkilö 1 muodostaa sen varmennetusta kontekstista.
- Tulos: `{ text, draftId?, revision?, status }`. `text` on WhatsAppiin sopiva lyhyt vastaus. Status on `collecting`, `choosing`, `ready`, `confirmed`, `pending_approval`, `rejected` tai `error`.
- Henkilö 2 omistaa pysyvän luonnosstoren, migraatiot ja rajatun säilytyksen uudessa hakemistossaan. Se ei muuta WhatsApp-jonon kantatauluja tai luota 20 viestin historiaan ainoana tilausmuistina. Avaus/sulkeminen ja polku annetaan runtime-kytkennästä.
- Luonnos: `{ id, revision, customerId, bindingVersion, deliveryDate?, deliverySiteId?, lines: [{ ref, productTerm, quantity?, claims, excludeAllergens, selectedProductId? }] }`. Määrä: `{ value, unit: 'L' | 'KG' | 'PCS', basis?: 'items' | 'sales' }`. Rivin `ref` on pysyvä, ei näytön järjestysnumero.
- Luonnosrevision pitää kasvaa aina kun tilauksen sisältö muuttuu. Päivän, määrän, toimituspaikan, ruokarajoitteen tai tuotevalinnan muutos mitätöi tarjouksen ja hyväksynnän. Tallennetaan myös tarjousviite ja hyväksyntää odottava luonnosversio.
- Ei hiljaista tuotteen, toimituspäivän tai ruokavaatimuksen valintaa. Kysytään vain puuttuva tai ristiriitainen tieto, yhdellä kertaa 1–2 olennaista kysymystä. Laktoositon ja maidoton erotetaan. Valmiin vanhan tilauksen päivä ei siirry uuteen tilaukseen.
- Nykyinen verkkosivun apuri säilytetään toimivana. Uusi tilauskeskustelu lisätään erillisenä polkuna, jonka henkilö 1 kytkee WhatsApp-kanavaan; vanhan MCP-lukupolun tilaustyökaluja ei avata yleisesti.

### Tuotetyökalut, henkilö 3

`createOrderingTools(deps)` palauttaa:

1. `suggest({ customer, draft })` → `{ lines: [{ ref, options }], issues }`. Enintään kolme perusteltua vaihtoehtoa per tarve; tuotetunniste, nimi, myyntierä, tarpeen kattava määrä ja vain taustapalvelusta saadut hinta-/saatavuustiedot. Ei automaattista tuotevalintaa.
2. `quote({ customer, draft })` → `{ quoteId, draftId, revision, expiresAt, lines, totals, issues }`. Tarjous koskee valittuja tuotteita, määriä, asiakkuutta, toimituspaikkaa ja päivää. Virhe tai puuttuva tieto estää sen hyväksymisen tilaukseksi.
3. `submit({ customer, draft, quoteId, approval, idempotencyKey })` → `{ status: 'confirmed' | 'pending_approval' | 'rejected', orderId?, reasons }`. `approval` sisältää `{ draftId, revision, quoteId }` ja syntyy vain asiakkaan nimenomaisesta yhteenvedon hyväksynnästä, ei mallin tuottamana valtuutuksena.

Henkilö 3 omistaa tarjousten palvelinpuolisen tallennuksen. Tarjous sidotaan myös todelliseen sisältöön ja asiakkuuteen, ei pelkkään asiakkaan lähettämään revisiolukuun. Ennen tallennusta tarkistetaan oikeudet, tuore hinta/saatavuus, tarjous, sisältö, toimituspaikka ja hyväksyntä. Saman lähetyksen uusinta palauttaa saman tilauksen. Nykyiset gatewayn allekirjoitukset, mandaattirajat ja audit-loki säilyvät. `confirmed` tarkoittaa tässä demossa gatewayn tallennusta; se ei ole todiste oikeasta Valio-tilauksesta.

### Kytkentä, henkilö 1

Vastaanota viesti → ratkaise asiakas henkilön 4 sovittimella → välitä konteksti henkilön 2 keskusteluun, jonka `tools` ovat henkilön 3 toteutuksesta → tallenna/lähetä vastaus nykyisen kanavan kautta. Tarkista asiakkuuden sidoksen voimassaolo uudelleen ennen asiakastietoja sisältävän vastauksen lähetystä ja tilauksen tekemistä. Henkilöt 3 ja 4 sopivat oikeuksien tuoreen tarkistuksen injektoidun funktion kautta; henkilö 1 kytkee sen.

Ota tilauspolku käyttöön erillisellä asetuksella. Vanha vain lukeva kanava ja verkkosivun apuri säilyvät, kunnes uusi polku on tarkistettu. Yksi worker per WhatsApp-kanta. Palvelujen julkaisu ja Meta-asetukset tehdään käytettävissä olevilla valtuuksilla; puuttuvat tunnukset ilmoitetaan, niitä ei keksitä tai kirjata repoon.

## Rinnakkaisen työskentelyn säännöt

- Kaikki voivat muokata omia tiedostojaan samaan aikaan. Kukaan ei siivoa muiden muutoksia tai ota niitä omiin nimiinsä. Ei `stash`-kiertoja yhteisessä kansiossa, `reset --hard`, `clean` tai force pushia.
- **Jos kaikki käyttävät samaa paikallista projektikansiota:** vain henkilö 1 tekee Gitin kirjoittavat toimet (`pull`, `checkout`/`switch`, `add`, `commit`, `merge`, `push`) ja riippuvuuksien asennukset. Muut eivät vaihda haaraa yhteisen työpuun alta. He saavat tarkistaa tilan/diffit ja ajaa omat eristetyt testinsä.
- Jokainen pitää omaa `docs/parallel/N.md`-tiedostoaan: omistetut tiedostot, toteutetut asiat, rajapintatarpeet, tarkistukset ja tulokset, esteet ja seuraava askel. Älä lisää sinne avaimia, puhelinnumeroita tai asiakastietoja.
- Henkilö 1 kokoaa kunkin valmistuneen työvaiheen tiedot `TYOLOKI.md`:hen ja commitoi/pushaa kyseisen vaiheen erikseen omistajan raportin ja tarkistetun diffin perusteella. Myös muiden tekijyys merkitään. Keskeneräisiä tiedostoja ei niputeta mukaan. Jaetut tiedostot tallennetaan vasta kun niiden omistaja on ilmoittanut ne valmiiksi.
- **Jos käytössä ovat eri kloonit:** jokaisella oma työhaara ja omat commitit/pushit. Henkilö 1 yhdistää sovittujen rajojen mukaan; kukaan ei pushaa toisen keskeneräisen työn päälle. `TYOLOKI.md` kirjataan normaalisti omaan commitiin.
- Vain henkilö 1 muokkaa yhteisiä asetuksia, pakettitiedostoja ja yllä olevia yleisdokumentteja. Muut kirjaavat tarvitsemansa asetuksen tai paketin omaan tilannetiedostoonsa. Riippuvuuksia lisätään vain tarpeeseen.
- Käytä väliaikaisia omia kantoja ja vapaita testipalvelinportteja. Älä käytä/nollaa päädemon kantoja. Vain henkilö 1 tekee sovitut yhteisen palvelimen restartit. Ei live-Valio-evaluaatioita tai oikeita testitilauksia päädemoon rutiinitesteissä.

## Työjärjestys ja yhteinen valmistumiskriteeri

1. **Kaikki heti rinnakkain:** 1 viimeistelee kanavan asetukset ja käyttöönoton; 2 tekee keskustelua injektoiduilla testityökaluilla; 3 tekee työkaluja esimerkkiluonnoksilla; 4 tekee asiakassovitinta ja päästä päähän -testin odotuksia testivastauksilla.
2. **Ensimmäinen yhdistäminen:** 4 toimittaa yhden testiasiakkaan, 3 yhden toimivan tuotevaihtoehdon ja tarjouksen, 2 yhden keskusteluketjun. Henkilö 1 kytkee nämä ennen lisäominaisuuksia. Osien ei tarvitse olla kokonaan valmiita yhdistämistä varten.
3. **Yhteinen koe:** oikeassa WhatsAppissa testiasiakas pyytää maitoa ja kermaa maanantaiksi, täydentää laktoosittomuuden/käyttötarkoituksen, valitsee tuotteet, muuttaa yhden määrän ja hyväksyy yhteenvedon. Tästä syntyy yksi eristetty demotilaus ja ymmärrettävä kuittaus.
4. **Henkilö 4 varmentaa lisäksi:** jo annettua päivää ei kysytä uudelleen; ruokarajoite säilyy; tuntematon asiakas ei näe toisen tietoja; määrä-/päivämuutos mitätöi hyväksynnän; sama webhook ja sama hyväksyntä eivät tuota kaksoistilausta; epäonnistunut hinta/saatavuus ei tuota onnistumiskuittausta. Mittaa viestien vasteajat ja kirjaa oikeasti nähty tulos.

Lisäkanavat, puhe, kuvat ja uudet verkkokauppanäkymät odottavat, kunnes tämä ketju toimii.

## Kopioitavat aloituspromptit

### Henkilö 1

```text
Lue AGENTS.md, uusin TYOLOKI.md ja TYONJAKO.md. Olet työnjaon henkilö 1: WhatsApp, käyttöönotto ja kokonaisuuden kytkentä. Jatka olemassa olevaa testikanavaa. Toteuta vastuusi ja kytke muiden moduulit yhteisen v1-sopimuksen mukaan. Noudata tiedosto-omistusta; älä tee muiden toteutuksia päällekkäin. Pidä docs/parallel/1.md ajan tasalla. Jos sama paikallinen kansio on kaikkien käytössä, vain sinä hoidat yhteiset Git-kirjoitukset, pakettimuutokset ja palvelimen restartit. Tallenna valmiit vaiheet tekijöineen TYOLOKI.md:hen ja GitHubiin. Aloita heti omasta kanava-/runtime-osuudestasi ja tee ensimmäinen kytkentä mahdollisimman aikaisin.
```

### Henkilö 2

```text
Lue AGENTS.md, uusin TYOLOKI.md ja TYONJAKO.md. Olet henkilö 2: keskustelu ja pysyvä tilausluonnos. Toteuta v1-sopimuksen keskustelumoduuli, muistissa säilyvät vaatimukset, tarkentavat kysymykset, rivikorjaukset, käyttäjän tuotevalinnat ja yhteenvedon hyväksyntä. Injektoi tuotetyökalut, jotta voit aloittaa testivastauksilla odottamatta muita. Muuta vain omistamiasi tiedostoja ja pidä docs/parallel/2.md ajan tasalla. Yhteisessä paikallisessa kansiossa älä tee Gitin kirjoittavia toimia tai palvelimen restartteja; henkilö 1 tallentaa valmiin vaiheesi. Aloita toteutus ja omat eristetyt testit nyt.
```

### Henkilö 3

```text
Lue AGENTS.md, uusin TYOLOKI.md ja TYONJAKO.md. Olet henkilö 3: tuotteet, tarjoukset ja hyväksytyn demotilauksen toteutus. Tee v1-sopimuksen suggest-, quote- ja submit-työkalut nykyisen katalogin, saatavuustarkistusten ja gatewayn avulla. Tuotevalinta tulee käyttäjältä; tarkista ruokarajoitteet, määrät, toimituspäivä, oikeudet ja hyväksytyn luonnoksen sisältö. Estä vanhentunut hyväksyntä ja kaksoistilaus. Aloita esimerkkiluonnoksilla ja eristetyillä testivastauksilla. Muuta vain omia tiedostojasi ja pidä docs/parallel/3.md ajan tasalla. Yhteisessä kansiossa henkilö 1 hoitaa Git-kirjoitukset ja restartit. Älä tee tilauksia päädemoon tai väitä demotallennusta oikeaksi Valio-tilaukseksi.
```

### Henkilö 4

```text
Lue AGENTS.md, uusin TYOLOKI.md ja TYONJAKO.md. Olet henkilö 4: Valio-asiakassovitin ja kokonaisuuden testit. Toteuta v1-sopimuksen asiakkuus-, toimituspaikka- ja oikeuskonteksti selvästi merkityllä testiasiakkaalla; tunnistuksen omistaa Valio, älä rakenna omaa tuotantokirjautumista tai keksi sen rajapintaa. Tee riippuvuudet injektoiva päästä päähän -testi ja lyhyt docs/ordering-demo.md. Testaa onnistumisen lisäksi muistaminen, rivikorjaus, ruokarajoitteet, oikeuksien rajat, vanha hyväksyntä ja duplikaatit. Aloita testivastauksilla odottamatta muita, ja aja lopuksi kytketty kokonaisuus. Muuta vain omia tiedostojasi ja pidä docs/parallel/4.md ajan tasalla. Yhteisessä kansiossa henkilö 1 hoitaa Git-kirjoitukset ja restartit.
```
