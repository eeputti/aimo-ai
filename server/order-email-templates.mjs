// Aimo-styled order e-mails and confirmation pages. Markup follows public/emails/order-confirmation.html
// (table layout, inline styles, 600 px shell). Every dynamic value goes through esc().
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (n) => `€${Number(n || 0).toFixed(2)}`;
const qty = (n) => String(Math.round(Number(n) * 1000) / 1000);
const longDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : String(iso ?? '');
const helsinki = (ms, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', ...opts }).format(new Date(ms));
const stamp = (ms) => helsinki(ms, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' (Finnish time)';
const day = (ms) => helsinki(ms, { day: 'numeric', month: 'long', year: 'numeric' });
const DEMO_NOTE = 'Demo order: no payment is taken and no real Valio order is placed.';
const hr = 'border-top:1px solid #d9e4e7';

/** Normalised summary used by both e-mails and the confirmation page. Accepts checkout drafts and gateway orders. */
export function summarize({ lines, totals, deliveryDate, reference }) {
  return {
    deliveryDate, reference: reference ? String(reference).slice(0, 100) : '',
    lines: lines.map((l) => ({ productId: String(l.productId), name: String(l.name), quantity: l.quantity, unitLabel: String(l.salesUnitLabel || ''), unitPriceNet: l.unitPriceNet, vatRate: l.vatRate, lineNet: l.lineNet })),
    totals: { net: totals.net, vat: totals.vat, gross: totals.gross },
  };
}

function itemRows(summary) {
  return summary.lines.map((l) => `<tr><td valign="top" style="padding:14px 0;${hr}"><p style="margin:0 0 4px;font-size:14px;line-height:20px;font-weight:bold;color:#000">${esc(l.name)}</p><p style="margin:0 0 6px;font-size:12px;line-height:18px;color:#6b797d">Product ${esc(l.productId)}</p><p style="margin:0;font-size:12px;line-height:18px;color:#454545">Qty ${esc(qty(l.quantity))} ${esc(l.unitLabel)} · ${eur(l.unitPriceNet)} / ${esc(l.unitLabel || 'unit')} · VAT ${esc(l.vatRate)}%</p></td><td class="amount" width="80" align="right" valign="top" style="padding:15px 0;${hr};font-size:14px;font-weight:bold;color:#000">${eur(l.lineNet)}</td></tr>`).join('');
}
function totalRows(t) {
  const row = (label, value) => `<tr><td style="padding:6px 0;font-size:13px;color:#454545">${label}</td><td align="right" style="padding:6px 0;font-size:13px">${value}</td></tr>`;
  return `${row('Subtotal (excl. VAT)', eur(t.net))}${row('VAT', eur(t.vat))}<tr><td style="padding:13px 0 0;border-top:2px solid #c0e021;font-size:17px;font-weight:bold;color:#005670">Total</td><td align="right" style="padding:13px 0 0;border-top:2px solid #c0e021;font-size:20px;font-weight:bold;color:#005670">${eur(t.gross)}</td></tr>`;
}
const fact = (label, value) => `<td class="stack" width="50%" style="padding:14px 16px;font-size:11px;line-height:17px;color:#005670">${label}<br><strong style="font-size:14px;color:#000">${value}</strong></td>`;

function layout({ logoUrl, label, preheader, kicker, headline, intro, facts, summary, extraHtml = '', cta = '', footer }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(label)}</title><style>html,body{margin:0!important;padding:0!important;width:100%!important;background:#eee8f5}table{border-collapse:collapse!important;border-spacing:0}img{display:block;border:0;outline:none;text-decoration:none}@media only screen and (max-width:600px){.shell{width:100%!important;max-width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}.stack{display:block!important;width:100%!important;text-align:left!important}.amount{padding-top:4px!important}}</style></head><body style="margin:0;background:#eee8f5;font-family:Arial,Helvetica,sans-serif;color:#000"><div style="display:none;font-size:1px;color:#eee8f5;line-height:1px;max-height:0;overflow:hidden">${esc(preheader)}</div><table role="presentation" width="100%" bgcolor="#eee8f5"><tr><td align="center" style="padding:28px 12px"><table role="presentation" class="shell" width="600" style="width:600px;max-width:600px;background:#fff;overflow:hidden"><tr><td class="pad" style="padding:18px 36px 16px;background:#005670"><table role="presentation" width="100%"><tr><td><img src="${esc(logoUrl)}" width="150" alt="Valio Aimo" style="width:150px;height:auto;background:#fff"></td><td align="right" style="font-size:11px;letter-spacing:1px;font-weight:bold;color:#fff">${esc(label.toUpperCase())}</td></tr></table></td></tr><tr><td style="height:7px;background:#c0e021;font-size:1px;line-height:1px">&nbsp;</td></tr><tr><td class="pad" style="padding:30px 36px 12px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;font-weight:bold;color:#005670">${esc(kicker)}</p><h1 style="margin:0 0 10px;font-size:28px;line-height:34px;color:#005670">${esc(headline)}</h1><p style="margin:0;font-size:15px;line-height:23px;color:#454545">${intro}</p></td></tr><tr><td class="pad" style="padding:18px 36px 25px"><table role="presentation" width="100%" style="background:#f2f6f8;border:1px solid #9dbfc9"><tr>${facts.slice(0, 2).join('')}</tr>${facts.length > 2 ? `<tr>${facts.slice(2, 4).join('')}</tr>` : ''}</table></td></tr><tr><td class="pad" style="padding:0 36px"><h2 style="margin:0 0 12px;font-size:19px;color:#005670">Order summary <span style="font-size:13px;font-weight:normal;color:#6b797d">· ${summary.lines.length} ${summary.lines.length === 1 ? 'product' : 'products'}</span></h2><table role="presentation" width="100%">${itemRows(summary)}</table></td></tr><tr><td class="pad" style="padding:2px 36px 24px"><table role="presentation" width="100%" style="${hr}"><tr><td colspan="2" style="padding:8px 0 0"></td></tr>${totalRows(summary.totals)}</table><p style="margin:8px 0 0;font-size:10px;color:#6b797d">${esc(DEMO_NOTE)}</p></td></tr>${extraHtml}${cta}<tr><td align="center" style="padding:17px 24px;background:#eee8f5;font-size:10px;line-height:17px;color:#6b797d">${footer}</td></tr></table></td></tr></table></body></html>`;
}

const textLines = (s) => s.lines.map((l) => `- ${l.name} (product ${l.productId}): ${qty(l.quantity)} ${l.unitLabel} x ${eur(l.unitPriceNet)} = ${eur(l.lineNet)}`).join('\n');
const textTotals = (t) => `Subtotal (excl. VAT): ${eur(t.net)}\nVAT: ${eur(t.vat)}\nTotal: ${eur(t.gross)}`;

/** Review e-mail: summary plus a Confirm order button. Nothing is ordered by opening the link. */
export function renderReviewEmail({ summary, confirmUrl, expiresAtMs, logoUrl }) {
  const button = `<tr><td align="center" class="pad" style="padding:25px 36px 13px"><table role="presentation"><tr><td align="center" bgcolor="#c0e021"><a href="${esc(confirmUrl)}" style="display:inline-block;padding:13px 25px;border:1px solid #c0e021;color:#005670;text-decoration:none;font-size:14px;font-weight:bold">Confirm order</a></td></tr></table><p style="margin:14px 0 0;font-size:11px;line-height:17px;color:#6b797d">The button opens a page with this order summary. The order is placed only when you press <strong>Confirm order</strong> on that page.<br>Button not working? Copy this link into your browser:<br><a href="${esc(confirmUrl)}" style="color:#005670;word-break:break-all">${esc(confirmUrl)}</a></p></td></tr><tr><td align="center" class="pad" style="padding:6px 36px 24px;font-size:11px;line-height:17px;color:#6b797d">Prices and availability are checked again when you confirm. If you did not request this e-mail, you can ignore it. No order is placed without your confirmation.</td></tr>`;
  const html = layout({
    logoUrl, label: 'Order review', preheader: `Review your order and confirm it. The link is valid until ${stamp(expiresAtMs)}.`,
    kicker: 'ONE STEP LEFT', headline: 'Please review and confirm your order',
    intro: 'Check the products, quantities and delivery date below. <strong>Nothing has been ordered yet.</strong>',
    facts: [fact('DELIVERY DATE', esc(longDate(summary.deliveryDate))), fact('LINK VALID UNTIL', esc(stamp(expiresAtMs))), ...(summary.reference ? [fact('YOUR REFERENCE', esc(summary.reference))] : [])],
    summary, cta: button,
    footer: 'Valio Aimo · Supplies for professional kitchens<br>Demo order flow · no payment, no real order',
  });
  const text = `Please review and confirm your order\n\nNothing has been ordered yet. Delivery date: ${longDate(summary.deliveryDate)}.${summary.reference ? `\nYour reference: ${summary.reference}` : ''}\n\n${textLines(summary)}\n\n${textTotals(summary.totals)}\n\nConfirm order: ${confirmUrl}\n\nThe link opens a page with this summary. The order is placed only when you press "Confirm order" on that page. The link is valid until ${stamp(expiresAtMs)}.\nPrices and availability are checked again when you confirm. If you did not request this e-mail, ignore it.\n\n${DEMO_NOTE}`;
  return { subject: 'Confirm your Valio Aimo order', html, text };
}

/** Separate e-mail sent after the demo order has been recorded. */
export function renderConfirmedEmail({ order, logoUrl }) {
  const html = layout({
    logoUrl, label: 'Order confirmation', preheader: `Order ${order.orderId} confirmed. Delivery ${longDate(order.deliveryDate)}.`,
    kicker: 'THANK YOU FOR YOUR ORDER', headline: 'Your order is confirmed',
    intro: 'Your demo order has been recorded. Here is the final summary.',
    facts: [fact('ORDER NUMBER', esc(order.orderId)), fact('ORDER DATE', esc(day(order.placedAtMs))), fact('DELIVERY DATE', esc(longDate(order.deliveryDate))), ...(order.reference ? [fact('YOUR REFERENCE', esc(order.reference))] : [])],
    summary: order,
    footer: 'Valio Aimo · Supplies for professional kitchens<br>Demo order · no payment, no real order',
  });
  const text = `Your order is confirmed\n\nOrder number: ${order.orderId}\nOrder date: ${day(order.placedAtMs)}\nDelivery date: ${longDate(order.deliveryDate)}${order.reference ? `\nYour reference: ${order.reference}` : ''}\n\n${textLines(order)}\n\n${textTotals(order.totals)}\n\n${DEMO_NOTE}`;
  return { subject: `Order ${order.orderId} confirmed`, html, text };
}

// ---- Confirmation page (server-rendered, works without JavaScript) ----
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{margin:0;background:#eee8f5;font:15px/1.5 Arial,Helvetica,sans-serif;color:#000}header{background:#005670;border-bottom:7px solid #c0e021;padding:16px 24px}header img{width:150px;height:auto;background:#fff;display:block}main{max-width:640px;margin:24px auto;background:#fff;padding:28px 28px 32px}h1{margin:0 0 8px;color:#005670;font-size:26px;line-height:32px}h2{color:#005670;font-size:18px;margin:24px 0 8px}p{color:#454545}.row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #d9e4e7;padding:12px 0}.row small{display:block;color:#6b797d}.tot{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}.grand{border-top:2px solid #c0e021;margin-top:8px;padding-top:12px;font-size:19px;font-weight:bold;color:#005670}button{background:#c0e021;color:#005670;border:1px solid #c0e021;font:bold 15px Arial,Helvetica,sans-serif;padding:14px 28px;cursor:pointer;margin-top:20px}.note{font-size:12px;color:#6b797d}.err{color:#a12626}</style></head><body><header><img src="/aimo-logo.png" alt="Valio Aimo"></header><main>${body}</main></body></html>`;
const rows = (s) => s.lines.map((l) => `<div class="row"><div><strong>${esc(l.name)}</strong><small>Product ${esc(l.productId)} · Qty ${esc(qty(l.quantity))} ${esc(l.unitLabel)} · ${eur(l.unitPriceNet)} / ${esc(l.unitLabel || 'unit')} · VAT ${esc(l.vatRate)}%</small></div><strong>${eur(l.lineNet)}</strong></div>`).join('');
const sums = (t) => `<div class="tot"><span>Subtotal (excl. VAT)</span><span>${eur(t.net)}</span></div><div class="tot"><span>VAT</span><span>${eur(t.vat)}</span></div><div class="tot grand"><span>Total</span><span>${eur(t.gross)}</span></div>`;
const form = (token, label) => `<form method="post" action="/order/confirm"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">${esc(label)}</button></form>`;

/** view: {state, summary, order, expiresAt, emailSent}. Returns {status, html}. Rendering never changes any state. */
export function renderConfirmPage(view, token) {
  if (view.state === 'pending') {
    const s = view.summary;
    return { status: 200, html: page('Confirm your order', `<h1>Confirm your order</h1><p>Delivery ${esc(longDate(s.deliveryDate))}${s.reference ? ` · reference ${esc(s.reference)}` : ''}. <strong>Nothing has been ordered yet.</strong> Your order is placed when you press the button below.</p><h2>Order summary</h2>${rows(s)}${sums(s.totals)}${form(token, 'Confirm order')}<p class="note">Prices and availability are checked again when you confirm. Link valid until ${esc(stamp(view.expiresAt))}. ${esc(DEMO_NOTE)}</p>`) };
  }
  if (view.state === 'confirmed') {
    const o = view.order;
    return { status: 200, html: page('Order confirmed', `<h1>Order confirmed</h1><p>Order number <strong>${esc(o.orderId)}</strong> · delivery ${esc(longDate(o.deliveryDate))}.</p>${view.emailSent ? '<p>A confirmation e-mail has been sent.</p>' : `<p class="err">The order is recorded, but the confirmation e-mail has not been sent yet.</p>${form(token, 'Send confirmation e-mail')}`}<h2>Order summary</h2>${rows(o)}${sums(o.totals)}<p class="note">${esc(DEMO_NOTE)}</p>`) };
  }
  if (view.state === 'changed') return { status: 409, html: page('Order not placed', '<h1>Order not placed</h1><p class="err">Prices, availability or the ordering deadline changed since the review e-mail was sent, so no order was placed.</p><p>Please review your cart in the shop and request a new confirmation e-mail.</p>') };
  if (view.state === 'expired') return { status: 410, html: page('Link expired', '<h1>This link has expired</h1><p>No order was placed. Please review your cart in the shop and request a new confirmation e-mail.</p>') };
  if (view.state === 'unavailable') return { status: 503, html: page('Try again', `<h1>We could not place the order</h1><p class="err">Something went wrong and no order was recorded. You can try again.</p>${form(token, 'Confirm order')}`) };
  return { status: 404, html: page('Link not found', '<h1>Link not found</h1><p>This confirmation link is not valid. Please request a new one from the shop.</p>') };
}
