# WhatsApp: kellonajan mukainen tervehdys ja kiireiset tilaukset (Claude Code, päivä ensin -chat)

Tehtävä 23f1d218. Eeliksen lisäpyyntö 15.11.2026 klo 01.25 (välitetty WhatsApp-botti ja localhost integraatio -sessiosta): tervehdys seuraa kellonaikaa, ja kiireiset tilaukset hoidetaan fiksusti. Pohja `fe9940d`.

## Tervehdys (`server/whatsapp/dialogue.mjs`, `ordering.mjs`)

- Aika on Helsingin aika viestin vastaanottohetkestä (`receivedAt`, Metan aikaleima) tai demokellosta, kun `DEMO_NOW` on asetettu. Palvelimen aikavyöhyke ei vaikuta. `ordering.mjs` välittää `receivedAt`:n dialogille.
- Klo 5–10 `Huomenta!`, 10–17 `Päivää!`, 17–22 `Iltaa!` ja yöllä neutraali `Moi!`. Asiakkaan arkinen tervehdys peilataan (`morjes` → `Morjes!`, `moro` → `Moro!`, `moi` → `Moi!`, `hei` → `Hei!`, `terve` → `Terve!`). Vuorokaudenaikaan sidottu tervehdys tulee aina kellosta, joten väärää vuorokaudenaikaa ei sanota (asiakkaan "huomenta" klo 15 → `Päivää!`).
- Apuri tervehtii vain vastauksena asiakkaan tervehdykseen, tyypillisesti keskustelun alussa, ei joka viestissä eikä selainkorissa. Mallin oma tervehdys korvataan aina: pelkkään tervehdykseen malli kirjoittaa vain jatkon, ja muissa viesteissä sen aloittama tervehdys poistetaan.

## Kiire (`server/order-conversation/index.mjs`)

- Kiire tunnistetaan sanoista (tänään, heti, nyt heti, kiire, asap, pikaisesti, mahdollisimman pian) ja kellonaikatoiveista (ennen klo 7, klo 7 mennessä, huomenna aamulla). Lisäksi tämän päivän ja huomisen toimitus käsitellään kiireellisenä.
- Toimituspäivä kysytään edelleen ensin, jos se puuttuu: `Mille päivälle toimitus? Jos on kiire, kirjoita esim. "huomenna", niin katson aikaisimman päivän, jolle ehtii.`
- Jos kiireelliselle päivälle ei ehdi, sama tuote haetaan työkaluilla enintään viideltä seuraavalta päivältä (tai suoraan `nextDeliveryDate`-tiedosta, jos työkalu sen antaa). Esimerkiksi: `Tänään ei enää ehdi: kananmunat. Aikaisin toimitettava päivä on ma 16.11.` ja `1) kyllä, ma 16.11.` / `2) ei, pidetään su 15.11.`. Päivää ei vaihdeta ilman lupaa. Hylättyä vaihtoa ei tarjota uudestaan, ja kaukaiselle päivälle ei tehdä lisähakuja.
- Kun kiireelliselle päivälle ehtii, listan alla lukee työkalujen tilausaikaraja: `Huomiselle ehtii tilata su 15.11. klo 12.00 asti.` Kun vaihtoehtoja on useita, näytetään aikaisin raja. Tämä vaatii vaihtoehtojen `cutoff`-kentän order-toolsista (pyydetty hakujärjestys-sessiolta ad2e5f06, kentät `storefront.mjs`:n `closingTime` → option `cutoff`). Ilman kenttää riviä ei näytetä, ja yhteenveto kertoo rajan kuten ennenkin (`Tilattava viimeistään …`).
- Kellonaikaa ei luvata: `Toivoit toimitusta "ennen klo 7": kellonaikaa en näe tilausjärjestelmästä, joten en voi luvata sitä. Toimituspäivä on ma 16.11.` Rivi näytetään vaihtoehdoissa kerran ja jokaisessa yhteenvedossa.

## Tarkistukset

