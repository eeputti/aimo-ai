# Aimo-tilausapuri: ruutudemo ilman ääntä

- Katselu: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- MP4: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-ruutudemo.mp4
- Kesto: **76,12 sekuntia (1 min 16 s)**, alle palautuksen 120 sekunnin rajan.
- **Ei ääniraitaa:** ei synteettistä puhetta, kertojaa tai musiikkia.
- H.264, 1280 × 720, 25 fps, MP4 / faststart.

## Uusi toteutustapa

Käyttäjä hylkäsi AI-äänen ja pyysi vähemmän mainospuhetta. Aiempi puhuva kalvoesitys korvattiin projektin oikean käyttöliittymän ruututallenteella. Video seuraa yhtä tilausta; lyhyet reunatekstit auttavat seuraamaan tapahtumia.

1. Ostaja kirjoittaa: 20 l laktoositonta maitoa maanantaiksi.
2. Apuri näyttää tuotteet. Ostaja valitsee vaihtoehdon 3.
3. Ostaja muuttaa määräksi 30 litraa.
4. Ostaja vastaa vain "joo". Apuri vaatii vielä erillisen TILAA-vahvistuksen.
5. TILAA tallentaa tilauksen odottamaan ihmisen hyväksyntää.
6. Sama tilaus näkyy projektin hyväksyntäsivulla. Ihminen hyväksyy.
7. Päätösloki näyttää tarkistukset ja hyväksynnän; ketjun eheys on tarkistettu.

Noin 45 s selaindemoa, 17 s hyväksyntänäkymää, 9 s päätöslokia ja lyhyt lopputeksti. Selainlatauksia on leikattu pois. Tallennettuja vastauksia tai tilaustiloja ei korvattu keksityillä käyttöliittymäkuvilla.

## Tallenteen lähde ja rajaukset

- Sovelluksen lähde: eeputti/aimo-ai, commit 043f08f, muuttamaton sovelluskoodi.
- Kuvausreitit: /demo, /approve.html?order=… sekä verkkokaupan Tilaukset → Näytä päätösketju.
- Erillinen paikallinen palvelin ja omat SQLite-kannat. Ei käyttäjän käynnissä olevien palvelinten tai tilausten muutoksia.
- Kuusi kuvausta varten koottua esimerkkituotetta. Nimet ja tunnisteet repossa olevasta julkisesta tuotesnapshotista; luokittelu- ja pakkauskentät paikallisia testisyötteitä. **Hinnat, saatavuus ja aika simuloitu.** Merkintä on videossa ja katselusivulla.
- Haasteen API-avainta tai kielimalliavainta ei käytetty: sääntötulkki, oikeat tilausmoduulit, tarjousallekirjoitus, mandaatti ja loki. Tallenne ei varmista Metan viestinkuljetusta tai vapaamuotoisen kielimallikeskustelun laatua.
- Ei oikeita Meta-viestejä, Valio-tilauksia tai maksuja. Ei aimo-team-/teamMCP-aineistoa videon sisältönä.

## Tarkistukset

Tallennusajuri varmisti, että sama tilaus on lopuksi confirmed, määrä 30 ja päätösketju ehjä. Videon koko dekoodaus läpi ffmpegillä. ffprobe: 76,12 s, yksi videovirta ja **nolla äänivirtaa**. Eri vaiheiden renderöidyt ruudut tarkistettu. Tiedosto 1 688 805 tavua, SHA-256 a15305390ec81082e9d3f0a06986add7f8b2af6eb8b2c0f710ab311541ad0374.

Katselusivu ja kaikki sen tarjoamat MP4-versiot on korvattu tällä äänettömällä ruutudemolla. Uusi erillinen tiedostonimi estää vanhan puhuvan videon sekoittumisen uuteen linkkiin.
