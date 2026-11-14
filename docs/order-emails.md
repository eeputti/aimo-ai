# Order review and confirmation e-mails

Demo order flow for the shared storefront. No payment is taken and no real Valio order is placed.

1. In the storefront's order dialog the customer checks prices and availability (the existing quote step). The **Lähetä tilaus** button is replaced by an e-mail field. Submitting it sends an **order review e-mail** (`POST /api/storefront/order-email`). **No order is placed.**
2. The review e-mail shows products, quantities, unit prices, delivery date and totals, with a **Confirm order** button at the bottom. The button opens `GET /order/confirm?token=…`, a read-only page with the saved summary.
3. Only the **Confirm order** button on that page (`POST /order/confirm`) places the order. It re-checks prices and availability, places the order through the gateway (`prepareCheckout` / `confirmCheckout`) and then sends a separate **order-confirmed e-mail** with the order number, products, quantities, unit prices, delivery date, subtotal, VAT and total.

If the server has no e-mail settings, the API answers 503 and nothing is sent.

## Configuration (server environment)

| Variable | Meaning |
|---|---|
| `RESEND_API_KEY` | Resend API key. Keep it in the server environment only. |
| `ORDER_EMAIL_FROM` | Sender on a domain verified in Resend, e.g. `Valio Aimo <orders@your-domain.example>`. |
| `ORDER_EMAIL_PUBLIC_URL` | Public HTTPS base URL of the deployed site, e.g. `https://shop.your-domain.example` (no path or query). `http://localhost…` is accepted for local trials only. |

Blank examples are in `.env.example`. Never commit real values and never paste the API key into chat. All three are required; the server reports only variable *names* when one is missing or invalid. The logo in the e-mails is loaded from `<ORDER_EMAIL_PUBLIC_URL>/aimo-logo.png`, so the site must be publicly reachable for it to show.

## Safety properties

- **GET never orders.** The page and the link are read-only (also `HEAD`), so link previews and e-mail security scanners cannot place an order. Only a form `POST` with the token does, and cross-site or non-form posts are refused. Pages are `no-store`, `noindex` and send no referrer.
- **Token.** 256 random bits in the link; only its SHA-256 is stored. The link ends after 24 hours or at the earliest ordering deadline of the products, whichever is first.
- **Idempotency.** The review record keeps one checkout token, so retries, double clicks and concurrent presses reach the gateway's idempotency and create one order. Both e-mails go out with a Resend `Idempotency-Key` (`order-review-<id>`, `order-confirmed-<order number>`), the confirmed e-mail is marked sent once, and a repeat review request for the same cart and address within 10 minutes sends nothing new. If the confirmed e-mail fails, the order stays recorded and pressing the button again retries only the e-mail.
- **Changes since the review.** If prices, quantities, availability or the deadline changed, no order is placed and the customer is asked to review the cart again.
- **Abuse limits** (in memory, per server process): 3 review e-mails per recipient and 100 in total per hour, 10 requests per recipient per hour.
- **Privacy.** E-mail addresses are stored only until the last e-mail has been sent. Neither addresses, tokens nor the API key are logged. All customer and product text is HTML-escaped in e-mails and pages.
- **Existing direct requests.** A direct order request already saved in the browser (`aimo.storefront.pending-order.v1`) is still recovered with **Yritä uudelleen**.

## Limits

Single server process (in-flight guards and rate limits are in memory). Review links are limited to carts whose selected quote options are the cart's own products; accept a substitute in the cart first. Stored review records are not purged automatically. The e-mail text and confirmation page are in English, matching `public/emails/order-confirmation.html`; the shop UI stays Finnish.

## Tests

`node --disable-warning=ExperimentalWarning --test test/order-email.test.mjs test/storefront-order.test.mjs test/storefront-checkout.test.mjs` uses a synthetic catalog, temporary databases and a fake Resend (`fetch`); no e-mail is sent. Resend delivery itself is not covered by tests.
