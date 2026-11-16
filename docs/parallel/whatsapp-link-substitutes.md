# Reseptilinkki: bottisuoja, liitetty resepti, saatavuus ja korvaajat

Omistaja: Claude Code, sessio I. Käyttäjän pyynnöt 16.11.2026: keskustelu avaa reseptilinkin, hakee ainekset ja kertoo, jos jotain ainesta ei ole tukussa tai sille päivälle, ja kysyy "kelpaako tilalle esim. sitruunamehu tai aito sitruuna". Kun k-ruoka.fi-linkki ei auennut, Eelis halusi, että botti sanoo sivun olevan bottisuojan takana, pahoittelee ja pyytää kopion reseptistä ("kuvakin reseptistä kelpaa, jos se on sulle helpompaa").

## Miksi k-ruoka.fi ei auennut

k-ruoka.fi palauttaa kaikille automaattisille hakijoille Cloudflaren haasteen (HTTP 403, `cf-mitigated: challenge`). WhatsAppin esikatselukuva näkyy, koska Metan oma hakija on päästetty läpi. Suojausta ei kierretä. Kokeillut sivut: valio.fi, kotikokki.net ja pirkka.fi aukeavat. arla.fi (noin 1,25 Mt) ylitti vanhan 1 Mt:n rajan. soppa365.fi:n etusivu rakentuu selaimessa.

## Toteutus

- `link-reader.mjs`: 401, 403, 429 ja `cf-mitigated`-otsake antavat virheen `LINK_BLOCKED`. Kokoraja nostettiin 3 Mt:hen, koska jäsennys on lineaarinen. `pageNameFromUrl` poimii sivuston ja reseptin nimen osoitteesta (`/reseptit/kermainen-kanapasta` → Kermainen kanapasta).
- `link-advice.mjs`: kun sivu ei aukea, botti kertoo syyn ja pyytää reseptin tekstinä. Kuvaa se pyytää vain WhatsAppissa, jossa kuvat luetaan (sessio H, `media.mjs`). Selainkeskustelussa kuvaa ei pyydetä. Viestin muu sisältö (esim. "juustoo sata kiloo", "x 100") säilyy. Seuraava vähintään 30 merkin viesti tai kuvasta luettu teksti käsitellään reseptinä samalla tarkistuksella kuin sivu: ainesten lähdelainauksen pitää löytyä tekstistä. Lyhyt viesti jatkaa tavallista keskustelua.
- Kerroin "x 100" tai "100-kertaisena" skaalaa määrät, ja botti kertoo, miten pyynnön tulkitsi ("Jos tarkoitit 100 annosta, kirjoita '100 annosta'").
- Toimituspäivä ensin: päivä luetaan pyynnöstä, ostoslistalta tai kysytään. Mennyttä päivää ei käytetä.
- `link-substitutes.mjs`: jokaisen aineksen saatavuus tarkistetaan tilauskeskustelun omalla `suggest`-työkalulla (sama haku, ruokavalio- ja saatavuusehto). Kilo- ja litratarve haetaan oikealla määrällä, kappaletarve yhdellä myyntierällä. Tila voi olla: saatavilla, ei Aimon valikoimassa, ei saatavilla päivälle (aikaisin päivä, jos rajapinta kertoo sen) tai ei tarkalleen tätä tuotetta.
- Puuttuville malli ehdottaa korvaavia hakusanoja ja määrän alkuperäiselle reseptimäärälle. Jokainen korvaaja tarkistetaan samalla työkalulla ennen näyttämistä, ja vain päivälle tilattavat näytetään (enintään kaksi). Ostaja valitsee numerolla tai nimellä, tai "jätetään pois". Pelkkää "joo" ei tulkita valinnaksi. Jos tilattavaa korvaajaa ei löydy, botti kertoo jättävänsä aineksen pois.
- Lopuksi botti näyttää listan korvaajineen ja kysyy lisäystä. Hyväksytty lista ja toimituspäivä menevät nykyiseen tilauskeskusteluun, jossa tuotevalinnat, hinnat ja vahvistus käsitellään kuten ennen.
- `ordering.mjs` välittää linkkivaiheelle asiakkuuden ja kanavan.

