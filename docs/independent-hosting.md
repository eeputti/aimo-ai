# Koneista riippumaton agentti ja tekoälyn laskutus

Tilanne tarkistettu 17.11.2026 GitHubin main-versiosta 34eed26.

## Hosting on jo pilvessä

[Nykyinen julkaisuohje](vercel.md) ja työloki kertovat 16.11. tehdystä siirrosta: WhatsApp-palvelin Vercelissä, viisi kantaa Tursossa ja sivusto sekä minuuttiajastin Cloudflaressa. Julkinen GET https://aimo-whatsapp.vercel.app/healthz palautti tarkistushetkellä `ok: true`, `mode: ordering-demo`, `host: cloud`. Pelkkä terveystarkistus ei todista Meta-tokenin toimivuutta tai viestin läpimenoa. Kummankaan kehittäjän koneen ei tämän arkkitehtuurin mukaan tarvitse olla käynnissä. Kehittäjän tietokoneelta tehtävä julkaisu on ylläpitotoimi, ei agentin ajonaikainen riippuvuus.

Ei ole tarpeen siirtää toimivaa palvelua uudelleen omalle virtuaalipalvelimelle vain tämän tavoitteen vuoksi. Repossa on myös Docker-vaihtoehto (`deploy/whatsapp`), jos oma palvelin myöhemmin valitaan.

## Tekoälyn laskutus on eri asia

`server/config.mjs` lukee ANTHROPIC_API_KEY-asetuksen. `server/aimoAgent.mjs` käyttää sillä Anthropic SDK:ta suoriin mallikutsuihin. API-käyttö laskutetaan avaimen omistavalta API-tililtä; Claude-/ChatGPT-chattilaus ei ole tämän integraation maksutapa. Lähdekoodista tai terveystarkistuksesta ei näe, kenen tili tai laskutus on tuotannon avaimen takana.

Vaihtoehdot:

- **Projektin oma API-laskutus (suositus nykyiselle demolle):** projektin hallintaan oma organisaatio/workspace ja erillinen palvelinavain. Asetetaan palveluntarjoajan saatavilla olevat käyttörajat ja hälytykset; selvitetään erikseen, mitkä rajat estävät käytön ja mitkä vain ilmoittavat. Vaihdetaan Vercelin tuotannon ANTHROPIC_API_KEY yksityisesti ja julkaistaan uusi versio. Sama pilvihosting voi jatkaa. Tämä poistaa henkilökohtaiseen API-avaimeen sidotun laskutuksen, mutta ei mallikutsujen kustannusta. Myös paikalliset maksulliset arviointiajot tarvitsevat projektin avaimen, jos ne halutaan pois henkilökohtaiselta laskulta.
- **Itse ajettava malli:** avoimen painotiedoston mallipalvelin omalla pilvipalvelimella; ei mallipalveluntarjoajan tokenilaskua, mutta laskenta, mahdollinen GPU ja ylläpito maksavat. Nykyinen toteutus on Anthropic SDK -kohtainen, joten tämä vaatii mallisovittimen sekä jäsenneltyjen vastausten, suomen, reseptien ja tarvittaessa kuvien testauksen. Ei pelkkä avaimen vaihto. Äänentunnistuksen Groq/OpenAI/command-asetukset tarkistetaan erikseen.
- **Sääntöpohjainen tila:** ilman Anthropic-avainta on sääntöpohjainen varapolku. Sitä ei pidä esittää nykyisen vapaan keskustelun, kuvien ja reseptiymmärryksen täysimääräisenä korvaajana.

## Käyttöönoton varmennus

Projektin omistaja valitsee laskutusmallin. Omistaja hallitsee palvelutilit ja lisää uuden salaisuuden suoraan palvelun asetuksiin; avainta ei toimiteta chatissa tai Gitissä. Säilytetään nykyiset kannat, asiakasliitokset ja allekirjoitusavaimet. Varmennetaan rajat, julkaisun jälkeen terveystarkistus ja yksi omalla testipuhelimella lähetetty ostoslistaviesti ja määrämuutos. Lopullinen riippumattomuuskoe tehdään kehittäjien koneet suljettuina. Laskutusnäkymästä varmistetaan, että käyttö kirjautuu projektin tilille. Vanha avain poistetaan tästä sovelluksesta varmennetun siirron jälkeen; muiden sovellusten mahdollisesti käyttämää avainta ei peruta selvittämättä vaikutusta.

Tässä selvityksessä ei muutettu tuotannon asetuksia, vaihdettu avaimia, tehty maksullisia mallikutsuja, julkaistu palvelua tai tehty WhatsApp-koetta. Valinta ja tilien hallintaoikeudet ovat vielä avoinna.
