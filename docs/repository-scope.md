# Repon rajaus 15.11.2026

Käyttäjä valtuutti rajaamaan GitHubin WhatsApp-tilausapuriin, sen ostoskoriin ja niiden tarvitsemaan taustaan. Poistettavat osat saavat jäädä käyttäjän koneelle. Nykyinen landing, liittyminen, tilausnäkymä, demomaksu ja sähköposti kuuluvat samaan polkuun ja säilyvät.

## Säilyvä tuote

Meta-kanava ja testinumeron liitos → päivä ja tarpeet → tuotehaku ja käyttäjän valinta → palvelimella säilyvä luonnos → allekirjoitettu korilinkki → muutokset → tuore tarjous ja erillinen hyväksyntä → idempotentti gatewayn demotilaus.

Gatewayn REST/MCP/OpenAPI-sopimus, ostajan mandaatit, tilauskohtainen paikallinen ihmishyväksyntäsivu ja audit-ketju säilyvät. Tuotehaku käyttää edelleen `server/storefront.mjs`:ää ja sen tarvitsemia Aimo-moduuleja. Tulkinnan reseptiainesosien tuki on yhteinen hakutoiminto; erillinen reseptisivu ja Excel-tuonti on arkistoitu.

## Paikallisesti arkistoitu

- Keittiön ennusteet, inventaario, varaukset, vanhat deep/fast/router-agentit ja yöajo.
- Verkkokaupan etusivukopio ja sen itsenäinen selainkori, kokoelmasivut, reseptisivu, selainhaku ja puhekäyttöliittymä.
- Vanhat agentti-/assistant-/console-näkymät ja erillinen Python-MCP-palvelin.
- AI-työn koordinointipalvelu ja sen käyttöliittymä, ajurit ja testit.
- Suuret alkuperäiskuvat ja vanhat suunnittelu-/työnjakoraportit. Korin yhteiset tyylit, fontit, ikonit, optimoidut tuotekuvat ja lähdemanifesti säilyvät.

Ennen poistoja tehty lähdearkisto ja palautettava Git-bundle ovat käyttäjän koneella projektin viereisessä hakemistossa `aimo-ai-local-archive/2026-11-15-before-whatsapp-cart-cleanup`. Pohjacommit on `e3b70e1589ff3c4b2c237988a0757edf64730419`. Arkistossa on SHA-256-manifesti ja palautusohje. Se ei sisällä ympäristötiedostoja, avaimia, käyttäjän kantoja, node_modulesia tai rajoitettua challenge-dataa.

Alkuperäisen jaetun projektikansion keskeneräisiin tiedostoihin ei koskettu. Siellä vanhat osat ja koordinointikanta ovat yhä paikallisesti käytettävissä. Siivous tehtiin erillisessä kloonissa. Arkistoitu koordinointityökalu ei ole uuden kloonin käynnistysriippuvuus; älä palauta sitä tai muita vanhoja demoja GitHubiin uuden työvaiheen sivuvaikutuksena.

Vanhoissa `TYOLOKI.md`-merkinnöissä olevat tiedostopolut kuvaavat senhetkistä toteutusta. Poistettu lähde löytyy kyseisen merkinnän commitista tai paikallisarkistosta. Historiaa ei kirjoitettu uudelleen.
