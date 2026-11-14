"""Valio Aimo Junction -rajapinta MCP-palvelimeksi (Streamable HTTP).

Ympäristömuuttujat:
  VALIO_API_KEY      (pakollinen) Valio Aimon X-API-Key
  MCP_BEARER_TOKEN   (vahvasti suositeltu) palvelimen oma tunnus; vaaditaan
                     Authorization: Bearer <token> -otsakkeessa tai ?token=<token>
                     osoitteessa (claude.ai custom connector)
  VALIO_BASE_URL     oletus https://junction26.valioaimo.fi
  PORT               oletus 8000
  MAX_BATCH          tuotteita / kysely, oletus 100 (API sallii 1000)
  CACHE_TTL_SECONDS  saatavuus- ja hintavälimuisti, oletus 300
"""
import asyncio
import codecs
import csv
import datetime
import hmac
import io
import json
import os
import re
import time
import zlib
from typing import Any
from urllib.parse import parse_qs

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

INSTRUCTIONS = """Olet Valio Aimo -tukkupalvelun ostosagentti ravintoloille ja muille
ammattiasiakkaille. Asiakkaat ovat kiireisiä: vastaa lyhyesti ja aina samassa muodossa.

Työnkulku:
1. Toimituspäivä: jos käyttäjä ei kerro sitä, käytä seuraavaa arkipäivää ja mainitse se.
   Älä kysy erikseen, ellei pyyntö ole muuten epäselvä.
2. Hae jokainen tuote search_products-työkalulla lyhyillä hakusanoilla (esim. "rasvaton
   maito"). Valitse sopivin osuma itse; älä listaa hakutuloksia käyttäjälle.
3. Kutsu quote-työkalua KERRAN kaikille valituille tuotteille. Se palauttaa taulukon tiedot
   valmiiksi muotoiltuina ja hakee korvaavat tuotteet puuttuville. Käytä sen arvoja sellaisenaan.

Vastauksen muoto (ei mitään muuta ennen taulukkoa):

| Tuote | Aikaisin toimitus | Tilaa viimeistään | Hinta (alv 0) | Korvaava tuote |
|---|---|---|---|---|

- Tuote: tuotteen nimi lyhyesti (tuotenumero suluissa).
- Aikaisin toimitus = earliestDelivery, Tilaa viimeistään = orderDeadline, Hinta = price.
- Korvaava tuote: jos ok = true, "–". Jos ok = false, ensimmäinen substitutes-tuote muodossa
  "Nimi (id), toimitus, hinta". Jos korvaajia ei ole, kirjoita lyhyesti note ja "ei korvaajaa".
- Puuttuva tieto: "–". Älä keksi päivämääriä tai hintoja.

Taulukon alle enintään kaksi lyhyttä riviä, vain jos tarpeen: esim. "Toimitus 16.11. on
aiemmin kuin pyydetty", "Tarkista korvaajan allergeenit" tai lisävaihtoehdot korvaajiksi.
Ei johdantoa, ei toistoa, ei yhteenvetoa taulukon sisällöstä.

Jos käyttäjä painottaa vastuullisuutta tai toimitusvarmuutta, käytä search_products-suodattimia
max_carbon_kg_per_kg ja min_delivery_reliability. Vastaa käyttäjän kielellä; muulla kielellä
käännä myös sarakeotsikot."""

mcp = MCPServer("valio-aimo", instructions=INSTRUCTIONS)

# ---------------------------------------------------------------- HTTP-apurit


def _auth_headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY}


async def fetch_file(path: str) -> bytes:
    """Hakee latausaineiston tavuina. Seuraa uudelleenohjaukset käsin, jotta API-avainta
    ei lähetetä muille palvelimille."""
    base_host = httpx.URL(BASE_URL).host
    async with httpx.AsyncClient(timeout=120) as client:
        url = httpx.URL(BASE_URL + path)
        for _ in range(6):
            headers = _auth_headers() if url.host == base_host else {}
            r = await client.get(url, headers=headers, follow_redirects=False)
            if r.is_redirect:
                url = r.url.join(r.headers["location"])
                continue
            r.raise_for_status()
            # Linkki voi tulla pienenä JSON-vastauksena. Isoa aineistoa ei jäsennetä tässä,
            # koska se kaksinkertaistaisi muistinkäytön.
            if len(r.content) < 10_000:
                try:
                    data = r.json()
                    if isinstance(data, dict) and len(data) == 1:
                        link = next(iter(data.values()))
                        if isinstance(link, str) and link.startswith("http"):
                            url = httpx.URL(link)
                            continue
                except ValueError:
                    pass
            return r.content
    raise RuntimeError(f"Liian monta uudelleenohjausta: {path}")


