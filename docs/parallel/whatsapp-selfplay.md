# WhatsApp-itsekeskustelut ja niiden korjaukset, 15.11.2026

Omistaja: Codex, WhatsApp-itsekeskusteluchatti. Käyttäjä pyysi oikeita monivuoroisia keskusteluja apurin kanssa ja parempaa ymmärtämistä; vastauksen laatu saa viedä aikaa. Vertailukohta on DM Champin keskustelutapa, ei väite samasta mallista tai mitatusta vastaavuudesta.

## Toteutettu

- `scripts/whatsapp-selfplay.mjs` ajaa oikean allekirjoitetun webhookin, pysyvän jonon, keskustelumuistin, mallireitityksen, tilausmoottorin ja korilinkin. Asiakas on toinen oikea kielimallikutsu, joka vastaa apurin edelliseen viestiin kiinteää ostotavoitetta kohti. Jokaisella ajolla on omat väliaikaiset tietokannat ja allekirjoitusavain. Meta-lähetys ja hinnat simuloidaan; Valion rajapintaa tai käyttäjän kantoja ei käytetä. Lopussa vaaditaan nolla tilausta.
- Viisi perustapausta: kananmunat, monirivinen kori puuttuvin määrin, määräkorjaus ja kysymys samassa viestissä, rivin poisto sekä ruoanlaittoneuvo ennen tilausta. Kooditarkistus lukee todellisen tallennetun korin määrät, päivän, rajaukset, poistot ja palautetun linkin. Erillinen malliarvio nostaa laadullisia ongelmia, mutta se ei ole automaattinen totuus.
- Varsinainen rakenteinen tulkitsija käyttää nyt syvempää mallia ja saa viimeisimmän keskustelun sekä näytetyt tuotteet, pakkaustiedot ja hinnat. Aiemmin pelkkä pintakeskustelu käytti syvempää mallia. Mallin palauttamat desilitrat, senttilitrat, millilitrat ja grammat muunnetaan laskennallisesti perusyksiköiksi. Myös puhekielinen `5 desii` normalisoidaan.
- Poistettu pakollinen yleinen allergia-/ruokavaliokysymys jokaisesta tilauksesta. Ilmoitetut rajaukset säilyvät ja estävät sopimattomat tuotteet. Tuotekohtainen tarkennus kysytään ehdokkaiden todellisen `clarify`-tiedon perusteella; vastaus koskee kysyttyjä rivejä, ja tavallisen tuotteen hyväksymistä ei kysytä uudelleen.
- Vapaamuotoinen korilinkkipyyntö toimii myös samassa viestissä tuotevalinnan tai määräkorjauksen kanssa. Muutos tehdään ennen oikean linkin luontia. Malli saa palvelimen korilinkkikyvyn ja sama linkistä vahvistamisen ohje säilyy keskustelumuistissa. WhatsApp-vastaus ei tee tilausta.
- Viestissä oleva sisällöllinen kysymys saa vastauksen myös silloin, kun sama viesti muuttaa koria. Tuoteneuvo nimeää ehdotettavan ainesosan jatkokysymyksessä ja lyhyt määräviesti voi jatkaa sitä. Ehdotuksesta ei lisätä mitään ilman ostajan vastausta.
- Tarvemäärä säilyy erillään pyöristetystä myyntierästä. Vaihtoehtojen viesti selittää pienimmän näytetyn myyntierän ylityksen ja kertoo, jos kaikki näytetyt vaihtoehdot ovat luomua.

## Oikeasti ajetut keskustelut

10 keskustelua, 34 asiakkaan vuoroa, 105 oikeaa mallikutsua, 0 mallirajapintavirhettä, 0 tilausta. Viidestä eri tapauksesta osa ajettiin uudestaan havaittujen virheiden korjaamisen jälkeen. Tässä vaiheessa ei ajettu sataa asiakasta eikä muutettu mallin painoja. Muiden chattien laajemmat ajurit ovat erillisiä työvaiheita.

| Ajo | Keskustelut | Asiakasvuorot | Mallikutsut | Kooditarkistus |
| --- | ---: | ---: | ---: | --- |
| Ennen korjausta: munat, monirivinen kori | 2 | 10 | 30 | 0/2 |
| Ensimmäinen korjausajo: samat tapaukset | 2 | 6 | 20 | 2/2 |
| Korjaus, poisto, neuvonta | 3 | 9 | 28 | 3/3 |
| Kysymyksen säilyttämisen uusinta | 2 | 6 | 18 | 2/2 |
| Nimetyn neuvontajatkon uusinta | 1 | 3 | 9 | 1/1 |

