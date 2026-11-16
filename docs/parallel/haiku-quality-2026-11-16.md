# WhatsApp-apurin laatu Haikulla (Claude Code, sessio F, 16.11.2026)

Tehtävä 3adefb4a. Puhelimen botin syvä malli vaihdettiin 16.11. Opuksesta Haikuun kustannusten vuoksi (`DEEP_MODEL=claude-haiku-5-5` `.env.whatsapp`:ssa, cd83f66), mutta itsekeskustelun 96–99/100 mitattiin Opuksella. Tämä raportti mittaa saman asian Haikulla nykykoodilla, erottaa mallista johtuvat virheet koodivirheistä ja antaa mallisuosituksen.

## Tulos tiivistettynä

- **Haiku riittää.** 241 persoonaa nykykoodilla (origin/main 671b9a1): perusvaatimukset läpi 223/241 (92,5 %), uusi vaatimus 237/241 (98,3 %). Samoilla tarkistuksilla uudelleenlaskettu Opus-vertailu 15.11.: alkuperäinen S001–S100 96/100 ja laajennettu X001–X100 99/100. Haiku: S 97/100 ja X 96/100. Ero 1 prosenttiyksikkö (195/200 vs 193/200) on kaukana merkitsevästä.
- **Yhtään Haiku-spesifiä turvallisuusvirhettä ei löytynyt.** S- ja X-joukoissa 0 allergeeni- tai ruokavaliovirhettä, 0 väitettä tehdystä tilauksesta, 0 ajovirhettä. 206/241 keskustelua päätyi korilinkkiin, 3/2377 mallikutsua epäonnistui.
- **Sokkoarvio (Opus arvioijana, 10 samaa persoonaa, nimettömät keskustelut) ei erota malleja:** kokonaisarvosana Haiku 3,4, Opus 3,4, Sonnet 2,8; voittoja 4, 2 ja 4. Suurin osa arvioijan nimeämistä virheistä on kaikille kolmelle yhteisiä eli koodista.
- **18 Haikun perusvirheestä vain 2 on mallivirhettä** (S047 slangi "jauhis" luettu jauhoksi, S066). Kahdeksan on koodia tai tarkistinta (Opus kaatuu samoihin seitsemässä), kahdeksan satunnaista (läpi Haikun uusinnassa). Lisäksi epämääräiseen avaukseen Haiku ei kysy päivää (S050, S070, S090, 3/3 kahdella ajolla; Sonnet 2/3, Opus 0/3 virhettä): tämäkin korjautuu koodilla.
- **Kulu:** apurin mallikutsut maksavat noin 0,0007 USD asiakasviestiä kohden Haikulla, 0,0078 Sonnetilla ja 0,0153 Opuksella (1 : 11 : 22). Yksi 241 persoonan koko ajo Haikulla (myös simuloitu asiakas ja arvioija Haikua) maksaa noin 0,80 USD, joten sen voi ajaa ennen jokaista julkaisua.
- **Suositus:** pidä Haiku kaikkialla. Älä päivitä mallia, vaan korjaa alla listatut koodivirheet (omistajille lähetetty taululla). Yksi mittaamaton mahdollisuus: Haikun syvä taso käyttää adaptiivista ajattelua effort-tasolla high, ja Haiku tuottaa 2–5 kertaa enemmän tulostokeneita kuin Sonnet tai Opus eikä ole nopeampi (alla). Effort-tason lasku kannattaa kokeilla samalla ajurilla ennen käyttöönottoa.

## Menetelmä

