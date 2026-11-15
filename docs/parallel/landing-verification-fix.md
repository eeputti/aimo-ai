# Landing-sivun puhelinvahvistuksen korjaus

15.11.2026, Codexin landing-vahvistuschat. Käyttäjä ilmoitti, ettei WhatsAppiin tule vahvistuskoodia.

## Syy ja käyttöönottoraja

Lomake tallentaa ilmoittautumisen Workerin D1-kantaan. Paikallinen seuranta tekee siitä apurin testijäsenen ja palauttaa `linked`-tilan. Kumpikaan ei pyydä Metan testivastaanottajan vahvistuskoodia. Esittelijän on lisättävä numero Metan **Step 1. Try it out → Recipient → Manage phone number list** -näkymässä, syötettävä kokeilijalle tullut koodi Metaan ja raportoitava hyväksyntä `approve --phone` -komennolla.

Tuotannon lukutarkistuksessa kaksi ilmoittautumista odotti `linked`-tilassa ilman sivulle toimitettua koodia. Metan näkyvä vastaanottajalista sisälsi vain kaksi aiempaa numeroa. Uusia numeroita ei lisätty eikä vahvistuskoodeja tai muita viestejä lähetetty tässä vaiheessa. Puhelinnumeroita, henkilöiden nimiä ja koodeja ei kirjata tähän raporttiin.

Testinumerolla lomake ei siis ole automaattinen WhatsApp-koodivahvistus. Täysin itsenäinen liittyminen edellyttää apurille omaa rekisteröityä WhatsApp-numeroa. Nykyinen `WHATSAPP_SIGNUP_AUTO_READY` ei poista Metan testinumeron rajoitusta eikä sitä kytketty päälle.

## Muutokset

- Sivulla kerrotaan ennen ilmoittautumista ja `linked`-tilassa, että Aimo-tiimin on käynnistettävä vahvistus. Sivulle toimitettu koodi on vasta esittelijän käsiteltävänä, eikä sen lähetys väitä numeroa hyväksytyksi.
- Kesken tilakyselyn tehty numeronvaihto ei enää pysäytä uuden ilmoittautumisen seurantaa tai näytä vanhan numeron hyväksyntää. Verkkovirhe säilyttää tiedon jo toimitetusta koodista. Numeronvaihto tyhjentää vanhan koodin ja virheilmoitukset.
- Seuranta näyttää myös jo `linked`-tilaan ehtineet numerot käynnistyessään uudelleen. Sama ilmoittautuminen ilmoitetaan vain kerran; uusi ilmoittautuminen samalle numerolle nostaa sen uudelleen näkyviin.
- Paikallisesti tallennettu esittelijän hyväksyntä raportoidaan Workerille uudelleen, jos ensimmäinen verkkopyyntö epäonnistui. Muita odottavia numeroita ei hyväksytä tämän vuoksi.

## Tarkistukset ja julkaisu

- Erillinen työpuu `origin/main`-commitista `f843b06`, muiden keskeneräisiä muutoksia ei otettu julkaisuun.
- `npm test`: **322/322**. Ensimmäinen ajo paljasti työpuusta puuttuvan katalogin ja sandboxin localhost-rajoituksen; uusinta käytti vain olemassa olevan katalogin lukulinkkiä ja sallittuja paikallisportteja. Testikannat eristetty, ei oikeita Meta-, malli- tai Valio-kutsuja.
- Workerin `npm test`: **26/26**. Uudet selainmoduulin regressiot: keskeneräinen koodi ei hyväksy numeroa, verkkovirhe säilyttää tilan, numeronvaihto ohittaa vanhan vastauksen ja uusi seuranta jatkuu.
- `typecheck`, `build`, `cf deploy --dry-run`, syntaksi ja `git diff --check` läpi.
- Selainkoe localhostiin sidotulla palvelimella ja muistissa olevalla testikannalla: lomake → `linked` → koodin toimitus → erillinen simuloitu hyväksyntä → oikeaan testilinkkiin osoittava Avaa WhatsApp. Ei selaimen JS-virheitä eikä viestin lähettämistä WhatsAppiin.
- Worker-versio **`6c6b6a56-3d49-4418-9609-c8ae353e24ed`** julkaistu samaan `aimo-order-demo`-Workeriin. `/landing.js` ja `/landing.css` takaisinluettu ja verrattu tavulleen julkaistuun lähteeseen; `/`, `/healthz`, `/api/orders` ja `/tilaukset` HTTP 200, numerolistaus ilman avainta HTTP 401. D1-skeemaa tai Worker-asetuksia ei muutettu.
- Vain ilmoittautumisseuranta käynnistettiin uudelleen: vanha PID 4578 korvattu yhdellä PID 28614 / exec-istunto 88157. Kahden odottavan numeron käsivaihe palautui näkyviin ilman hakuvirheitä. Nykyisen hakemiston skripti vastasi ennen muutosta `origin/main`-blobia; siihen sovellettiin vain tämän vaiheen tarkistettu muutos. WhatsApp-palvelinta ja tilausjulkaisijaa ei käynnistetty uudelleen.

Seuraava askel on odottavan numeron vahvistuksen aloittaminen Metassa käyttäjän luvalla. Koodin saapumista tai uuden numeron toimivuutta puhelimessa ei ole varmennettu, eikä tätä sivukorjausta raportoida automaattisen WhatsApp-vahvistuksen valmistumisena.
