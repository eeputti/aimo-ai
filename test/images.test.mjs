import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createImageService } from '../server/images.mjs';
import { imageCache } from '../server/image-cache.mjs';
import { staticAssetHeaders } from '../server/static-assets.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-images-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/image-index.json'), JSON.stringify({ merkki1kgkerma: 'merkki-1-kg-kerma' }));
  return root;
}

test('a running resolver sees an externally warmed cache without restarting or dropping its own entries', async (t) => {
  const root = fixture(t); const dir = path.join(root, 'data/img');
  const serverCache = imageCache(dir); const warmerCache = imageCache(dir);
  serverCache.put('1', { miss: Date.now() });
  const resolver = createImageService({ root, catalog: () => { throw new Error('must use disk'); } });
  assert.equal(await resolver.resolveImage('1'), null);
  fs.writeFileSync(path.join(dir, '1.jpg'), 'cached photo');
  warmerCache.put('1', { file: '1.jpg', type: 'image/jpeg', source: 'fixture' });
  assert.equal((await resolver.resolveImage('1')).file, '1.jpg');
  serverCache.put('2', { miss: Date.now() });
  assert.equal(warmerCache.get('1').file, '1.jpg');
  assert.ok(warmerCache.get('2').miss);
});

test('concurrent requests share one supplier download and a later process uses the disk cache', async (t) => {
  const root = fixture(t); const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes('/toimitustukku/')) return new Response('<meta property="og:image" content="https://api.valioaimo.fi/medias/test.jpg">');
    assert.ok(url.startsWith('https://imgfly.scarabresearch.com/'));
    return new Response(Buffer.alloc(300), { headers: { 'content-type': 'image/jpeg' } });
  };
  const opts = { root, catalog: () => ({ get: () => ({ name: 'Merkki 1 kg kerma' }) }), fetcher };
  const resolver = createImageService(opts);
  const results = await Promise.all(Array.from({ length: 12 }, () => resolver.resolveImage('123')));
  assert.equal(calls.length, 2);
  assert.ok(results.every((r) => r.file === '123.jpg'));
  await createImageService({ ...opts, fetcher: () => { throw new Error('no network on cache hit'); } }).resolveImage('123');
  assert.equal(calls.length, 2);
});

test('supplier name matching completes before the GTIN fallback', async (t) => {
  const root = fixture(t); const calls = [];
  fs.writeFileSync(path.join(root, 'data/image-index.json'), JSON.stringify({ near: 'merkki-1-kg-kerma-purkki' }));
  const resolver = createImageService({ root, catalog: () => ({ get: () => ({ name: 'Merkki 1 kg kerma', gtin: '1234567890123' }) }), fetcher: async (url) => {
    calls.push(url);
    assert.ok(!url.includes('openfoodfacts'));
    return url.includes('/toimitustukku/')
      ? new Response('<meta property="og:image" content="https://api.valioaimo.fi/medias/test.jpg">')
      : new Response(Buffer.alloc(300), { headers: { 'content-type': 'image/jpeg' } });
  } });
  assert.equal((await resolver.resolveImage('123')).file, '123.jpg');
  assert.equal(calls.length, 2);
});

test('verified reference images bypass both a cached miss and catalogue lookup', async (t) => {
  const root = fixture(t); const assets = path.join(root, 'public/storefront-assets');
  fs.mkdirSync(path.join(assets, 'optimized'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'optimized/123.abcdefabcdef.webp'), 'local photo');
  fs.writeFileSync(path.join(assets, 'sources.json'), JSON.stringify({ assets: [{ file: 'optimized/123.abcdefabcdef.webp', derivedFrom: '123.png', mime: 'image/webp', source: 'fixture' }] }));
  imageCache(path.join(root, 'data/img')).put('123', { miss: Date.now() });
  const resolver = createImageService({ root, catalog: () => { throw new Error('must use local photo'); } });
  const hit = await resolver.resolveImage('123');
  assert.equal(hit.type, 'image/webp'); assert.equal(hit.directory, assets);
  assert.equal(await resolver.resolveImage('../secret'), null);
});

test('cached photos do not wait behind the four remote downloads', async (t) => {
  const root = fixture(t); const dir = path.join(root, 'data/img');
  const cache = imageCache(dir);
  fs.writeFileSync(path.join(dir, 'ready.jpg'), 'cached photo');
  cache.put('ready', { file: 'ready.jpg', type: 'image/jpeg', source: 'fixture' });
  let release;
  const gate = new Promise((r) => { release = r; });
  let downloads = 0;
  const resolver = createImageService({ root, catalog: () => ({ get: () => ({ name: 'Merkki 1 kg kerma' }) }), fetcher: async (url) => {
    if (url.includes('/toimitustukku/')) {
      downloads++; await gate;
      return new Response('<meta property="og:image" content="https://api.valioaimo.fi/medias/test.jpg">');
    }
    return new Response(Buffer.alloc(300), { headers: { 'content-type': 'image/jpeg' } });
  } });
  const jobs = ['1', '2', '3', '4', '5'].map(resolver.resolveImage);
  try {
    await new Promise(setImmediate);
    assert.equal(downloads, 4);
    assert.equal((await resolver.resolveImage('ready')).file, 'ready.jpg');
    assert.equal(downloads, 4);
  } finally { release(); await Promise.all(jobs); }
});

test('photos and fonts are cached with the correct MIME type; editable UI files stay fresh', () => {
  const stat = { size: 100, mtimeMs: 1000 };
  const photo = staticAssetHeaders('/optimized/123.abcdefabcdef.webp', stat);
  assert.equal(photo['content-type'], 'image/webp');
  assert.match(photo['cache-control'], /immutable/);
  assert.notEqual(photo.etag, staticAssetHeaders('/optimized/123.abcdefabcdef.webp', { ...stat, size: 101 }).etag);
  assert.equal(staticAssetHeaders('/product.jpg', stat)['content-type'], 'image/jpeg');
  assert.equal(staticAssetHeaders('/font.woff2', stat)['content-type'], 'font/woff2');
  for (const file of ['/index.html', '/aimo-ask.js', '/aimo-ask.css', '/storefront-data.json']) {
    assert.equal(staticAssetHeaders(file, stat)['cache-control'], 'no-store');
    assert.equal(staticAssetHeaders(file, stat).etag, undefined);
  }
});