- Ajurit: `scripts/whatsapp-selfplay-batch.mjs` (`runSelfplay`, oikea HMAC-webhook, jono, kanava, keskusteluydin, eristetyt kannat, simuloidut hinnat ja saatavuus, tyhjä `VALIO_API_KEY`, ei Meta-lähetyksiä, 0 tilausta joka ajossa) ja persoonat `eval/whatsapp-personas*.mjs`. Mallin avain luettiin yhteisen kansion `.env`:stä `--env-file`-lipulla, ja apurin malli asetettiin komentoriviltä (`DEEP_MODEL=…`). Avainta ei kopioitu eikä tulostettu.
- Lähde kiinnitettiin kaikissa ajoissa samaan committiin `671b9a15822205963a2072445581e32c48183d2a` (`--source-ref`). origin/main on sen jälkeen edennyt, joten muiden sessioiden myöhemmät korjaukset eivät ole mukana.
- Simuloitu asiakas ja arvioija ovat kaikissa ajoissa Haikua (oletus c5aee6e), jotta vain apurin malli vaihtuu. Huom: 15.11. Opus-ajoissa myös asiakas ja arvioija olivat Opusta, joten vertailu ei ole täysin puhdas.
- **Mittausvirhe löytyi ja korjattiin (c44fac4):** ajuri latasi demokellon lapsiprosessissa ennen kuin `runSelfplay` asetti `DEMO_NOW`:n. Persoonat ilman `now`-kenttää (S, V, R) ajettiin siksi oikealla kellolla, ja ajohetkellä ma 16.11. illalla "tiistaiksi" ei enää ehtinyt simuloidussa haussa (S002 jäi seitsemäksi vuoroksi päivänsiirtokysymykseen). Ensimmäinen 2 personan pilotti ja keskeytetty ajo hylättiin. Korjauksen jälkeen kello on su 15.11. klo 9.00 (`clock.requested` raportissa). Aiemmat yöllä 15.11. ajetut tulokset pitävät. Ajurin `PRICES`iin lisättiin Sonnet 5.5.
- Otokset: Haiku 30 persoonan ositettu otos (12 S, 12 X, 6 V) ja loput 211 persoonaa (kaikki S, X, V ja R, yhteensä 241). Samat 10 persoonaa Sonnetilla ja Opuksella (S002, S003, S012, S014, S018, X004, X056, X084, V007, V032). Haikun 16 epäonnistunutta uudelleen Haikulla (satunnaisuuden arvio) ja Opuksella; Sonnetilla S047, S050, S070, S090; Opuksella V009–V012.
- Sokkoarvio: `judge.mjs` (ei Gitissä), Opus 5.5 deep-tasolla, kolme keskustelua nimettömänä (A, B, C, satunnaisjärjestys persoonakohtaisella siemenellä), pisteet 1–5 ymmärrys, totuudenmukaisuus, tehokkuus, sävy ja kokonaisarvio sekä nimetyt virheet.

## Tulokset

| ajo | n | perus läpi | uusi läpi | huomio |
|---|---|---|---|---|
| Haiku S001–S100 | 100 | 97 | 96 | |
| Haiku X001–X100 | 100 | 96 | 100 | kaikki 20 murretta, 15 outoa, 8 tervehdystä läpi |
| Haiku V001–V035 | 35 | 25 | 35 | alla: kaikki V-virheet koodia tai tarkistinta |
| Haiku R01–R06 | 6 | 5 | 6 | |
| **Haiku yhteensä** | **241** | **223** | **237** | 2377 kutsua, 3 epäonnistunutta, 0 tilausta |
| Opus 15.11. S (e3b70e1, uudelleentarkistettu) | 100 | 96 | 97 | Opus-asiakas ja arvioija |
| Opus 15.11. X (e3b70e1) | 100 | 99 | 99 | |
| Opus 15.11. V (043f08f, ennen e3b70e1:n korjauksia) | 35 | 27 | 31 | ei vertailukelpoinen |
| Samat 10 persoonaa nykykoodilla: Haiku | 10 | 9 | 10 | V007 |
| Samat 10: Sonnet | 10 | 8 | 8 | V007, S014 (asiakas ei valinnut mitään) |
| Samat 10: Opus | 10 | 9 | 9 | V007 |
| Haikun 16 epäonnistunutta uudelleen: Haiku | 16 | 11 | 12 | 8 läpi: satunnaisuutta |
| Haikun 16 epäonnistunutta uudelleen: Opus | 16 | 11 | 15 | |

Kolmen mallin sokkoarvio samoille 10 persoonalle (keskiarvo, 5 = erinomainen):

| malli | ymmärrys | totuus | tehokkuus | sävy | kokonais | virheitä / keskustelu | voitot |
|---|---|---|---|---|---|---|---|
| Haiku | 3,4 | 3,4 | 3,3 | 3,2 | 3,4 | 3,6 | 4 |
| Opus | 3,4 | 3,6 | 3,5 | 3,4 | 3,4 | 3,5 | 2 |
| Sonnet | 3,0 | 3,3 | 3,0 | 3,2 | 2,8 | 4,1 | 4 |

Otos on pieni (n = 10) ja yksi ajo per persoona, joten ero on kohinaa. Haikun oma arvioija (S 3,05, X 2,40, V 1,97) on tiukempi ja epätarkka eikä vertailukelpoinen aiempiin Opus-arvioihin.

