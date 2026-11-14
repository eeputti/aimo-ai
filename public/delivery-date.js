// Replace the previous request date when a picker changes the shared delivery day.
// Keep product quantities, filters and recipe portions intact.
export function withDeliveryDate(value, date) {
  const text = String(value || '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\d{1,2}\.(?:\d{4})?(?=\s|$|,)/gu, ' ')
    .replace(/\b(?:day after tomorrow|ylihuomi\p{L}*|tomorrow|huomi\p{L}+|huomenna|today|tänään|täksi päiväksi)\b/giu, ' ')
    .replace(/\b(?:(?:by|on|for|before|until|next|ensi viikon|ensi|tulevaksi|tulevan)\s+)?(?:maanantai\p{L}*|tiistai\p{L}*|keskiviik\p{L}*|torstai\p{L}*|perjantai\p{L}*|lauantai\p{L}*|sunnuntai\p{L}*|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thurs?|fri|sat|sun)\b/giu, ' ')
    .replace(/\b(?:by|on|for|before|until|next|ensi viikon|ensi|tulevaksi|tulevan)\s+(?:ma|ti|ke|to|pe|la|su)\b|\b(?:ma|ti|ke|to|pe|la|su)(?=[\s.!?]*$)/giu, ' ')
    .replace(/\s+/g, ' ').trim();
  return `${text} ${date}`.trim();
}
