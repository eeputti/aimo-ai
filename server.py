"""Valio Aimo Junction -rajapinta MCP-palvelimeksi (Streamable HTTP).

Ympäristömuuttujat:
  VALIO_API_KEY      (pakollinen) Valio Aimon X-API-Key
  MCP_BEARER_TOKEN   (vahvasti suositeltu) palvelimen oma tunnus; vaaditaan
                     Authorization: Bearer <token> -otsakkeessa
  VALIO_BASE_URL     oletus https://junction26.valioaimo.fi
  PORT               oletus 8000
  MAX_BATCH          tuotteita / kysely, oletus 100 (API sallii 1000)
  CACHE_TTL_SECONDS  saatavuus- ja hintavälimuisti, oletus 300
"""
import asyncio
import csv
import datetime
import hmac
import io
import json
import os
import re
import time
from typing import Any

import httpx
import uvicorn
from mcp.server.mcpserver import MCPServer
from starlette.responses import JSONResponse

BASE_URL = os.environ.get("VALIO_BASE_URL", "https://junction26.valioaimo.fi").rstrip("/")
API_KEY = os.environ.get("VALIO_API_KEY", "")
BEARER = os.environ.get("MCP_BEARER_TOKEN", "")
PORT = int(os.environ.get("PORT", "8000"))
MAX_BATCH = int(os.environ.get("MAX_BATCH", "100"))
CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "300"))
DEFAULT_CUSTOMER = "123"  # asiakasnumero ei vaikuta tuloksiin tässä haasteessa

mcp = MCPServer("valio-aimo")

# ---------------------------------------------------------------- HTTP-apurit


def _auth_headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY}


async def fetch_file(path: str) -> str:
    """Hakee latausaineiston. Seuraa uudelleenohjaukset käsin, jotta API-avainta
    ei lähetetä muille palvelimille."""
    base_host = httpx.URL(BASE_URL).host
    async with httpx.AsyncClient(timeout=60) as client:
        url = httpx.URL(BASE_URL + path)
        for _ in range(6):
            headers = _auth_headers() if url.host == base_host else {}
            r = await client.get(url, headers=headers, follow_redirects=False)
            if r.is_redirect:
                url = r.url.join(r.headers["location"])
                continue
            r.raise_for_status()
            # Joissain toteutuksissa linkki voi tulla JSON-vastauksena
            try:
                data = r.json()
                if isinstance(data, dict) and len(data) == 1:
                    link = next(iter(data.values()))
                    if isinstance(link, str) and link.startswith("http"):
                        url = httpx.URL(link)
                        continue
            except ValueError:
                pass
            return r.text
    raise RuntimeError(f"Liian monta uudelleenohjausta: {path}")


# --------------------------------------------------------------- Staattinen data

ID_KEYS = ("productId", "product_id", "id", "code", "materialNumber", "sku", "itemNumber")
_products: dict[str, dict] = {}
_reliability: dict[str, float] = {}
_carbon: dict[str, float] = {}
# pid -> (nimet + valmistaja pienillä kirjaimilla, koko tuote JSONina pienillä kirjaimilla)
_index: dict[str, tuple[str, str]] = {}
_raw_samples: dict[str, list[str]] = {}  # diagnostiikkaa varten: CSV-tiedostojen alkurivit
_loaded = False
_load_lock = asyncio.Lock()


def _extract_list(data: Any) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def _pid(item: dict) -> str | None:
    for k in ID_KEYS:
        if item.get(k) not in (None, ""):
            return str(item[k])
    return None


def _parse_csv_map(text: str) -> dict[str, float]:
    first = text.split("\n", 1)[0]
    delim = ";" if ";" in first else ","
    out: dict[str, float] = {}
    for row in csv.reader(io.StringIO(text), delimiter=delim):
        if len(row) < 2:
            continue
        try:
            out[row[0].strip()] = float(row[1].strip().replace(",", "."))
        except ValueError:
            continue  # otsikkorivi tai tyhjä arvo
    return out


async def ensure_data() -> None:
    global _loaded
    async with _load_lock:
        if _loaded:
            return
        products_txt, rel_txt, co2_txt = await asyncio.gather(
            fetch_file("/api/products/download"),
            fetch_file("/api/delivery-reliability/download"),
            fetch_file("/api/carbon-footprint/download"),
        )
        for item in _extract_list(json.loads(products_txt)):
            if isinstance(item, dict) and (pid := _pid(item)):
                _products[pid] = item
                names = " ".join(_names(item).values())
                _index[pid] = (
                    f"{names} {item.get('vendorName', '')}".lower(),
                    json.dumps(item, ensure_ascii=False).lower(),
                )
        _reliability.update(_parse_csv_map(rel_txt))
        _carbon.update(_parse_csv_map(co2_txt))
        _raw_samples["delivery-reliability"] = rel_txt.splitlines()[:3]
        _raw_samples["carbon-footprint"] = co2_txt.splitlines()[:3]
        _loaded = True


