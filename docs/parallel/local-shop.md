# Localhost-kaupan tilausyhteys — Codex, 14.11.2026

## Käyttäjän tarve ja ratkaisu

Käyttäjä halusi tilausapurin tilauksen verkkokauppaan ja pohti oikean Aimo-testitilin liittämistä. Hän kertoi, ettei testitilin numeroliitokseen päästä käsiksi, ja piti localhostia todennäköisenä vaihtoehtona. Toteutettu nykyisen kauppanäkymän paikallinen käyttö WhatsAppin samassa prosessissa ja samalla testiasiakkaalla; ei ulkoista Aimo-tilausta tai uutta tuotantokirjautumista.

## Omistetut tiedostot

- `server/local-shop.mjs`, `server/whatsapp-server.mjs`, `server/index.mjs`
- `public/storefront-agent.js`
- `test/local-shop.test.mjs`, `docs/local-shop.md`, tämä raportti ja oman vaiheen lokimerkintä

Varaukset `132333b7`, `2b6b1d50` ja erillinen lokin/Git-viennin varaus. Alkuperäinen erillisen palvelimen/kannan ajatus korvattiin ennen käyttöönottoa yhden prosessin ratkaisulla: kaksi gateway-kirjoittajaa voisi rikkoa synkronisen päätösketjun rinnakkaisissa kirjoituksissa. Uutta käynnistysskriptiä tai porttia ei jäänyt toteutukseen.

## Valmis ja tarkistettu

- Sama HTTP-käsittelijä ja gateway upotettuna WhatsApp-prosessiin. Paikallinen `/?shop=orders`, automaattinen kolmen sekunnin päivitys, aktiivisten puhelin-/selainasiakkaiden valinta ja asiakastiedot otsakkeessa. Linkki selaimen tilausapuriin.
- Ei toista workeria, palvelimen kuuntelijaa tai keittiön alustus-/malliajoa. Ulkoiset ja tunneloidut kauppapyynnöt estetty. Nollaus-/testiskenaarioreitit estetty. Health-vastauksen skeema säilytettiin yhteensopivana.
- Oikean standalone-prosessin HTTP-ketjun testit **2/2**. Tuotekohtaiset keskustelut, tilauksen kuittaus, sama tilausnumero ja ostaja kaupassa, uusintojen yksi tilaus, hyväksyntä/päätösketju sekä eristyksen ja vain lukevan tilan rajat.
- Kohdistetut integraatio-, preflight-, kori- ja tilauspolkutestit **34/34**. Syntaksit ja diff tarkistettu.
- Selaimessa oma simuloitu väliaikainen esikatselu: kaksi välilehteä, 20 l laktoositonta maitoa ja 5 l kermaa → valinta 1 1 → TILAA → **AGW-20261114-0001**, 221,45 euroa. Sama tilaus ilmestyi automaattisesti kauppaan. Ei selaimen varoituksia tai JavaScript-virheitä. Ei testitilausta käyttäjän päädemoon tai käytössä olevaan WhatsApp-kantaan.
- Koko yhteisen työpuun `npm test` ensimmäisellä ajolla **172/174**: moniviestisen dialogin keskeneräinen rinnakkaismuutos rikkoi vanhan yhden vastauksen e2e-odotuksen (ilmoitettu sen omistajalle taulun viestissä #17). Toinen virhe oli oma uusi health-kenttä; se poistettiin, ja preflight-testit sen jälkeen läpi. Koko sarjan tulosta ei väitetä vielä vihreäksi.

## Käyttöönotto ja jatko

Käynnissä olevaan 4749-prosessiin, `.env`-tiedostoihin, Metaan tai päädemokantoihin ei koskettu toteutuksen aikana. Valmiin commitin jälkeen käyttöönottaja tekee yhden hallitun restartin samoilla asetuksilla ja kannoilla. Osoitteet ovat silloin `http://localhost:4749/?shop=orders` ja `http://localhost:4749/demo`. Uudelleenkäynnistyksen omistaa tehtävä `a6a2ef87`; pyynnöt on välitetty koordinointitauluun. Käyttöönottoa ja oikean puhelimen vastausta ei vielä väitetä varmennetuksi.
