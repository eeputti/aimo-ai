# Aimo: WhatsApp, ostoskori ja reseptistä tuotteiksi

- Katselu: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- MP4: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-koko-demo.mp4
- **Kesto 107,20 sekuntia (1 min 47,2 s), alle ehdottoman 120 sekunnin rajan.**
- Ei ääniraitaa. H.264, 1280 × 720, 25 fps, BT.709, MP4 / faststart.
- Videossa on 11 lyhyttä suomenkielistä selitystekstiä. Tekstit ovat kuvan alapuolella eivätkä peitä toimintoja. Erillinen tekstitystiedosto: /captions.vtt.

## Videon sisältö

1. WhatsApp-keskustelun selaindemossa ostaja pyytää 20 litraa laktoositonta maitoa maanantaiksi ja valitsee tuotteen.
2. Keskustelun Avaa ostoskori -linkki avaa saman korin samoilla tuotteilla ja määrillä. Tämä on yksi jatkuva tallenne, ei eri tilausten yhdistelmä.
3. Käyttäjän viitekuvan mukaisessa /whatsapp/cart-näkymässä määrä muutetaan 30 litraan. Hinnat ja saatavuus tarkistetaan ennen erillistä vahvistusta. Demotilaus tallentuu ostajan valtuuksien mukaisesti.
4. Vaihtoehtoisena aloitustapana näytetään reseptipolku: valmis Lohikeitto-reseptipohja, 100 valmistettavaa annosta ja niistä laskettu kahdeksan raaka-aineen tarve, esimerkiksi lohta 10 kg ja perunaa 20 kg.
5. Reseptin raaka-aineille haetaan sopivat tuotteet, valitaan tuotteet ja lisätään kahdeksan riviä selaimen ostoskoriin tarkistettaviksi. Reseptistä valmisteltua toista koria ei tilata videossa.

Selitystekstit kertovat tarpeen antamisen, tuotevalinnan, korilinkin, määrämuutokset, hinnan ja saatavuuden tarkistuksen, valtuudet sekä reseptistä laskemisen vaiheet. WhatsApp- ja ostoskoriosuus on 78,48 s. Reseptiosuus on noin 28,7 s; sen toistuvia tuotevalintoja on nopeutettu kolminkertaisiksi.

## Toteutus ja rajaukset

Sovelluslähde commitista 043f08f. Ostoskorin alkuperäinen ulkoasu, Matter- ja National-fontit sekä Aimo-värit säilyvät. Reseptiosuus käyttää projektin /recipes.html-sivua sekä oikeita analyzeRecipeSource-, recipeProducts- ja reviewStorefront-moduuleja.

WhatsApp-osuus on projektin keskustelun selaindemo, ei oikean WhatsApp-sovelluksen tai Metan toimituksen tallenne. Kuvausharness esittää palvelimen antaman aidon korilinkin painikkeena ja käyttää korivahvistukseen sopivaa aloitustekstiä. Sovelluksen tilauslogiikkaa ja ostoskorin käyttöliittymää ei muutettu videota varten.

Omat paikalliset HTTPS-palvelimet ja erilliset kannat. Tuotetiedot ovat rajattuja esimerkkisyötteitä; hinnat, saatavuus ja aika simuloitu. Reseptin tuotehakua varten lisättiin seitsemän esimerkkituotetta. Reseptipalvelimen demokello on ennen kaikkien tuotteiden tilausaikarajoja. Ei kielimalli- tai Valio-avaimia, Meta-lähetyksiä, oikeita tilauksia tai maksuja. Reseptiosuus ei väitä demonstroivansa vapaamuotoista kielimallireseptiä: siinä käytetään projektin valmista lohikeittopohjaa ja sen raaka-aineiden tuotehakua. Avaimia ja allekirjoitettua korilinkkiä ei julkaista. aimo-team-/teamMCP-aineistoa ei käytetä videossa.

## Tarkistukset ja julkaisu

Selainajurit varmistivat WhatsApp → sama kori → 30 l → confirmed sekä reseptin 100 annosta, kahdeksan raaka-ainetta ja kahdeksan lisättyä koririviä. Ei selainvirheitä. Videon koko dekoodaus, pituus, äänettömyys sekä eri vaiheiden tekstien luettavuus tarkistettu renderöidyistä ruuduista. Värialue muunnetaan hallitusti full-range-lähteestä BT.709-videoon.

Sites-versio 6 julkaistu onnistuneesti. MP4 ladattu takaisin ilman tunnistautumista: HTTP 200, 107,20 s, nolla äänivirtaa, 3 626 231 tavua ja paikalliseen identtinen SHA-256: 7dc6bb60d45114b8a9824ba5b8e2e06b54331d50ebd5169a6433a3c0687b572e.
