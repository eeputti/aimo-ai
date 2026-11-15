# WhatsApp: linkin lukeminen ja siihen sopivat tuotteet

Omistaja: Codex, linkkichat. Käyttäjän pyyntö 15.11.2026: apuri saa avata lähetetyn linkin, kertoo ensin esimerkiksi ”Hetki, avaan linkin”, tutkii sisällön ja ehdottaa siihen sopivia tuotteita.

## Toteutus

- `server/whatsapp/link-reader.mjs`: yksi julkinen HTTPS-sivu kerrallaan. HTML, teksti ja Schema.org Recipe -tiedot; sivun JavaScriptiä ei ajeta. Lukija ei lähetä evästeitä, valtuuksia tai sovelluksen avaimia. Enintään 1 MB, 12 sekuntia ja kolme uudelleenohjausta. Kaikkien DNS-vastausten on oltava julkisia osoitteita. Tarkistettu osoite sidotaan HTTPS-yhteyteen, ja uudelleenohjaukset tarkistetaan uudestaan. HTTP, sisäverkko, paikalliset osoitteet ja erikoisprotokollat torjutaan.
- `link-advice.mjs`: ensimmäinen mallikutsu poimii raaka-aineet ja lähdelainaukset. Koodi hyväksyy vain oikeasti sivulta löytyvät lainaukset ja määrät. Annoskerroin ja yksikkömuunnokset lasketaan koodissa. Kilot eivät muutu litroiksi. Puuttuvat määrät ja annosmäärä kysytään tai jätetään tarkennettaviksi. Hakusanassa olevat tilaus-/poisto-/oikeuskomennot torjutaan.
- Toinen rajattu mallikutsu vertaa lähteen valmistusastetta ja makua todellisiin katalogiehdokkaisiin. Suositeltu ID hyväksytään vain saman rivin ehdokkaista; tunnetut ruokarajoitteet suodattavat ehdokkaat koodissa. Suola-krassia ei ole tarkoitus ehdottaa suolaksi eikä tavallista kermaa juustokermaksi. Valmiin liemen määrä ei siirry tilaukseen liemitiivisteen määränä; tunnetut jauhe-/tiiviste-ehdokkaat tarkistetaan lisäksi koodissa. Jos sopivuus tai haku jää epäselväksi, riville ei nimetä tuotetta.
- `channel.mjs` lähettää ennen lukemista ”Hetki, avaan linkin ja katson, mitä siihen sopisi Aimon valikoimasta.” Väliviestillä on oma pysyvä kertamerkintä: jonon uusinta ei toista sitä. Väliviestin lähetysvirhe ei estä varsinaista vastausta. Tuntematon tai peruttu asiakas ei käynnistä lukemista.
- `ordering.mjs` kytkee linkkineuvonnan nykyisen keskustelun eteen. Sivun lukeminen ei muuta ostoslistaa. Erillinen myöntävä vastaus siirtää näytetyt ainekset nykyiseen tilauskeskusteluun, jossa päivä, määrät, tuotevalinnat, saatavuus ja vahvistus käsitellään ennestään. `cart-link.mjs` varmistaa, että ”ok” vastaa juuri linkkiehdotuksen kysymykseen ennen vanhan valmiin korin kuittausta.
- Ehdotus säilyy asiakkaan sidoksessa tunnin. Annosmäärää voi muuttaa ilman uutta sivuhakua. Muu keskustelu, kielteinen vastaus, muuttunut kori tai vanhentuminen estää vanhan ehdotuksen hiljaisen hyväksymisen. Sivujen ja mallin tuloksia ei käytetä tilauslupana.

## Tarkistukset

