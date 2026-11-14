import crypto from 'node:crypto';
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError, InvalidScopeError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { digest, secret } from './store.mjs';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const SCOPES = ['team.read', 'team.write'];
export function createAuth(store, baseUrl, redirectOrigins) {
  const resource = new URL('/mcp', baseUrl).href;
  const records = store.records;
  const validGrant = (grant, client) => grant && grant.clientId === client.client_id && store.member(grant.memberId) && store.currentKeyHash(grant.memberId) === grant.keyHash;
  function tokens(grant) {
    const accessToken = secret(); const refreshToken = secret();
    const identity = { memberId: grant.memberId, keyHash: grant.keyHash, scopes: grant.scopes, clientId: grant.clientId };
    records.set('access', accessToken, { ...identity, expiresAt: Math.floor((store.now() + 3600_000) / 1000) }, store.now() + 3600_000);
    records.set('refresh', refreshToken, identity, store.now() + 7 * 86400_000);
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshToken, scope: grant.scopes.join(' ') };
  }
  const provider = {
    clientsStore: {
      getClient: (id) => records.get('client', id) || undefined,
      registerClient: async (client) => {
        if (!client.redirect_uris?.length || client.redirect_uris.length > 5) throw new InvalidClientMetadataError('Provide 1–5 redirect URIs');
        for (const uri of client.redirect_uris) {
          let url; try { url = new URL(uri); } catch { throw new InvalidClientMetadataError('Invalid redirect URI'); }
          const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
          if (url.username || url.password || url.hash || !(url.protocol === 'https:' && redirectOrigins.includes(url.origin) || url.protocol === 'http:' && loopback)) throw new InvalidClientMetadataError('Redirect origin is not allowed by this server');
        }
        if ((client.grant_types || []).some((g) => !['authorization_code', 'refresh_token'].includes(g))) throw new InvalidClientMetadataError('Unsupported grant type');
        if ((client.response_types || []).some((r) => r !== 'code')) throw new InvalidClientMetadataError('Only code responses are supported');
        const full = { ...client, client_id: client.client_id || crypto.randomUUID(), client_id_issued_at: Math.floor(store.now() / 1000) };
        records.set('client', full.client_id, full, store.now() + 365 * 86400_000);
        return full;
      },
    },
    authorize: async (client, params, res) => {
      const scopes = params.scopes?.length ? params.scopes : SCOPES;
      if (scopes.some((s) => !SCOPES.includes(s))) throw new InvalidScopeError('Unknown scope');
      if (params.resource && params.resource.href !== resource) throw new InvalidRequestError('Wrong MCP resource');
      if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError('PKCE S256 is required');
      const request = secret(); const cookie = secret();
      records.set('pending', request, { clientId: client.client_id, redirectUri: params.redirectUri, state: params.state, codeChallenge: params.codeChallenge, scopes, cookieHash: digest(cookie) }, store.now() + 10 * 60_000);
      res.cookie('team_mcp_consent', cookie, { httpOnly: true, secure: baseUrl.protocol === 'https:', sameSite: 'lax', path: '/consent', maxAge: 10 * 60_000 });
      res.redirect('/consent?request=' + encodeURIComponent(request));
    },
    challengeForAuthorizationCode: async (client, code) => {
      const grant = records.get('code', code);
      if (!validGrant(grant, client)) throw new InvalidGrantError('Invalid authorization code');
      return grant.codeChallenge;
    },
    exchangeAuthorizationCode: async (client, code, verifier, redirectUri, requestedResource) => {
      return store.tx(() => {
        const grant = records.get('code', code);
        if (!validGrant(grant, client) || grant.redirectUri !== redirectUri || requestedResource && requestedResource.href !== resource || verifier !== undefined && (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128 || crypto.createHash('sha256').update(verifier).digest('base64url') !== grant.codeChallenge)) throw new InvalidGrantError('Invalid authorization code or PKCE verifier');
        records.delete('code', code); return tokens(grant);
      });
    },
    exchangeRefreshToken: async (client, refresh, scopes, requestedResource) => {
      return store.tx(() => {
        const grant = records.get('refresh', refresh);
        if (!validGrant(grant, client) || scopes?.some((s) => !grant.scopes.includes(s)) || requestedResource && requestedResource.href !== resource) throw new InvalidGrantError('Invalid refresh token');
        records.delete('refresh', refresh); return tokens({ ...grant, scopes: scopes?.length ? scopes : grant.scopes });
      });
    },
    verifyAccessToken: async (token) => {
      const direct = store.authenticate(token);
      const grant = direct ? { memberId: direct.id, keyHash: direct.keyHash, scopes: SCOPES, clientId: 'member-key', expiresAt: Math.floor(direct.keyExpires / 1000) } : records.get('access', token);
      if (!grant || !store.member(grant.memberId) || store.currentKeyHash(grant.memberId) !== grant.keyHash) throw new InvalidTokenError('Invalid or revoked team credential');
      return { token, expiresAt: grant.expiresAt, clientId: grant.clientId, scopes: grant.scopes, resource: new URL(resource), extra: { memberId: grant.memberId } };
    },
    revokeToken: async (client, request) => {
      for (const kind of ['access', 'refresh']) { const grant = records.get(kind, request.token); if (grant?.clientId === client.client_id) records.delete(kind, request.token); }
    },
  };
  function pendingRequest(req) {
    const request = req.method === 'POST' ? req.body?.request : req.query.request;
    if (typeof request !== 'string' || request.length > 100) return null;
    const pending = records.get('pending', request);
    const cookie = /(?:^|;\s*)team_mcp_consent=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '';
    return pending && digest(cookie) === pending.cookieHash ? { request, pending } : null;
  }
  const consentHeaders = (res, callbackOrigin = '') => {
    res.set({ 'cache-control': 'no-store', 'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`, 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff' });
  };
  function page(req, res, error = '') {
    consentHeaders(res);
    const flow = pendingRequest(req);
    if (!flow) { res.status(400).send('Authorization request expired. Start again from your MCP client.'); return; }
    const { request, pending } = flow; consentHeaders(res, new URL(pending.redirectUri).origin); const client = records.get('client', pending.clientId);
    res.type('html').send(`<!doctype html><html lang="fi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tiimi-MCP – yhdistä avustaja</title><style>body{font:17px/1.5 system-ui;max-width:580px;margin:60px auto;padding:20px}input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:10px 0}small{overflow-wrap:anywhere}label{display:block}</style><h1>Yhdistä avustaja tiimin palvelimeen</h1><p>Sovellus: <b>${esc(client?.client_name || pending.clientId)}</b><br><small>Paluuosoite: ${esc(pending.redirectUri)}</small></p><p>Oikeudet: ${esc(pending.scopes.join(', '))}. Tunnus rajaa käytettävissä olevat projektit. Viestien kirjoittaminen ei käynnistä muiden avustajien keskusteluja.</p><p role="alert">${esc(error)}</p><form method="post" action="/consent"><input type="hidden" name="request" value="${esc(request)}"><label>Ylläpitäjältä saamasi oma tiimiavain<input type="password" name="key" required maxlength="300" autocomplete="off"></label><button name="decision" value="allow">Salli yhteys</button><button name="decision" value="deny">Peruuta</button></form></html>`);
  }
  function consent(req, res) {
    consentHeaders(res);
    if (req.headers.origin !== baseUrl.origin) { res.status(403).send('Invalid form origin'); return; }
    const flow = pendingRequest(req);
    if (!flow) { res.status(400).send('Authorization request expired'); return; }
    const { request, pending } = flow;
    consentHeaders(res, new URL(pending.redirectUri).origin);
    if (req.body.decision === 'deny') {
      records.delete('pending', request);
      const redirect = new URL(pending.redirectUri); redirect.searchParams.set('error', 'access_denied'); if (pending.state) redirect.searchParams.set('state', pending.state); res.redirect(redirect.href); return;
    }
    const member = store.authenticate(req.body.key);
    if (!member || req.body.decision !== 'allow') { res.status(401); page(req, res, 'Virheellinen tai käytöstä poistettu tiimiavain.'); return; }
    const code = secret();
    store.tx(() => { records.delete('pending', request); records.set('code', code, { ...pending, memberId: member.id, keyHash: member.keyHash }, store.now() + 60_000); });
    res.clearCookie('team_mcp_consent', { path: '/consent', secure: baseUrl.protocol === 'https:', httpOnly: true, sameSite: 'lax' });
    const redirect = new URL(pending.redirectUri); redirect.searchParams.set('code', code); if (pending.state) redirect.searchParams.set('state', pending.state); res.redirect(redirect.href);
  }
  return { provider, page, consent, resource };
}