def _names(item: dict) -> dict[str, str]:
    """Tuotteen nimet kielittäin synkkaData.names-kentästä."""
    names = (item.get("synkkaData") or {}).get("names") or []
    out = {n.get("language", "?"): n["value"] for n in names if isinstance(n, dict) and n.get("value")}
    if not out and item.get("name"):
        out["fi"] = str(item["name"])
    return out


def _name(item: dict) -> str:
    n = _names(item)
    return n.get("fi") or n.get("en") or next(iter(n.values()), "")


SUMMARY_KEYS = ("vendorName", "salesUnit", "baseUnit", "category", "temperatureCondition", "countryOfOrigin")


def _summary(pid: str) -> dict:
    """Tiivis tuotekuvaus hakutuloksiin (ei markkinointitekstejä eikä ainesosia)."""
    item = _products.get(pid, {})
    out: dict[str, Any] = {"id": pid, "name": _name(item)}
    out.update({k: item[k] for k in SUMMARY_KEYS if item.get(k) not in (None, "")})
    if pid in _reliability:
        out["deliveryReliability"] = _reliability[pid]
    if pid in _carbon:
        out["carbonFootprintKgCO2eqPerKg"] = _carbon[pid]
    return out


async def _data_error() -> dict | None:
    """Lataa staattisen datan; palauttaa virhekuvauksen agentille, jos lataus epäonnistuu."""
    try:
        await ensure_data()
    except Exception as e:  # noqa: BLE001 - halutaan näkyvä syy, ei geneeristä virhettä
        return {"error": f"Staattisen datan lataus epäonnistui: {type(e).__name__}: {e}"}
    return None


def _shorten(v: Any, n: int = 200) -> Any:
    if isinstance(v, str):
        return v if len(v) <= n else v[:n] + "…"
    if isinstance(v, list):
        return [_shorten(x, n) for x in v[:20]]
    if isinstance(v, dict):
        return {k: _shorten(x, n) for k, x in v.items()}
    return v


def _enrich(pid: str) -> dict:
    out = _shorten(_products.get(pid, {"productId": pid}))
    if pid in _reliability:
        out["deliveryReliability"] = _reliability[pid]
    if pid in _carbon:
        out["carbonFootprintKgCO2eqPerKg"] = _carbon[pid]
    return out


# ------------------------------------------------------- Dynaamiset kyselyt + cache

_cache: dict[tuple[str, str, str], tuple[float, dict]] = {}


async def _query(endpoint: str, product_ids: list[str], requested_date: str, customer: str) -> dict:
    try:
        datetime.date.fromisoformat(requested_date)
    except ValueError:
        return {"error": "requested_date pitää olla muodossa YYYY-MM-DD, esim. 2026-11-16"}
    ids = list(dict.fromkeys(str(p) for p in product_ids))
    if not ids:
        return {"error": "product_ids on tyhjä"}
    if len(ids) > MAX_BATCH:
        return {
            "error": f"Enintään {MAX_BATCH} tuotetta kerralla. Rajaa lista ensin "
            "search_products-työkalulla äläkä kysy kaikkia tuotteita."
        }
    now = time.time()
    found: dict[str, dict] = {}
    missing: list[str] = []
    for pid in ids:
        hit = _cache.get((endpoint, requested_date, pid))
        if hit and now - hit[0] < CACHE_TTL:
            found[pid] = hit[1]
        else:
            missing.append(pid)
    if missing:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    f"{BASE_URL}/api/{endpoint}",
                    headers=_auth_headers(),
                    json={"customer": customer, "requestedDate": requested_date, "products": missing},
                )
        except httpx.HTTPError as e:
            return {"error": f"Yhteysvirhe: {e}"}
        if r.status_code == 429:
            return {"error": "Rate limit täynnä. Odota hetki ja vähennä kyselyjä."}
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code}", "detail": r.text[:500]}
        for entry in r.json().get("products", []):
            pid = str(entry.get("productId"))
            found[pid] = entry
            _cache[(endpoint, requested_date, pid)] = (now, entry)
    return {
        "requestedDate": requested_date,
        "products": [found[p] for p in ids if p in found],
        "notReturned": [p for p in ids if p not in found],
    }


