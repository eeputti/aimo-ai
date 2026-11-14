"""Testaa MCP-palvelimen työkalut oikealla datalla.

Käyttö (palvelin käynnissä toisessa ikkunassa):
  $env:MCP_BEARER_TOKEN = "<sama tunnus kuin palvelimella>"
  python test_tools.py [hakusana]

Valinnainen: $env:MCP_URL (oletus http://127.0.0.1:8000/mcp)
"""
import datetime
import json
import os
import sys

import httpx

URL = os.environ.get("MCP_URL", "http://127.0.0.1:8000/mcp")
TOKEN = os.environ.get("MCP_BEARER_TOKEN", "")
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
if TOKEN:
    HEADERS["Authorization"] = f"Bearer {TOKEN}"

_id = 0


def rpc(method: str, params: dict) -> dict:
    global _id
    _id += 1
    r = httpx.post(URL, headers=HEADERS, timeout=120,
                   json={"jsonrpc": "2.0", "id": _id, "method": method, "params": params})
    if r.status_code == 401:
        sys.exit("401 Unauthorized: MCP_BEARER_TOKEN puuttuu tai ei täsmää palvelimen tunnukseen.")
    r.raise_for_status()
    if r.headers.get("content-type", "").startswith("text/event-stream"):
        for line in r.text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:])
        raise RuntimeError(f"Tyhjä SSE-vastaus: {r.text[:300]}")
    return r.json()


def call(tool: str, **args):
    msg = rpc("tools/call", {"name": tool, "arguments": args})
    if "error" in msg:
        return {"JSONRPC-VIRHE": msg["error"]}
    res = msg["result"]
    if res.get("isError"):
        return {"TYÖKALUVIRHE": [c.get("text") for c in res.get("content", [])]}
    sc = res.get("structuredContent")
    if sc is not None:
        return sc.get("result", sc) if set(sc) == {"result"} else sc
    texts = [c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"]
    if len(texts) == 1:
        try:
            return json.loads(texts[0])  # dict-paluuarvot tulevat JSON-tekstinä
        except ValueError:
            return texts[0]
    return texts


def show(title: str, data, limit: int = 3000):
    print(f"\n=== {title} ===")
    txt = json.dumps(data, ensure_ascii=False, indent=2)
    print(txt if len(txt) <= limit else txt[:limit] + "\n… (lyhennetty)")


def next_weekday() -> str:
    d = datetime.date.today() + datetime.timedelta(days=1)
    while d.weekday() >= 5:
        d += datetime.timedelta(days=1)
    return d.isoformat()


def main():
    query = " ".join(sys.argv[1:]) or "maito"
    rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                       "clientInfo": {"name": "test_tools", "version": "1"}})

    show("ping", call("ping"))

    print("\nLadataan staattinen data (ensimmäinen kutsu voi kestää)...")
    show("data_status", call("data_status"))

    search = call("search_products", query=query, limit=8)
    show(f"search_products('{query}')", search)

    products = search.get("products", []) if isinstance(search, dict) else []
    if not products:
        print("\n!! Haku ei palauttanut tuotteita. Katso virhe yltä tai palvelimen ikkunasta.")
        return

    ids = [str(p["id"]) for p in products[:3]]
    date = next_weekday()

    show(f"get_product_details({ids[:1]})", call("get_product_details", product_ids=ids[:1]), limit=4000)
    show(f"get_prices({ids}, {date})", call("get_prices", product_ids=ids, requested_date=date))
    show(f"get_availability({ids}, {date})", call("get_availability", product_ids=ids, requested_date=date))
    show(f"quote({ids}, {date})", call("quote", product_ids=ids, requested_date=date), limit=6000)


if __name__ == "__main__":
    main()
