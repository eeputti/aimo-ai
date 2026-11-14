# Aimo Agent Gateway

**The open front door for buyer agents at Valio Aimo: verifiable offers, spend-limited mandates, human sign-off when it matters, and a tamper-evident record of every decision.**

Shared development context for Codex and Claude Code: [working instructions](AGENTS.md), [current status and work log](TYOLOKI.md), and [competition plan](SUUNNITELMA.md). Claude Code loads the shared instructions through [CLAUDE.md](CLAUDE.md). Record each completed work stage and its checks in the work log, then commit and push it to GitHub.

Junction 2026, Valio Aimo challenge "Trusted Trade Agents". This is not a chatbot on top of the web shop. It is the Aimo-side interface that lets *any* buyer agent go from inquiry to commitment, with the buyer's own rules deciding what the agent may do alone.

```
buyer's agent ──► search_products ──► request_quote ──► place_order ──► confirmed
 (REST or MCP)     static catalogue    live price +       mandate            │
                   17 546 products     availability,      decides ──► pending_approval ──► human: one button
                                       signed offer                  └─► rejected (reason codes)
                                                    every step ──► hash-chained audit trail
```

## Run it

Requires Node 22.13+ (uses built-in `node:sqlite`, no native dependencies).

```bash
npm install
cp .env.example .env        # add VALIO_API_KEY (from the Junction platform)
npm run fetch-data          # downloads the challenge data into data/raw (not in the repo)
npm run catalog             # builds the compact search index
npm start                   # http://localhost:4747
```

| URL | What |
|---|---|
| `/` or `/gateway.html` | Static local copy of the Toimitustukku homepage, based on the 14 Nov 2026 reference |
| `/agent.html` | Console: run a buyer agent, approve, edit the mandate, read the audit trail |
| `/approve.html?order=…` | The human approval view, built for a phone: what was asked, what is proposed, why it stopped, Approve / Reject |
| `/openapi.json` | The contract (OpenAPI 3.1) |
| `/mcp` | The same contract as MCP tools (Streamable HTTP, JSON-RPC) |
| `/.well-known/agent-gateway.json` | Discovery: operations, reason codes, clock |
| `/.well-known/jwks.json` | Public key for verifying offers |
| `/kitchen.html` | Demo client: a kitchen ordering agent (Ravintola Kulma) |

The homepage uses local images, fonts and a fixed product snapshot. Its prices, availability, delivery date and cart are display data; the homepage does not place orders. Product carousels and the assistant greeting open and close locally. Asset sources are recorded in `public/storefront-assets/sources.json`.

The kitchen demo combines history, ordinary bookings and recipe demand, including new ingredients, yield factors and explicitly supplied usable inventory/incoming deliveries. See [kitchen planning inputs and limitations](docs/kitchen-planning.md). Run `npm test` for isolated planning and HTTP regression tests; the local catalogue is required, and the tests do not use live API keys or the running demo databases.

The whole chain in one command, as an outside agent sees it (real HTTP calls, live mock API):

```bash
npm run demo
```

```
━━ 1. "I need 1,000 litres of lactose-free milk by Monday."
   22 ms  POST /v1/products/search   25 products (type milk, FREE_FROM_LACTOSE) → 25 candidates
  164 ms  POST /v1/quotes            3 signed options, cheapest 1010.00 € (464306 × 1000)
                                     excluded: 15 × CUTOFF_PASSED, 1 × NOT_DELIVERABLE, 2 × INSUFFICIENT_STOCK
   64 ms  POST /v1/orders            AGW-…-0001: pending_approval (SPEND_CAP_ORDER)
   Human approves with one button → confirmed
━━ 2. "100 litraa Arlan rasvatonta laktoositonta maitojuomaa maanantaiksi"
          stock is 51 → 51 × original + 49 × substitute, same allergen profile, cheaper
          → confirmed without a human (within mandate), human gets a notification
━━ 3. "… by Sunday"       → earliest delivery is Monday → pending_approval (DELIVERY_DATE_SHIFT)
━━ 4. tampered offer      → rejected (OFFER_INVALID_SIGNATURE)
━━ 5. new buyer, default mandate → pending_approval (APPROVAL_ALWAYS)
━━ Audit trail: chain VALID
```

Demo buyer keys (public, demo only): `demo-nordic-hotels`, `demo-ravintola-kulma`, `demo-kahvila-aalto`. Send as `Authorization: Bearer <key>`.

