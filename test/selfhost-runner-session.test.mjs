import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRunnerCookie } from '../deploy/selfhost-demo/runner-session.mjs';

test('runner preserves original HMAC identities and explicit cart aliases across credential rotation', () => {
  const token = 'old-demo-runner-secret-for-a-unit-test';
  const cookie = createRunnerCookie({ runnerToken: token });
  const h = createHmac('sha256', token).update('owner').digest('hex');
  const sid = [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
  assert.equal(cookie('owner'), 'selfhost_demo=' + sid);
  const rotated = createRunnerCookie({ runnerToken: 'new-demo-runner-secret-for-a-unit-test', sessionAliases: {owner: sid} });
  assert.equal(rotated('owner'), cookie('owner'));
  assert.notEqual(rotated('other'), rotated('owner'));
  assert.notEqual(rotated('other'), cookie('other'));
});

test('runner rejects malformed and shared aliases before processing any jobs', () => {
  const cfg = { runnerToken: 'demo-runner-secret-for-a-unit-test' };
  const sid = '12345678-1234-1234-1234-123456789abc';
  for (const sessionAliases of [null, [], {owner:'invalid; cookie=bad'}, {owner:sid,other:sid}]) {
    assert.throws(() => createRunnerCookie({...cfg,sessionAliases}), /aliases|alias/);
  }
  assert.throws(() => createRunnerCookie({runnerToken:''}), /token/);
});
