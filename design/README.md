# Tiivis ja luotettava ostoskori — käyttöliittymäehdotukset

14.11.2026. Graafisia, paikallisesti toimivia ehdotuksia; ei kytkentää tilausrajapintaan. `aimo-ui-ehdotukset.html` on Codexin visualize-esityksen HTML-fragmentti, ei uusi tuotantosivu. Nykyistä etusivua, käynnissä olevaa palvelinta tai tilauskantaa ei muutettu.

## Käyttäjän täsmentämä suunta

- Ostoportaali helpottaa ostamista huomaamalla esimerkiksi poikkeavan tilausmäärän ja näyttämällä ymmärrettävän perustelun.
- Ostoskori pysyy pääasiana: aidot tuotekuvat, tiiviit rivit ja pienet huomautukset. Ei erillistä keskustelunäkymää tai suuria päätöskortteja.
- Värit ja symbolit ilmaisevat tilan. Keltainen nostaa tarkistettavan määrän esiin juuri tuotteen kohdalla, vihreä kertoo perustellusta tai käyttäjän vahvistamasta määrästä. Punainen varataan todelliselle tilausesteelle; puuttuva tieto ei saa näyttää vihreältä.
- Ensisijainen toiminto on selkeä **HYVÄKSY MUUTOS**. Määrä ennen ja jälkeen sekä vaikutus tilauksen summaan näytetään vieressä. Alkuperäisen määrän säilyttäminen on erillinen, pienempi toiminto.
- Ei otsikkoa ”sinun päätöksesi”. Huomion syy ilmaistaan suoraan: ”Tarkista määrä”, ”5 × tavallinen määrä”.

## Kolme vaihtoehtoa

1. **Huomio tuoterivillä — suositus.** Kerman rivi muuttuu keltaiseksi ja näyttää heti muutoksen 30 l → 6 l, syyn ja vihreän hyväksyntäpainikkeen. Yhteenveto on vieressä, puhelimella listan alla. Huomautuksen ja toiminnon yhteys tuotteeseen on vahvin.
2. **Yhteinen tarkistusnauha.** Tuotelista säilyy erityisen tiiviinä. Keltainen tarkistusnauha kokoaa muutosehdotuksen ennen tilauksen yhteenvetoa. Sopii myöhemmin usean huomion läpikäyntiin, mutta yhteys yksittäiseen riviin on heikompi.
3. **Tarkistus vahvistushetkellä.** Määrähuomio aukeaa pieneen ikkunaan tilausta tarkistettaessa. Hyväksyntä erottuu vahvasti, mutta katkaisee ostamisen. Ikkunan voi sulkea ja avata uudelleen ”Tarkista ja tilaa” -painikkeesta.

Ensimmäinen vaihtoehto on avustajan suositus. Käyttäjä ei ole vielä valinnut toteutettavaa vaihtoehtoa.

## Esimerkkitiedot ja vuorovaikutus

Kaikki hinnat, myyntierät, historiatiedot, reseptit, varastosaldot ja päivämäärät ovat tätä luonnosta varten keksittyjä esimerkkejä. Tuotekuvat ovat aiemmin paikallisesti välimuistitettuja julkisia kuvia; ne eivät todenna esimerkin hintaa tai myyntierää.

- Maito: 9 esimerkkilaatikkoa × 6 l = 54 l, yhteensä 72,90 €. Avattava perustelu: 48 l ostohistoriasta + 12 l ryhmämenusta − 6 l käyttökelpoisesta varastosta. Lähteet ja varaston päiväys näkyvät perustelussa.
- Kerma: aluksi 30 × 1 l ja 150,00 €. Esimerkin tavallinen viikkotilaus on 6 l eikä annetuista varaus- ja reseptitiedoista löydy lisätarvetta. Tämä on tarkistuspyyntö, ei väite virheellisestä tilauksesta.
- Voi: 16 × 500 g = 8 kg, yhteensä 60,00 €.
- **Hyväksy muutos:** kerma 6 l / 30,00 €, kokonaissumma 282,90 € → 162,90 €. Keltainen huomio poistuu, rivi saa vihreän vahvistustilan ja tilauksen esimerkkivahvistus avautuu.
- **Säilytä 30 litraa:** käyttäjä vahvistaa alkuperäisen määrän; summa pysyy 282,90 eurossa. Tarkistus on mahdollista kuitata ilman määrän pienentämistä.
- ”Vahvista tilaus” näyttää vain paikallisen ilmoituksen. Fragmentti ei sisällä verkkokutsuja tai oikean tilauksen lähetystä.
- Vaihtoehdot säilyttävät omat valintansa. Tuotantototeutus tarvitsee palvelimelta tarkistetut tiedot ja varsinaisen tilausketjun.

## Luotettavuuden toteutus myöhemmin

Käyttöliittymää ei pidä kytkeä mielivaltaiseen kielimallin päätelmään siitä, paljonko kermaa on ”oikein”. Luvut lasketaan tarkistetuista yksiköistä ja lähteistä; malli voi auttaa esittämään laskelman. Ostohistoria ei yksin ole mitattua kulutusta. Historiallisen poikkeaman raja, vertailujakso, sesongit ja ryhmätilaukset tarvitsevat erillisen määrittelyn ja validoinnin ennen oikeita hälytyksiä.

Näytä tietojen päiväys, puutteet ja epävarmuus. Ilman ajantasaista varastotietoa ei väitetä varastovähennystä oikeaksi. Kaikki puuttuva tieto ei ole tilauseste; erottele huomautus ja todellinen este. Allergeenirajoituksia ja muita pakollisia sääntöjä ei ohiteta hyväksyntäpainikkeella.

Asiakkaan ostoskorin tarkistus on käyttöliittymäkerros nykyisen Agent Gatewayn ja tarvelaskennan päällä. Tässä työvaiheessa ei muutettu projektin rajapinta-, mandaatti- tai hyväksyntäarkkitehtuuria.

## Kuvien lähteet

Kuvat upotettiin jo olemassa olleesta paikallisesta välimuistista; uusia verkkolatauksia ei tehty. Lähteet perustuvat `data/img/_meta.json`-tietueisiin ja nykyisen etusivun aineistoon.

- Maitokuva: [Valio Arki Eila kevytmaitojuoma](https://www.valio.fi/tuotteet/valio-hyva-suomalainen-arki-eila-kevytmaitojuoma-laktoositon/), välimuistitiedosto `464306.jpg`.
- Kermakuva: [Valio Aimo: Arla kuohukerma 1 l](https://www.valioaimo.fi/toimitustukku/arla-kuohukerma-1-l-esl-laktoositon/), välimuistitiedosto `464727.jpg`.
- Voikuva: [Open Food Facts, tuote 6408430030002](https://world.openfoodfacts.org/product/6408430030002), lähdetieto ”Open Food Facts (CC BY-SA)”, välimuistitiedosto `475797.jpg`. Kuvan lisenssi säilyy CC BY-SA:na; upotus ei muuta muun projektin lisenssiä.
- Logo ja fontit: projektin nykyinen `public/storefront-assets/`-aineisto. Fragmentissa ne on upotettu, jotta esitys toimii ilman paikallista palvelinta tai uusia aineistopyyntöjä.

## Tarkistus

Fragmentin JavaScriptin syntaksi, sisäinen rakenne ja esimerkkisummat tarkistetaan tämän työvaiheen yhteydessä. Selainkokeilu käyttää erillistä staattista esikatselua portissa 4763. Tarkistuksista kirjataan tulokset `TYOLOKI.md`:hen; käyttöliittymäluonnoksen tarkistus ei ole todistus oikean tilausketjun toiminnasta.