def _parse_ts(s: str | None) -> datetime.datetime | None:
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        try:
            return datetime.datetime.fromisoformat(s)
        except ValueError:
            return None


def _interpret_availability(entry: dict, requested_date: str) -> dict:
    """Lisää saatavuusriviin valmiin tulkinnan: canOrder, deliveryDate, amountKnown, reason."""
    lines = entry.get("scheduleLines") or []
    closing = _parse_ts(entry.get("closingTime"))
    now = datetime.datetime.now(datetime.timezone.utc)
    usable = [ln for ln in lines if not ln.get("salesBlock") and (ln.get("availableAmount") or 0) > 0]
    dates = sorted({ln["availableDate"] for ln in usable if ln.get("availableDate")})
    terminal = entry.get("logisticModel") == "Terminal"

    reason = None
    if entry.get("salesBlock"):
        reason = "Myyntiesto (salesBlock): tuotetta ei voi tilata."
    elif not lines:
        reason = "Ei toimitettavissa (tyhjä scheduleLines)."
    elif not usable:
        reason = "Ei saatavilla: availableAmount 0 tai rivit myyntiestossa."
    elif closing and closing < now:
        reason = f"Tilauksen takaraja {entry['closingTime']} on jo mennyt."

    out = dict(entry)
    out["canOrder"] = reason is None
    if reason is None:
        out["deliveryDate"] = dates[0] if dates else requested_date
        out["deliversOnRequestedDate"] = requested_date in dates or not dates
        out["amountKnown"] = not terminal
        if not terminal:
            out["availableAmountTotal"] = sum(ln.get("availableAmount") or 0 for ln in usable)
        if not out["deliversOnRequestedDate"]:
            reason = f"Toimitettavissa vasta {out['deliveryDate']}, ei pyydettynä päivänä."
    out["note"] = reason or ("Saatavilla. Terminal-tuote: todellinen määrä ei tiedossa." if terminal
                             else "Saatavilla pyydettynä päivänä.")
    return out


# ------------------------------------------------------------------------ Työkalut


