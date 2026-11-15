# Valion rajapinnan viimeisin tunnettu arvo varalle

15.11.2026, Claude Code (katselmointichat). Käyttäjän päätös: botti ei saa lakata toimimasta, jos haasteen testirajapinta suljetaan tapahtuman jälkeen. Kaikkien tuotteiden hintoja ei kuitenkaan haeta etukäteen, koska rajapinnan ohje kieltää sen erikseen ("solutions should not be based on … retrieving prices and availabilities for all products … Query only the products you need").

## Toiminta

Asetus `VALIO_FALLBACK=last-known` (`.env.whatsapp`). Ilman asetusta toiminta on ennallaan.

- Rajapinta toimii: kaikki kuten ennen. Botti kysyy vain tarvitsemansa tuotteet, ja vastaukset tallentuvat välimuistiin (`AIMO_DB`, taulu `api_cache`).
- Rajapinta ei vastaa (verkkovirhe, aikakatkaisu tai HTTP-virhe):
  - **Hinta:** tuotteen viimeisin oikea hinta mille tahansa päivälle.
  - **Saatavuus:** viimeisin tila. Tilattavalle tuotteelle tilausaika lasketaan pyydetylle päivälle samalla toimitusajalla kuin viimeksi. Esimerkiksi Stock-tuote, jonka raja oli 15.11. klo 17.00 ma 16.11. toimitukselle, saa 20.11. toimitukselle rajan 19.11. klo 17.00. Terminal-tuotteiden pidemmät toimitusajat säilyvät.
  - **Loppunut tai myyntiesto** pysyy ennallaan.
  - **Tuotteelle, jota ei ole koskaan kysytty,** ei keksitä hintaa eikä saatavuutta. Se ei ole tilattavissa.
  - Arvot merkitään `source: 'last-known'`, mukana alkuperäinen hakuaika. Niitä ei tallenneta välimuistiin oikeina vastauksina.
  - Virheen jälkeen rajapintaa ei kysytä 5 minuuttiin, jotta jokainen viesti ei odota aikakatkaisua. Sen jälkeen botti kokeilee taas oikeaa rajapintaa.

Toteutus: `server/valioApi.mjs` (`lastKnownAvailability`, `lastKnownPrice`, 5 minuutin katkaisu) ja `server/db.mjs` (`apiCache.latest`).

## Kattavuus

Varalla ovat vain tuotteet, joita botti tai paikallinen kauppa on jo kysynyt: WhatsAppin välimuistissa 471 tuotetta 15.11. illalla. Kattavuus kasvaa tavallisessa käytössä. Kokonaisia tuoteryhmiä tai kaikkia tuotteita ei haeta etukäteen.

## Tarkistukset

- Uusi `test/valio-last-known.test.mjs` 4/4 paikallisella jäljitellyllä rajapinnalla: oikeat vastaukset tallentuvat; ilman asetusta katkos antaa vain tuntemattoman; asetuksella viimeisin hinta ja siirretty tilausaika; Terminal-toimitusaika säilyy; loppunut pysyy loppuneena; kysymätön tuote ei saa hintaa; katkaisu estää uudet kutsut ja palautuminen käyttää taas oikeaa rajapintaa.
- Koko `npm test` 283/283 uusimman GitHub-version päällä.
- Oikea tuotehaku välimuistin kopiolla, oikealla kellolla ja suljetulla rajapinnalla (`VALIO_API_BASE=http://127.0.0.1:9`): 20 l maitoa 17.11. → 13 tilattavaa (rasvaton maito 0,88 €/l, raja 16.11. klo 17.00), 5 kg voita 18.11. → 9 ja 10 kg perunaa 18.11. → 45. Kaksi epäonnistunutta yhteysyritystä, sen jälkeen ei kutsuja.

## Rajat

- Tarjouksen yleisotsikko `priceSource` (`server/gateway/service.mjs:279`) sanoo yhä "Valio Aimo Junction API (live)", kun avain on asetettu. Rivikohtainen `priceSource` kertoo oikein `last-known`. Tiedosto on toisen chatin varauksessa, joten korjaus on pyydetty taululla.
- Hinnat ovat haasteen asiakaskohtaisia testihintoja eivätkä päivity katkoksen aikana. Demoon tämä riittää, tuotantoon ei.