# --------------------------------------------------------------- Staattinen data

ID_KEYS = ("productId", "product_id", "id", "code", "materialNumber", "sku", "itemNumber")
_products: dict[str, dict] = {}
_reliability: dict[str, float] = {}
_carbon: dict[str, float] = {}
# pid -> (nimet + valmistaja, hakuteksti: nimet, valmistaja, ainesosat, kuvaus), pienillä kirjaimilla
_index: dict[str, tuple[str, str]] = {}
# pid -> tuotteen tiedot lyhennettynä ja zlib-pakattuna JSONina (get_product_details).
# _products sisältää vain kevyet kentät, jotta palvelin mahtuu pieneen muistiin.
_details: dict[str, bytes] = {}
_raw_samples: dict[str, list[str]] = {}  # diagnostiikkaa varten: CSV-tiedostojen alkurivit
_loaded = False
_load_lock = asyncio.Lock()


def _iter_json_array_items(raw: bytes, chunk: int = 1 << 20):
    """Käy läpi JSON-taulukon alkiot yksi kerrallaan purkamatta koko tiedostoa kerralla.

    Toimii, kun aineisto on taulukko [{...}, ...] tai olio, jonka ensimmäinen taulukko
    sisältää tuotteet ({"products": [{...}, ...]}). Alkioiden oletetaan olevan olioita."""
    decoder = json.JSONDecoder()
    utf8 = codecs.getincrementaldecoder("utf-8")()
    off = 3 if raw.startswith(codecs.BOM_UTF8) else 0
    buf, i = "", 0

    def more() -> bool:
        nonlocal buf, i, off
        if off >= len(raw):
            return False
        end = off + chunk
        buf = buf[i:] + utf8.decode(raw[off:end], final=end >= len(raw))
        i, off = 0, end
        return True

    while (j := buf.find("[", i)) < 0:  # taulukon alku
        i = len(buf)
        if not more():
            return
    i = j + 1
    while True:
        while True:  # ohita välilyönnit ja pilkut
            while i < len(buf) and buf[i] in " \t\r\n,":
                i += 1
            if i < len(buf) or not more():
                break
        if i >= len(buf) or buf[i] == "]":
            return
        try:
            obj, end = decoder.raw_decode(buf, i)
        except json.JSONDecodeError:
            if not more():  # alkio jatkuu seuraavassa palassa; jos dataa ei ole, se on rikki
                raise
            continue
        yield obj
        i = end


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
        products_raw, rel_raw, co2_raw = await asyncio.gather(
            fetch_file("/api/products/download"),
            fetch_file("/api/delivery-reliability/download"),
            fetch_file("/api/carbon-footprint/download"),
        )
        rel_txt = rel_raw.decode("utf-8-sig", errors="replace")
        co2_txt = co2_raw.decode("utf-8-sig", errors="replace")
        # Tuotteet jäsennetään yksi kerrallaan: koko listaa ei koskaan ole muistissa olioina.
        for item in _iter_json_array_items(products_raw):
            if isinstance(item, dict) and (pid := _pid(item)):
                _store_product(pid, item)
        del products_raw
        _reliability.update(_parse_csv_map(rel_txt))
        _carbon.update(_parse_csv_map(co2_txt))
        _raw_samples["delivery-reliability"] = rel_txt.splitlines()[:3]
        _raw_samples["carbon-footprint"] = co2_txt.splitlines()[:3]
        _loaded = True


def _texts(item: dict, field: str, langs: tuple[str, ...] | None = None) -> list[str]:
    vals = (item.get("synkkaData") or {}).get(field) or []
    return [v["value"] for v in vals
            if isinstance(v, dict) and v.get("value") and (langs is None or v.get("language") in langs)]


