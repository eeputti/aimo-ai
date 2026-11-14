# WhatsAppin pitkä korilinkki painikkeeksi

15.11.2026, Claude Code (korisivuchatti), taulun tehtävä `806610cd`.

## Pyyntö ja nykytila

Käyttäjä klo 01.25: WhatsAppissa näkyvä linkki on liian pitkä, sen pitäisi näkyä esimerkiksi "Maksulinkki" tai "Avaa ostoskori" ja viedä oikeaan paikkaan. Tarkistettu koodista: WhatsAppiin lähtee vain korilinkki (`cart-handoff.mjs`: "Tässä linkki ostoskoriisi…:" ja koko `https://<tunneli>/whatsapp/cart#<allekirjoitettu token>`, noin 200 merkkiä). Demomaksun linkki näkyy korisivulla vahvistuksen jälkeen, ei WhatsAppissa.

## Ratkaisu

Meta Cloud API:n interaktiivinen `cta_url`-viesti: näkyvä teksti ja painike, URL painikkeen takana. Muoto tarkistettu Metan nykyisestä ohjeesta (`interactive.type: "cta_url"`, `body.text` enintään 1024 merkkiä, `action.name: "cta_url"`, `action.parameters.display_text` enintään 20 merkkiä ja `url`). Interaktiiviset viestit ovat vapaamuotoisia vastauksia, ja botti lähettää korilinkin aina vastauksena asiakkaan viestiin 24 tunnin palveluikkunan sisällä.

- `server/whatsapp/channel.mjs`: `createMetaSender` lähettää painikkeen, kun vastausosan viimeinen rivi on täsmälleen allekirjoitettu korilinkki (`/whatsapp/cart#<payload>.<43 merkin HMAC>`) tai demomaksulinkki (`/demo-payment.html#AGW-…`). Teksti ilman URL:ia on viestin runko (loppukaksoispiste pisteeksi), painike "Avaa ostoskori" tai "Siirry maksamaan". Kaikki muu pysyy tavallisena tekstinä.
- Varatie: jos Meta hylkää painikkeen (HTTP 400), sama vastaus lähetetään heti tavallisena tekstinä linkin kanssa. 401/403/429/5xx eivät laukaise toista lähetystä, vaan jonon nykyinen uusinta hoitaa ne. `WHATSAPP_LINK_BUTTONS=false` palauttaa aiemman pelkän tekstin ilman koodimuutosta.
- Tallennettu vastaus, keskusteluhistoria, `cart-link.mjs` ja `cart-handoff.mjs` ennallaan: token pysyy fragmentissa eikä päädy tunnelin lokeihin.

**Miksi ei lyhyttä polkua (`/k/<koodi>`) nyt:** se lisäisi uuden pysyvän oikeustunnisteen (kanta, vanheneminen, mitätöinti uudesta korista, re-pairista ja revokoinnista, arvausrajoitus), ja polussa oleva koodi päätyisi tunnelin ja palvelimen lokeihin, toisin kuin nykyinen fragmentti. Painike piilottaa saman tokenin ilman uutta tilaa. Lyhyt polku on seuraava askel vain, jos oikea puhelinkoe näyttää, että WhatsApp ei säilytä painikkeen URL:n `#`-osaa.

## Tarkistukset

- Uusi `test/whatsapp-link-button.test.mjs` **5/5**: oikea `replyWithCartLink`-vastaus → `replyChunks` → lähettäjä tuottaa täsmälleen odotetun `cta_url`-pyynnön (endpoint, bearer, runko ilman URL:ia tai tokenia, painikkeen teksti enintään 20 merkkiä, URL sellaisenaan); demomaksulinkki; tavalliset viestit ja epäselvät, väärän muotoiset, http-, query- ja liian pitkät tapaukset tekstinä; 400 → yksi tekstivaratie samalla linkillä; 401/403/429/500 ei toista lähetystä; puuttuva viestitunniste virhe; asetus pois päältä.
- WhatsApp-, korilinkki- ja OK-testit yhdessä 43/43, koko `npm test` **266/266** origin/mainin päällä. Simuloitu Meta-rajapinta, ei oikeita viestejä.

## Avoinna

- **Oikea puhelinkoe:** painikkeen näkyminen ja se, että painike avaa korin tokenin kanssa (`#`-osa säilyy), varmistetaan vasta Codexin käyttöönoton restartin jälkeen. Metan ohje ei kerro fragmentin käsittelystä. Jos kori aukeaa ilman linkkiä ("Avaa ostoskori WhatsApp-apurin lähettämästä linkistä"), aseta `WHATSAPP_LINK_BUTTONS=false` ja toteuta lyhyt polku erikseen.
- Restarttia, Meta-asetuksia tai käyttäjän kantoja ei muutettu.
