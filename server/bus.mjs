// Pieni tapahtumaväylä: syvä agentti ja nopeat agentit julkaisevat tilansa, palvelin välittää ne selaimelle SSE:nä.
const subscribers = new Set();
export function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
export function publish(type, data = {}) { for (const fn of subscribers) { try { fn({ type, ...data, at: Date.now() }); } catch { /* yksittäinen kuuntelija ei saa kaataa muita */ } } }
