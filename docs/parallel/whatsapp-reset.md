# Luonteva alusta aloitus ja tavalliset viestit, 14.11.2026 (Codex)

Käyttäjän kuvassa apuri vastasi lainauksella viestiin `moi` ja näytti vanhan maitolistan. Käyttäjä pyysi DM Champin kaltaista luontevaa asiointia: myös `tyhjää kaikki` ymmärretään ja aloitetaan alusta. Odotuksen ilmaisimeksi hän tarkensi **vain liikkuvat pisteet, ei erillistä odotustekstiä tai lisäviestiä**. Tämä käyttää edellisen commitin Metan omaa statusilmaisinta; apuri ei lähetä pisteitä tai odotustekstiä tavallisena chat-viestinä. WhatsApp-sovellus itse piirtää natiivin ilmaisimen.

## Muutokset

- `channel.mjs`: tekstiviestin Meta-payloadista poistettu automaattinen `context.message_id`. Vastaukset ovat tavallisia keskusteluviestejä; jokainen kupla ei lainaa ostajan viimeistä viestiä. Saapuva viestitunniste säilyy jonon, idempotenssin ja statusilmaisimen käytössä.
- `dialogue.mjs`: tavalliset nollausilmaukset tunnistetaan ilman malliriippuvuutta (`tyhjää kaikki`, `tyhjennä koko ostoslista`, `nollaa kaikki`, `aloitetaan alusta`, `voitko tyhjentää listan`). Mallin reitityksessä on lisäksi `reset` vapaammille ilmauksille. Kieltoa, yksittäisen rivin poistamista tai ohjeen kysymistä ei tulkita suoraan koko listan nollaukseksi.
- Nollaus peruu vain oman aktiivisen luonnoksen nykyisen moottorin kautta. Ostoslistan, avoimen jatkokysymyksen, aiempien lisäehdotusten ja dialogin historian tilalle tallennetaan uusi keskustelujakso. Vanha toimituspäivä, ruokavalio, tuotevalinta ja tarjous eivät siirry uuteen listaan. Jo tallennetut tilaukset ja muiden asiakkuuksien tiedot säilyvät.
- `ordering.mjs`: uuden jakson tunniste rajaa seuraavan luonnoksen erilleen myös vanhojen valmiiden tilausten `lastOrdered`-hausta. Tyhjän uuden listan TILAA ei siis kuittaa vanhaa tilausta. Jakso ja nollauksen sisäinen operaatiotunniste johdetaan viestitunnisteesta; nollausviestin uusinta ei tyhjennä sen jälkeen muodostettua uutta listaa.
- Pelkkään tervehdykseen vastaava malli ei saa vanhaa listaa tai keskusteluhistoriaa uudelleen tulostettavaksi. Jos malli ei ole käytössä, epäonnistuu tai reitittää tervehdyksen väärin, palautetaan lyhyt tervehdys. Tervehdys itsessään säilyttää ostoslistan.
- Muiden omistamiin `server/order-conversation/`- tai `server/order-tools/`-tiedostoihin, asetuksiin tai käynnissä oleviin palvelimiin ei koskettu. Rajaus varattiin taululla ja siitä ilmoitettiin käyttöönottochatille. Cloudflare-julkaisutyön tiedostot säilytetään sen omistajalle.

## Tarkistukset ja käyttöönotto

- Koko `npm test`: **183/183**. Kuusi uutta regressiota kattaa nollausilmaukset ja poikkeukset, rajatun/pysyvän nollauksen ja uusinnan, tervehdyksen malli- ja virhepoluissa, vapaan kielen nollauksen sekä oikean tilausmoottorin luonnoksen ja vanhan hyväksynnän erottamisen.
- Oikea Claude, omat tilapäiset kannat ja simuloidut hinnat: 50 l maitoa keskiviikoksi → moi → `heitetääs tää lista pois ja alotetaan ihan puhtaalta pöydältä` → TILAA → 5 kg voita. Nollaus onnistui, tyhjää listaa ei tilattu ja voi kysyi uuden toimituspäivän/ruokavalion. Neljä mallikutsua, ei mallivirheitä eikä tilausta. Ensimmäinen tervehdys vielä toisti vanhaa listaa; sen syöte rajattiin ja oikean mallin uusinta vastasi vain `Moi! Mitä tilattaisiin tänään?`.
- Lähettäjän testi varmistaa ettei lähtevässä payloadissa ole `context`-objektia. Pisteilmaisimen aiemmat testit varmistavat välittömän statuskutsun ja sen, ettei ennen mallin lopullista vastausta lähetetä odotustekstiä.
- Nykyistä 4749-palvelinta ei restartattu tässä työssä. Käyttöönottosessio omistaa edelleen sen ja Meta-asetukset; sille ilmoitetaan valmis commit ja samaan restartiin yhdistyvät aiemmat dialogi-/piste-/moniviestimuutokset. Oikean puhelimen animaation tai lainauksettoman vastauksen toimivuutta ei väitetä varmennetuksi ennen sitä.