Haikun tulokset luokittain: S-poluista vain date-missing-more-options 4/5, unavailable-zero 4/5, neutral-no-diet 4/5 ja vague 5/5 perus mutta 2/5 uusi vaatimus. X: virheet 18/20, kiire 11/12, kysymykset 24/25, loput täydet. V: allergeenit 0/6 (alla), alkuperä 5/6, hiilijalanjälki 4/5, edullisin 2/3, varmuus 2/3, muut täydet.

## Epäonnistumiset ryhmiteltyinä (18 perusvirhettä + 3 uuden vaatimuksen virhettä)

**1. Koodi (tuotefaktat), kahdeksan: V004, V007, V008, V009, V010, V011, V012, V019.** Opus kaatuu samoihin (V004, V007, V008, V009, V010, V012 ja V019 uusinnassa; V011 Opus läpäisi). Nämä johtuvat Valio-data-only-muutoksesta 9ae0b13, jossa koodi kirjoittaa tuotetiedot listana ja mallin faktaväitteet pudotetaan, kun taas V-tarkistin odottaa suoraa kyllä/ei-väitettä. Todelliset tuotevirheet:
- Kyllä/ei-kysymykseen ei vastata suoraan ("Onko HK Coleslaw munaton?" saa vain allergeenilistan), ja mallin avauslause on irrallinen ("Tarkista ne sieltä ennen ostopäätöstä", "Voin auttaa muissa kysymyksissä", V007 ja V008 sokkoarvioijan mukaan käsittämätön).
- Mukaan liitetään kysymättömiä tuotteita (V007 ja V012 HK Suomipekoni, V009 Sunnuntai gluteeniton jauhoseos). V008 ja V009 "allergen_wrong_dangerous" on tarkistimen väärä hälytys: apuri ei väittänyt kysyttyä tuotetta turvalliseksi, mutta mukaan liitetty vieras tuote sisälsi sanan gluteeniton.
- Tuntematon tuote (Oatly iKaffe, V008) ei johda kertomiseen, ettei tuotetta löytynyt, vaan vieraisiin gluteenittomiin tuotteisiin.
- V004: "APPELSIINI JAFFA" yhdistyy Hartwall Jaffa -virvoitusjuomaan ja alkuperäksi sanotaan Suomi (väärä tuote, väärä alkuperä). Sekä Haiku että Opus.
- V019: "Hiilijalanjälki: 1) 25,62, 2) 25,62, 3) ei tietoa. Arvo on kaikille sama" (väite on väärä, kun yksi on tuntematon).

**2. Satunnainen tai simuloitu asiakas, kahdeksan, läpi Haikun uusinnassa: S094, R04, X013, X015, X066, X079, V023, V026.** X013 ja X015 "date_invented" on tarkistimen väärä hälytys (asiakas antoi päivän itse). R04 ja S094: simuloitu asiakas painoi "4" kuusi kertaa eikä valinnut mitään. V026: asiakas valitsi 3, vaikka apuri sanoi edullisimmaksi 1. X066 ja X079 paljastavat silti oikeita koodiheikkouksia (ks. C2 ja C4), jotka näkyvät kun asiakas vastaa sanoin.

**3. Mallista johtuva, kaksi: S047, S066.** S047: "6 kg jauhista" luettiin jauhoksi, vaikka `jauhis: 'jauheliha'` on jo `server/aimo/synonyms.mjs`:ssä (rivi 25). Haiku 2/2 ja S003 Haiku ja Sonnet virheellinen, Opus oikein 2/2, Sonnet S047 uusinnassa oikein. S066: Haiku kaatui kahdesti (asiakas alkoi tilata persoonan slangiesimerkkejä maitoa ja perunaa), Opus läpi; todennäköisesti apurin ytimekäs virheviesti "Ei tilattavaa tuotetta … Tilausta ei ole tehty" ajoi simuloidun asiakkaan harhaan, joten tämä on epävarma.

**4. Uusi vaatimus, epämääräinen avaus (S050, S070, S090).** Kun ensimmäinen viesti on "tarvis vähän kaikkee keittiöön", Haiku vastaa "Kerro vaan, mitä tarvitset" eikä kysy päivää. Haiku 3/3 molemmilla ajoilla, Sonnet 2/3, Opus 0/3. Dialogi-malli kirjoittaa tämän vastauksen, joten korjaus on koodissa: tyhjään avaukseen kiinteä "Mille päivälle toimitus? Mitä tarvitset?" ilman mallia. S094: asiakas ei pyytänyt "4" (asiakaspuoli).

