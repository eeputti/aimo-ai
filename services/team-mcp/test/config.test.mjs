import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
test('local defaults are independent of the storefront; public URLs and ports are validated', () => {
  const local = config({}); assert.equal(local.port, 4750); assert.equal(local.host, '127.0.0.1');
  assert.ok(local.db.endsWith('/services/team-mcp/data/team-mcp.db'));
  const cloud = config({ PORT: '8080', TEAM_MCP_PORT: '4750', TEAM_MCP_HOST: '0.0.0.0', TEAM_MCP_PUBLIC_URL: 'https://team.example' });
  assert.equal(cloud.port, 8080); assert.equal(cloud.url.origin, 'https://team.example');
  for (const url of ['http://public.example', 'https://user:password@team.example', 'https://team.example/subpath', 'https://team.example?query=1']) assert.throws(() => config({ TEAM_MCP_PUBLIC_URL: url }));
  assert.throws(() => config({ TEAM_MCP_PORT: 'bad' }));
});
