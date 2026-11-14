# WhatsApp-tilausapurin demo: käsikirjoitus ja toistettava testi

Tämä on demon kulku ja sen takana oleva automaattinen testi. Vastaustekstit alla ovat testin 14.11.2026 tuottamia, simuloidulla Valio-rajapinnalla ja säännöillä ilman kielimallia. Oikealla rajapinnalla tuotteet ja hinnat voivat olla toiset.

## Toistettava testi

```bash
node --disable-warning=ExperimentalWarning --test test/ordering-e2e.test.mjs
```

Keskustelun saa näkyviin harjoittelua varten:

```bash
ORDERING_E2E_PRINT=1 node --disable-warning=ExperimentalWarning --test test/ordering-e2e.test.mjs
```

Testi ajaa oikeat moduulit ketjuna: allekirjoitettu Meta-webhook, kanavan jono, testiasiakkaan yhdistäminen, tilauskeskustelu, tuotetyökalut ja gatewayn demotilaus. Se käyttää omia väliaikaisia kantoja eikä verkkoa. Metalle lähtevä vastaus kerätään muistiin, joten testi ei todista, että viesti kulkee oikeaan puhelimeen. Testi ohitetaan, jos `data/catalog.json` puuttuu.

## Ennen demoa

- Palvelin käynnissä tilaustilassa: `WHATSAPP_ORDERING_ENABLED=true`, oma `GATEWAY_DB` (ei `data/gateway.db`) ja `data/catalog.json` paikallaan. Tarkista `/healthz`: tilan pitää olla `ordering-demo`.
- HTTPS-tunneli auki ja webhook rekisteröity Metaan. Tunnelin osoite vaihtuu uudelleenkäynnistyksessä.
- Demopuhelin on Metan testivastaanottaja ja yhdistetty testiasiakkaaksi (`WHATSAPP_DEMO_PHONE` tai `npm run whatsapp:member -- invite`).
- Aja keskustelu kerran läpi samana aamuna. Maanantain 16.11. toimituksen tilausaika päättyy su 15.11. klo 12.00 oikealla kellolla, ellei `DEMO_NOW` ole asetettu.
- Kielimalli päällä (`ANTHROPIC_API_KEY`), jos demossa puhutaan vapaasti. Säännöt ymmärtävät alla olevat viestit, mutta eivät pitkiä puhekielisiä lauseita. Mallin kanssa vaste on 1,5–3,4 s per viesti.

## Demon kulku

| Ostaja kirjoittaa | Apuri vastaa | Mitä tämä näyttää |
|---|---|---|
| `20 l maitoa ja 5 l kermaa maanantaiksi` | Luonnoksen rivit ja yksi kysymys: allergiat ja ruokavaliot | Päivää ja määriä ei kysytä uudelleen. Tuotteita ei näytetä ennen tarkistuslistaa |
| `laktoositon` | Toimitus ma 16.11., kolme numeroitua vaihtoehtoa kummallekin riville hintoineen | Vain valitulle päivälle tilattavat, laktoosittomat tuotteet. Apuri ei valitse ostajan puolesta |
| `1 1` | Tilausluonnos: 4 ltk maitoa ja 5 kpl kermaa, yhteensä 221,45 €, tilattava viimeistään su 15.11. klo 12.00 | Pakkaukset, hinnat ja tilausaika yhdessä viestissä |
| `maitoa 30 litraa` | Uusi luonnos: 6 ltk maitoa, yhteensä 310,75 € | Muutos kohdistuu oikeaan riviin, kerma ja ruokavalio säilyvät |
| `joo` | Vahvista tilaus vastaamalla TILAA | Epämääräinen myöntö ei ole tilauslupa |
| `TILAA` | Tilaus AGW-… on tallennettu, toimitus ma 16.11., yhteensä 310,75 € | Yksi demotilaus. Viesti kertoo, ettei oikeaa Valio-tilausta lähetetty |
| `tilaa` | Tilaus on jo tallennettu, uutta tilausta ei tehty | Kaksoistilaus on estetty |

Varalla, jos aikaa on: lähetä viesti numerosta, jota ei ole yhdistetty. Vastaus pyytää yhdistämiskoodia eikä näytä tuotteita tai hintoja.

## Mitä testi varmistaa

- Tuntematon numero ei saa tuotteita, hintoja eikä luonnosta.
- Jo annettua päivää ja määriä ei kysytä uudelleen.
- Tuotteita ei näytetä ennen kuin päivä, allergeenit ja määrät ovat tiedossa.
- Ruokarajoite säilyy vaihtoehdoista yhteenvetoon ja määrämuutoksen yli.
- Määrän muutos tuottaa uuden yhteenvedon, ja tilaus vaatii sanan TILAA sen jälkeen.
- Sama webhook kahdesti ei tuota toista käsittelyä eikä toista vastausta.
- TILAA kahdesti tuottaa yhden tilauksen gatewayn kantaan, kahdella rivillä.
- Jokainen vastaus lähtee oikealle numerolle vastauksena oikeaan viestiin.

## Mitä testi ei kata

- Oikea WhatsApp, Metan toimitus puhelimeen ja tunneli.
- Oikea Valio-rajapinta: hinnat ja saatavuus ovat simuloituja.
- Kielimallitulkki koko keskustelussa.
- Epäonnistunut hinta- tai saatavuushaku ja vanhentunut tarjous tässä ketjussa. Ne on testattu erikseen tiedostoissa `test/order-tools.test.mjs` ja `test/order-conversation.test.mjs`.
- Viestien vasteajat oikeassa käytössä.
