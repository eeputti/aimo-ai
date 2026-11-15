# Aimo-tilausapuri: WhatsApp-ostoskorin ruutudemo

- Katselu: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- MP4: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-ostoskoridemo.mp4
- Kesto: **50,80 s**, alle 120 sekunnin rajan.
- **Ei ääniraitaa**, kertojaa tai musiikkia.
- H.264, 1280 × 720, 25 fps, BT.709, MP4 / faststart.

## Käyttäjän viitekuvan mukainen näkymä

Käyttäjä täsmensi, että aiemmassa videossa oli väärä käyttöliittymä, ja lähetti kuvan WhatsApp-korilinkin avaamasta Toimitustukun näköisestä ostoskorista. Aiempi /demo-keskusteluvaranäkymä poistettiin videosta. Uusi tallenne käyttää juuri tämän korin alkuperäistä HTML:ää, CSS:ää ja fontteja:

- public/whatsapp-storefront-cart.html ja .js / .css
- server/whatsapp/storefront-cart.mjs
- reitti /whatsapp/cart

Allekirjoitettu korilinkki on voimassa, joten viitekuvan vanhentuneen linkin varoitusta ei toisteta. Sivun oma Aimo-tunniste, yläpalkki, vaalea otsake, WA-ilmoitus, ostoskorin typografia ja taulukko säilyvät. Sivustoa ei muotoiltu uudelleen.

## Videon kulku

1. Avataan WhatsAppissa koottu ostoskori, jossa on 20 litraa laktoositonta maitoa.
2. Ostaja kirjoittaa korin omaan muutoskenttään "maitoa 30 l".
3. Tarkistetaan päivittynyt määrä, hinnat ja yhteenveto.
4. Painetaan TARKISTA JA TILAA ja erikseen VAHVISTA DEMOTILAUS.
5. Sama kori näyttää tallennetun, vahvistetun demotilauksen.

## Tallennus ja rajaukset

Muuttamaton sovelluskoodi commitista043f08f, erillinen paikallinen HTTPS-palvelin ja omat kannat. Korilinkki, ostoslistan muutokset, tarjoukset ja tilauksen tallennus kulkevat projektin oikeiden moduulien kautta. Testiasiakkaan paikalliseksi valtuudeksi asetettiin hyväksyntä vain poikkeuksissa, 1 000 €/tilaus ja 2 000 €/päivä. Tilaus jää näihin rajoihin.

Kuusi esimerkkituotetta, nimet ja tunnisteet repon julkisesta snapshotista, muut tuotetiedot testisyötteitä. Hinnat, saatavuus ja aika simuloitu. Ei kielimalli- tai Valio-avainta, Meta-lähetyksiä, oikeita tilauksia tai maksuja. Paikalliset avaimet ja allekirjoitettu korilinkki eivät sisälly julkaistuihin materiaaleihin. aimo-team-/teamMCP-aineistoa ei käytetä videossa.

## Tarkistukset

Selainajossa 20 → 30 litraa, tarkistus ja vahvistus, lopputila confirmed (AGW-20261114-0002), ei selainvirheitä. Videon koko dekoodaus läpi. ffprobe:50,80 s, yksi videovirta ja nolla äänivirtaa. Tiedosto1 876 222 tavua, SHA-256 f8d031bc7a29f990107998a5a635e84de288f062ab48250d7bf2c3b2e49f0d72.

Samalla korjattiin aiemman ruututallenteen värialueen virhetulkinta: lähteen full-range-värit muunnetaan hallitusti BT.709-videoon. Enkoodatun videon sinistä yläpalkkia ja vaaleaa otsaketta verrattiin selaimen PNG-kuvaan; suurin kanavaero näissä tasavärisissä näytepisteissä4/255. Fontit ja ulkoasu tarkistettu renderöidystä ruudusta käyttäjän viitekuvaa vasten.
