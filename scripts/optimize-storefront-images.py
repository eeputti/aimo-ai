"""Build small, fingerprinted WebP copies of the reference product images (Pillow).

Original source files and their checksums remain unchanged. Run with python3.
"""
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public/storefront-assets"
MANIFEST = ASSETS / "sources.json"
manifest = json.loads(MANIFEST.read_text())
entries = {a["file"]: a for a in manifest["assets"]}
prefix = "/storefront-assets/"
replacements = {}
before = after = 0


def optimize(url):
    global before, after
    if url in replacements:
        return replacements[url]
    if not url.startswith(prefix):
        return url
    rel = url.removeprefix(prefix)
    original = entries.get(rel, {}).get("derivedFrom", rel)
    source = entries[original]
    with Image.open(ASSETS / original) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((400, 400), Image.Resampling.LANCZOS)
        image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
        out = io.BytesIO()
        image.save(out, "WEBP", quality=82, method=6)
    data = out.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    target = f"optimized/{Path(original).stem}.{digest[:12]}.webp"
    (ASSETS / "optimized").mkdir(exist_ok=True)
    (ASSETS / target).write_bytes(data)
    entries[target] = {
        "file": target, "source": source["source"], "derivedFrom": original,
        "transform": "fit 400x400, WebP quality 82, preserve alpha",
        "bytes": len(data), "sha256": digest, "mime": "image/webp",
    }
    replacements[url] = prefix + target
    before += (ASSETS / original).stat().st_size
    after += len(data)
    return replacements[url]


def walk(value):
    if isinstance(value, list):
        return [walk(x) for x in value]
    if isinstance(value, dict):
        return {k: optimize(v) if k == "image" and isinstance(v, str) else walk(v) for k, v in value.items()}
    return value


for name in ["storefront-data.json", "storefront-cart-data.json"]:
    file = ROOT / "public" / name
    file.write_text(json.dumps(walk(json.loads(file.read_text())), ensure_ascii=False, indent=2) + "\n")
manifest["assets"] = list(entries.values())
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"{len(replacements)} product images: {before:,} -> {after:,} bytes ({100 * (1 - after / before):.1f}% smaller)")