Esimerkki ennen korjausta, oikean mallin vastaukset:

> Asiakas: ok, näyttää hyvältä. laita linkki tulemaan
>
> Apuri: Hyvä! Tilaus vahvistetaan täällä vastaamalla *TILAA*, erillistä korilinkkiä en pysty lähettämään.

Tätä ennen apuri oli itse luvannut linkin ok-vastauksesta. Korjauksen jälkeen sama tavoite eteni munissa kahdessa vuorossa:

> Asiakas: ykkönen käy, eli ne Loimaan luomumunat 9 rasiaa. laitatko korilinkin tulemaan?
>
> Apuri: Tässä linkki ostoskoriisi. Tarkista tuotteet ja vahvista tilaus siellä: [oikea testilinkki poistettu]

Toinen todellinen virhe: `5 desii` tallentui ennen korjausta 5 litraksi, eikä ensimmäinen oikaisu korjannut sitä. Uusinnassa se tallentui 0,5 litraksi ja maidon myöhempi 50 -> 30 litran korjaus säilyi loppuun asti.

Viimeisessä neuvontauusinnassa vastaus oli esimerkiksi:

> Lohikeittoon sopii parhaiten maustamaton ruokakerma, koska se kestää kuumennusta hyvin eikä juoksetu helposti. [...] Lisätäänkö maustamatonta ruokakermaa ostoslistalle? Kerro määrä.

Tämä ei silti todista koko ketjua virheettömäksi: seuraava tuotehaku tarjosi maustamattomaan ruokakermaan sipulilla maustettua tuotetta ensimmäisenä. Rivin hakutermi tallentui oikein. Havainto välitettiin `server/order-tools/index.mjs`-omistajalle, eikä tämän vaiheen kirjoittaja muokannut omistettua työkalutiedostoa. Samoin työkalun laktoositarkennuksen pitää varmistaa todellinen maitoainesosa, jotta katalogin sekalaiset väittämät eivät tuota turhaa kysymystä esimerkiksi munille.

Malliarvioiden pisteet paranivat noin 1–2:sta 3–4:ään viidestä. Arvioissa oli myös vääriä tulkintoja: esimerkiksi laktoosittoman tuotteen tarjoaminen tilanteessa, jossa tavallinenkin käy, ei yksin riko asiakkaan vaatimusta. Tarkista alkuperäinen viesti, tallennettu tila ja todellinen tuotetieto ennen johtopäätöstä. Ennen-kokeen asiakasmalli myös muutti yhdessä kohdassa tarpeensa pakkausmääräksi; simulaattorin ohjetta tarkennettiin, eikä tätä yksin lasketa apurin virheeksi.

## Tarkistukset ja toistaminen

- Oman muutoksen jäädytetty lähdekuva, ilman muiden keskeneräisiä muutoksia: `npm test` **226/226 läpi**. Mukana aito HTTP-, SQLite-, hyväksyntä-, allergia- ja idempotenssiketju eristetyissä kannoissa.
- Jaetun työpuun laajassa ajossa 236/238 meni läpi; kaksi vielä punaista testiä ovat toisen chatin seuraavan päivä-ensin/sivutusvaiheen keskeneräisiä odotuksia. Niitä ei muutettu tämän vaiheen läpäisyn vuoksi.
- `git diff --check` ja muutettujen moduulien syntaksitarkistukset läpi. Oikeaa Valio-evaluaatiota tai käyttäjän demon tilauksia ei ajettu.
- Yksityiskohtaiset synteettiset JSON-tulokset olivat paikallisissa `/private/tmp/aimo-selfplay-*.json`-tiedostoissa; ne eivät sisällä oikeita asiakkaita. Tilapäiset kannat eivät kuulu Gitiin.

Uusi rajattu ajo avaimen ollessa ympäristössä:

```sh
node --env-file=.env scripts/whatsapp-selfplay.mjs --cases eggs,mixed --max-turns 6 --out /private/tmp/aimo-selfplay-repeat.json
```

`runSelfplay({cases,maxTurns,out,maxModelCalls})` on myös vietävä rajapinta. Tee kukin eristetty ajo omassa lapsiprosessissaan: sovelluksen ympäristö ja gateway latautuvat vain kerran prosessissa. Oletusraja on 220 mallikutsua ja enintään 10 asiakasvuoroa tapausta kohti. Ajuri ei ajasta itseään eikä opi automaattisesti. Puhelimeen toimitus ja käynnissä olevan palvelimen käyttöönotto varmennetaan erikseen.
