# WhatsApp: ok avaa saman ostoskorin

Käyttäjän tarkennus 14.11.2026: WhatsAppissa ei tarvitse kirjoittaa TILAA. Valmiin korin jälkeen esimerkiksi ok riittää, ja apuri antaa linkin ostoskoriin. Lopullinen vahvistus tehdään siellä. Tämä korvaa aiemman WhatsApp-yhteenvedon TILAA-ohjeen tässä linkkipolussa.

## Oma rajaus ja toteutus

- `server/whatsapp/cart-handoff.mjs`: deterministinen lyhyen kuittauksen/koripyynnön tunnistus, linkkivastaus ja ready-yhteenvedon ohjeen vaihto. Apuri ei kutsu tilausmoottoria tai submit-työkalua eikä muuta ostoslistaa.
- `ok`, `okei`, `joo`, `kyllä`, `juu`, `jep`, `selvä`, `sopii` ja vastaavat lyhyet kuittaukset avaavat korin, kun viimeisin ready-yhteenveto vastaa edelleen nykyisen korin tunnistetta ja revisiota. Odottavaa lisätuote-ehdotusta tai puuttuvan määrän/ruokavalion vastausta ei kaapata korilinkiksi.
- Suora `avaa kori`, `linkki koriin` tai vanha `TILAA` voi avata myös keskeneräisen korin tarkistettavaksi. Linkin epäonnistuminen palauttaa ohjeen yrittää uudelleen, eikä päästä vanhaa TILAA-viestiä tilauksen lähettämiseen.
- `withCartHandoffHint` vaihtaa vain ready-vastauksen TILAA-ohjeen ok-ohjeeksi. Tuoterivit, hinnat, toimituspäivä, huomautukset, muutosesimerkit ja vastausosat säilyvät.
- `test/whatsapp-cart-handoff.test.mjs`: **7/7 läpi**. Seitsemäs testi käyttää oikeaa `createCartLink.chat`-kerrosta ja varmistaa ok-ohjeen, ok/okei/joo/sopii/TILAA-viestien ohituksen ennen tilausmoottoria sekä selaimen erillisen vahvistuksen säilymisen. Linkkireitin omistajan kytkentä korjasi siinä toistetun integraation puutteen. Ei oikeita API-/malli-/WhatsApp-kutsuja tai käyttäjän tietokantojen muutoksia.
- Yhdessä `test/whatsapp-cart-link.test.mjs`:n kanssa **14/14 läpi**, 0 ohitettua. HTTP-testi vaati oikeuslaajennuksen paikallisen portin avaamiseen. Mukana oikea allekirjoitettu WhatsApp-webhook, sama pysyvä kori selaimessa, version ristiriidan esto, eksplisiittinen vahvistus ja uusinnan idempotenssi sekä linkin allekirjoitus/vanheneminen/asiakkuuserottelu. Syntaksi ja `git diff --check` läpi.

## Integraatio ja käyttöönotto

Linkkireitin omistaa rinnakkainen WhatsApp-korilinkkichatti (yhteinen tehtävä `4d367ec0`, paikallinen `2779d057`). Sen `createCartLink.chat` on WhatsAppin ympärillä oleva kerros; selaimen vahvistus käyttää yhä suoraan yhteistä tilausmoottoria. Näin ok/linkki ei ole tilauslupa, mutta korin erillinen vahvistuspainike toimii nykyisen version ja hyväksynnän tarkistuksin.

Integraatiosopimus lähetetty yhteisellä MCP:llä ja paikallisella taululla. Linkkireitin omistaja kuittasi #121 ja toteutti kytkennän omiin tiedostoihinsa; yhdistetty regressio on vihreä. Hänelle annettu #127 lupa koota myös tämän chatin kolme tiedostoa samaan valmiiseen linkki+OK-työvaiheen commitiin ja lokiin, jotta välivaihe ei tarvitse vielä puuttuvaa linkkimoduulia. Git-vastaavan commitia/pushia ja käyttöönottochatin yhtä hallittua versionpäivitystä ei vielä ole varmennettu tässä raportissa. Muiden varaamia dialogue/ordering/runtime/cart-link-tiedostoja ei ole muokattu tästä chatista.
