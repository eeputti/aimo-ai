# DM Champ: opit WhatsApp-tilausapuriin

Selvitetty 14.11.2026 (Claude Code). Lähteet: keskustelu DM Champin julkisen demoagentin kanssa WhatsAppissa ja DM Champin julkiset ohjeet (help.dmchamp.com). DM Champin palvelinkoodia ei ole nähty. Tämä on suunnittelumuistio: se ei muuta `TYONJAKO.md`:n v1-sopimusta, vaan kertoo, miten sopimuksen osat kannattaa toteuttaa.

**Tila koodissa 14.11.2026:** osuuksien 2 ja 3 säännöt (luonnos palvelimella, pysyvä `ref`, revisio, koodissa tunnistettu vahvistus, enintään kolme vaihtoehtoa, saatavuusehto, idempotentti `submit`) on toteutettu hakemistoissa `server/order-conversation/` ja `server/order-tools/` ja testattu paikallisesti; ks. `docs/parallel/2.md` ja `docs/parallel/3.md`. Koodi odottaa henkilön 1 tallennusta ja kytkentää. Osuuksien 1 ja 4 säännöt (viestien niputus, pilkkominen, asiakas kanavalta, muistutus, ihmiselle siirto) ovat tekemättä.

## Yhteenveto

- DM Champ on valmiin kielimallin (Pro-taso on Claude) ympärille rakennettu myyntiagenttialusta. Sen arvo ei ole malli vaan rakenne: ohjeet, tietopohja, työkalut, kanava ja seuranta ovat erillisiä osia.
- Tärkein oppi: **malli vain keskustelee ja pyytää työkaluja. Faktat (tuotteet, hinnat, saldot), asiakkaan henkilöllisyys ja peruuttamattomat teot tulevat palvelimelta.** Tuoteluettelo ei ole mallin muistissa eikä tietopohjassa vaan työkalun takana.
- DM Champissa ei ole valmista tilausluonnosta. Sen "muisti" on keskusteluhistoria ja tyypitetyt asiakaskentät. Monirivinen luonnos, revisio ja vahvistusportti pitää tehdä omalle palvelimelle. Tämä on meidän lisäarvomme.

## Miten DM Champ on rakennettu

| Osa | Toteutus | Lähde |
|---|---|---|
| Malli | Laatutasot Max, Mini ja Pro; Pro on Anthropic Claude. Oma avain vain Anthropicille. "Ajattelun" määrä valitaan neljästä nopeustilasta, oletus on syvin. | docs |
| Ohjeet | Viisi kenttäryhmää: persoona ja tavoite, yritystieto, säännöt ja keskustelun kulku, ihmiselle ohjaus ja lopetusehto, tietopohja. Hinnat ja rajat kehotetaan pitämään tietopohjassa, ei ohjeissa. | docs |
| Tietopohja | Kysymys ja vastaus -parit sekä sivuilta ja tiedostoista luetut lähteet. Haku on merkityspohjainen ja ajetaan joka viestillä; mallille annetaan vain osuvat kohdat ja lähdesivun alkuperäinen teksti. | docs |
| Työkalut | Custom function (yksi HTTP-kutsu, tyypitetyt parametrit, kuvaus kertoo mallille milloin kutsua) ja MCP-palvelin (työkalut löytyvät itse). Aikakatkaisu 30 s, suositus alle 10 s. | docs, keskustelu |
| Työkalujen suojat | Vain lukeva -merkintä (turvallinen uusinta), välimuisti samoille syötteille, enimmäismäärä ajoja per keskustelu ja per aikaikkuna, pyyntöjen allekirjoitus. Kirjoittavaa kutsua ei uusita automaattisesti. | docs |
| Lähettäjän tunnistus | Jokainen työkalukutsu saa yhteystiedon alustalta (`_meta` tai `system.contact`), ei mallin kirjoittamana. WhatsAppissa numero on se, josta viesti oikeasti tuli. Testikeskustelu merkitään `test: true`. | docs |
| Asiakasmuisti | Tyypitetyt kentät (teksti, numero, päivä, valinta, kyllä/ei). Malli saa kirjoittaa vain erikseen sallittuihin kenttiin, ja väärän muotoinen arvo hylätään ja palautetaan mallille korjattavaksi. | docs |
| Viestien niputus | Vastausta viivytetään 15–30 s. Sinä aikana tulleet viestit käsitellään yhtenä vuorona, ja kesken kirjoituksen tullut viesti kirjoituttaa vastauksen uudelleen. | docs |
| Vastauksen muoto | Vastaus pilkotaan enintään kuuteen lyhyeen viestiin ja kirjoitusviive näytetään. Ensimmäinen vastaus kertoo, että kyseessä on tekoäly. | docs, keskustelu |
| Aiheessa pysyminen | Demoagentti kieltäytyi maitotilauksesta ("en ole ruokakauppa") ja palasi omaan tehtäväänsä. | keskustelu |
| Ihmiselle siirto | "Hälytä ihminen kun" -ehdot. Hälytys pysäyttää botin siinä keskustelussa, viimeinen viesti kertoo ihmisen jatkavan, ja botti pysyy hiljaa kunnes se palautetaan. Lisäksi 20 vastauksen katto per keskustelu. | docs |
| Virheet | Epäonnistunut työkalukutsu näkyy keskustelussa merkkinä, malli kertoo asiakkaalle teknisestä viasta, ja kolme virhettä vuorokaudessa hälyttää ylläpidon. | docs |
| Muistutukset | Alle 24 h muistutus kirjoitetaan lähetyshetkellä keskustelun pohjalta. Ennen lähetystä voi ajaa tarkistuksen omasta rajapinnasta. Virallisessa WhatsApp API:ssa 24 h jälkeen tarvitaan hyväksytty viestipohja. | docs |
| Media | Ääniviestit litteroidaan ja kuvat luetaan ennen mallia. Työkalun palauttama suora tiedostolinkki lähetetään kuvana. | docs |
| Testaus | Testikeskustelu, jossa ohjeiden muutos on luonnos kunnes se julkaistaan. Oikean keskustelun voi toistaa testissä. Tallennettua testisarjaa ei ole. | docs |

