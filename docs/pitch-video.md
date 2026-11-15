# Aimo-tilausapurin suomenkielinen esittelyvideo

- Katselu: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- MP4: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-agent-pitch-fi.mp4
- Puheteksti: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/pitch-script.txt
- Suomenkielinen tekstitys: https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/captions.vtt
- Kesto: 113,832683 s (1 min 53,83 s), alle kahden minuutin.
- Puhe, videon tekstit ja katselusivu suomeksi. Synteettinen suomenkielinen kertojaääni, tavallinen puhenopeus. H.264/AAC, 1280 × 720, 24 fps.

Käyttäjän korjaus: video suomeksi ja vähemmän mainospuhetta. Englanninkielinen versio korvattiin. Käsikirjoitus kirjoitettiin uusiksi yhden ravintolatilauksen ympärille: WhatsApp-viesti, tuotehaku, ostoskori, tarjous, ostajan asettamat rajat ja päätösloki. Videossa on kuvitettu työnkulku. Prototyyppi ei lähetä oikeita Valio-tilauksia eikä veloita maksuja. Tiimikoordinointia ei käytetä videon sisältönä.

Lähteet: projektin README.md, docs/challenge-coverage.md ja package.json. Ei uusia malli-/Meta-/Valio-testiajoja. Videon suomenkielinen puhe tuotettiin erikseen.

## Puheteksti

00:00:00  Aimo-tilausapuri
Rakensimme Valio Aimolle tilausapurin. Sen kautta ostaja voi valmistella tilauksen WhatsAppissa ja vahvistaa sen selaimessa.

00:00:10  Tilaus alkaa viestistä
Ostaja kirjoittaa: tarvitsen kaksikymmentä litraa laktoositonta maitoa ja viisi litraa kermaa maanantaiksi. Apuri kysyy puuttuvat tiedot.

00:00:21  Apuri etsii tuotteet
Apuri etsii tuotteet. Hinta, saatavuus ja tilausaika tarkistetaan haasteen rajapinnasta. Laktoosittomuus varmistetaan tuotetiedoista.

00:00:34  Ostaja valitsee ja tarkistaa
Ostaja valitsee tuotteet ja määrät. Apuri lähettää linkin ostoskoriin. Lopullinen vahvistus tehdään siellä.

00:00:44  Tilaukseen tarvitaan tarjous
Taustalla Aimo Agent Gateway muodostaa allekirjoitetun tarjouksen. Hinta ja saatavuus tarkistetaan vielä ennen tilauksen tallennusta.

00:00:55  Ostaja määrää agentin rajat
Ostaja asettaa agentille säännöt. Euromäärän ylitys vaatii ihmisen hyväksynnän. Kiellettyä allergeenia ei voi hyväksyä tilaukseen.

00:01:07  Päätökset jäävät lokiin
Päätöslokista näkee tarkistukset ja hyväksynnän syyn. Saman pyynnön lähettäminen uudestaan ei tee kaksoistilausta.

00:01:17  Sama rajapinta eri apureille
Sama rajapinta palvelee verkkokauppaa ja muita ostoagentteja. Keittiödemo tekee tilausehdotuksia historiasta, varauksista ja resepteistä.

00:01:29  Mitä rakensimme?
Toteutus käyttää Nodea ja SQLitea. Agentit liittyvät siihen REST- tai MCP-rajapinnalla. Tilausoikeudet tarkistetaan koodissa.

00:01:41  Tämä on toimiva prototyyppi
Demo tallentaa testitilauksia, ei oikeita Valio-tilauksia tai maksuja. Seuraava vaihe on yhteys Aimon asiakastunnistukseen ja tilausjärjestelmään.

## Tarkistukset

Koko MP4 dekoodattu ffmpegillä ilman virheitä. Kesto tarkistettu ffprobella. Jokainen puheosuus päättyy ennen kuvan vaihtumista, nopeusmuutos alle 0,5 %. Otsikoiden leveydet ja renderöidyn tekstityksen sijoittuminen tarkistettu. Sites-versio 2 julkaistu samaan julkiseen osoitteeseen, lähdecommit 316a5da416bdd2af53aa7f0ca068a454ab59c5e4.
