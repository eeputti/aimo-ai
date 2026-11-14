// Shared decision for the search footer: explicitly added products already satisfy their need.
export function cartSelection(result, selected = new Set()) {
  const items = result?.understood?.items || [];
  const unresolved = !items.length || result.error || result.handoff || result.understood?.unparsed?.length;
  const unavailable = items.some((_, i) => !selected.has(i) && (result.cards?.[i]?.status !== 'ok' || !result.cards[i].list?.length));
  const missingQuantity = items.findIndex((item, i) => !selected.has(i) && !item.quantity);
  return { enabled: !unresolved && !unavailable, missingQuantity,
    entries: items.flatMap((_, i) => selected.has(i) ? [] : result.cards?.[i]?.list?.[0] ? [result.cards[i].list[0]] : []) };
}