### Connect your own agent

Any MCP client works with nothing but the URL and a key:

```json
{ "mcpServers": { "aimo": { "type": "http", "url": "http://localhost:4747/mcp", "headers": { "Authorization": "Bearer demo-nordic-hotels" } } } }
```

Or plain REST:

```bash
curl -s localhost:4747/v1/products/search -H 'authorization: Bearer demo-nordic-hotels' \
  -H 'content-type: application/json' -d '{"query":"lactose-free milk"}'
```

## The contract

One definition (`server/gateway/contract.mjs`) generates the REST routes, the MCP tools and the OpenAPI document, so the solution is not tied to either transport.

| Operation | REST | Does |
|---|---|---|
| `search_products` | `POST /v1/products/search` | Search the static catalogue in Finnish or English. Claims in the text (lactose-free, gluten-free, vegan, organic) become classification filters. No prices here. |
| `request_quote` | `POST /v1/quotes` | Live price and availability for the shortlisted candidates only. Up to 5 options per need, each a signed offer valid 15 minutes. Excluded candidates come back with reason codes. |
| `place_order` | `POST /v1/orders` | Commit to signed offers. Requires an idempotency key. Returns `confirmed`, `pending_approval` or `rejected`. |
| `add_to_order` | `POST /v1/orders/{id}/lines` | "Forgot the cream": add signed offers to an order already placed, before its cut-off. The mandate is re-evaluated on the new order total. `addition.status` is `applied`, `pending_approval` (the confirmed order stays as it was until a human decides) or `rejected`. |
| `get_order` | `GET /v1/orders/{id}` | Status and reasons. A pending approval expires at the order cut-off. |
| `get_audit_trail` | `GET /v1/orders/{id}/audit` | The decision chain, with chain verification. |
| `get_mandate` | `GET /v1/mandate` | The agent's own limits, so it does not have to guess. |

Reason codes are part of the contract (`/.well-known/agent-gateway.json`): an agent can branch on `CUTOFF_PASSED`, `INSUFFICIENT_STOCK`, `SPEND_CAP_ORDER`, `SUBSTITUTION_OUTSIDE_POLICY`, `DELIVERY_DATE_SHIFT`, `OFFER_EXPIRED` and so on without parsing prose.

## Autonomy and control

**The LLM proposes, deterministic code decides.** The mandate is data (`server/gateway/mandate.mjs`), not a prompt.

| Level | The agent may | A human is asked when |
|---|---|---|
| `always` (default) | prepare orders | always: nothing leaves without sign-off |
| `exceptions` | place ordinary orders | spend cap exceeded, any substitution, delivery date slips |
| `autonomous` | also accept a substitute that stays inside the rules | spend cap exceeded, substitute outside the rules, delivery date slips |

- Per-order and per-day spend caps, required claims, banned allergens, substitution limits (max unit price increase, minimum delivery reliability), allowed date shift.
- **Never automatic and never overridable**: a product that breaks an allergen restriction. Approval cannot wave it through.
- A substitute whose allergen data cannot be verified from the product data is treated as outside policy.
- When the agent decides alone, the human gets a notification afterwards; when it may not, the order stops in `pending_approval` and the human gets one screen with two buttons.

## Exceptions handled

| Situation | What the gateway does |
|---|---|
| Order cut-off already passed | The mock API still lists such products as available. The gateway compares `closingTime` to its own clock and excludes them (`CUTOFF_PASSED`). |
| Partial stock | Keeps what is available and fills the rest with a substitute from the same product type with the same allergen profile; inside the mandate it confirms, otherwise it asks. |
| No schedule line / zero stock | `NOT_DELIVERABLE`, substitute options offered. |
| Quantity reported as 999999 | All Terminal (supplier-stocked) items and some Stock items. The real quantity is unknown. Flagged `STOCK_UNKNOWN`, never presented as confirmed stock. |
| Requested date not possible | Offer carries the earliest date and `DELIVERY_DATE_SHIFT`; a human decides unless the mandate allows the shift. |
| Price or stock changed after the offer | Re-checked live at `place_order`; `OFFER_STALE` → request a new quote. |
| Tampered, expired, reused or someone else's offer | Rejected with `OFFER_INVALID_SIGNATURE`, `OFFER_EXPIRED`, `OFFER_ALREADY_USED`, `OFFER_WRONG_BUYER`. |
| Retries | Same idempotency key returns the same order. |

## "Did you forget this?"