def _store_product(pid: str, item: dict) -> None:
    """Tallentaa tuotteen kevyenä: skalaarikentät ja nimet muistiin, muut tiedot pakattuna."""
    names = _names(item)
    light = {k: v for k, v in item.items() if not isinstance(v, (dict, list))}
    light["synkkaData"] = {"names": [{"language": l, "value": v} for l, v in names.items()]}
    _products[pid] = light
    search_text = " ".join(
        [*names.values(), str(item.get("vendorName", "")),
         *_texts(item, "keyIngredients"), *_texts(item, "marketingTexts", ("fi",))]
    )
    _index[pid] = (
        f"{' '.join(names.values())} {item.get('vendorName', '')}".lower(),
        search_text[:3000].lower(),
    )
    _details[pid] = zlib.compress(json.dumps(_shorten(item), ensure_ascii=False).encode(), 6)


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
    if pid in _details:
        out = json.loads(zlib.decompress(_details[pid]))
    else:
        out = {"productId": pid, "error": "Tuotetta ei löydy tuotedatasta."}
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


UNKNOWN_AMOUNT = 999999  # rajapinta käyttää tätä, kun todellinen saldo ei ole tiedossa
WEEKDAYS_FI = ("ma", "ti", "ke", "to", "pe", "la", "su")


def _fmt_date(iso: str | None) -> str | None:
    """2026-11-16 -> 'ma 16.11.'"""
    if not iso:
        return None
    try:
        d = datetime.date.fromisoformat(iso[:10])
    except ValueError:
        return iso
    return f"{WEEKDAYS_FI[d.weekday()]} {d.day}.{d.month}."


def _fmt_deadline(ts: str | None) -> str | None:
    """2026-11-15T17:00:00+0200 -> 'su 15.11. klo 17.00' (rajapinnan oma aikavyöhyke, Suomen aika)."""
    t = _parse_ts(ts)
    if not t:
        return ts
    return f"{WEEKDAYS_FI[t.weekday()]} {t.day}.{t.month}. klo {t.hour}.{t.minute:02d}"


def _interpret_availability(entry: dict, requested_date: str) -> dict:
    """Lisää saatavuusriviin valmiin tulkinnan: canOrder, deliveryDate, deliversByRequestedDate,
    amountKnown, note."""
    lines = entry.get("scheduleLines") or []
    closing = _parse_ts(entry.get("closingTime"))
    now = datetime.datetime.now(datetime.timezone.utc)
    usable = [ln for ln in lines if not ln.get("salesBlock") and (ln.get("availableAmount") or 0) > 0]
    dates = sorted({ln["availableDate"] for ln in usable if ln.get("availableDate")})
    # 999999 = saldo ei tiedossa. Koskee kaikkia Terminal-tuotteita mutta myös osaa Stock-tuotteista.
    amount_known = bool(usable) and all((ln.get("availableAmount") or 0) < UNKNOWN_AMOUNT for ln in usable)

    reason = None
    if entry.get("salesBlock"):
        reason = "Myyntiesto: tuotetta ei voi tilata."
    elif not lines:
        reason = "Ei toimitettavissa."
    elif not usable:
        reason = "Loppu varastosta."
    elif closing and closing < now:
        reason = f"Tilausaika umpeutui {_fmt_deadline(entry['closingTime'])}."

    out = dict(entry)
    out["canOrder"] = reason is None
    if reason is None:
        out["deliveryDate"] = dates[0] if dates else requested_date
        # Aikaisempi toimitus kuin pyydetty on hyväksyttävä; myöhäisempi ei.
        out["deliversByRequestedDate"] = out["deliveryDate"] <= requested_date
        out["amountKnown"] = amount_known
        if amount_known:
            out["availableAmountTotal"] = sum(ln.get("availableAmount") or 0 for ln in usable)
        if not out["deliversByRequestedDate"]:
            reason = f"Aikaisin toimitus {_fmt_date(out['deliveryDate'])}, myöhemmin kuin pyydetty."
        elif out["deliveryDate"] < requested_date:
            reason = f"Toimitus jo {_fmt_date(out['deliveryDate'])}, aiemmin kuin pyydetty."
    if out["canOrder"] and not amount_known:
        reason = f"{reason} Saldo ei tiedossa." if reason else "Saatavilla, saldo ei tiedossa."
    out["note"] = reason or "Saatavilla."
    return out