## Mitä agentti itse vastasi

Vastaukset ovat myyntiagentin väitteitä, eivät varmennettua toteutusta.

| Kysymys | Agentin vastaus tiivistettynä |
|---|---|
| Voiko agentti kutsua omaa tuote-, hinta- ja saldorajapintaa kesken keskustelun? | Kyllä. MCP-palvelin rekisteröidään osoitteella ja agentti kutsuu sen työkaluja, tai custom function osuu yhteen päätepisteeseen. Käyttöönotto "noin 10 minuuttia". |
| Missä usean viestin tilausluonnos säilyy? | Malli seuraa "tee siitä 30 litraa" -korjauksia keskusteluhistoriasta. Istuntojen yli säilyvään rakenteiseen tilaan on kaksi tapaa: asiakaskentät, joita päivitetään työkalukutsulla joka muutoksella, tai oma palvelin, jonka avaimena on jokaisessa MCP-kutsussa tuleva yhteystiedon tunniste. |
| Miten estetään tilaus ennen ostajan vahvistusta? | Työkalukutsulle ei ole erillistä vahvistusehtoa. Portti on ohjeissa: "älä kutsu place_order ennen kuin asiakas vahvistaa yhteenvedon". Kova tarkistus on vain ihmisen hyväksymä vastaus inboxissa. |
| Voiko MCP-palvelin luottaa lähettäjään? | Kyllä, jokainen MCP-kutsu kantaa yhteystiedon. Vastauksen loppu jäi lukematta; ohjeiden mukaan tiedot tulevat alustan yhteystietueesta eivätkä mallilta. |
| Tietopohja vai hakutyökalu 17 000 tuotteelle? | Hakutyökalu. Tietopohja on staattinen kopio ja vanhenisi heti hintojen muuttuessa. MCP-palvelin on ainoa lähde, ja agentti toimii vain sen palauttamalla tiedolla. |
| Miten "maitoa" tarkennetaan ja montako vaihtoehtoa näytetään? | Ohjeilla, esimerkiksi "jos haku palauttaa useita, näytä kolme parasta koon ja hinnan kanssa ja kysy mikä". Vaihtoehtojen määrälle ei ole asetusta, kaikki on kehotekerroksessa. |
| Miten estetään keksityt hinnat ja saldot? | Hintoja ei laiteta tietopohjaan, ja ohjeisiin kirjoitetaan "kerro vain työkalun palauttama hinta tai saldo". Vastauksen loppu jäi lukematta. |
| Ääniviesti tai kuva käsin kirjoitetusta listasta? | Ääniviestit litteroidaan, kuvat luetaan kuvina. |
| Kolme nopeaa viestiä peräkkäin? | Yleensä yksi vuoro, jos ne ehtivät vastausviiveen sisään. |
| Ihmiselle siirto? | Laukaisin määritellään agentille. Keskustelu pysähtyy ja botti on hiljaa, kunnes joku palauttaa sen. |
| Muistutus kesken jääneestä tilauksesta ennen tilausaikarajaa? | Onnistuu, kun tilauksen tila tarkistetaan ensin omasta rajapinnasta. WhatsAppin 24 h ikkunan ulkopuolella tarvitaan viestipohja. |
| Mitä agentti sanoo, kun työkalu epäonnistuu? | Oletusta ei ole. Se sanoo, mitä ohjeisiin on kirjoitettu ("kerro ettei löytynyt ja tarjoa uusintaa"), muuten malli muotoilee itse. |
| Miten muutokset testataan? | Try out -välilehti ajaa tallentamattomat muutokset hiekkalaatikossa. Pieleen menneen oikean keskustelun voi kopioida testiin ja toistaa samasta kohdasta. |
| Mitä DM Champ ei hoida hyvin tilauspolussa? | "Vahvistusportti on ohjetasoa, ei kova tekninen lukko. Jos virheitä ei sallita, lisää toinen tarkistus omaan rajapintaan: place_order tarkistaa lipun, joka asetetaan vasta ostajan hyväksyttyä." Toinen kohta alkoi monimutkaisesta liiketoimintalogiikasta, loppu jäi lukematta. |

