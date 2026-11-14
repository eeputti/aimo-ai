# WhatsApp-ostoslista projektin verkkokaupan ostosapurille

Käyttäjän 14.11.2026 toimeksianto tässä Danielin chatissa: WhatsApp-viestistä koottu ostoslista siirretään projektin omaan verkkokaupan ostosapuriin. Eeliksen Claude ja Codex saivat aloitusviestit MCP-alustalla (#5–8); Eeliksen Claude vahvisti rajauksen (#24).

## Valmis toteutus

- Käytetään nykyistä tilauskeskustelua ja pysyvää luonnosta. Ei uutta tulkinta-agenttia tai erillistä listakopiota.
- Rakenteinen listanäkymä: tuotteet, määrät/yksiköt, rivikohtaiset ja yhteiset ruokavaatimukset, toimituspäivä/paikka, puuttuvat tiedot ja revisionumero. Ei puhelinnumeroita tai avaimia vastauksessa.
- GET `/api/assistant/whatsapp-list?buyerId=...`: paikallisen testikaupan asiakasvalinta ja nykyinen lista.
- POST `/api/assistant/whatsapp-list/chat`: `{buyerId, text, messageId: UUID, expectedList: {id, revision} | null}` jatkaa samaa luonnosta. Asiakkuus ratkaistaan palvelimella, ei selaimen lähettämästä customer-objektista.
- `/assistant.html`: WhatsApp-ostoslistan valinta ja jatkaminen. Nimenomainen TILAA ja nykyinen tarkistettava tarjous tarvitaan edelleen tilauksen tallennukseen.
- Paikallisen koneen rajaus, sama alkuperä, vanhan revision torjunta sekä saman asiakkaan eri kanavien vuorojen sarjoitus.

## Käyttö

Kun käyttöönoton omistaja on päivittänyt koodin ja käynnistänyt nykyisen WhatsApp-tilausdemopalvelimen hallitusti samoilla kannoilla:

1. Lähetä WhatsApp-apurille tuotteet ja määrät, esimerkiksi `20 l laktoositonta maitoa ja 5 kg voita maanantaiksi`. Puuttuvat tiedot saavat jäädä avoimiksi ja niitä täydennetään nykyisessä keskustelussa.
2. Avaa palvelinkoneen selaimessa `http://localhost:4749/assistant.html` (tai oman prosessin portti).
3. Valitse testiasiakas, paina **Päivitä lista**, sitten **Jatka listaa ostosapurissa**. Apuri näyttää saman listan ja seuraavan tarkennuksen/tuotevaihtoehdot.
4. Tee tarvittavat korjaukset kummassa tahansa kanavassa. Jos toinen kanava ehti muuttaa listaa, päivitä ja avaa se uudelleen; vanhalla versiolla ei voi tehdä muutoksia.
5. Tilaus syntyy vain erillisestä TILAA-vahvistuksesta ajantasaiseen yhteenvetoon. Se on nykyisen gatewayn demotilaus.

### Siirtosopimus

GET-vastaus: `{mode:'local-demo',accounts:[{buyerId,companyName,personName}],buyerId,shoppingList}`. `shoppingList` on null tai rakenteinen snapshot, jossa ovat `schemaVersion:1`, `source:'whatsapp'`, `id`, `revision`, `buyerId`, `companyName`, `deliveryDate`, `deliverySiteId`, `diet`, `lines`, `missing`, `status` ja `requiresExplicitConfirmation:true`. Ei alkuperäistä yksityistä keskusteluhistoriaa, puhelinnumeroita, avaimia tai tarjousvaltuutuksia.

POST-pyyntö esimerkiksi:

```json
{"buyerId":"whatsapp-demo-<nykyinen-sidos>","text":"maitoa sittenkin 30 litraa","messageId":"00000000-0000-4000-8000-000000000001","expectedList":{"id":"WD-<luonnos>","revision":1}}
```

Käytä oikeita GETistä saatuja tunnisteita ja uudelle viestille omaa UUID:ta; täsmälleen saman pyynnön uudelleenyrityksessä samaa UUID:ta. Vastauksessa nykyisen tilausmoottorin `{text,status,draftId?,revision?,messages?}` sekä `shoppingList`. Väärä/vanha lista tai revisio palauttaa 409. Tilattu, nollattu tai tyhjä lista näkyy nullina. Vanha idempotentti vastaus ei saa kantaa uudemman listan hyväksyttävää revisiota.

Tämä on vain olemassa olevan paikallisen testikaupan rajapinta. Palvelinkoneen ylläpitäjä voi valita demoasiakkaan; kyseessä ei ole asiakkaan tuotantokirjautuminen. Proxy-, cross-site- ja ei-paikalliset pyynnöt torjutaan. Asiakkuus ratkaistaan nykyisestä WhatsApp-sidoksesta palvelimella, nollaus käyttää samaa `wa_dialogue`-keskustelujaksoa. GET ei käynnistä uutta parserivuoroa tai tilausta. Yhden asiakkaan luku- ja kirjoitusvuorot sarjoitetaan saman prosessin sisällä; nykyinen yhden workerin/prosessin sääntö säilyy.

## Tarkistukset

- Kohdistettu WhatsApp-, tilauskeskustelu-, tuotetyökalu- ja siirtotestisarja: **76 läpi, 0 virhettä, 2 katalogia vaativaa testiä ohitettu** (78 yhteensä), myös rinnakkain tulleen `27ee93b`-korjauksen yhdistämisen jälkeen.
- Viisi uutta regressiotestiä: allekirjoitettu HTTP-webhook → lista → selain-API → sama luonnos → valinnat → yhteenveto → erillinen vahvistus → yksi demotilaus; puuttuvat tiedot/stale/revokointi; HTTP-rajaus/validointi; saman asiakkaan kanavien sarjoitus; reset → uusi keskustelujakso → uusi lista → restart. Työkalut injektoitu, aito suomenkielinen sääntötulkki ja väliaikainen synteettinen katalogi.
- Oikea Chromium ja oikea standalone-WhatsApp-runtime, oma synteettinen katalogi ja väliaikaiset kannat: selain avaa listan, määräkorjaus näkyy takaisin WhatsApp-keskustelussa, toisessa kanavassa muuttuneen listan vanha muokkaus torjutaan ja päivitys palauttaa toiminnan. Ei JavaScript-virheitä. Malliavaimet tyhjinä; ei oikeita Meta-, malli- tai Valio-kutsuja. Sivuston olemassa oleva ulkoinen fonttipyyntö estettiin selaintestissä.
- Ensimmäinen koko `npm test` ennen uusimpien reset-commitien yhdistämistä: 150 läpi, 21 epäonnistui ja 6 ohitettu, koska katalogia tarvitsevat vanhat testit eivät löydä `data/catalog.json`:ia. Koko sarjaa ei väitetä läpäistyksi.
- Syntaksi ja `git diff --check` tarkistettu. Riippuvuuksia tai lockfilea ei muutettu. Nykyisiä palvelimia/kantoja tai Meta-asetuksia ei muutettu.

## Yhteistyö ja rajat

- Eeliksen Claude vahvisti tiedostorajauksen ja pyysi säilyttämään `cf1d3b0`:n keskustelujaksot; ne on yhdistetty ja reset-regressio läpi. Hän välittää omat varaukset Eeliksen paikalliselle taululle.
- Eeliksen Codex ottaa riippumattoman oikean gatewayn HTTP-loppuketjun varmennuksen tiedostoissa `test/shopping-list-order-api.test.mjs` ja `docs/parallel/shopping-list-order-api.md` (sopimus MCP-viestissä #35). Sen tulosta ei lasketa yllä oleviin testeihin.
- TYOLOKI.md:n lyhyt varausyritys torjuttiin, koska toinen chat ehti varata sen lokipäivitykseen. Oma raportti säilyy tässä tiedostossa ja yleislokikirjaus pyydetään omistajalta MCP-viestillä. Yleislokia ei muuteta tässä commitissa.
- Nykyisen 4749-palvelimen restart kuuluu Eeliksen käyttöönottochatille. Tässä tehtiin ainoastaan omien eristettyjen testiprosessien käynnistyksiä.
- Ei Valion tuotantokaupan integraatiota. Puhelut ovat erillinen tehtävä; botti ei saa aloittaa puhelua tai soittaa takaisin.
