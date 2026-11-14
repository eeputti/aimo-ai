// Shared disk cache: a running demo must also see images fetched by `npm run images`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function imageCache(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '_meta.json');
  let meta = {}; let stamp = null;
  function refresh() {
    try {
      const s = fs.statSync(file);
      const next = `${s.ino}:${s.mtimeMs}:${s.size}`;
      if (next !== stamp) { meta = JSON.parse(fs.readFileSync(file, 'utf8')); stamp = next; }
    } catch { /* a new cache has no metadata yet */ }
  }
  return {
    get(id) { refresh(); return meta[id]; },
    put(id, value) {
      refresh();
      meta[id] = value;
      const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(meta));
      fs.renameSync(tmp, file);
      stamp = null;
      return value;
    },
  };
}
