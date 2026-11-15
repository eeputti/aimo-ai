// Public page reader. DNS is checked at every redirect and the HTTPS socket uses that
// exact address, so a second DNS lookup cannot redirect the request into the LAN.
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(address, prefix);
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blocked.addSubnet(address, prefix, 'ipv6');
const failure = (code) => Object.assign(new Error(code), { code });

export function publicAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function pageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure('LINK_URL'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !host.includes('.') && !isIP(host) || /(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/i.test(host)
    || (isIP(host) && !publicAddress(host)) || value.length > 2000) throw failure('LINK_URL');
  url.hash = '';
  return url;
}

export function messageLinks(text) {
  const found = String(text || '').match(/(?:https?:\/\/|www\.)[^\s<>"\u0000-\u001f]+/giu) || [];
  return [...new Set(found.map((s) => s.replace(/[.,!?;:]+$/u, '').replace(/[)\]}]+$/u, ''))
    .map((s) => s.startsWith('www.') ? `https://${s}` : s))];
}

function abortable(work, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(failure('LINK_TIMEOUT'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// No cookies, credentials, shared connection pool, JavaScript or automatic redirects.
export function requestPage(url, { address, family, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', agent: false, signal,
      headers: { accept: 'text/html,application/xhtml+xml,text/plain', 'accept-encoding': 'identity', 'user-agent': 'Aimo-LinkReader/1.0' },
      lookup: (_host, options, callback) => options.all ? callback(null, [{ address, family }]) : callback(null, address, family),
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        resolve({ status: res.statusCode, location: res.headers.location }); res.destroy(); return;
      }
      const type = String(res.headers['content-type'] || '');
      if (res.statusCode !== 200 || !/^(?:text\/(?:html|plain)|application\/xhtml\+xml)\b/i.test(type)
        || !['', 'identity'].includes(String(res.headers['content-encoding'] || '').toLowerCase())) {
        reject(failure('LINK_CONTENT')); res.destroy(); return;
      }
      if (Number(res.headers['content-length']) > maxBytes) { reject(failure('LINK_SIZE')); res.destroy(); return; }
      const chunks = []; let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { reject(failure('LINK_SIZE')); res.destroy(); } else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: 200, type, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', aring: 'å', Aring: 'Å', frac12: '1/2', frac14: '1/4', frac34: '3/4' };
export const decodeEntities = (s) => String(s).replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, key) => {
  if (key[0] !== '#') return entities[key] ?? all;
  const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
});
const plain = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu, '').replace(/\s+/gu, ' ').trim();

export function extractPage(body, type = 'text/html') {
  let charset = type.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(charset).decode(body); } catch { charset = 'utf-8'; html = new TextDecoder(charset).decode(body); }
  if (/^text\/plain\b/i.test(type)) return { title: '', text: plain(html).slice(0, 18000), recipes: [] };
  const title = plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '').slice(0, 180);
  const recipes = [];
  const visit = (node, depth = 0) => {
    if (!node || depth > 12 || recipes.length >= 4) return;
    if (Array.isArray(node)) { node.slice(0, 100).forEach((n) => visit(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    if ([node['@type']].flat().some((t) => /(?:^|\/)Recipe$/.test(t))) {
      recipes.push({ name: plain(node.name || '').slice(0, 180), yield: plain([node.recipeYield].flat().filter((v) => typeof v === 'string' || typeof v === 'number').join(', ')).slice(0, 120),
        ingredients: [node.recipeIngredient].flat().filter((v) => typeof v === 'string').slice(0, 40).map((v) => plain(v).slice(0, 240)) });
    }
    Object.values(node).slice(0, 100).forEach((n) => visit(n, depth + 1));
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Invalid structured data is ignored. */ }
  }
  const withoutNoise = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const main = withoutNoise.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1] || withoutNoise;
  return { title, text: plain(main).slice(0, 18000), recipes };
}

export function createPageReader({ resolve = lookup, request = requestPage, timeoutMs = 12000, maxBytes = 1_000_000 } = {}) {
  return async function readPage(value) {
    const signal = AbortSignal.timeout(timeoutMs);
    let url = pageUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await abortable(resolve(host, { all: true, verbatim: true }), signal);
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw failure('LINK_ADDRESS');
      const response = await abortable(request(url, { ...addresses[0], signal, maxBytes }), signal);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location || hop === 3) throw failure('LINK_REDIRECT');
        url = pageUrl(new URL(response.location, url).href); continue;
      }
      if (response.status !== 200 || !response.body || response.body.length > maxBytes) throw failure('LINK_CONTENT');
      const page = extractPage(response.body, response.type);
      if (page.text.length < 30 && !page.recipes.some((r) => r.ingredients.length)) throw failure('LINK_EMPTY');
      return { url: url.href, ...page };
    }
    throw failure('LINK_REDIRECT');
  };
}

export const readPublicPage = createPageReader();
