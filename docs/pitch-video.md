# Aimo Agent Gateway: palautuksen pitch-video

Valio Aimo, Trusted Trade Agents, Junction 2026.

- **Katselulinkki (julkinen, ei kirjautumista):** https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site
- **MP4:** https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/aimo-agent-pitch.mp4
- **Puheteksti:** https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/pitch-script.txt
- **Tekstitys:** https://aimo-agent-pitch.daniel-turkkinen.chatgpt.site/captions.vtt
- **Kesto:** 110,028 sekuntia (1 min 50,03 s), alle ehdottoman 120 sekunnin rajan.
- **Formaatti:** 1280 × 720, 24 fps, H.264 / AAC, MP4, faststart.
- **Kieli:** englanti, synteettinen kertojaääni ja videoon poltettu englanninkielinen tekstitys.

## Sisältö ja rajaukset

Videon ydin on Agent Gateway: tuotehaku, live-hinta ja saatavuus challenge-API:sta, allekirjoitettu tarjous, mandaatti, ihmisen hyväksyntä ja hash-ketjutettu loki. WhatsApp-apuri, verkkokauppa, keittiödemo ja ulkoiset agentit esitetään saman portin asiakkaina.

Videon tilauskulku on kuvitettu esimerkki, ei ruuduntallennus tai uusi oikean rajapinnan ajo. Kuvitetut vaiheet on merkitty. Oikeita tilauksia, toimituksia tai maksuja ei luvata. Tuotantointegraatiot ovat seuraava askel. Ei keksittyjä säästö-, nopeus- tai asiakasmittareita.

Lähteet: README.md, docs/challenge-coverage.md, package.json ja TYOLOKI.md, luettu GitHubin main-haarasta 15.11.2026 Helsingin aikaa. Logo: deploy/cloudflare/public/aimo-logo.png. Käyttäjän pyynnöstä aimo-team- ja teamMCP-nimiset tiedostot sekä vastaavat tiimikoordinointiosuudet rajattiin pitchin ulkopuolelle.

## Kohtaukset ja puheteksti

### 0:00 (8 s): Aimo Agent Gateway

Meet Aimo Agent Gateway: trusted purchasing, on your terms. Built for the Valio Aimo Trusted Trade Agents challenge at Junction.

### 0:08 (10 s): An agent can ask.

Kitchen purchasing has real constraints: allergies, stock, delivery deadlines and budgets. An agent needs a reliable way to turn a request into an authorised order.

### 0:18 (10 s): Start with a real need.

Imagine a buyer asking for one thousand litres of lactose-free milk by Monday. Their purchasing agent sends that need to the gateway.

### 0:28 (12 s): Find the right product.

The gateway searches over seventeen thousand products, then checks live prices and availability for shortlisted options through the challenge API. Dietary requirements become structured product filters.

### 0:40 (12 s): A quote you can verify.

The buyer receives a digitally signed, fixed-price offer. Before ordering, the gateway rechecks price and stock. Expired or tampered offers are rejected, and retries cannot create duplicate orders.

### 0:52 (12 s): Your mandate decides.

The buyer sets spending limits, substitution rules and approval requirements. Orders outside that authority wait for a human. A forbidden allergen cannot be waved through, even by approval.

### 1:04 (10 s): Every decision leaves a trail.

A hash-chained audit trail records each step and checks its integrity. Both sides can inspect what was offered, why an order stopped, and who approved it.

### 1:14 (14 s): One gateway. Many clients.

The same gateway serves external agents, the storefront, a kitchen planning demo and a WhatsApp assistant. In WhatsApp, buyers describe their needs, choose products and open a basket to confirm.

### 1:28 (12 s): Open interfaces. Explicit rules.

Built with Node, SQLite, REST, MCP and OpenAPI, with signed offers and deterministic policy checks. This prototype records demo orders; real fulfilment and payments are not connected.

### 1:40 (10 s): Let agents handle the routine.

Our next step is integration with Aimo customer identity and order systems. Aimo Agent Gateway makes agent purchasing verifiable, controlled and ready for human decisions when they matter.

## Varmennus

- MP4 dekoodattu kokonaan ffmpegillä ilman dekoodausvirheitä.
- ffprobe: 110,028 s, H.264 / AAC, 1280 × 720.
- Puheosuuksien kestot tarkistettu: ääni päättyy ennen jokaisen kohtauksen loppua.
- Tekstityksen sijainti ja luettavuus tarkistettu renderöidystä ruudusta.
- Sites-julkaisu onnistui, yleisö public. MP4 ladattu takaisin ilman tunnistautumista: HTTP 200, 2 535 186 tavua, SHA-256 sama kuin paikallisessa videossa.
- MP4 SHA-256: c14af55a5a03b9a3e5a06618a4daf95724aaa9315cc6427906a71c3e8f314b18.

Video on julkaistu Sitesilla. Mahdollinen YouTube-/Vimeo-julkaisu tehdään lataamalla sama MP4 halutulle tilille. Pitch deck, palautuslomake ja tiimin yhteystiedot eivät sisälly tähän videotyövaiheeseen.