**Havainto:** agentin oma vastaus paljastaa heikon kohdan. Tilauksen estäminen ennen vahvistusta ja vaihtoehtojen määrä ovat DM Champissa pelkkiä ohjelauseita. Mallin ohje ei ole tae. Meillä nämä ovat palvelimen koodia.

## Sovellus Valion tehtävään

### Oikeiden tuotteiden haku

| Sääntö | Miten meillä | Omistaja |
|---|---|---|
| Katalogi on työkalun takana, ei kehotteessa | 17 546 tuotetta ei mahdu eikä kuulu mallin kontekstiin. `suggest` hakee ehdokkaat palvelimella ja palauttaa enintään kolme perusteltua vaihtoehtoa per rivi. | 3 |
| Malli tuottaa hakuehtoja, ei tuotekoodeja | Tulkinta tehdään `server/aimo/interpret`-funktiolla (määrä, yksikkö, väittämät, allergeenit, päivä). Tuotetunniste voi tulla vain katalogista. Tuntematon tunniste hylätään palvelimella. | 2, 3 |
| Sama saatavuusehto kuin verkkokaupassa | Vaihtoehdoksi kelpaa vain tuote, jonka `orderableProduct` hyväksyy valitulle päivälle: tuore hinta, saldo, tilausaika, muunnettava myyntierä. | 3 |
| Monitulkintainen pyyntö tarkennetaan ennen hakua | "Maitoa" jakautuu laktoosittomaan, rasvaprosenttiin ja pakkauskokoon. Kysytään yksi tai kaksi asiaa, jotka oikeasti jakavat ehdokasjoukon (sama periaate kuin haun tarkennuksissa). Laktoositon ja maidoton pidetään erillään. | 2 |
| Tyypitetyt arvot, virhe palaa mallille | Määrä, yksikkö ja päivä validoidaan palvelimella. Kelvoton arvo palautetaan syykoodilla, ja agentti kysyy uudelleen. Puuttuva määrä ei ole arvaus. | 2, 3 |
| Puuttuva tieto pysyy puuttuvana | Jos hinta- tai saatavuuskutsu epäonnistuu tai aikakatkeaa, vastaus sanoo sen suoraan. Hintaa, saldoa tai toimituslupausta ei muotoilla mallin tekstistä. | 3 |
| Lukukutsut saa uusia ja välimuistittaa, kirjoittavia ei | `suggest` ja `quote` ovat vain lukevia. `submit` ajetaan kerran idempotenssiavaimella. | 3 |
| Tuotekuva viestiin | Työkalu voi palauttaa kuvan suoran osoitteen (`/img/<id>`), jolloin vaihtoehdot voi lähettää kuvina. Vasta tilausketjun jälkeen. | 1, 3 |

### Tilausluonnos