The gateway notices what is missing before the buyer does. For a buyer's most recent open order, `place_order`, `add_to_order` and `get_order` return a `suggestions` list: products that were in at least half (and at least two) of that buyer's last confirmed orders, when the current order has nothing from the same product group. Each suggestion is a concrete product and the buyer's typical quantity, never an open question.

- **For the agent**: the suggestion carries a ready `next` step (`request_quote` → `add_to_order`).
- **For the human**: the approval view shows it with one button. Pressing it runs the same chain as any addition: signed offer, live re-check, mandate, audit trail (`SUGGESTION_ACCEPTED`).
- No language model, and only the buyer's own history (`server/gateway/suggest.mjs`, disclosed in `/.well-known/agent-gateway.json`). A suggestion never changes an order by itself.

## Trust

- **Signed offers**: JWS compact, EdDSA (Ed25519). Payload holds the lines, fixed net prices, delivery date, cut-off and expiry. Public key at `/.well-known/jwks.json`.
- **Audit trail**: append-only ledger in SQLite; each row stores the hash of the previous row. `get_audit_trail` re-computes the chain and reports `chain.valid`. The same log is readable by the buyer and by Aimo.

## Assumptions (stated, not hidden)

1. **No order endpoint exists in the mock API.** Commitment is recorded in the gateway's own ledger. In production `place_order` would post to Aimo's order system.
2. **Product types are curated by hand** (`milk`, `cream`, `butter`, `eggs`). Category codes in the challenge data have no names, so "drinking milk" is category 10400 minus coffee milk, buttermilk, portion packs and flavoured drinks. In production this comes from Aimo's product hierarchy.
3. **"Lactose-free" means the classification `FREE_FROM_LACTOSE`**, not the product name and not `LOW_LACTOSE`.
4. **Litres per sales unit** come from product data, else from the product name ("12 x 1 L", "100x2 cl"), cross-checked against net price ÷ comparison price.
5. **`allowedLotSize` is 0.01 for almost every product**; the practical step is one sales unit (0.5 for products sold by the kilogram).
6. **The mock API returns Monday 16 Nov as the delivery date whatever is requested.** `closingTime` is the only signal of whether an order makes it.
7. **Missing delivery reliability or CO₂ is shown as missing**, never estimated.
8. **Free-text understanding is the client agent's job.** The gateway takes structured requests; the bundled reference client parses text with rules so the demo is fast and repeatable. An LLM client can use the same contract through MCP.
9. **Demo clock**: set `DEMO_NOW` to pin the gateway's clock (the mock API's stock items close on Sunday 15 Nov 17:00). Every response then says the time is simulated.
10. **The console and approval endpoints are open in this demo.** In production they sit behind the buyer's login.
11. The kitchen demo client's order history, bookings and menu are generated demo data. Products, allergens, substitution rules, delivery reliability and CO₂ are from the challenge data; prices and availability from the mock API.

## Standards

| Need | Standard |
|---|---|
| Contract | OpenAPI 3.1 + JSON Schema |
| Agent interface | Model Context Protocol (same contract) |
| Offer verifiability | JWS (RFC 7515) with EdDSA, JWKS (RFC 7517) |
| Product identity | GS1 GTIN (returned with every product and offer line), GS1 allergen codes |
| Agent authority | Mandate as data; the same idea as signed mandates in AP2 |
| Order message in production | Peppol BIS Ordering (UBL) |

## Path to production

1. Replace the local commitment with Aimo's order API; keep the offer signature as the price guarantee.
2. Buyer authentication with OAuth 2.0 client credentials; mandates signed by the buyer and stored per customer.
3. Customer-specific prices: the gateway already passes a customer number to the pricing API and never prices more than the shortlisted candidates.
4. Approval notifications by email, SMS or Teams with a deep link to the approval view.
5. Product types and substitution groups from Aimo's own hierarchy; payment (x402 or invoice) as a later step.

## Layout

```
server/gateway/   contract, service (search, quote, order), mandate, signing, store (ledger), clock, http (REST + MCP), buyerAgent (reference client)
server/           catalog (search index), valioApi (price + availability, cached), substitutes, kitchen demo client
public/           index.html / gateway.html (storefront), agent.html (console), approve.html (phone), kitchen.html (kitchen demo)
scripts/          build-catalog, fetch-data, demo-buyer
```

The challenge data may only be used for this event, so `data/raw/` and the API key are not in the repository. MIT licence.
