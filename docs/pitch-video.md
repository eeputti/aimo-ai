# Aimo: WhatsAppista samaan ostoskoriin

- Katselu: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- MP4: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-whatsapp-ja-ostoskori.mp4
- **Kesto78,48s (1min18,48s), ei ääniraitaa.** H.264,1280×720,25fps,BT.709.

## Koko tilausketju samassa tallenteessa

Käyttäjä huomautti, että pelkkään ostoskoriin rajatusta videosta oli poistettu WhatsApp-demonstraatio. Uusi video lisää keskustelun alkuun ja säilyttää käyttäjän viitekuvan mukaisen ostoskorin.

1. Ostaja pyytää keskustelussa20l laktoositonta maitoa maanantaiksi.
2. Apuri näyttää vaihtoehdot, ostaja valitsee tuotteen3.
3. Ostaja pyytää avaamaan korin. Vastauksessa on Avaa ostoskori -linkki.
4. Linkki avataan samassa selaintallenteessa. /whatsapp/cart näyttää saman tuotteen ja20l määrän.
5. Ostaja muuttaa korin omalla muutoskentällä määräksi30l.
6. TARKISTA JA TILAA → VAHVISTA DEMOTILAUS → confirmed,AGW-20261114-0001.

Tallenne on yksi jatkuva selainajo. Keskustelusta luotua korilinkkiä todella klikataan, eikä keskustelua ja erillistä ostoskoria ole liimattu eri tilauksista. Ostoskorissa käytetään alkuperäisiä public/whatsapp-storefront-cart.html/js/css-tiedostoja ja fontteja.

## Mitä WhatsApp-osuus näyttää

WhatsApp-osuus on **projektin keskustelun selaindemo, ei oikean WhatsApp-sovelluksen tai Metan toimituksen tallenne**. Tämä kerrotaan videon otsakkeessa ja katselusivulla. Paikallinen kuvausharness käyttää projektin createWebDemo-,createDemoOrderingChat- ja createCartLink-moduuleja. Selaindemon aloitusteksti päivitettiin korivahvistusta vastaavaksi, ja palvelimen aito korilinkki esitetään klikattavana Avaa ostoskori -painikkeena. Vastauksia, tuotevalintoja, määriä tai tilaustiloja ei keksitty kuvia varten.

## Ympäristö ja tarkistukset

Muuttamaton sovelluslähde043f08f, erillinen paikallinen HTTPS-palvelin ja omat kannat. Kuusi esimerkkituotetta, nimet ja tunnisteet repon julkisesta snapshotista, muut tiedot testisyötteitä. Hinnat,saatavuus ja aika simuloitu. Paikallinen testivaltuus exceptions,1000€/tilaus,2000€/päivä. Ei käyttäjäkantojen muutoksia, kielimalli-/Valio-avaimia, Meta-lähetyksiä, oikeita tilauksia tai maksuja. aimo-team-/teamMCP-aineisto ei kuulu videoon. Avaimia tai allekirjoitettua korilinkkiä ei julkaista.

Selainajuri varmisti vaihtoehdot → tuotevalinta → korilinkki → sama20l kori →30l → tarkistus → confirmed, ei selainvirheitä. Videon koko dekoodaus läpi,ffprobe78,48s ja0äänivirtaa. Sinisen ja vaalean otsakealueen värinäytteet verrattu PNG-lähteeseen, suurin kanavaero4/255.

Sites-versio5, julkaisu succeeded. Julkinen MP4 ladattu takaisin ilman tunnistautumista,HTTP200, paikalliseen identtinen SHA-256:4c76a85a6c6a4ef43487238071c946c08fcc59026c75d9aff0a22c1d12fa102d. Tiedosto2541465tavua. Uusi tiedostonimi välttää vanhan, vajaaksi jääneen videon välimuistiversion.
