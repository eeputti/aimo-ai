const target = new URL('/', location.origin);
for (const [key, value] of new URLSearchParams(location.search)) target.searchParams.set(key, value);
target.searchParams.set('shop', 'agent');
location.replace(target.pathname + target.search);