## Koodiviat omistajille

Löydökset ovat kolmen mallin yhteisiä (ellei toisin mainita), eli mallin vaihto ei korjaa niitä. Lähetetty taululle ja kopioitu yhteiseen muistiinpanokansioon.

**Sessio A (allergeenit ja tulkinta):**
- A1. Tulkki ei käytä synonyymitaulua: `jauhis` luettiin jauhoksi (S047, S003). Normalisoi slangi sanaston kautta ennen mallia tai ohita mallin tulkinta, kun taulussa on täsmäosuma.
- A2. `server/whatsapp/product-facts.mjs`: vastaa suoraan kyllä/ei ("Ei ole munaton: sisältää kananmunaa"), älä liitä kysymättömiä tuotteita, kerro kun tuotetta ei löydy (V008), korjaa V004:n väärä tuote, ja pudota mallin irrallinen avauslause kokonaan, kun koodi kirjoittaa tuotetiedot.
- A3. `(ei allergeeneja AW)` vuoti ostajalle näkyvään vaihtoehtoriviin (V032, Haiku ja Opus).

**Sessio C (keskustelu ja korisivu):**
- C1. "Vastaa 1, 2 tai 3." näkyy, vaikka listassa on myös 4) (S003, S018, X004, V032).
- C2. Päivänsiirtokysymys toistuu täsmälleen samana 5–7 kertaa, kun asiakas vastaa sanoin ("ei käy ti, tarvin maanantaiks") numeron sijaan, eikä tilausaikakysymykseen vastata (X066 Haiku, X056 Opus). Tulkitse sanallinen vastaus vaihtoehdoksi 2 tai kysy numerolla.
- C3. Epämääräinen avaus: kysy päivä ja tuotteet kiinteällä tekstillä (S050, S070, S090).
- C4. "Tavallinen käy, vaihda tavalliseen" -pyyntö ei muuta laktoositonta luonnosta, vaikka apuri vastaa "Vaihdetaan tavalliseen" (X079), ja kahvikerman lista toistui kuusi kertaa samana Sonnetilla (S014). Älä lupaa muutosta, jota ei tehdä, tai kerro, ettei tavallista löydy.
- C5. "Valitse ensimmäinen sopiva" -valtuutta ei noudateta (S018, kaikki kolme).
- C6. Keskustelun keskellä irrallinen "Huomenta!", "Iltaa!" tai "Moi!" (S003, X004, X056, X079), kun asiakkaan viesti alkaa "Hei".
- C7. Lupaus, jota ei voi pitää ("palaan siihen sitten", V025). Tyhjentyneen lisälistan jälkeen sama "Vastaa 1, 2 tai 3" toistuu (R04 kuusi kertaa).

Sessiot B, D ja H: ei löydöksiä näiden tiedostoista.

## Kulut ja nopeus

Todellinen kulu arvioituna ajurin mallikohtaisella hinnoittelulla (claude-api-taidon hinnat; välimuistiin kirjoitusta laskuri ei näe, joten arvio on alakanttiin ja todellinen noin 10 % suurempi):

| erä | USD |
|---|---|
| Haiku 241 persoonaa + 16 uusintaa + pilotit | 0,88 |
| Sonnet 10 + 4 persoonaa | 0,46 |
| Opus 10 + 16 + 4 persoonaa | 1,76 |
| Sokkoarvio (Opus, 10 kutsua) | 0,56 |
| **Yhteensä** | **3,66** (noin 4,0 välimuistikirjoituksineen, alle 5 euron katon) |

Persoonaa kohden kaikki roolit: Haiku 0,0033, Sonnet 0,034, Opus 0,064 USD (15.11. Opus-ajo kaikilla rooleilla 0,086–0,09).

Apurin osuus asiakasviestiä kohden: Haiku 0,0007, Sonnet 0,0078, Opus 0,0153 USD. Neljän viestin keskustelu maksaa siis noin 0,003 / 0,03 / 0,06 USD. Tulkki (`whatsapp_order_turn`) maksaa Sonnetilla 0,0046 ja Opuksella 0,0073 viestiä kohden, dialogi 0,0031 ja 0,0067.

