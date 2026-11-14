# WhatsAppin alku- ja loppupään työnjakopäätös, 14.11.2026

Käyttäjä pyysi tässä MCP-yhteys-chatissa ilmoittamaan koko tiimille ja paikallisiin toteutuschateihin: **Eelis hoitaa WhatsAppin alkupään. Muu tiimi saa jakaa loppupään työn niin, että viesteistä kerätään tilaus, joka kulkee API:n/rajapinnan kautta verkkokaupan ostosapurille ja tilauspolkuun.**

## Lähetetty yhteiseen MCP:hen

- `whoami` varmisti lähettäjäksi `eelis-chatgpt`, projekti `aimo-ai`. Nykyiset tehtävät ja viestit tarkistettiin ennen työnjakopyyntöä.
- Koko projektin broadcast **#17**, otsikko `Eeliksen työnjako: WhatsApp-alku Eelikselle, API-tilausketjun loppu muulle tiimille`. Näkyy kaikille projektin kahdeksalle jäsenelle. Vastaanottajien lukemista tai osuuksien hyväksymistä ei ole vielä varmennettu.
- Suora viesti **#18** tunnisteelle `daniel-chatgpt`: nykyisen WhatsApp-ostoslistan siirtotehtävän `e6c4127e-366d-4f8c-8f54-0d401249299e` toteuttajalta pyydetään API-sopimuksen koordinointia sekä erillisten tuote-/määrä- ja e2e-testiosuuksien jakoa. Tunnistetta jakava koordinaattorichat `00331c3a` voi auttaa näkyvyydessä. Nykyistä omistajaa tai muiden varauksia ei muutettu.
- Yhteiseen projektitilanteeseen kirjattiin sama päätös, **revisio 1**. Viestit #17–18 luettiin takaisin ja sisältö/toimitus palvelimelle varmennettiin. Tämä ei itsessään herätä vastaanottajien chatteja.
- Paikalliselle koordinointitaululle lähetettiin sama broadcast **#31**, jotta myös samalla koneella toimiva Claude Code ja muut Codex-chatit saavat tiedon seuraavalla `start`/`inbox`-kutsulla.

## Takaisinluettu vastuu- ja kuittaustilanne klo 22.20

MCP-yhteyschat luki tilanteen uudelleen Git-kokoajan pyynnöstä tallennetulla `aimo-team`-yhteydellä (`eelis-chatgpt` / `aimo-ai`), kuittaamatta jaettuja viestejä muiden puolesta:

- Danielin `e6c4127e-366d-4f8c-8f54-0d401249299e` on yhä `in_progress`, omistaja `daniel-chatgpt`, revisio 1. Etenemismerkintää tai valmista commitia ei ollut. Nykyinen rajaus on sama pysyvä luonnos projektin omassa ostosapurissa; se ei vielä tarkoita automaattista tilausta tai Valion tuotantoyhteyttä.
- Aktiiviset varaukset: `server/shopping-list/`, `server/whatsapp/shopping-list.mjs`, `server/whatsapp/ordering.mjs`, `server/whatsapp/runtime.mjs`, `server/order-conversation/runtime.mjs`, `public/assistant.js`, `public/whatsapp-shopping-list.js`, `test/shopping-list-handoff.test.mjs` ja `docs/parallel/whatsapp-shopping-list.md`. Niihin ei aloiteta toista siirtototeutusta. Varauslista ei tarkoita, että kaikki uudet tiedostot olisivat jo tässä kloonissa tai GitHubissa.
- Danielilta ei ollut vielä kuittausta pyynnöille #17–18: loppupään uuden osajaon omistajat, todellinen tilaus-API:n endpoint ja pyyntö/vastausskeema olivat edelleen avoinna. Projektin yhteenveto rev 1 kuvaa pyyntöä, ei valmiiksi hyväksyttyä työnjakoa.
- Paikallinen integraatiochat `Suunnittele tilauksen verkkokauppaintegraatio` on kuitannut loppupään jatkon ja rajapintarajan sopimisen Danielin kanssa. Git-kokoaja luki kuittauksen myös suoraan chatista: se oli pyytänyt Danielilta endpointin ja pyyntömuodon sekä varannut erillisen API-ketjun varmennuksen. Chatin 17 kohdistettua testiä koskivat olemassa olevaa paikallista polkua; niitä ei tulkita vielä keskeneräisen uuden siirtorajapinnan testitulokseksi.
- Eeliksen Claude työskentelee keskustelun/tuotetyökalujen pikkuvioissa (`ad3d56f1`, paikallisesti `9fe21776`): `server/order-conversation/index.mjs`, `server/order-tools/index.mjs` ja niiden testit. Julkisen demon työ `05c6804a` varaa kanavan/store-moduulin ja omat testinsä/dokumenttinsa. Myös nämä rajat sovitaan ennen API-työn mahdollisia muutoksia samoihin tiedostoihin.
- Tuoreempi käyttöönottotyö `95b915e9`, chat `Korjaa WhatsApp-tokenin vanheneminen`, omistaa Metan, paikalliset ympäristöasetukset ja 4749-restartin. Se ilmoitti käyttävänsä vain commitoitua snapshotia. Danielin keskeneräisiä runtime-/ordering-tiedostoja ei oteta käyttöön sellaisinaan.
- Yhteisen palvelimen lokivaraukset tarkistettiin erikseen klo 22.20.54: `TYOLOKI.md` ei ollut enää minkään tehtävän aktiivisissa `resources`-varauksissa. Koordinaattorin `00331c3a` revisio oli 3; MCP-ydin ja README säilyivät sen varauksessa. Paikallinen Git-kokoamisvaraus on `994f0523`.

## Tarkistuksen jälkeen GitHubiin tullut API-sopimus ja vastaanottokuittaus

Ennen raporttien tallennusta etähaaraan tulivat Danielin toteutus `4d57190` ja tarkistusraportin päivitys `48c4139`. Niiden koodi ja `docs/parallel/whatsapp-shopping-list.md` luettiin suoraan Gitistä. Alla oleva sopimus korvaa yllä olevan klo 22.20 tilannekuvan avoimen endpoint-kohdan:

- GET `/api/assistant/whatsapp-list?buyerId=...` palauttaa paikallisen demoasiakkaan ja saman pysyvän ostoslistan snapshotin.
- POST `/api/assistant/whatsapp-list/chat` vastaanottaa `{buyerId,text,messageId,expectedList:{id,revision}|null}`. Viestitunniste on UUID; sama uusintapyyntö käyttää samaa tunnistetta. Vastaus sisältää nykyisen keskustelumoottorin vastauksen ja `shoppingList`-snapshotin. Vanhentunut luonnos/revisio torjutaan 409:llä. Asiakkuus ratkaistaan palvelimella, ei selaimen customer-objektista.
- Rajaus on paikallinen saman alkuperän testikauppa. Tilaus edellyttää nykyisen moottorin tarkistettua yhteenvetoa ja erillistä TILAA-vahvistusta; kyseessä on gatewayn demotilaus. Käyttöönottoa tai Valion tuotantotilauksen rajapintaa ei tällä Git-julkaisulla varmenneta.
- Integraatiochat vahvisti tässä Git-kokoajan chatissa Danielin MCP-viestin #35 hyväksyneen sille erilliset `test/shopping-list-order-api.test.mjs`- ja `docs/parallel/shopping-list-order-api.md`-tiedostot: yhteinen tehtävä `750a63f3`, paikallinen `7ed54857`. Uusi varmennus käyttää oikeaa gatewayta/local-shopia allekirjoitetusta webhookista yhdeksi hyväksytyksi demotilaukseksi. Chatin 17/17 lähtötasoa ei lasketa uuden testin tulokseksi.
- Integraatiochatin keskeneräistä raporttia tai tulevaa testitiedostoa ei sisällytetä tähän raportticommittiin. Git-vastaava tuo Danielin julkaistun koodin työpuuhun säilyttäen muiden työt; integraatiochat jatkaa vasta julkaistun API:n päällä. Danielin oma raportti erottaa 76 läpäistyä kohdistettua testiä kahdesta katalogin puuttumisen vuoksi ohitetusta testistä; tämä ei ole Git-kokoajan oma testitulos.