- `test/whatsapp-links.test.mjs`: 14/14. Osoitemuodot, julkinen IPv4/IPv6, sisäverkot, DNS-vaihto, ohjaukset, HTTPS:n sidottu osoite, aika-/kokorajat, HTML/Recipe-poiminta, määrämuunnokset, lähteeseen perustumattomat ainekset ja vapaat väitteet, annoskoon muutos, erillinen hyväksyntä, liemitiiviste, asiakkaiden eristys, vanhentuminen, jonon uusinta, väliviesti ja vanhan valmiin korin ok-kuittaus.
- Koko `npm test`: **351/351**, erillinen klooni `e3b70e1` + linkkivaihe, eristetyt testikannat. Ensimmäinen hiekkalaatikkoajo ei saanut avata paikallisia HTTP-portteja; oikealla testiporttiluvalla koko sarja läpi. Myöhempi `d50dd29` muuttaa vain landingia ja lokia.
- Oikea HTTPS-lukija luki `https://www.valio.fi/reseptit/lohikeitto/` (4 annosta, 9 lähdeainesta) ja `https://www.valioaimo.fi/reseptit/kermainen-lohikeitto/` (20 annosta, 11 lähdeainesta).
- Ensimmäinen oikean mallin koe: 3 kutsua, 0 rajapintavirhettä, molemmat reseptit 40 hengelle ja ei-ruokasivun hallittu vastaus. Löydös: pelkkä katalogihaku tarjosi valmiin kalaliemen määrälle tiivistettä ja väärän makuista kermaa. Tuotemuodon erillinen vertailu lisättiin tämän perusteella.
- Korjattu koe: 5 kutsua, 0 rajapintavirhettä. Molempien reseptien määrät skaalautuivat; ammattikeittiöreseptin valmis kalaliemi 5 kg jäi ostomäärältään tarkennettavaksi eikä 5 kg siirtynyt ostoslistan syötteeseen. Hakuehdokkaat olivat oikeasta paikallisesta katalogista. Molemmissa erillinen ”joo lisää ne” kutsui vain testiin injektoitua tilauskeskustelua.
- Lopullinen koko ketjun koe: oikea julkinen Aimon resepti → oikea malli → katalogi → WhatsApp-jonon simuloitu odotusviesti → erillinen ”joo lisää ne” → oikea dialogi, tulkki ja tilausmoottori → 11 tallennettua riviä ja toimituspäiväkysymys. **5 mallikutsua, 0 rajapintavirhettä, 0 tilausta**. Kaikkien tunnettujen määrien annoskerroin, molempien maitotuotteiden laktoosivaatimus ja kalaliemen puuttuva ostomäärä tarkistettu tallennetusta luonnoksesta. Ajurin kaksi aiempaa loppuasertiota korjattiin: store ei tarjoa julkista db-kenttää, ja ”laktoositon” tallentuu erilliseksi vaatimukseksi, ei välttämättä tuotenimeen. Nämä ajovirheet eivät ole laskettuja läpäisyjä.
- Näissä kokeissa kannat olivat muistissa, Meta-lähetys ja tilauksen tekeminen estetty, ei Valio-API-kutsuja. Oikea malli ja julkisten sivujen verkkopyynnöt olivat käytössä. Paikallisia testiraportteja ja reseptisisältöä ei lisätä Gitiin.

## Rajat ja käyttöönotto

- Julkiset teksti-/HTML-sivut. Kirjautumista, PDF:ää, videoita tai JavaScriptillä avautuvan sivun selainohjausta ei toteutettu. Epäonnistumisesta kerrotaan ilman väitettä luetusta sisällöstä.
- Katalogiosuma ei ole saatavuus- tai hintalupaus. Tuotesopivuus on rajattu malliarvio; uutta yleistä laatuväitettä tai allergeeniturvallisuuden takausta ei tehdä.
- Uudet SQLite-taulut ovat lisääviä: `wa_link_progress`, `wa_link_advice`, `wa_link_results`. Ei asetusten, riippuvuuksien, vanhojen taulujen tai asiakkaiden muutoksia.
- Toteutus tehdään erillisessä `/private/tmp/aimo-whatsapp-links`-kloonissa, koska yhteinen työpuu sisältää muiden keskeneräisiä vaiheita. Yhteisen työpuun tiedostoja tai indeksiä ei korvata.
- Käyttöönoton tarkka versio, prosessi ja säilyvyystarkistus kirjataan erikseen `whatsapp-links-rollout.md`:hen. Oikean puhelimen uutta käyttäjäkoetta ei väitetä tehdyksi ilman vastaanotettua viestiä.

## Toteutuksen lähteet

[Node.js HTTPS](https://nodejs.org/api/https.html), [Node.js net.BlockList](https://nodejs.org/api/net.html), [Schema.org Recipe](https://schema.org/Recipe).
