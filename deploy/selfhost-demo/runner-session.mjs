import { createHmac } from 'node:crypto';

// Explicit aliases allow a private runner credential to rotate without changing
// existing cart identities. Pass aliases only through hidden runtime stdin.
export function createRunnerCookie({ runnerToken, sessionAliases = {} }) {
  if (typeof runnerToken !== 'string' || runnerToken.length < 24) throw new Error('Invalid runner token');
  if (!sessionAliases || typeof sessionAliases !== 'object' || Array.isArray(sessionAliases)) throw new Error('Invalid session aliases');
  const aliases = new Map(Object.entries(sessionAliases));
  const used = new Set();
  for (const [user, sid] of aliases) {
    if (!user || typeof sid !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sid) || used.has(sid)) throw new Error('Invalid or shared session alias');
    used.add(sid);
  }
  return (user) => {
    if (aliases.has(user)) return `selfhost_demo=${aliases.get(user)}`;
    const h = createHmac('sha256', runnerToken).update(user).digest('hex');
    return 'selfhost_demo=' + [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
  };
}
