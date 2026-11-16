# Haiku-mittauksen keskusteluviat C1–C7 (Claude Code, sessio C)

17.11.2026. Lähde: sessio F:n raportti `docs/parallel/haiku-quality-2026-11-16.md` ja sen itsepelien vuorot (X066, X079, S018, S050, S070, S090, V025, R04). Eelis hyväksyi korjaukset tässä sessiossa. Ei botin restarttia, Meta-, Valio- tai mallikutsuja.

| # | Vika itsepelissä | Korjaus | Tiedosto |
|---|---|---|---|
| C1 | "Vastaa 1, 2 tai 3." vaikka listassa näkyy "4) Näytä lisää vaihtoehtoja" (S003, S018, X004, V032, R04). | Lisävaihtoehtojen numero kuuluu ohjeeseen: "Vastaa 1, 2, 3 tai 4." Viimeisellä sivulla ilman lisäriviä esim. "Vastaa 1 tai 2." | `server/order-conversation/index.mjs` |
| C2 | Päivänsiirtokysymys toistui 5–7 kertaa, kun asiakas vastasi sanoin ("Ei käy ti, tarvin ehdottomasti maanantaiks"), ja tilausaikaan vastattiin "en saanut tilausaikarajaa" (X066). | Sanallinen vastaus, jonka päivä on pyydetty päivä tai joka alkaa kiellolla, pitää päivän eikä siirtoa kysytä uudelleen. Vastaus kertoo aikaisimman toimitettavan päivän ("Aikaisin toimitettava päivä on ti 17.11. Kirjoita "ti 17.11.", jos se käy."). Tilausaikakysymys samassa tilassa: "Huomiselle (ma 16.11.) ei enää ehdi tilata. Aikaisin toimitettava päivä on ti 17.11., ja sille ehtii tilata ma 16.11. klo 12.00 asti." | `server/order-conversation/index.mjs` |
| C3 | Epämääräiseen avaukseen ("tarvis vähän kaikkee keittiöön", "hei, voisitteko auttaa tilauksen kanssa", "no niin, taas loppu tavarat") malli vastasi "Kerro vaan, mitä tarvitset" kysymättä päivää (S050, S070, S090). | Kun jokainen sana on tarve- tai täytesana, viestissä ei ole lukuja eikä listaa vielä ole, dialogi ohittaa mallin ja kysyy tilausmoottorilta luonnoksen tilan: "Mille päivälle toimitus, ja mitä tarvitset?" tai jo annetun päivän kuittaus. Tuotesana viestissä vie tavalliselle polulle. | `server/whatsapp/dialogue.mjs` |
| C4 | "Tavallinen käy, vaihda tavalliseen" ei muuttanut laktoositonta valintaa, mutta apuri sanoi vaihtaneensa (X079). | Valittu laktoositon tuote (merkintä tai nimi) avataan, laktoosikysymys merkitään käsitellyksi ja vaihtoehdoista näytetään vain tavalliset. Jos tavallista ei ole, se sanotaan ja kaikki näytetään. Asiakkaan oma laktoositon-vaatimus estää vaihdon. | `server/order-conversation/index.mjs` |
| C5 | "Valitse ensimmäinen sopiva" -valtuutta ei noudatettu (S018). | Valtuutus kirjataan nimetylle riville, muuten kysytylle riville, muuten kaikille valitsemattomille. Kun rivin vaihtoehdot näytetään, koodi valitsee ykkösen ja kertoo sen ("Valitsin ensimmäisen sopivan vaihtoehdon: …"). Ei automaattista valintaa, jos tarkkaa osumaa ei ole tai vaihtoehdossa on varoitus. Valinta kasvattaa luonnoksen versiota. | `server/order-conversation/index.mjs` |
| C6 | Irrallinen "Iltaa!", "Huomenta!" tai "Moi!" kesken keskustelun, kun viesti alkoi "Hei" (S003, X004, X056, X079). | Tervehdys vain keskustelun alussa (ei aiempaa keskustelua tai yli kahden tunnin tauko) tai pelkkään tervehdykseen. Mallin oma tervehdys poistetaan kuten ennen. | `server/whatsapp/dialogue.mjs` |
| C7 | Lupaus "palaan siihen sitten" (V025). Lisälistan toisto oli C1:n ohjetekstiä. | Mallin tekstistä pudotetaan lupaus palata, ottaa yhteyttä tai ilmoittaa myöhemmin. Koskee dialogin vastauksia ja korikuittausta (`groundedAcknowledgement`). | `server/whatsapp/model-guard.mjs` |

## Lisäys: V023 (17.11.2026)

F:n täydennys (`docs/parallel/haiku-quality-2026-11-16.md`, 63b9c55): "Mikä näistä toimitetaan varmimmin?" sai 2/4 ajossa vastauksen "En pysty itse arvioimaan", koska toimitusvarmuuskysymyksen tunnistus tunsi vain järjestyksen "varmimmin toimitetaan". Nyt kumpikin järjestys ja "luotettavimmin" tunnistetaan (`compareKind`, `server/order-conversation/index.mjs`), ja koodi vastaa näytettyjen vaihtoehtojen toimitusvarmuustiedoista. Regressiotesti `test/haiku-findings-c.test.mjs` (V023), koko `npm test` 396/396.

## Testit

- Uusi `test/haiku-findings-c.test.mjs` (7) itsepelien vuoroista testityökaluilla. Ennen korjausta C1–C6 kaatuivat odotetusti, C7 läpäisi jo vartijan lisäyksen jälkeen.
- `test/whatsapp-date-first-options.test.mjs`: kaksi odotusta uuteen ohjeeseen "Vastaa 1, 2, 3 tai 4."
- Koko `npm test` 372/372 ennen rebasea (ks. TYOLOKI-merkintä rebasen jälkeisestä ajosta).

## Rajat

- Mittausta ei ajettu uudelleen oikealla mallilla. Suositus F:n raportin komennolla (30 persoonan otos noin 0,10 USD) ennen ja jälkeen.
- C3 tunnistaa vain sanaston sanat; muut epämääräiset avaukset kulkevat mallin kautta kuten ennen. "se tavallinen tilaus taas" jätettiin mallille, koska se voi tarkoittaa edellisen tilauksen toistoa.
- Käyttöön botin seuraavassa sovitussa restartissa (sessio E).
