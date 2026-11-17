# Aimo-agentti omalla kielimallilla

## Mitä on toteutettu

AIMO_MODEL_PROVIDER=ollama vaihtaa nykyisen `askAgent`-rajapinnan Ollaman `/api/chat`-palveluun. WhatsAppin tekstikeskustelu, ostoslistan tulkinta ja muut samalla rajapinnalla tehtävät tekstitehtävät voivat käyttää valmiin avoimen mallin painotiedostoja. Perusmallia ei kouluteta alusta. Tuotehaku, hinnat, saatavuus, mandaatit ja tilausten vahvistus pysyvät nykyisessä sovelluskoodissa.

Valinta on palvelimen asetus. Oletuksena Anthropic-polku säilyy; Ollaman ollessa valittu myös jäljelle jäänyt ANTHROPIC_API_KEY jätetään käyttämättä. Katko tai puuttuva malli palauttaa virheen nykyiselle kutsujalle, joka voi jatkaa omalla sääntöpolullaan. Maksulliseen malliin ei siirrytä automaattisesti.

Ensimmäinen sovitin tukee tekstiä ja Ollaman JSON-skeemaformaattia. Vastauksen pitää valmistua normaalisti ja JSONin on oltava luettavissa. Osittaista tai katkennutta vastausta ei hyväksytä. Kutsujien toimialatarkistukset ovat edelleen välttämättömiä; JSON-formaatti ei todista tilauksen oikeellisuutta. Vastaukset puskuroidaan, joten onToken saa koko tekstin yhtenä osana. Sovitin ei tee automaattisia uusintakutsuja. Syöte- ja tulostokenit tulevat Ollaman laskureista; Anthropic-välimuistilaskurit ovat nolla.

Kuvien luku on tässä tilassa pois; botti pyytää kirjoittamaan tuotteet. Ääni on erillinen litterointipalvelu: alla oleva Compose poistaa maksulliset litterointipalvelut käytöstä. Paikallinen Whisper voidaan myöhemmin liittää nykyiseen command-rajapintaan. Anthropic API:n etä-MCP-connector ei ole tuettu Ollamalla; käytä varsinaista tilaustilaa (`WHATSAPP_ORDERING_ENABLED=true`). Tämä ei muuta gatewayn omia REST/MCP-rajapintoja.

## Malli ja palvelin

Aloitusehdokas tekstikokeeseen on `qwen3:8b`. Se ei ole tässä todettu riittävän laadukkaaksi suomenkielisiin tilauksiin. Valitse malliversio ja tarkista sen lisenssi sekä mallikortti ennen julkaisua. Lukitse myös Ollaman image-versio tai digest todellista käyttöönottoa varten: esimerkin latest helpottaa ensimmäistä koetta mutta ei takaa toistettavuutta.

8B-mallin kokeeseen varataan alustavasti vähintään 16 Gt RAMia; kontekstin pituus, kvantisointi ja yhtäaikaiset pyynnöt voivat vaatia enemmän. Sujuvaan keskusteluun kannattaa arvioida GPU-palvelin, mutta tarvittava VRAM ja viive mitataan valitulla mallilla. CPU-ajo on mahdollinen mutta voi olla liian hidas nykyisten aikakatkaisujen sisällä. 32k-konteksti on lähtöarvo, ei lupaus siitä, että kaikki pitkät keskustelut ja katalogikehotteet mahtuvat siihen. Liian lyhyt konteksti voi johtaa mallipalvelimen syötteen katkaisuun. Rinnakkaisuus on esimerkissä yksi; monen käyttäjän viive pitää mitata.

Mallipalvelin ei toimi Vercel-funktion sisällä. Vaihtoehdot ovat:

- **Agentti ja Ollama samalla pilvi-VPS:llä:** alla oleva Compose pitää mallirajapinnan Dockerin sisäverkossa. Koneidenne ei tarvitse olla päällä. GPU:n läpivienti ja ajurit lisätään erikseen palvelinympäristön mukaan.
- **Nykyinen agentti Vercelissä, Ollama erillisellä palvelimella:** anna agentille mallipalvelimen autentikoitu HTTPS-osoite. `OLLAMA_AUTH_TOKEN` välitetään Bearer-otsakkeessa omalle gatewaylle, jonka on myös tarkistettava se. Ollaman omaa porttia ei avata suojaamatta internetiin. Esimerkin `http://ollama:11434` ei ole Vercelistä saavutettava osoite.

Tekoäly-API:n tokenilasku poistuu näistä tekstikutsuista, mutta pilvipalvelin, laskenta, Meta ja muut käytettävät palvelut voivat edelleen maksaa. Tämä paketti ei tilaa palvelinta eikä muuta olemassa olevaa tuotantoa.

## Ajo omalla pilvipalvelimella

Asenna Docker + Compose. Tee ensin [WhatsApp-palvelimen valmistelu](whatsapp-deploy.md): yksityinen `deploy/whatsapp/.env`, Metan asetukset ja katalogi `data/catalog.json`. Aseta myös pysyvä julkinen `WHATSAPP_PUBLIC_URL`. Älä siirrä nykyisiä kantoja käynnissä olevasta lähteestä.