# ------------------------------------------------------ Tiivis tarjous + korvaavat tuotteet

# Ominaisuudet, joiden pitää säilyä korvaavassa tuotteessa (allergeeni- ja ruokavaliovaatimukset).
KEEP_CLAIMS = ("laktoositon", "gluteeniton", "maidoton", "vegaaninen", "luomu", "kasvis")
_TOKEN_RE = re.compile(r"[a-zåäö]{3,}")


def _name_tokens(pid: str) -> set[str]:
    return set(_TOKEN_RE.findall(_name(_products.get(pid, {})).lower()))


def _substitute_candidates(pid: str, n: int = 8) -> list[str]:
    """Saman tuoteryhmän (category) tuotteet, joiden nimessä on samoja sanoja.
    Ruokavalio-ominaisuudet (laktoositon ym.) säilyvät aina."""
    item = _products.get(pid)
    if not item:
        return []
    cat = item.get("category")
    name = _name(item).lower()
    claims = [c for c in KEEP_CLAIMS if c in name]
    toks = _name_tokens(pid)
    scored = []
    for other, o in _products.items():
        if other == pid or o.get("deleted") or o.get("category") != cat:
            continue
        oname = _name(o).lower()
        if not oname or any(c not in oname for c in claims):
            continue
        overlap = len(toks & _name_tokens(other))
        if overlap:
            scored.append((-overlap, abs(len(oname) - len(name)), other))
    scored.sort()
    return [p for *_, p in scored[:n]]


def _fmt_eur(v: Any) -> str | None:
    if not isinstance(v, (int, float)):
        return None
    return f"{v:.2f}".replace(".", ",") + " €"


