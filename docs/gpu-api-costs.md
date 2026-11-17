# GPU-palvelin vai Anthropicin API: kustannusvertailu

Julkiset hinnastot tarkistettu 17.11.2026. Laskelma on esimerkki ostosapurin kustannusrakenteesta, ei nykyisen tuotannon lasku tai mitattu tokenikeskiarvo. API on pienellä käyttömäärällä edullinen; GPU:n jatkuva vuokra alkaa kannattaa vasta riittävällä käytöllä ja hyväksyttävällä mallilaadulla.

## Lähtöoletukset

Yksi mallikutsu sisältää **3000 laskutettavaa syötetokenia ja 500 tulostokenia**. Syöte sisältää myös ohjeet, keskusteluhistorian, työkalujen kuvaukset ja palautteet. Tulostokenien oletus kattaa kaiken laskutettavan generoinnin, myös mahdollisen ajattelun; 500 ei tarkoita pelkästään asiakkaalle näytettyä tekstiä. Ei välimuistiosumia, cache-kirjoituksia, Batch-alennusta, Fast Mode -lisähintaa, erillisiä maksullisia työkaluja tai alennussopimusta. Kaikki dollarimäärät ovat USD, ennen veroja ja muita palveluita. Eurohintaa ei ole muunnettu dollariksi.

3000/500 on vertailuoletus. Lyhyen WhatsApp-viestin koko on eri asia kuin API:lle lähetetyn koko syötteen tokenimäärä. Yksi WhatsApp-viesti voi tarvita useita mallikutsuja; yksiselitteinen korimuutos voi puolestaan toimia ohjelmalogiikalla ilman mallia. Repon `server/aimoAgent.mjs` tukee jo ohjeiden ja keskustelun välimuistimerkintöjä, mutta osumat ja todellinen kulutus pitää mitata tuotannosta. Tässä ei luettu salaisuuksia, asiakkaiden keskusteluja tai laskutustiliä eikä tehty mallikutsuja.

## API: käyttöön perustuva kustannus

| Malli | Syöte / miljoona tokenia | Tuloste / miljoona tokenia | 1000 kutsua | 10 000 kutsua | 100 000 kutsua |
|---|---:|---:|---:|---:|---:|
| Claude Haiku 5.5 | 0,10 $ | 0,50 $ | 0,55 $ | 5,50 $ | 55 $ |
| Claude Sonnet 5.5 | 2 $ | 10 $ | 11 $ | 110 $ | 1100 $ |
| Claude Opus 5.5 | 4 $ | 20 $ | 22 $ | 220 $ | 2200 $ |

Haikun nämä hinnat koskevat enintään 100 000 tokenin syötettä. Malliversio on olennainen: esimerkiksi vanhemman Haiku 4.5:n hinnasto on eri. Vertailu ei vaihda nykyistä malliasetusta.

Kaava yhdelle kutsulle: `(syötetokenit × syötteen MTok-hinta + tulostokenit × tulosteen MTok-hinta) / 1 000 000`. Sonnet-esimerkki: `(3000 × 2 + 500 × 10) / 1 000 000 = 0,011 $`.

Jos jokainen 10 000 WhatsApp-viestistä tarvitsee kolme tämän kokoista mallikutsua, kustannus on Haikulla **16,50 $**, Sonnetilla **330 $**, Opuksella **660 $**. Tämä ei ole väite nykyisen botin kutsumääristä. Pidemmät syötteet, ajattelutokenit ja uudelleenyritykset nostavat hintaa. Välimuistin onnistuneet osumat voivat laskea syötekustannusta, kun taas cache-kirjoituksilla on oma hintansa. Batch ei kuulu tämän reaaliaikaisen demon perusvertailuun.