Komennot projektin juuresta:

```bash
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml config --quiet
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml up -d ollama
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml exec ollama ollama pull qwen3:8b
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml build whatsapp
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml run --rm --no-deps whatsapp node scripts/ollama-smoke.mjs
docker compose -f deploy/whatsapp/compose.yaml -f deploy/whatsapp/compose.ollama.yaml up -d whatsapp
```

Mallin vaihto: anna sama OLLAMA_MODEL Compose-komentojen ympäristömuuttujaksi tai `--env-file`-tiedostossa ja lataa juuri se malli. Compose-interpolointi ei lue palvelun env_file-tiedostoa automaattisesti. Myös OLLAMA_IMAGE_TAG ja OLLAMA_CONTEXT_TOKENS voidaan antaa samalla tavalla. Ollaman terveystarkistus tarkistaa palvelun, ei valitun mallin saatavuutta; savutesti paljastaa puuttuvan mallin.

Mallipainot säilyvät `ollama-models`-levyllä ja viisi sovelluskantaa nykyisellä `whatsapp-data`-levyllä. Älä käytä `down --volumes`. WhatsAppin portti on oletuksena palvelimen localhostissa 4759; pysyvä HTTPS-reverse proxy ja Metan callback on kytkettävä sinne palvelimen omistajan tekemässä käyttöönotossa. Nykyisen pilven Turso-kantojen siirto VPS:n paikallisiin kantoihin on erillinen hallittu migraatio; tämä Compose ei kopioi niitä.

## Pelkän malliyhteyden koe nykyisellä Node-asennuksella

Kun Ollama ja malli ovat jo omalla palvelimella, aseta nämä yksityiseen asetustiedostoon:

```dotenv
AIMO_MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_CONTEXT_TOKENS=32768
```

```bash
node --env-file=/polku/yksityiseen/malliasetukseen scripts/ollama-smoke.mjs
```

Tämä tekee kolme oikeaa mallikutsua: suomenkielinen 20 litran tilaus, muutos 30 litraan vaatimuksen säilyessä ja tavallinen maito ilman ruokavaliorajauksia. Se ei koske kantoihin, Metaan tai tilauksiin. Ajo estyy, ellei Ollama ole valittu. Läpäisy on perustulkinnan koe, ei koko agentin laatutodistus.

## Ennen WhatsApp-käyttöön vaihtamista

Aja savutesti ja nykyiset synteettiset WhatsApp-laatuskenaariot eristetyillä kannoilla. Tarkista määrät ja yksiköt, määrän muutos ilman kaksoislisäystä, allergeenivaatimuksen säilyminen, toimituspäivä, epäselvän tuotteen tarkennus, malli-/verkkokatko sekä usean käyttäjän viive. Koe tehdään oikealla valitulla mallilla: HTTP-testitupla ei osoita mallin laatua.

Tuotannon vaihtoa ei tehdä ennen näitä tuloksia. Säilytä nykyiset asiakasliitokset, kannat ja allekirjoitusavain. Lopuksi varmennetaan omalla WhatsApp-puhelimella korin päivitys kehittäjien koneiden ollessa suljettuina sekä se, ettei henkilökohtaisen tekoäly-API:n käyttö lisäänny. Tilisiirto ja julkinen käyttöönotto ovat vielä tekemättä.

Lähteet: [Ollama chat](https://docs.ollama.com/api/chat), [JSON-skeemaiset vastaukset](https://docs.ollama.com/capabilities/structured-outputs), [Docker](https://docs.ollama.com/docker).

## Tämän toteutuskerran tarkistukset (17.11.2026)

- Kohdistetut sovitin-, välimuisti- ja käynnistystestit 18/18 läpi. Sovittimen oikea HTTP-koe käyttää simuloitua mallipalvelinta.
- Koko `npm test`: 464 testiä, 381 läpi, 0 epäonnistunutta, 83 ohitettu puuttuvan paikallisen katalogin vuoksi. Aluksi puuttunut @libsql/client saatiin asentamalla lukitut riippuvuudet erillisellä npm-välimuistilla; sovelluskoodia ei muutettu tämän vuoksi.
- Yhdistetty Compose validoitu tyhjällä eristetyllä asetustiedostolla; yksityisiä tuotantoasetuksia ei luettu.
- Docker-buildia yritettiin, mutta npm-pakettien lataus kontissa pysähtyi tämän ympäristön `self-signed certificate in certificate chain` -virheeseen. TLS-tarkistusta ei poistettu. Valmista imagea tai kontissa käynnistyvää bottia ei siksi väitetä varmennetuksi.
- Ollama-painoja ei ladattu eikä oikean mallin savutestiä ajettu. Mallin laatu, resurssitarve ja todellinen WhatsApp-koe ovat avoinna. Tuotannon julkaisu ja palvelimen hankinta eivät sisälly tähän muutokseen.