- Uusi `test/whatsapp-greeting-rush.test.mjs` 6/6 ilman mallia: vuorokaudenajan rajat 4.59/5.00/9.59/10.00/16.59/17.00/21.59/22.00, peilaus, väärän vuorokaudenajan korjaus, UTC-aikaleima, mallin väärän tervehdyksen poisto, selainkorissa ei tervehdystä; tänään ei ehdi → aikaisin päivä työkaluista → 1 vaihtaa päivän → tilausaikaraja ja kellonaikavaraus listassa ja yhteenvedossa; 2 pitää päivän eikä tarjoa uudestaan; kaukainen päivä ei tee lisähakuja; kiire ilman päivää kysyy päivää ensin.
- Kaksi vanhaa dialogitestiä odotti "Hei!" asiakkaan "Moi"-viestiin; nyt `Moi!` (peilaus).
- Koko sarja puhtaassa worktreessa `origin/main` 2ddc0a9 + tämä vaihe: 289/289, 0 ohitettua.
- Oikea malli (`node --env-file=.env`, tyhjä `VALIO_API_KEY`, väliaikaiset kannat ja avain, ei Metaa eikä vahvistusta), vastaanottohetki asetettu: 3 keskustelua, 8 vuoroa, 13 mallikutsua, 0 virhettä. Klo 20.30 "huomenta! tarvis 50 kananmunaa" → `Iltaa! Joo, päivitin ostoskorin!` ja päiväkysymys; klo 07.15 "moro" → `Moro!`; klo 02.10 "Hyvää päivää" → `Moi!`. "tänään 50 kananmunaa ennen klo 7" → `Tänään ei enää ehdi … Aikaisin toimitettava päivä on ma 16.11.`, `1` → ma 16.11. vaihtoehdot ja kellonaikavaraus, `1` → yhteenveto `Tilattava viimeistään su 15.11. klo 12.00.` ja varaus. "heti 20 l maitoa" ilman päivää → kiirettä huomioiva päiväkysymys. Tilausaikarivi vaihtoehtolistassa puuttui kokeessa, koska order-tools ei vielä anna `cutoff`-kenttää (ks. Kiire-kohta).

## Jatko: tilausaikaraja käytössä ja kellonaikasanojen vuoto korjattu

- Hakujärjestys-sessio lisäsi `34fc629`:ssä option `cutoff`-kentän (`storefront.mjs` `closingTime`) ja `NO_ORDERABLE_PRODUCT`-issueen `nextDeliveryDate`-kentän (null, kun pyydetyn päivän tilausaika on jo mennyt; ydin kokeilee silloin seuraavia päiviä). Oikeilla työkaluilla ja katalogilla ilman mallia: "huomiseksi 50 kananmunaa" → lista ja `Huomiselle ehtii tilata su 15.11. klo 12.00 asti.`; "tänään … ennen klo 7" → `Tänään ei enää ehdi`, `1` → ma 16.11. lista tilausaikarajan ja kellonaikavarauksen kanssa, `1` → yhteenveto.
- Tarkistus paljasti sääntötulkin (mallin varapolku) virheen: kellonaika- ja kiiresanat vuotivat tuotesanaan ("kananmuna enne", "kananmuna enne kelt", "aamu maito", "eesti voi"). Ydin poistaa nyt kellonajat (ennen klo 7, klo 7 mennessä), vuorokaudenajat (aamulla, aamuks) ja kiireadverbit (heti, kiireesti, asap) tulkille menevästä tekstistä (`withoutClockWords`). Päiväsanat säilyvät, ja kiire sekä toive luetaan alkuperäisestä viestistä. Testi 7/7 (uusi tapaus myös oikealla sääntötulkilla, kun katalogi on paikalla), koko sarja `origin/main` 34fc629 + korjaus 297/297.

## Rajat

- Ei Meta-lähetyksiä, oikeita Valio-kutsuja, tilauksia eikä 4749-restarttia. Käyttöönotto kuuluu Codexin käyttöönottochatille.
- Toimituksen kellonaikaa ei ole tilausjärjestelmän tiedoissa, joten kellonaikatoiveeseen vastataan aina varauksella.
- Abuse-tests-chatin löydös #208 (mallin vapaa teksti ilman koodivartijaa) ei kuulu tähän vaiheeseen.
