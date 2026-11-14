# Selaimen varademon (/demo) visuaaliset korjaukset (tehtävä B, aleksi-claude)

Eelis-clauden työnjaon tehtävä B (yhteisen taulun viesti #20). Aleksi rajasi tämän työvaiheen kolmeen korjaukseen: tervetuloviesti tyhjään näkymään, hiirellä vieritettävät pikavalinnat ja Aimo-logo avatariin. MCP-tehtävä `f4ceb8a9`.

## Muutokset

- **Tervetuloviesti:** tyhjä näkymä näyttää Tänään-merkin ja apurin kuplan: kuka vastaa, mitä kerrotaan, ja että tilaus lähtee vasta TILAA-vahvistuksella, sekä esimerkkipyyntö. Viesti piirretään selaimessa; se ei tee palvelin- tai mallikutsua.
- **Alusta-painike:** lähettää edelleen saman `peru`-viestin palvelimelle, mutta näkymä palaa tervetuloviestiin eikä näytä nollausvuoroa kuplina. Epäonnistunut nollaus näytetään keltaisena kuplana, jossa kerrotaan edellisen luonnoksen voivan olla yhä voimassa.
- **Pikavalinnat hiirellä:** rullan pystyliike vierittää riviä sivuttain, rivin voi raahata hiirellä (raahauksen päättävä vapautus ei lähetä pikavastausta), hiirilaitteilla näkyy ohut vierityspalkki ja reunat häivytetään, kun rivi jatkuu. Kosketusnäytöllä toiminta on ennallaan. Uudet pikavalinnat aloittavat vasemmasta reunasta. Vähennetyn liikkeen asetus poistaa pehmeän vierityksen.
- **Logo:** avatarissa `public/aimo-logo.png` valkoisella pyöreällä pohjalla; sama kuva faviconina. WhatsApp-palvelin ei tarjoa public-kansiota, joten `server/whatsapp/web-demo.mjs` tarjoaa sen reitillä `GET /demo/logo.png` samalla localhost-rajauksella kuin sivu (tunnelin kautta 403). Jos kuva ei lataudu, avatar näyttää tekstin "aimo".

## Tarkistukset

- `test/whatsapp-web-demo.test.mjs` **2/2**: lisätty logoreitin 200/image/png/PNG-tunniste ja tunnelipyynnön 403.
- Koko `npm test` tällä koneella 155 läpi, 30 virhettä, 7 ohitettu. **Täsmälleen sama tulos ilman tämän työn muutoksia** (git stash): virheet johtuvat koneelta puuttuvasta `data/catalog.json`:sta.
- Oikea selain (Edge headless CDP:n kautta), eristetty palvelin portissa 4791 oikealla `createWebDemo`-moduulilla, muistinvaraisella kannalla ja simuloidulla chat-funktiolla (ei mallia, Metaa, Valiota tai porttia 4749). Leveydet 1280 ja 375 px:
  - tervetuloviesti näkyy, logo latautuu (380 × 132, näkyvä leveys 34 px)
  - rullan pystyliike 200 → pikavalintarivi vieritti 200 px sivuttain ja häivytys molempiin reunoihin; raahaus 150 px takaisin ilman lähetettyä viestiä
  - pikavalinnan klikkaus → oma kupla, kirjoittaa-ilmaisin odotuksen ajan, vastaus ja tilan mukaiset pikavastaukset
  - Alusta → vain Tänään-merkki ja tervetuloviesti
  - vaakaylivuoto 0 px, ei konsolivirheitä (faviconin 404 korjattu)
- Testipalvelin ja selain suljettu.

## Ei tehty / huomiot

- Tehtävän B laajempi lista (moniosaiset vastaukset erillisinä kuplina, listan muotoilu, oikean mallin ketju TILAA:an ja tyhjää kaikki asti) jäi tämän rajauksen ulkopuolelle. `POST /demo/chat` palauttaa yhden `text`-kentän; jos kanavan moniosaisuus halutaan varademoon, se vaatii tiedon ordering-sillalta (`runtime.mjs`/`ordering.mjs`, Danielin omistus).
- Tervetuloviesti näytetään sivun latautuessa, vaikka palvelimella olisi vanha keskeneräinen luonnos. Alusta-painike nollaa sen.
- Logo on leveä sanamerkki, joten pyöreässä avatarissa se on pieni. Neliöversio parantaisi tätä (sama tarve kuin WhatsApp-profiilikuvalla).