@mcp.tool()
async def ping() -> str:
    """Testaa, että Valio Aimon rajapinta vastaa."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BASE_URL}/api/ping", headers=_auth_headers())
        return f"HTTP {r.status_code}: {r.text[:200]}"
    except httpx.HTTPError as e:
        return f"Virhe: {e}"


@mcp.tool()
async def search_products(
    query: str,
    limit: int = 20,
    min_delivery_reliability: float | None = None,
    max_carbon_kg_per_kg: float | None = None,
) -> dict:
    """Hakee tuotteita staattisesta tuotedatasta (ei kutsu dynaamisia rajapintoja).

    Käytä tätä ENSIN, ennen hinta- ja saatavuuskyselyjä. Hakusanoja (esim. "kaurajuoma 1l")
    etsitään ensisijaisesti tuotteen nimestä ja valmistajasta; vasta jos nimestä ei löydy,
    muista kentistä (ainesosat, kuvaukset). matchedIn kertoo kumpi. Käytä lyhyitä,
    tuotenimessä todennäköisesti esiintyviä sanoja. Tulos on tiivis yhteenveto; täydet tiedot
    get_product_details-työkalulla. Toimitusvarmuus ja hiilijalanjälki (kg CO2-ekv / kg)
    liitetään, kun ne ovat tiedossa. Suodattimet jättävät pois tuotteet, joilta tieto puuttuu.
    Poistetut tuotteet (deleted) jätetään aina pois."""
    if err := await _data_error():
        return err
    tokens = query.lower().split()
    if not tokens:
        return {"error": "query on tyhjä"}
    word_res = [re.compile(r"(?<!\w)" + re.escape(t)) for t in tokens]
    exact_res = [re.compile(r"(?<!\w)" + re.escape(t) + r"(?!\w)") for t in tokens]
    tiers: dict[str, list[tuple[tuple, str]]] = {"name": [], "other": [], "partial": []}
    for pid, item in _products.items():
        if item.get("deleted"):
            continue
        names, full = _index[pid]
        name_hits = sum(t in names for t in tokens)
        full_hits = sum(t in full for t in tokens)
        if full_hits == 0:
            continue
        if min_delivery_reliability is not None and _reliability.get(pid, -1) < min_delivery_reliability:
            continue
        if max_carbon_kg_per_kg is not None and _carbon.get(pid, float("inf")) > max_carbon_kg_per_kg:
            continue
        exact_hits = sum(bool(r.search(names)) for r in exact_res)
        word_hits = sum(bool(r.search(names)) for r in word_res)
        # järjestys: kokonaiset sanat nimessä, sanan alusta alkavat osumat, lyhyempi nimi
        key = (-exact_hits, -word_hits, -name_hits, -full_hits, len(names))
        tier = "name" if name_hits == len(tokens) else "other" if full_hits == len(tokens) else "partial"
        tiers[tier].append((key, pid))
    matched_in, chosen = next(((t, rows) for t, rows in tiers.items() if rows), ("none", []))
    chosen.sort()
    limit = max(1, min(limit, 50))
    return {
        "totalMatches": len(chosen),
        "matchedIn": matched_in,
        "products": [_summary(p) for _, p in chosen[:limit]],
    }


@mcp.tool()
async def data_status() -> dict:
    """Diagnostiikka: kuinka paljon staattista dataa latautui ja osuvatko toimitusvarmuus-
    ja hiilijalanjälkitiedostojen tuotetunnukset tuotedataan."""
    if err := await _data_error():
        return err
    ids = set(_products)
    return {
        "products": len(_products),
        "deletedProducts": sum(bool(p.get("deleted")) for p in _products.values()),
        "deliveryReliabilityRows": len(_reliability),
        "deliveryReliabilityMatchingProducts": len(ids & set(_reliability)),
        "carbonFootprintRows": len(_carbon),
        "carbonFootprintMatchingProducts": len(ids & set(_carbon)),
        "sampleProductIds": list(_products)[:3],
        "csvSamples": _raw_samples,
    }


@mcp.tool()
async def get_product_details(product_ids: list[str]) -> dict:
    """Palauttaa tuotteiden staattiset tiedot, toimitusvarmuuden ja hiilijalanjäljen (max 50 tuotetta)."""
    if err := await _data_error():
        return err
    return {"products": [_enrich(str(p)) for p in product_ids[:50]]}


@mcp.tool()
async def get_availability(product_ids: list[str], requested_date: str, customer: str = DEFAULT_CUSTOMER) -> dict:
    """Kertoo, voiko tuotteet toimittaa pyydettynä päivänä (requested_date, YYYY-MM-DD).

    Tulkinta: tyhjä scheduleLines = ei toimitettavissa; salesBlock true = ei voi tilata;
    Terminal-tuotteilla availableAmount on aina 999999 (oikea määrä ei ole tiedossa);
    availableDate voi poiketa pyydetystä päivästä; closingTime on tilauksen takaraja.
    Jokaisessa tuloksessa on valmis tulkinta: canOrder (voiko tuotteen tilata nyt),
    deliveryDate (milloin toimitus tulee), deliversOnRequestedDate (tuleeko pyydettynä päivänä),
    amountKnown, availableAmountTotal ja note (syy suomeksi). Tuote sopii tilaukseen vain, jos
    canOrder ja deliversOnRequestedDate ovat true. Luota näihin kenttiin raakadatan sijaan.
    Kysy vain etukäteen rajatuille tuotteille."""
    res = await _query("availability", product_ids, requested_date, customer)
    if "products" in res:
        res["products"] = [_interpret_availability(e, requested_date) for e in res["products"]]
    return res


@mcp.tool()
async def get_prices(product_ids: list[str], requested_date: str, customer: str = DEFAULT_CUSTOMER) -> dict:
    """Hakee tuotteiden hinnat toimituspäivälle (requested_date, YYYY-MM-DD).

    catalogPrice.value on veroton ja valueWithTax verollinen hinta myyntiyksikköä kohti;
    comparisonPrice on hinta per comparisonUnit (KG tai L); error true = hintaa ei löytynyt.
    Kysy vain etukäteen rajatuille tuotteille."""
    return await _query("price", product_ids, requested_date, customer)


# --------------------------------------------------------------------------- Käynnistys


class BearerAuth:
    """Puhdas ASGI-middleware: vaatii Authorization: Bearer <MCP_BEARER_TOKEN>."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and BEARER:
            sent = dict(scope["headers"]).get(b"authorization", b"").decode()
            if not hmac.compare_digest(sent, f"Bearer {BEARER}"):
                await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)


if __name__ == "__main__":
    if not API_KEY:
        raise SystemExit("Aseta VALIO_API_KEY.")
    if not BEARER:
        print("VAROITUS: MCP_BEARER_TOKEN puuttuu, palvelin on avoin kaikille, joilla on osoite.")
    # mcp 2.x: kuljetusasetukset annetaan streamable_http_app()-kutsulle.
    # host="0.0.0.0" -> ei localhost-rajattua DNS rebinding -suojausta (julkinen palvelin).
    app = mcp.streamable_http_app(stateless_http=True, host="0.0.0.0")
    uvicorn.run(BearerAuth(app), host="0.0.0.0", port=PORT)
