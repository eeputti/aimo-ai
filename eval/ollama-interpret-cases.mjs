// Synthetic held-out interpretation checks, not training examples. No customer messages.
const line = (ref, productTerm, value, unit, claims = []) => ({ ref, productTerm, quantity: { value, unit }, claims, excludeAllergens: [] });
const base = () => ({ lines: [], offered: {}, pending: null, deliveryDate: null });
const milk = () => ({ ...base(), lines: [line('L1', 'maito', 20, 'L', ['FREE_FROM_LACTOSE'])], deliveryDate: '2026-11-20' });
export const CASES = [
  { id: 'add-milk', text: '20 litraa maitoa', draft: base(), expected: { op: 'add', productTerm: 'maito', value: 20, unit: 'L' } },
  { id: 'change-milk', text: 'Muuta maito 30 litraan.', draft: milk(), expected: { op: 'update', ref: 'L1', value: 30, unit: 'L', noRemoveClaims: true } },
  { id: 'cream-dl', text: 'Tarvitsen 5 desilitraa kermaa.', draft: base(), expected: { op: 'add', productTerm: 'kerma', value: 0.5, unit: 'L' } },
  { id: 'butter-grams', text: '250 grammaa voita', draft: base(), expected: { op: 'add', productTerm: 'voi', value: 0.25, unit: 'KG' } },
  { id: 'remove-milk', text: 'Poista maito.', draft: milk(), expected: { op: 'remove', ref: 'L1' } },
  { id: 'milk-allergen', text: 'Kaiken pitää olla maidotonta, asiakkaalla on maitoallergia.', draft: milk(), expected: { op: 'diet', allergen: 'AM', forbidClaim: 'FREE_FROM_LACTOSE' } },
  { id: 'lactose-claim', text: 'Kaikki laktoosittomana.', draft: milk(), expected: { op: 'diet', claim: 'FREE_FROM_LACTOSE' } },
  { id: 'missing-quantity', text: 'Lisää maitoa.', draft: base(), expected: { op: 'add', productTerm: 'maito', noQuantity: true } },
  { id: 'no-order', text: 'Kiitos avusta!', draft: base(), expected: { empty: true } },
  { id: 'select-second', text: 'Valitsen vaihtoehdon 2.', draft: { ...milk(), pending: { kind: 'choose', refs: ['L1'], more: 4 }, offered: { L1: [{ name: 'Maito A' }, { name: 'Maito B' }, { name: 'Maito C' }] } }, expected: { op: 'select', ref: 'L1', option: 2 } },
  { id: 'more-options', text: 'Näytä muita vaihtoehtoja.', draft: { ...milk(), pending: { kind: 'choose', refs: ['L1'], more: 4 }, offered: { L1: [{ name: 'Maito A' }] } }, expected: { op: 'more', ref: 'L1' } },
  { id: 'ambiguous-amount', text: 'Eikun 30 litraa.', draft: { ...milk(), lines: [...milk().lines, line('L2', 'kerma', 5, 'L')] }, expected: { empty: true } },
];
export function inspect(caseInfo, result) {
  const want = caseInfo.expected; const ops = result?.ops;
  if (result?.via !== 'model' || !Array.isArray(ops)) return ['model_result_missing'];
  // Echoing the existing date changes nothing; a new date needs an explicit request.
  const failures = result.deliveryDate != null && result.deliveryDate !== caseInfo.draft.deliveryDate ? ['invented_delivery_date'] : [];
  if (want.empty) return [...failures, ...(ops.length ? ['unrequested_operation'] : [])];
  if (result.intent !== 'order') failures.push('intent');
  const found = ops.find((o) => o.op === want.op && (!want.ref || o.ref === want.ref) && (!want.productTerm || o.productTerm === want.productTerm));
  if (!found) return [...failures, 'expected_operation_missing'];
  if (want.value != null && (found.quantity?.value !== want.value || found.quantity?.unit !== want.unit)) failures.push('quantity');
  if (want.noQuantity && found.quantity != null) failures.push('invented_quantity');
  if (want.option && found.option !== want.option) failures.push('option');
  if (want.allergen && !found.excludeAllergens?.includes(want.allergen)) failures.push('allergen');
  if (want.claim && !found.addClaims?.includes(want.claim)) failures.push('claim');
  if (want.forbidClaim && ops.some((o) => o.addClaims?.includes(want.forbidClaim))) failures.push('allergy_confused_with_lactose');
  if (want.noRemoveClaims && ops.some((o) => o.removeClaims?.length)) failures.push('constraint_removed');
  if (ops.some((o) => o !== found)) failures.push('unexpected_operation');
  return failures;
}
