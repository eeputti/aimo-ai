# Tilauskeskustelun kolme pikkuvikaa, 14.11.2026 (Claude Code, Eeliksen kone)

Eelis pyysi korjaamaan työnjaon tehtävän F: kolme aiemmin lokiin avoimeksi kirjattua vikaa. Muutokset vain tiedostoissa `server/order-conversation/index.mjs` ja `server/order-tools/index.mjs` sekä niiden testeissä. Danielin varaamiin tiedostoihin (`runtime.mjs`, `ordering.mjs`), kanavaan, `.env`-tiedostoihin tai käynnissä oleviin palvelimiin ei koskettu.

## Korjaukset

- **Muutosvihje:** yhteenvedon loppu neuvoi aina "maitoa 30 litraa" tai "poista voi", vaikka tilauksessa ei ollut kumpaakaan. Vihje muodostetaan nyt tilauksen omista riveistä, esim. "peruna 3 kg" tai "poista kerma".
- **Kiitos:** pelkkä "kiitos" (myös kiitti, kiitos paljon, thx, tack) tulosti koko yhteenvedon uudelleen. Nyt vastaus on yksi lyhyt rivi. Luonnos, revisio, tarjous ja avoin kysymys säilyvät, joten TILAA koskee yhä samaa yhteenvetoa eikä uutta tarjousta haeta. "Ei kiitos" käsitellään edelleen dialogikerroksessa.
- **Halvin vaihtoehto:** peruna 20 kg näytti ensin 72,40 euron säkin ja halvimman 13,30 euroa kolmantena. Näytettävien kolmen sisällä yli kaksi kertaa halvimman hintainen vaihtoehto siirtyy nyt muiden jälkeen. Kun hinnat ovat lähempänä toisiaan, järjestys ei muutu. Mitään ei pudoteta pois, ja ostaja valitsee edelleen itse.

## Päätös, joka muutti vanhaa testiä

Aiempi testi odotti, että viisi kertaa muita halvempi vaihtoehto näkyy kolmantena. Uuden säännön mukaan se näkyy ensimmäisenä. Testin odotus päivitettiin ja rinnalle lisättiin tapaus, jossa hintaero on alle kaksinkertainen ja järjestys säilyy.

## Tarkistukset

- `npm test`: 185/185 läpi (kaksi uutta testiä).
- `npm run aimo:eval`: 26/26, 0 mallikutsua.
- Ei oikeita malli-, Meta- tai Valio-kutsuja. Perunan järjestystä ei ajettu uudelleen oikeaa mock-API:a vasten; simuloiduilla hinnoilla alkuperäinen tapaus ei toistu, joten korjaus on varmennettu vain testin jäljittelemällä hintajakaumalla.
- Käynnissä oleva 4749-palvelin tarvitsee restartin ennen kuin korjaukset näkyvät WhatsAppissa. Sen tekee käyttöönottochat.

## Loki

`TYOLOKI.md` on yhteisellä taululla Danielin koordinaattoritehtävän varaama, joten merkintä on tekemättä. Tämä raportti korvaa sen siihen asti.
