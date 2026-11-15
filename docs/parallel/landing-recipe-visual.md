# Landingin reseptikuvat ja WhatsApp-viestiesimerkki, 15.11.2026

## Käyttäjän pyyntö ja lopulliset tekstit

- Pieni lisäys nykyiselle landingille: kaksi käyttäjän antamaa ruokakuvaa hieman päällekkäin Aimo- ja WhatsApp-logojen alle, pehmeä sininen varjo sekä selkeä esimerkki reseptilinkin ja kiiretilauksen lähettämisestä WhatsAppissa.
- Käyttäjän jatkotarkennuksen mukainen viesti: **Tämän reseptin ainekset 30 hengelle huomiseksi. Vieläkö ehtisi?**
- Esittelyteksti: **Lähetä reseptilinkki tai tilaa omin sanoin. Myös kiiretilaukset käyvät. Tarkastamme osuvat toimitusajat.**
- Nykyinen Matter/National-typografia, logot ja numeronliitoslomake säilyvät. Viestikupla on staattinen esimerkki.

## Toteutus ja aineisto

- `deploy/cloudflare/index.html`: kuvaryhmä, saavutettavat kuvatekstit, WhatsApp-viestikupla ja esittelyteksti. Lomakkeen tunnisteisiin tai toimintalogiikkaan ei muutoksia.
- `deploy/cloudflare/public/landing.css`: päällekkäiset kortit, sininen hehku ja kapean puhelinnäkymän mitoitus. Kuvatekstit siirrettiin korttien yläreunaan, jotta viestikupla ei peitä niitä.
- Käyttäjän kaksi PNG-liitettä tallennettu vain esityskäyttöön 720 pikselin JPEG-kuvina: `public/landing-images/pasta.jpg` (115 435 tavua) ja `keitto.jpg` (86 174 tavua). Kuvien sisältöä ei generoitu tai muutettu; alkuperäiset liitteet säilyvät.
- SHA-256 pasta: `a063050b25f008a3644a48f78f5215bf5ad088ca8092d558157548a2a78eebe0`; keitto: `02216466fdf8f0c83d98a289820a4515a88fd81b1627447c7901db778a422c9f`.

## Tarkistukset ja julkaisu

- Worker `npm test`: **26/26**. `npm run typecheck`, `npm run build`, `cf deploy --dry-run` ja `git diff --check` läpi. Testit käyttävät eristettyjä vastauksia; ei oikeita tilauksia tai Meta-/Valio-/mallikutsuja.
- Selaimessa paikallinen esikatselu 1280 ja 375 px, lisäksi DOM-mittaus 320 px: kuvat latautuvat eikä vaakaylivuotoa. Tyhjän lomakkeen lähetys näyttää `Anna puhelinnumerosi.`; uusia ilmoittautumisia ei tehty. Selainloki virheetön.
- Julkaistu nykyiseen osoitteeseen <https://aimo-order-demo.aimo-demo-41cfac.workers.dev/>. Ensimmäinen kuvaversio `516e8bb3-6510-441c-8eee-e5f144706d5c`, lopullinen käyttäjän sanamuoto **`d725f4d6-d849-4df4-877e-6ae2465340b5`**. Lopullinen teksti, molempien kuvien latautuminen ja virheetön selainloki tarkistettu julkiselta sivulta. Erillinen Python HTTP-takaisinluku sai 403-vastauksen; tavuntarkkaa verkkohashivarmennusta ei väitetä tehdyksi.

## Rajaus ja työn jatkaminen

- Tämä vaihe muuttaa esittelyä, ei lisää reseptilinkin taustakäsittelyä. Julkisten reseptilinkkien lukupolku kuuluu linkkichatin `fea99383`-työhön; landingin esimerkin tarve ilmoitettu sille tauluviestillä #242. Sen valmistumista tai Node-käyttöönottoa ei väitetä tämän vaiheen tulokseksi.
- Ei Node-restarttia, tietokantamuutoksia, liittymisiä, maksutoimia tai muutoksia muiden keskeneräisiin tiedostoihin.
- Työ tehty erillisessä `/private/tmp/aimo-landing-recipe-20261115`-kloonissa uusimman `origin/main`-pohjan päällä. Yhteisen projektikansion indeksi, haara ja ennestään keskeneräiset muutokset säilytettiin.
