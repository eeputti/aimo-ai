// Kielimallin vapaan tekstin viimeinen tarkistus ennen asiakasta (WhatsApp-dialogi ja tuoteneuvonta).
// Malli ei tiedä hintoja, alennuksia, maksuja, tilauksen tilaa tai asiakkuuden oikeuksia, eikä se saa
// lähettää linkkejä: korilinkki ja demomaksun linkki luodaan aina palvelimella. Asiakkaan viesti tai
// katalogiteksti voi yrittää ohjata mallia (prompt injection), joten rajat tarkistetaan koodissa.
// Tarkistus pudottaa vain kielletyn virkkeen. Tilausmoottorin omat tekstit eivät kulje tämän läpi.

const LINK = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|fi|io|me|ly|app|dev|xyz|info|biz|link|shop|site|online|top|eu|co|ru|cn|tk|gl)\b(?:\/\S*)?/iu;
// Puhelinnumero tai muu pitkä numerosarja (vähintään 8 numeroa): mallin ei pidä antaa yhteystietoja.
const LONG_NUMBER = /\+?\d(?:[\s-]?\d){7,}/u;
// \b ei tunne ääkkösiä, joten sanarajat ovat Unicode-kirjaimiin perustuvia: (?<!L) alussa, (?!L) lopussa.
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const re = (source) => new RegExp(source.replaceAll('<B>', B).replaceAll('<E>', E), 'iu');
const CLAIMS = [
  // Tilauksen, maksun tai lisäyksen tila: vain tilausmoottori tietää sen.
  re('<B>tilau\\p{L}*\\s+(?:on\\s+|nyt\\s+|jo\\s+|onnistuneesti\\s+)*(?:vahvistettu|vahvistunut|tehty|lähetetty|tallennettu|hyväksytty|valmis|perillä|matkalla|maksettu)<E>'),
  re('<B>(?:tilasin|tilattu|tilattiin|vahvistin|hyväksyin|lisäsin|lisätty|maksoin|maksettu|veloitin|veloitettu)<E>'),
  // Hinnat, alennukset ja maksut.
  re('<B>(?:alenn?u|alen(?:e|ne)|ilmai|hyvity|kampanjahin)\\p{L}*|<B>(?:ale|kaupan päälle|veloituksetta|veloitukseton)<E>'),
  re('€|<B>(?:eur(?:o|oa|oja|on|ot)?|snt|sentti\\p{L}*)<E>'),
  re('<B>hin(?:ta|nan|nat|taa|noin|nalla|naksi)<E>[^.!?\\n]*\\d'),
  re('<B>maks(?:a|u|ua|un|uun|ut|ettu|uton|utta|ulinkki\\p{L}*|usivu\\p{L}*)<E>'),
  // Asiakkuus, oikeudet ja henkilöllisyys eivät muutu viestillä.
  re('<B>(?:oikeu|valtuu|asiakkuu|asiakastun|käyttäjätun|tunnu|rooli)\\p{L}*[^.!?\\n]*<B>(?:muutettu|muutin|päivitetty|päivitin|lisätty|myönnetty|myönsin|vaihdettu|vaihdoin|korotettu|nostettu|poistettu|ohitettu)<E>'),
  re('<B>olet\\s+(?:nyt\\s+)?(?:valion|aimon)\\s+(?:työntekijä|ylläpitäjä|edustaja)<E>'),
];
// Sisäisen ohjeen tai rakenteen vuoto: koko vastaus korvataan, ei vain virkettä.
const LEAK = re('<B>(?:route|lookupQuery|suggestionTerm|openCart|capabilities|cartLink|shoppingList|lastOrderReply|pendingSuggestion|addQuestion|pendingQuestion|productTerm|quantityValue|excludeAllergens)<E>|<B>Olet Valio Aimon<E>|<B>Route (?:order|chat|cart|reset)<E>|<B>järjestelmä(?:kehote|kehotteen|kehotteesi|ohje|ohjeet|ohjeeni|prompt)\\p{L}*|<B>system prompt<E>|<B>minun ohjeeni<E>|<B>ohjeeni (?:ovat|kuuluvat)<E>');

export const GUARD_FALLBACK = 'En voi luvata hintoja, alennuksia tai tilauksen tilaa. Ne näkyvät vain ostoskorin yhteenvedossa, ja tilaus vahvistetaan aina erikseen. Kerro, mitä keittiöön tarvitaan, niin jatketaan ostoslistan kanssa.';

/**
 * Pudottaa mallin tekstistä linkit, yhteystiedot ja väitteet, joita malli ei voi tietää.
 * @returns {{ text: string, blocked: string[] }} text on tyhjä, jos mitään sallittua ei jäänyt.
 */
export function guardModelText(value) {
  const raw = String(value ?? '').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, '').trim();
  if (!raw) return { text: '', blocked: [] };
  if (LEAK.test(raw)) return { text: '', blocked: ['leak'] };
  const blocked = [];
  const kept = [];
  for (const line of raw.split(/\n/u)) {
    const sentences = line.split(/(?<=[.!?])\s+/u).filter((s) => s.trim());
    const ok = sentences.filter((sentence) => {
      if (LINK.test(sentence)) { blocked.push('link'); return false; }
      if (LONG_NUMBER.test(sentence)) { blocked.push('number'); return false; }
      if (CLAIMS.some((re) => re.test(sentence))) { blocked.push('claim'); return false; }
      return true;
    });
    if (ok.length) kept.push(ok.join(' '));
    else if (!sentences.length) kept.push('');
  }
  const text = kept.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
  // Pelkkä tervehdys tai välimerkki ei ole vastaus, jos sisältö pudotettiin.
  return { text: blocked.length && !/\p{L}{3,}.*\p{L}{3,}/su.test(text) ? '' : text, blocked: [...new Set(blocked)] };
}

/** Mallin vapaa vastaus tai varateksti, jos vastaus jouduttiin poistamaan. Tyhjä syöte pysyy tyhjänä. */
export function safeModelText(value, fallback = GUARD_FALLBACK) {
  const { text, blocked } = guardModelText(value);
  return text || (blocked.length ? fallback : '');
}