def _row(pid: str, avail: dict | None, price: dict | None, requested_date: str) -> dict:
    item = _products.get(pid, {})
    info = _interpret_availability(avail, requested_date) if avail else None
    unit = None
    if avail:
        unit = next((ln.get("salesUnit") for ln in avail.get("scheduleLines") or [] if ln.get("salesUnit")), None)
    unit = unit or item.get("salesUnit")
    row: dict[str, Any] = {"id": pid, "name": _name(item) or pid}
    if info:
        row["ok"] = info["canOrder"] and info.get("deliversByRequestedDate", False)
        row["earliestDelivery"] = _fmt_date(info.get("deliveryDate")) if info["canOrder"] else None
        row["orderDeadline"] = _fmt_deadline(avail.get("closingTime"))
        row["note"] = info["note"]
    else:
        row.update(ok=False, earliestDelivery=None, orderDeadline=None, note="Saatavuustieto puuttuu.")
    cp = (price or {}).get("catalogPrice") or {}
    if price and not price.get("error") and cp.get("value") is not None:
        row["price"] = f"{_fmt_eur(cp['value'])} / {unit}" if unit else _fmt_eur(cp["value"])
        row["priceWithTax"] = _fmt_eur(cp.get("valueWithTax"))
        cmp_ = (price.get("comparisonPrice") or {}).get("value")
        if cmp_ is not None and price.get("comparisonUnit"):
            row["comparisonPrice"] = f"{_fmt_eur(cmp_)} / {price['comparisonUnit']}"
    else:
        row["price"] = None
    return row


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
async def quote(product_ids: list[str], requested_date: str, customer: str = DEFAULT_CUSTOMER) -> dict:
    """PÄÄTYÖKALU vastaukseen. Palauttaa valituille tuotteille (max 20) valmiiksi muotoillut
    taulukon tiedot: earliestDelivery (aikaisin toimituspäivä), orderDeadline (viimeinen
    tilausajankohta), price (veroton hinta / myyntiyksikkö), priceWithTax ja note.

    Jos tuote ei ole toimitettavissa pyydettyyn päivään mennessä (ok = false), tulokseen
    haetaan automaattisesti enintään 3 saatavilla olevaa korvaavaa tuotetta samasta
    tuoteryhmästä (substitutes). Korvaajat säilyttävät ominaisuudet kuten laktoositon ja
    gluteeniton, mutta allergeenit on silti hyvä mainita tarkistettaviksi.
    requested_date muodossa YYYY-MM-DD."""
    if err := await _data_error():
        return err
    ids = list(dict.fromkeys(str(p) for p in product_ids))[:20]
    avail, prices = await asyncio.gather(
        _query("availability", ids, requested_date, customer),
        _query("price", ids, requested_date, customer),
    )
    for res in (avail, prices):
        if "error" in res:
            return res
    a_by = {str(e.get("productId")): e for e in avail["products"]}
    p_by = {str(e.get("productId")): e for e in prices["products"]}
    rows = [_row(p, a_by.get(p), p_by.get(p), requested_date) for p in ids]

    # Korvaavat tuotteet: yksi yhteinen kysely kaikille ehdokkaille rajapintakutsujen säästämiseksi.
    need = {r["id"]: _substitute_candidates(r["id"]) for r in rows if not r["ok"]}
    cand_ids = list(dict.fromkeys(c for cs in need.values() for c in cs if c not in ids))[:MAX_BATCH]
    if cand_ids:
        ca, cp = await asyncio.gather(
            _query("availability", cand_ids, requested_date, customer),
            _query("price", cand_ids, requested_date, customer),
        )
        ca_by = {str(e.get("productId")): e for e in ca.get("products", [])}
        cp_by = {str(e.get("productId")): e for e in cp.get("products", [])}
        for r in rows:
            if r["ok"]:
                continue
            subs = []
            for c in need.get(r["id"], []):
                sr = _row(c, ca_by.get(c), cp_by.get(c), requested_date)
                if sr["ok"]:
                    subs.append({k: sr.get(k) for k in ("id", "name", "earliestDelivery", "orderDeadline", "price")})
                if len(subs) == 3:
                    break
            r["substitutes"] = subs
    return {"requestedDate": requested_date, "requestedDateFormatted": _fmt_date(requested_date), "rows": rows}


@mcp.tool()
async def get_availability(product_ids: list[str], requested_date: str, customer: str = DEFAULT_CUSTOMER) -> dict:
    """Kertoo, voiko tuotteet toimittaa pyydettynä päivänä (requested_date, YYYY-MM-DD).

    Tulkinta: tyhjä scheduleLines = ei toimitettavissa; salesBlock true = ei voi tilata;
    Terminal-tuotteilla availableAmount on aina 999999 (oikea määrä ei ole tiedossa);
    availableDate voi poiketa pyydetystä päivästä; closingTime on tilauksen takaraja.
    Raakadataa; vastauksiin käytä mieluummin quote-työkalua.
    Jokaisessa tuloksessa on valmis tulkinta: canOrder (voiko tuotteen tilata nyt),
    deliveryDate (aikaisin toimitus), deliversByRequestedDate (ehtiikö pyydettyyn päivään
    mennessä), amountKnown, availableAmountTotal ja note (syy suomeksi). Tuote sopii tilaukseen
    vain, jos canOrder ja deliversByRequestedDate ovat true.
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
    """Puhdas ASGI-middleware. Hyväksyy tunnuksen joko otsakkeessa
    Authorization: Bearer <MCP_BEARER_TOKEN> tai osoitteessa ?token=<MCP_BEARER_TOKEN>
    (claude.ai:n custom connector ei salli omia otsakkeita)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") == "/healthz":
            # Pilvipalvelun terveystarkistus: ei tunnusta, ei paljasta mitään.
            await JSONResponse({"status": "ok"})(scope, receive, send)
            return
        if scope["type"] == "http" and BEARER:
            header = dict(scope["headers"]).get(b"authorization", b"")
            query = parse_qs(scope.get("query_string", b"").decode("latin-1")).get("token", [""])[0]
            ok = hmac.compare_digest(header, f"Bearer {BEARER}".encode()) or hmac.compare_digest(
                query.encode(), BEARER.encode()
            )
            if not ok:
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
