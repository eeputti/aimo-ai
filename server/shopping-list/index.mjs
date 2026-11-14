// A structured handoff of the existing draft, never a second interpretation or an order approval.
export function shoppingListView(draft, customer) {
  if (!draft || draft.state !== 'active' || !draft.lines?.length) return null;
  if (customer?.permissions?.readProducts !== true || draft.customerId !== customer.customerId
      || draft.bindingVersion !== customer.bindingVersion) return null;
  const missing = [];
  if (!draft.deliveryDate) missing.push('deliveryDate');
  if (!draft.deliverySiteId) missing.push('deliverySiteId');
  if (!draft.diet?.known) missing.push('diet');
  for (const line of draft.lines) if (!line.quantity) missing.push(`quantity:${line.ref}`);
  return {
    schemaVersion: 1, source: 'whatsapp', id: draft.id, revision: draft.revision,
    buyerId: customer.buyerId, companyName: customer.companyName,
    deliveryDate: draft.deliveryDate || null, deliverySiteId: draft.deliverySiteId || null,
    diet: { known: draft.diet?.known === true, claims: [...(draft.diet?.claims || [])], excludeAllergens: [...(draft.diet?.excludeAllergens || [])] },
    lines: draft.lines.map((line) => ({ ref: line.ref, productTerm: line.productTerm,
      quantity: line.quantity ? { value: line.quantity.value, unit: line.quantity.unit, ...(line.quantity.basis ? { basis: line.quantity.basis } : {}) } : null,
      claims: [...line.claims], excludeAllergens: [...line.excludeAllergens],
      selectedProductId: line.selectedProductId || null, selectedName: line.selectedName || null,
    })),
    missing, status: missing.length ? 'needs_details' : draft.lines.some((line) => !line.selectedProductId) ? 'needs_product_selection' : 'review',
    // No bearer credentials, phone numbers, quote approvals or implicit permission to submit.
    requiresExplicitConfirmation: true,
  };
}
