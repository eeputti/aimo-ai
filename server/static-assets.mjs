import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export function staticAssetHeaders(file, stat) {
  const ext = path.extname(file);
  const cacheable = /^(?:image\/|font\/)/.test(TYPES[ext] || '');
  const fingerprinted = /\.[a-f0-9]{12}\.webp$/.test(file);
  return {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': cacheable ? (fingerprinted ? 'public, max-age=31536000, immutable' : 'public, max-age=3600') : 'no-store',
    ...(cacheable ? { etag: `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"` } : {}),
  };
}