Lähteet: [Anthropic API-hinnasto](https://claude.com/pricing) ja [tarkat tokeni-, välimuisti- ja työkaluhinnat](https://platform.claude.com/docs/en/about-claude/pricing).

## GPU: hinta koneen varausajasta

| Palvelin | Tunti | 6 tuntia | Jatkuva käyttö |
|---|---:|---:|---:|
| Runpod RTX A5000, 24 Gt | 0,27 $ | 1,62 $ | 197,10 $ / 730 h |
| Runpod RTX 4090, 24 Gt | 0,89 $ | 5,34 $ | 649,70 $ / 730 h |
| Scaleway L4-1-24G, 24 Gt | noin 0,79 € | noin 4,74 € | hinnaston arvio noin 575 €/kk |

Runpodin luvut ovat nyt hinnastossa näkyvät Pod-hinnat; pilviluokka, alue ja saatavuus tarkistetaan ostettaessa. Scalewayn kuukausiarvio käyttää valmistajan tarkempaa tuntihintaa, joten se eroaa pyöristetyn 0,79 euron kertomisesta 730:llä. GPU-hinnat eivät sisällä kaikkia levy-, IP-, vero-, ylläpito- tai muita palvelukuluja. Ne eivät sisällä kehittäjien ylläpitotyötä. Palvelin maksaa myös ilman käyttäjiä ollessaan vuokrattuna. Pysäyttäminen säästää laskentakuluja palveluntarjoajan ehtojen mukaan, mutta jatkuva välitön saatavuus menetetään; automaattisesti käynnistyvä GPU-palvelu olisi erillinen toteutus.

API-vaihtoehdossakin tarvitaan agentin, webhookin ja tietojen palvelin. Sen kustannuksia tai WhatsApp-/verkkokauppapalveluiden kuluja ei ole laskettu mukaan kumpaankaan vaihtoehtoon. GPU-ratkaisu voi yhdistää agentin ja mallin samalle koneelle. Vertailu koskee pääasiassa mallilaskentaa.

Lähteet: [Runpod GPU-hinnasto](https://www.runpod.io/pricing), [Scaleway GPU-hinnasto](https://www.scaleway.com/en/pricing/gpu/). Käyttöönoton erot: [gpu-server.md](gpu-server.md).

## Laskennallinen tasapiste

Edullisen A5000:n jatkuva 730 tunnin vuokra, **197,10 $**, vastaa noin:

- **358 364 Haiku-kutsua** kuukaudessa.
- **17 919 Sonnet-kutsua** kuukaudessa.
- **8960 Opus-kutsua** kuukaudessa.

Nämä ovat ylöspäin pyöristettyjä hintarajoja yllä olevalla tokenioletuksella. Esimerkiksi noin 18 000 Sonnet-kutsun jälkeen A5000:n laskentavuokra alittaa tämän API-laskelman. Jos kutsuja olisi kolme viestiä kohti, Sonnet-raja olisi noin 6000 WhatsApp-viestiä kuukaudessa; todelliset koko- ja kutsumäärät on silti mitattava.

**Tasapiste ei todista samaa laatua tai riittävää kapasiteettia.** Qwen3 8B/14B yhdellä 24 Gt:n GPU:lla ei ole sama malli kuin Claude. GPU-kokeen läpimenoa, samanaikaisia käyttäjiä, suomenkielisten tilausten laatua ja virheiden kustannusta ei ole vielä mitattu. Parempaan laatutavoitteeseen tarvittava suurempi malli voi nostaa GPU-budjettia. API:n kapasiteetti puolestaan riippuu tilin nopeusrajoista.

## Suositus projektille

Nykyistä kevyttä demokäyttöä varten **projektin oma API-organisaatio ja budjetti** on todennäköisesti edullisempi kuin ympäri vuorokauden varattu GPU. Aloitetaan tehtävään laadultaan riittävästä mallista ja käytetään kalliimpaa vain tarvittaessa. Mallin laatu päätetään tilaustesteillä, ei hinnalla. GPU:n lyhyt vuokrakoe on edelleen järkevä, jos halutaan tutkia omaa mallia; GPU:n pitkäaikaista varausta ei perustella vielä säästöillä ilman käyttö- ja laatumittausta.

API:n käyttö ei vaadi botin ajamista kummankaan kehittäjän koneella. Henkilökohtaisesta laskutuksesta irtaudutaan erillisellä projektin organisaatiolla, omalla API-avaimella ja kulurajalla. Pelkkä uusi avain tai workspace henkilökohtaisen organisaation alla ei siirrä laskua eri maksajalle. Tämä on suositus, ei käyttäjän hyväksymä mallin tai laskutuksen vaihto. [Anthropicin workspace- ja kulurajat](https://platform.claude.com/docs/en/manage-claude/workspaces).

Koneellisesti tarkistettavat luvut ja lähteet: [evaluations/gpu-api-costs-20261117.json](evaluations/gpu-api-costs-20261117.json). Ei palvelinhankintaa, asetusten vaihtoa, henkilökohtaista mallikutsua tai nykyisen demon muutosta tämän vertailun yhteydessä.
