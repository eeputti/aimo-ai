# Hakujärjestys: pyydetty tuotetyyppi kärkeen (Claude Code, hakujärjestys-chat, 15.11.2026)

Lähtö: selfplay-100:n löydökset (koordinointitaulun viesti #152, simuloitu haku ilman mallia). WhatsApp-tilausapurin
vaihtoehdoissa kärkeen nousi halvempi väärä tuotetyyppi: kanafilee → Jalostaja Stroganoff, valkosipuli → hapankaali
valkosipuli, herne → kikherne-porkkanapihvi, salaatti → perunasalaatti, tomaatti → tomaattimurska, spagetti →
spagettilihavuoka, kinkku → kinkkumakkara, lohi → kirjolohifilee, peruna 18 kg → kypsä suikaleperuna, tuorehiiva →
kuivahiiva, sipuli 2 kg → SIPULI NIPPU ilman kilomäärää.

## Missä järjestys syntyi

1. `availableStorefront` (server/storefront.mjs) lajitteli tilattavat halvin ensin. Vain raaka-ainehyllyn sanoilla
   (kana, lohi, peruna...) oli hyllyjärjestys. Tomaattisäilykkeet, perunasalaatit ja kikhernepihvit olivat halvempia.
2. `scoreOptions` (server/order-tools/index.mjs) järjesti haun tuloksen uudelleen ja ohitti haun järjestyksen:
   tukkunimien maa- ja pakkaussanat ("SOLO IRTO KIINA", "1KG PUSSI HOLLANTI") laskettiin kuvaileviksi sanoiksi, joten
   oikea tuote näytti maustetulta. Irtokiloina myytävää perunaa (18 kg = 18 myyntierää) pidettiin kymmeninä
   pikkupakkauksina. "Halvin nostetaan aina listalle" valitsi halvimman väärää tyyppiä tai maustettua tuotetta.
3. Tulkinta: "kanafilee" tunnettiin sanastossa vain kanasäilykkeistä (kategoria 21510), ja "keltasipuli" pilkottiin
   muotoon "kelt + asipuli", koska "asipuli" löytyy punasipulin lopusta.

## Muutos

- Uusi `server/aimo/match.mjs`: hakusanan ja tuotenimen suhde. Taso 0–1 = tuote itse (myös lohi|filee, kinkku|viipale,
  maissi|n|jyvät, tuore|hiiva), 2 = saman pääsanan eri tuote (kirjo|lohi, peruna|salaatti), 3 = pelkkä määrite
  (tomaatti|murska, kinkku|makkara, väliviivan alkuosa: kikherne-porkkanapihvi), 4 = ei mainita. Tyyppiavain:
  [raaka-aineen hylly, raaka-aine ennen valmistetta, osuman ryhmä]. Saman pääsanan yhdyssana on yleensä lajike
  (luonnonjogurtti, pitkäriisi, palvikinkku) ja kuuluu pyydettyyn ryhmään. Eri tuotteeksi se luetaan vain hyllysanoilla
  (lohi ≠ kirjolohi, banaani ≠ keittobanaani) ja kun ostaja tarkensi tilan tai lajikkeen (tuorehiiva, keltasipuli).
  Kuratoidut tuotetyypit (maito, kerma, voi, munat) säilyttävät aiemman järjestyksen.
- `resolve.mjs` ja `storefront.mjs` järjestävät tällä ennen hintaa. Storefront liittää jokaiseen tilattavaan
  `typeRank`, `match` ja `requested`. Ennen 80 ehdokkaan rajausta sama avain, jotta tuoreet tomaatit eivät putoa pois.
- `order-tools`: tyyppiryhmä ensimmäisenä avaimena. Ensimmäinen sivu näyttää vain pyydettyä tuotetta, kun sellaista on;
  muut jäävät "Näytä lisää" -sivulle, mitään ei pudoteta. Halvimman nosto vain parhaasta ryhmästä ja tunnetulla
  määrällä, maustamaton ennen maustettua. Irtokilot eivät saa pikkupakkausrangaistusta. Kilo- tai litratarpeessa
  tuntematon määrä (sipulinippu) jää tunnetun jälkeen. Maa- ja pakkaussanat neutraaleiksi. Makusanana käytettävä tuote
  nimen loppupäässä ("HAPANKAALI 400G VALKOSIPULI") luetaan mauksi. "Tarkkaa osumaa ei löytynyt" perustuu haun
  `requested`-tietoon, joten hylly- ja synonyymihaku ("kana" → broileri) ei anna väärää varoitusta, eikä arvattu
  sanan osa ("kuukivi|jogurtti") näytä tarkalta osumalta.
- Tulkinta: `SHELVES.kanafilee` (broilerihylly, nimessä filee), hyllysana myös taivutettuna ("kanafileetä").
  Yhdyssanan pilkkominen kokeilee ensin loppuosaa, joka on itse sana tuotenimissä. `WORD_CORRECTED`-huomio kertoo
  tunnistamatta jääneen osan (`dropped`).

## Tulokset (simuloitu haku, toimitus ti 17.11., ei mallikutsuja)

| Pyyntö | Ennen (kärki) | Nyt (kärki) |
|---|---|---|
| kanafilee 5 kg | Jalostaja Kasvishernekeitto, Stroganoff | Top Choice Kanan rintafilee 5 kg, Atria Kanan Ohut Filee |
| valkosipuli 1 kg | HAPANKAALI 400G VALKOSIPULI | VALKOSIPULI SOLO IRTO KIINA, Santa Maria Valkosipuli |
| herne 5 kg | Kikherne-porkkanapihvi | + GREENS 2,5KG HERNE, HERNE 2,5KG OHUT PAKASTE |
| salaatti 3 kg | HK Perunasalaatti | LEHTISALAATTI, AMERIKANSALAATTI, PUNASALAATTI |
| tomaatti 5 kg | Gustodoro tomaattimurska | TOMAATTI 1.LK, PIHVITOMAATTI |
| spagetti 5 kg | (2.) Spagettilihavuoka | Raketti Spagetti, Barilla 5 kg Spagetti |
| kinkku 3 kg | HK kinkkumakkara | Maalaispalvikinkku, Vaasan Kinkku |
| lohi 5 kg | Kirjolohifilee E, Kirjolohifilee B | Lohifilee B, Lohifilee suomustettu, Lohifilee E |
| peruna 18 kg | JEPO kypsä suikaleperuna | PP JAUHOINEN PERUNA, PUIKULA PERUNA, ROSAMUNDA |
| tuorehiiva 1 kg | (3.) kuivahiiva | 2 tuorehiivaa, kuivahiiva vasta Näytä lisää -sivulla |
| sipuli 2 kg | SIPULI NIPPU (2 kpl, ei kiloja) | SIPULI 1KG PUSSI ×2 (2 kg), nippu toisena |
| keltasipuli 3 kg | Marinoitu punasipuli | Tavallinen sipuli |
| mozzarella 5 kg | Mozzarella-sipulirengas | Mozzarella 1 kg |

Vertailu 50 tavallisella keittiötermillä (HEAD vs. muutos): 25 ennallaan (mm. maito, kerma, voi, kananmunat, jogurtti,
riisi, sokeri, kahvi, vehnäjauho), 25 muuttui, kaikki tarkistettu: väärä tyyppi pois kärjestä tai halvempi saman tyypin
tuote edelle. Välivaiheen tiukemmat säännöt (pääryhmä ja "nimi alkaa tuotteella" ryhmänä) huononsivat tilliä, jogurttia,
riisiä ja sokeria; ne poistettiin ennen tätä versiota. Olemattomat: strutsinmuna, kamelinmaito ja kuukivijogurtti
näytetään yhä "Tarkkaa osumaa ei löytynyt" -merkinnällä.

## Tarkistukset

- Uusi `test/search-product-type.test.mjs` 5/5: osumatasot synteettisillä nimillä, tyyppiryhmät, order-toolsin
  järjestys injektoidulla haulla (perunasalaatti, hapankaali, irtoperuna, sipulinippu, kirjolohi ei tarkka osuma),
  kanafileen hylly ja #152:n tapaukset oikealla katalogilla simuloiduin hinnoin.
- `npm test` 294/294 uusimman mainin 9efab5b päällä (mukana selfplay-100:n `whatsapp-personas` 10/10 ja
  `whatsapp-option-stability`). `npm run aimo:eval` 26/26 ja `aimo:eval:spoken` 54/54, 0 mallikutsua.
- Ei oikeita malli-, Meta- tai Valio-kutsuja, ei tilauksia, ei 4749-restarttia. Käyttöönotto 4749:ään kuuluu
  käyttöönottochatille.

## Rajat ja jatko

- Heuristiikka vain järjestää; ostaja valitsee aina. Tukkunimien merkit ilman merkkikenttää ("CASA MILO", "+ GREENS")
  eivät ole sanastossa, joten nimen alun sanaa ei käytetä ryhmänä. Se painaa vain makusanoissa (valkosipuli, tomaatti...).
- Kategorian sisäinen valinta tuoreen ja jalostetun raaka-aineen välillä (paprikasuikale vs. tuore paprika, molemmat
  raaka-ainekategorioita) ratkeaa edelleen hinnalla.
- #152:n kohta 1 (olemattomat tuotteet saavat lähimmän vaihtoehdon) on ennallaan: lähimmät näytetään merkinnällä.
  "tryffeli" osuu yhä tryffelisuklaapatukkaan, koska sana on nimessä sellaisenaan.