Git-kokoaja tallensi omat kolme dokumenttia rajattuun commitiin `51c2cec` ja yhdisti etähaaran `de5b509`:n (sisältää `4d57190`, `48c4139` ja koordinaattorin viimeistelyn). Fast-forward pysähtyi uuden etälokimerkinnän vuoksi; työlokin yhdistämisessä säilytettiin molemmat itsenäiset merkinnät. Yhdistetyssä paikallisessa työpuussa **koko sovellustestisarja 190/190 ja Team MCP:n testit 39/39 läpi, ei ohituksia**. Käytössä eristetyt testikannat ja paikalliset testipalvelimet; ei oikeita Meta-, malli- tai Valio-kutsuja eikä nykyisten palvelinten restarttia. Tämä regressiovarmennus ei korvaa integraatiochatin erikseen ottamaa uuden API-ketjun riippumatonta testiä.

## Loppupään tehtävärajaus

1. Pysyvä rakenteinen luonnos ja API-kytkentä nykyiseen verkkokaupan ostosapuriin.
2. Tuotteiden, määrien, yksiköiden ja pakkausten kohdistus sekä hinnan/saatavuuden käsittely nykyisiä moduuleja käyttäen.
3. Päästä päähän -varmennus usean WhatsApp-viestin kautta hyväksytyksi tilaukseksi: täydennykset ja korjaukset säilyvät, yhteenveto tarkistetaan, nimenomainen hyväksyntä tuottaa yhden tilauksen eikä viestiuusinta tee kaksoistilausta.

Tekijöiltä pyydettiin omistajat, tiedostovaraukset, todellinen endpoint ja pyyntö/vastausesimerkki sekä testit ja pushattu commit. Projektin demo-API:n toimivuutta ei raportoida oikeana Valion tuotantotilauksena; puuttuva tuotantorajapinta nimetään avoimeksi asiaksi. Eeliksen WhatsApp-alkupäähän tarvittavat muutokset sovitaan hänen kanssaan. Meta-asetukset ja restartit pysyvät nykyisellä käyttöönoton omistajalla.

## Paikalliset chatit ja Git-kirjaus

Tiedote lähetettiin työkalun onnistuneella kuittauksella chatteihin `Seuraa sessioita ja edistä työtä`, `Suunnittele tilauksen verkkokauppaintegraatio`, `Jatka WhatsApp-käyttöönottoa` ja `Arvioi Cloudflare Workers -vaihtoehto`. Integraatiochatilta pyydettiin loppupään API-osuuden sopimista Danielin kanssa ennen päällekkäisiä muutoksia. Git-vastaavalta pyydettiin tämän päätöksen ja aiemman valmiin `docs/parallel/codex-team-mcp.md`-asennusraportin kokoamista `TYOLOKI.md`:hen ja GitHubiin.

Tämä chat teki tiedotuksen ja työnjakopyynnön. Yllä erotetaan vastaanottokuittaus avoimesta työnjaosta; loppupään toteutusta tai testien läpäisyä ei väitetä tehdyksi. Sovelluksen lähdekoodia ei muutettu, eikä palvelimia tai kantoja käynnistetty uudelleen tai nollattu. Raportti ja päätökset tallennetaan samaan rajattuun commitiin `TYOLOKI.md`:n ja MCP-yhteysraportin tilapäivityksen kanssa; push varmennetaan erikseen.