## Tarkistukset

- `test/whatsapp-link-substitutes.test.mjs` 5/5 ja `test/whatsapp-links.test.mjs` 15/15 (vanhan virheviestin odotus päivitetty).
- Koko `npm test` worktreessä origin/main 5d6ae75:n päällä: 329/333. Neljä kaatuvaa (`sqlite-remote`, `cloud-handler`) johtuu yhteisestä `node_modules`ista puuttuvasta `@libsql/client`-paketista, eikä se liity tähän muutokseen.
- Oikea malli ja oikea katalogi, simuloidut hinnat ja saatavuus (tyhjä `VALIO_API_KEY`), muistikanta, ei Metaa eikä tilausta: Eeliksen viesti k-ruoka-linkillä → bottisuojaviesti (95 ms) → liitetty resepti (noin 20 s, kaksi mallikutsua) → "perjantaiks" (noin 13 s) → saatavuus pe 20.11. → valkosipulikerman tilalle ruokakerma tai kuohukerma, parmesaanin tilalle grana padano tai pecorino → lista ja tilauskeskustelun syöte "Toimitus 20.11.2026" sekä alkuperäinen toive.
- Tilauskeskustelun jatkoa (juusto 100 kg toiveesta) ei ajettu tässä kokeessa, ja simuloitu saatavuus ei kerro, mitä oikea testirajapinta palauttaa perjantaille.

## Jatko 17.11.: tuntematon saatavuus ei ole "ei saatavilla"

- Valion testirajapinnan nimi ei ratkea (DNS), ja botti vastaa vain välimuistin tiedoilla (`VALIO_FALLBACK=last-known`). Tuotantoa vastaavassa kokeessa (kopio Macin `whatsapp-kitchen.db`:stä ja todelliset asetukset) välimuistin ulkopuoliset tagliatelle, öljy ja persilja näkyivät virheellisesti puuttuvina, ja botti jätti ne pois.
- `storefront.mjs`: kortti kertoo `availabilityUnknown`, kun yhdestäkään osumasta ei ole voimassa olevaa saatavuustietoa, ja `requestedUnknown`, kun pyydetyn tuotteen omista osumista ei ole tietoa ja tilattavat ovat vain lähimpiä muita tuotteita.
- `order-tools`: tyhjä tulos ilman tietoa antaa viestin "Saatavuutta ei saatu nyt tarkistettua päivälle …" (`availabilityUnknown: true`), ei "Ei tilattavaa tuotetta". Lähimpien vaihtoehtojen rivi saa `availabilityUnknown: true`. Tilauskeskustelun ydin näyttää jälkimmäisessä tapauksessa vielä vanhan tekstin "Tarkkaa osumaa ei löytynyt", koska `order-conversation/index.mjs` on toisen session varauksessa.
- Reseptilinkki pitää nämä ainekset listalla omana kohtanaan ("Saatavuutta ei saatu nyt tarkistettua, tarkistetaan tilauksessa"), eikä niille ehdoteta korvaajia.
- Uusinta samoissa olosuhteissa: tagliatelle, öljy ja persilja pysyivät listalla, valkosipulikerman tilalle tarjottiin ruokakermaa tai kuohukermaa, ja vain parmesaani jäi pois (siitä on välimuistissa tietoa, mutta ei tilattavaa tuotetta eikä tilattavaa korvaajaa).
- Testit: link-substitutes 8/8, links 15/15, hakutyyppi ja order-tools mukana yhteensä 44/44. Koko `npm test` 366/372 (samat kuusi libsql-testiä), `aimo:eval` 26/26.

## Rajat ja käyttöönotto

- Suojattuja sivuja ei kierretä. Kopio tai kuva on ainoa reitti.
- Saatavuuden tarkistus tekee yhden haun ainesta ja korvaajaa kohden (enintään neljä rinnakkain).
- Botti siirtyi 16.11. noin klo 23.45 Verceliin (sessio E). Muutos tulee käyttöön vasta seuraavassa `vercel deploy --prod` -julkaisussa; Macin bottia ei käynnistetä uudelleen.
