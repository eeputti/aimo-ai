# WhatsAppin keskustelutapa, 14.11.2026 (Codex)

## Käyttäjän linjaus

Luontevat tervehdykset ja tarkennukset Valio Aimo -sävyllä; myös vapaata keskustelua tuotteista ja käyttötavoista. Päätavoite on ostoslistan keruu. Lista voi tulla ensin ja hyödyllinen jatkokysymys erillisenä viestinä. Lisätuotetta ei lisätä kysymättä.

## Toteutus ja rajaus

- Uusi `server/whatsapp/dialogue.mjs` on nykyisen tilausmoottorin ympärillä. Mallikutsut kulkevat edelleen `aimoAgent.askAgent`-moduulin ja asetetun nopean mallin kautta. Nykyisistä ympäristöasetuksista varmennettiin vain käyttötilat: malli päällä, `claude-haiku-5-5`, tilaustila päällä. Salaisuuksia ei tulostettu tai muutettu.
- Malli erottaa listan muutokset ja siihen annetut vastaukset tervehdyksistä/käyttökysymyksistä. Tilausteksti menee nykyiselle moottorille; sen hintoja, tuotevalintoja, toimitustietoja ja TILAA-ohjetta ei kirjoiteta mallilla uudelleen. TILAA, peruminen ja numerovalinnat ohittavat keskustelureitityksen.
- Käyttökysymys hakee rajatun paikallisen katalogikontekstin, jonka perusteella malli antaa lyhyen käyttövinkin. Katalogihaku ei varmista reaaliaikaista saatavuutta tai hintaa. Mallin ohje kieltää niiden sekä allergeeniturvallisuuden ja säilyvyysaikojen keksimisen. Vapaamuotoinen käyttövinkki on edelleen mallin tekstiä, ei faktatakuulla tuotettu resepti.
- Tarvittaessa seuraa erillinen kysymys tuotteen lisäämisestä. Vastaukset kuten `joo 5 litraa` ja `lisää sitä 5 litraa` sidotaan viimeksi kysyttyyn tuotteeseen; määrää ei keksitä. Pelkkä kyllä lisää korkeintaan tuotetarpeen ja pyytää määrän nykyisen moottorin kautta. Se ei vahvista tilausta.
- Valmiiseen listaan voidaan ehdottaa yhtä katalogista löytyvää täydentävää raaka-ainetta, kun mainittu ruoka tai tarjoilu perustelee sen. Ilman käyttötarkoitusta ei ohjata tuputtamaan lisätuotteita. Ruokavaliomerkityille listoille ei tehdä tarkistamatonta lisäehdotusta. Kielteinen vastaus säilyttää listan. Aiempia ehdotuksia ei toisteta saman keskustelumuistin aikana.
- Lista ja tarkennus kulkevat erillisinä `messages`-osina. Lopullinen tarjous ja sen TILAA-ohje pidetään yhdessä. Ilman mallia säilyy aiempi yhden vastauksen sopimus. Myös malli-/luokitteluvirheessä nykyinen tilauspolku jää käyttöön.
- Keskusteluhistoria, viimeisin listavastaus, avoin lisäkysymys ja viestikohtainen tulos säilyvät WhatsApp-kannan erillisissä `wa_dialogue`-tauluissa. Uusinta palauttaa saman tuloksen. Muisti rajataan, siivotaan seitsemän päivän jälkeen ja poistetaan tunnuksen perumisessa. Asiakkuusrajaus käyttää varmennettua sidosta.
- Henkilöiden 2–3 omistamia `server/order-conversation/`- tai `server/order-tools/`-tiedostoja ei muutettu. Kytkentä on henkilön 1 omassa `ordering.mjs`:ssä. Meta-asetuksia, ympäristötiedostoja tai käynnissä olevia palvelimia ei muutettu.

## Varmennus

- Koko `npm test`: **177/177**. Ensin löytyneet kaksi yhteensopivuusvirhettä ratkaistiin tiedostorajojen mukaan: oma adapteri säilyttää ilman mallia vanhan vastaussopimuksen; paikallisen verkkokaupan omistaja korjasi oman health-vastauksensa lisäkenttäristiriidan. Lopullinen koko sarja läpi yhdistetyn koodin päällä.
- Oikea Claude, simuloidut hinnat, omat väliaikaiset kannat: Moi → kuohukerman käyttökysymys → 2 litraa → maanantai/ei allergioita → valinta 1 → tarjous. **8 mallikutsua, 0 virhettä, 0 tilausta**. Malli antoi aluksi liian pitkän käyttövinkin ja tarpeettoman toisen kermatuotteen ehdotuksen; ohje tiivistettiin ja lisäehdotus sidottiin käyttötarkoitukseen.
- Ohjemuutoksen oikean mallin uusinta: sinutteleva tervehdys; lyhyt käyttövinkki ja erillinen määräkysymys; yleiseen kermalistaan ei lisätuote-ehdotusta. Ei Meta- tai Valio-kutsuja eikä tilauksen vahvistusta näissä kokeiluissa. Mallin avainta käytettiin sen nykyisellä valtuutuksella, sitä ei luettu lokiin.
- Automaattitestit kattavat chatin vaikutuksettomuuden listaan, katalogikontekstin, hyväksytyn lisäyksen, kieltäytymisen, TILAA-polun erillisyyden, mallivirheen, pysyvän uusinnan ja tunnuksen perumisen. Kanavan osatoimituksen testit on kuvattu `whatsapp-typing.md`:ssä.

## Käyttöönotto

Valmis muutos viedään omaan rajattuun commitiin yhdessä `TYOLOKI.md`:n kanssa. Käyttöönottochatille ilmoitetaan commit ja restartin tarve. Nykyisten kantojen säilyttäminen on edellytys; mitään ei tarvitse nollata. Kirjoittaa-ilmaisimen näkyminen ja viestisarja oikeassa puhelimessa odottavat tätä käyttöönottoa ja puhelintestiä.