Nopeus ja tokenit (samat 10 persoonaa, 38–41 vuoroa per malli, kohinaa): vuoron kesto mediaani Haiku 6,8 s, Opus 5,6 s, Sonnet 3,9 s; p90 9,7 / 10,1 / 7,4 s. Koko Haiku-ajossa mediaani 6,2 s, p90 11,0 s, p99 16,0 s. Apurin tulostokenit persoonaa kohden Haiku 3 504, Sonnet 1 474, Opus 1 532, dialogikutsussa Haiku 1 668 vs 336 ja 547. Syvä taso ajaa kaikilla malleilla adaptiivista ajattelua effort-tasolla high (`server/aimoAgent.mjs`), ja Haiku ajattelee selvästi pidempään. Haiku ei siis ole nopein vaihtoehto.

## Suositus mallivalinnasta (E:lle)

1. **Pidä `DEEP_MODEL=claude-haiku-5-5` puhelimen botissa, selainkeskustelussa ja pilvessä.** Koodin tarkistuksilla ero Opukseen on alle 1 prosenttiyksikkö, sokkoarviossa ei eroa, ja kulu on kahdeskymmenesosa.
2. **Älä päivitä mallia, korjaa koodi.** Ainoat mallista johtuvat aukot (slangi "jauhis", epämääräisen avauksen päiväkysymys) korjautuvat deterministisesti (A1, C3), ja Sonnet ei korjannut niitä luotettavasti (S003, S050, S090). Jos jonkin kohdan haluaa vakuutukseksi, päivitä vain tulkki (`whatsapp_order_turn`) Sonnetille: noin +0,004 USD per asiakasviesti, mutta nykyisellä näytöllä siitä ei ole hyötyä, eikä koodissa ole erillistä mallia tulkille (`tier: 'deep'` käyttää yhtä `DEEP_MODEL`ia).
3. **Kokeile Haikun effort-tason laskua (medium tai low) ennen mitään mallipäivitystä:** vähentäisi tulostokeneita ja vuoron kestoa. Tätä ei mitattu tässä. Aja sama 30 persoonan otos (`--ids S002,S003,S005,S008,S009,S012,S014,S015,S016,S018,S019,S020,X001,X004,X010,X016,X021,X035,X041,X056,X064,X078,X084,X093,V001,V007,V013,V017,V025,V032`, noin 0,10 USD) ennen ja jälkeen.
4. Ajettava mittari julkaisujen välillä: `node --env-file=<.env> scripts/whatsapp-selfplay-batch.mjs --set all --limit 200` kahdessa erässä (`--offset 0` ja `--offset 200`), `DEEP_MODEL=claude-haiku-5-5 VALIO_API_KEY=`, noin 0,80 USD ja noin 35 min (`--concurrency 4`, `--max-calls 5000`). Käytä `--source-ref <sha>`.

## Luotettavuus ja rajat

- Yksi ajo per persoona. Haikun 16 virheestä 8 katosi uusinnassa, joten yksittäisen persoonan tulos on kohinaa; luotettavia ovat vain ryhmätason luvut ja kahdella ajolla toistuneet virheet.
- Simuloitu asiakas on Haiku kaikissa ajoissa ja sillä on omia virheitään (S066, R04, V026, X013, X015). 15.11. Opus-vertailu käytti Opus-asiakasta ja eri koodiversiota (e3b70e1), joten Haiku–Opus-ero S ja X -joukoissa ei ole puhdas A/B. Puhdas A/B on vain 10 + 16 + 4 samaa persoonaa.
- Opus V-joukko nykykoodilla on mittaamatta (vain V009–V012 ja V004, V008, V019, V023, V026 uusinnassa), joten V-luvut ovat vain Haikun.
- Sokkoarvioija on Opus ja yksi arvioitavista malleista (mahdollinen omavalinta), otos 10.
- Hinnat ja saatavuus ovat simuloituja, ja demokello on kiinnitetty su 15.11. klo 9.00. Oikean Valio-rajapinnan kuormitusta ei mitattu.
- Kustannusarviosta puuttuu välimuistiin kirjoitus, ja Anthropicin Console-käyttöä ei verrattu arvioon.
- Lähde 671b9a1: myöhemmät commitit (esimerkiksi f848556 audit-korjaukset, 4bb1385 uusintatilaus, 1c49398 kuva- ja ääniviestit) eivät ole mukana.

## Toisto

Raakadata (Gitin ulkopuolella, session väliaikaishakemisto): `runs/haiku-all241.json`, `runs/{sonnet,opus}-*`, `judge-sample10.json`. Analyysi- ja arvioijaskriptit eivät ole repossa. Tarkistukset: `node --test test/whatsapp-personas.test.mjs` 16/16.