| Sääntö | Miten meillä | Omistaja |
|---|---|---|
| Luonnos on palvelimen tietue, ei keskusteluhistoria | Rivit, määrät, vaatimukset, päivä ja valinnat tallennetaan omaan storeen. 20 viestin historia ei ole tilausmuisti. | 2 |
| Rivillä pysyvä tunniste | "Eikun 30 litraa" kohdistetaan rivin `ref`-tunnisteeseen, ei näytön järjestysnumeroon. Jos kohde on epäselvä, kysytään. | 2 |
| Jokainen sisältömuutos kasvattaa revisiota | Määrän, päivän, ruokarajoitteen, toimituspaikan tai tuotevalinnan muutos mitätöi tarjouksen ja odottavan hyväksynnän. | 2 |
| Vahvistus on palvelimen portti, ei mallin päätös | Palvelin muodostaa yhteenvedon tarjouksesta ja tallentaa odottavan revision. Tilaus lähtee vain, kun ostajan seuraava viesti on nimenomainen hyväksyntä juuri sille revisiolle. Malli ei voi kutsua `submit`-työkalua omin päin. | 2, 3 |
| "Joo" kysymykseen ei ole tilauslupa | Hyväksynnäksi kelpaa vain vastaus yhteenvetoon. Tarkentavan kysymyksen "joo" käsitellään vastauksena siihen kysymykseen. | 2 |
| Asiakas tulee kanavalta | Asiakkuus ratkaistaan varmennetusta lähettäjästä ennen mallia ja annetaan työkaluille palvelimen kontekstina. Malli tai viestin teksti ei voi vaihtaa asiakasta. Tuntematon numero ei näe asiakastietoja eikä voi tilata. | 1, 4 |
| Peräkkäiset viestit yhtenä vuorona | Saman lähettäjän jonossa odottavat viestit yhdistetään ennen mallikutsua, jottei "20 l maitoa" ja "ja voita" tuota kahta ristiriitaista vastausta. | 1 |
| Lyhyet viestit | Tuote per viesti tai lyhyt lista, ei taulukkoa. Pitkä vastaus pilkotaan. | 1, 2 |
| Muistutus vain kun luonnos on yhä kesken | Ennen muistutusta tarkistetaan palvelimelta, että luonnos on avoin ja tilausaika ei ole mennyt. Vain asiakkaan avaaman 24 h ikkunan sisällä. | 1, 2 |
| Ihmiselle siirto pysäyttää botin | Toimitusongelma, reklamaatio tai toistuva väärinymmärrys ohjataan asiakaspalveluun, eikä botti jatka tilausta sen jälkeen ennen uutta pyyntöä. | 1, 2 |
| Luonnos ja julkaisu erillään | Uusi tilauspolku pysyy asetuksen takana, ja vanha vain lukeva kanava säilyy, kunnes ketju on testattu. | 1 |
| Tallennettu testisarja | DM Champista tämä puuttuu. Meillä päästä päähän -testi ajaa samat keskustelut jokaisen muutoksen jälkeen. | 4 |

## Mitä emme kopioi

- **Myyntifollow-upit ja kylmät viestit.** Ostaja tilaa itse, emme jahtaa häntä. Vain luonnoksen muistutus ennen tilausaikarajaa on perusteltu.
- **Kampanjat, lähetykset ja liidien pisteytys.** Eivät kuulu tilaamiseen.
- **Keinotekoinen 15–30 s viive.** Kiireinen kokki haluaa vastauksen heti. Viestien niputus tehdään jonosta ilman lisäodotusta.
- **Ihmiseksi tekeytyminen.** Apuri kertoo olevansa Aimon tilausapuri.
- **WhatsApp Web -paritus.** Käytämme virallista Cloud API:a ja Metan testinumeroa.
- **Monikanavaisuus, valkoinen merkki ja alitilit.** Ei tarvetta demossa.
- **Vapaa verkkohaku ja mallin itse kirjoittamat tietopohjavastaukset tuotetiedoille.** Tuotetieto tulee vain katalogista ja Valion rajapinnasta.

## Avoimet kysymykset

- Kolmen vastauksen loppu jäi lukematta, koska WhatsApp katkaisee pitkän viestin ("Näytä kokonaan"): tuntemattoman numeron käsittely, keksittyjen hintojen esto ja toinen asia, jota DM Champ ei hoida hyvin.
- Ei kysytty: miten kuvan teksti ja litterointi tarkalleen syötetään mallille, ja miten vastausten optimointi keskusteluista toimii. Ohjeiden mukaan optimointi kirjoittaa ohjeet uusiksi luonnokseksi, joka julkaistaan erikseen.
- Ei kokeiltu: omaa DM Champ -tiliä, MCP-kytkentää tai testikeskustelua. Kaikki yllä on agentin vastauksista ja julkisista ohjeista.
- Meidän päätettävä: yhdistetäänkö peräkkäiset viestit jonossa (henkilö 1) ja lähetetäänkö tuotevaihtoehdot kuvina.

## Lähteet

- [AI Agents](https://help.dmchamp.com/ai-agents/ai-agents/), [AI Bot Setup](https://help.dmchamp.com/ai-automation/ai-bot-setup/), [Custom Functions](https://help.dmchamp.com/ai-automation/custom-functions/), [MCP-palvelimet](https://help.dmchamp.com/ai-automation/mcp-servers/)
- [Custom Fields](https://help.dmchamp.com/get-started/custom-contact-fields/), [Knowledge Base](https://help.dmchamp.com/ai-automation/faq-management/), [Follow-ups](https://help.dmchamp.com/ai-automation/follow-ups/), [Media Library](https://help.dmchamp.com/ai-automation/media-library/)
- [Try Out](https://help.dmchamp.com/chats/playground/), [AI Model & BYOK](https://help.dmchamp.com/ai-automation/ai-model-and-byok/), [hinnat](https://help.dmchamp.com/billing/subscription-tiers/), [WhatsApp-sivu](https://dmchamp.com/features/whatsapp/)
- Aiempi vertailu: [docs/aimo-malli.md](aimo-malli.md)
