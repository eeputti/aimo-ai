# WhatsApp-agentin kohdistettu koe 15.11.2026 (Codex, testauschat)

> Historiallinen katselmointimuistio, tallennettu paikallisesta jaetusta työpuusta käyttäjän pyytämässä yhteisessä tilannetallennuksessa 15.11.2026. Alla olevat ajoversiot, PID ja käyttöönoton tila kuvaavat alkuperäisen testauschatin havaintohetkeä. Niitä ei ole varmennettu uudelleen tässä tallennuksessa; uudempi tilanne on `TYOLOKI.md`:ssä ja `bot-audit-2026-11-15-ilta.md`:ssä. Alkuperäinen tekijä ja tulokset säilyvät sellaisinaan.

Käyttäjä täsmensi aiempaa kokonaiskoetta: tärkein tavoite on WhatsApp-agentin toimivuus. Tässä vaiheessa testattiin vain agentin keskustelua, korin tilaa ja WhatsApp-kanavan teknistä toimitusta.

## Oikeat mallikeskustelut

Muuttumaton lähdekuva ajossa olevasta versiosta **9f20407**. Oikea malli, allekirjoitettu webhook, jono, asiakkuus, keskustelumuisti ja tallennettu kori. Hinnat/saatavuus ja Meta-lähetys simuloitiin. Kaikki kannat ja asiakastiedot eristettyjä.

| Tapaus | Tarkistus | Tulos |
|---|---|---|
| S003, slangi | "moro! tarvis 8 kg jauhista keskiviikoks", valinta numerolla | Oikea jauheliha, 8 kg, ke 18.11., valmis kori ja linkki |
| S005, annoslasku | Perunaa 120 annokselle, 150 g/annos | 18 kg, ma 16.11., valmis kori ja linkki |
| S012, päivän vaihto | Sipuli 3 kg ja broilerin rintafilee 8 kg, ma → ke | Molemmat rivit ja määrät säilyvät, ke 18.11., valmis kori ja linkki |
| X022, savolainen peruna–porkkana | Peruna 25 kg ja porkkana 8 kg keskiviikolle | Sisältö ja päivä oikein ja linkki vasta valintojen jälkeen, mutta **perunan laktoosittomuutta kysytään turhaan** |

Kovat sisältö-/toimintatarkistukset **3/4**, päivä-/vaihtoehto-/linkkiohjaus **4/4**. Yksikään keskustelu ei tehnyt tilausta. S012:ssa päivän vaihtoon yhdistetty sipulivalinta nollautui, ja ostaja joutui toistamaan saman valinnan: ylimääräinen keskustelukierros, ei väärää tallentunutta tilausta. Myös ilmaus "päivitin ostoskorin" ennen tuotevalintaa on edelleen epätarkka.

## Perunan korjauksen riippumaton uusinta

Toisen chatin valmis **e3b70e1** muuttaa laktoosikysymyksen ehtoa sekä lisää työkalutietoihin perustuvat hinta-, hiilijalanjälki- ja toimitusvarmuusvertailut. Sama X022 ajettiin erikseen tällä jäädytetyllä versiolla: **1/1 läpi**, ei perunan laktoosikysymystä; oikeat tuotteet, 25 kg + 8 kg, ke 18.11., linkki valintojen jälkeen. Lisäksi oma kohdistettu testisarja **21/21** läpi (päivä ensin, pilottikorjaukset, vertailut).

Yhteensä **5 keskustelua, 17 asiakasvuoroa, 48 mallikutsua, 0 kutsuvirhettä, 0 tilausta**. Ajurin kustannusarvio yhteensä noin **0,43 USD**; välimuistiin kirjoitus ei sisälly arvioon. Tämä oli rajattu kertakoe, ei uusi sadan asiakkaan ajo tai jatkuva seuranta.

## Oikean kanavan tila ja käyttöönotto

- Riippumaton vain lukeva tarkistus: 4749-palvelin on **PID 39055**, runtime **9f204077a**. Se ei sisällä e3b70e1-korjausta. Lähdekoodissa valmis korjaus ei siis vielä tarkoita puhelimessa korjattua toimintaa.
- Oikean WhatsApp-kannan kymmenen viimeisintä viestiä: kaikki `done`, yksi käsittely-yritys, Metan vastaustunniste tallessa, ei virhekoodia. Tämä todistaa teknisen lähetyskuittauksen, ei asiakkaan lukukuittausta.
- Vuorokauden 10 vanhaa `failed`-riviä säilyivät muuttamattomina. Niitä ei tulkita tässä uudeksi käyttöönoton jälkeiseksi viaksi.
- Puhelimeen ei lähetetty testiviestejä, käyttäjän koria ei muutettu eikä palvelinta restartattu tästä chatista.

**Johtopäätös:** testatut perustilaukset etenevät oikein valmiiseen koriin, mutta ajossa olevassa versiossa on edelleen perunan turha laktoosikysymys ja keskustelun sujuvuuteen liittyvää toistoa. Perunan korjaus on varmennettu e3b70e1:ssä; se tarvitsee käyttöönoton omistajan koordinoidun päivityksen. Tästä ei tehdä väitettä, että kaikki mahdolliset keskustelut tai oikea puhelimen loppukoe olisivat läpäistyjä.

Tarkat synteettiset ajot ja niiden lähdehashit ovat paikallisesti `/private/tmp/aimo-whatsapp-agent-audit-9f20407/` ja `/private/tmp/aimo-whatsapp-agent-audit-e3b70e1/`. Ei oikeita asiakasviestejä tai tunnuksia raporttiin.
