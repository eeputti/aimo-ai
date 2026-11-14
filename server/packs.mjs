// PAKKAUSKOKO-EHDOTUS. Kun rivin määrä jää vähän vajaaksi täydestä laatikosta, tarjotaan yhden napautuksen pyöristys ("laatikossa 10 kpl · 27 → 30").
// Laatikkokoko tulee tuotedatasta (data/packs.json, scripts/build-packs.mjs), ei arvauksesta eikä kielimallista.
// Ehdotus ei väitä täyttä laatikkoa halvemmaksi: data ei kerro sitä. Se on pelkkä pyöristys, ja muutos kulkee saman sääntötarkistuksen läpi kuin käsin tehty.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './catalog.mjs';

// OLETUS: kynnykset on valittu demolle. Ehdotetaan vain, kun laatikosta puuttuu vähän ja määrä kasvaa vähän.
export const PACK_RULES = { maxMissingShareOfCase: 0.3, maxIncreasePct: 20 };
const CASE_LABEL = { KI: 'Laatikossa', CS: 'Laatikossa', KRT: 'Laatikossa', PAK: 'Pakkauksessa' };

let packs = null;
function loadPacks() {
  if (packs) return packs;
  try { packs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'packs.json'), 'utf8')); } catch { packs = {}; console.warn('[packs] data/packs.json puuttuu: pakkauskokoehdotuksia ei näytetä (aja npm run catalog)'); }
  return packs;
}

const num = (n) => String(+(+n).toFixed(2)).replace('.', ',');

/** Ehdotus riville tai null. rules = keittiön säännöt: ehdotusta ei tehdä, jos se ylittäisi määrärajan ja vaatisi erillisen varmistuksen. */
export function packHint(line, rules = {}) {
  const pack = loadPacks()[line.productId];
  if (!pack || !(line.qty > 0)) return null;
  const to = Math.ceil(line.qty / pack.size - 1e-9) * pack.size;
  const add = +(to - line.qty).toFixed(2);
  if (add <= 0) return null; // jo täysiä laatikoita
  if (add > pack.size * PACK_RULES.maxMissingShareOfCase || add > line.qty * (PACK_RULES.maxIncreasePct / 100)) return null;
  const ref = line.expectedQty ?? line.baselineQty;
  if (ref > 0 && rules.maxQtyJumpPct != null && to > ref * (1 + rules.maxQtyJumpPct / 100)) return null;
  return {
    caseSize: pack.size, to, add, cases: to / pack.size,
    text: `${CASE_LABEL[pack.unit] || 'Laatikossa'} ${num(pack.size)} ${line.unitLabel} · pyöristä ${num(line.qty)} → ${num(to)}`,
    title: `Tuotedatan mukaan ${num(pack.size)} ${line.unitLabel} / laatikko. ${num(to)} ${line.unitLabel} on ${num(to / pack.size)} täyttä laatikkoa (+${num(add)} ${line.unitLabel}).`,
  };
}
