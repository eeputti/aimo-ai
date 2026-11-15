import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the shipped browser script against controlled network responses and DOM events.
function page() {
  const elements = new Map(), tasks = new Map(), requests = [];
  let taskId = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: true, checked: false, disabled: false, listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; }, removeAttribute() {}, setAttribute() {}, focus() {}, blur() {} });
    return elements.get(id);
  };
  const document = { hidden: false, activeElement: null, getElementById: element, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, Date, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout(fn) { const id = ++taskId; tasks.set(id, fn); return id; }, clearTimeout(id) { tasks.delete(id); },
    fetch(url, init) { return new Promise(resolve => requests.push({ url, init, resolve })); } });
  vm.runInContext(fs.readFileSync(new URL('../public/landing.js', import.meta.url), 'utf8'), context);
  const submit = (id) => element(id).listeners.submit({ preventDefault() {} });
  const register = async (id = 'first') => {
    element('phone').value = '0401234567'; element('name').value = 'Test'; element('consent').checked = true;
    const action = submit('signup-form');
    requests.at(-1).resolve(Response.json({ id, token: id, status: 'linked' })); await action;
  };
  const nextPoll = () => { const [id, fn] = tasks.entries().next().value; tasks.delete(id); return fn(); };
  return { element, requests, register, nextPoll, submit };
}

test('a linked number explains manual verification and submitting a code never claims approval', async () => {
  const p = page(); await p.register();
  assert.match(p.element('status-detail').textContent, /tämä lomake ei lähetä koodia/);
  assert.equal(p.element('open-whatsapp').hidden, true);
  p.element('code').value = '12345';
  const action = p.submit('code-form');
  p.requests.at(-1).resolve(Response.json({ status: 'linked', codeSent: true })); await action;
  assert.equal(p.element('status-title').textContent, 'Koodi toimitettu Aimo-tiimille');
  assert.equal(p.element('open-whatsapp').hidden, true);
  const polling = p.nextPoll();
  p.requests.at(-1).resolve(new Response('', { status: 503 })); await polling;
  assert.equal(p.element('status-title').textContent, 'Koodi toimitettu Aimo-tiimille');
});

test('changing number during a pending request keeps the new registration polling and ignores the old response', async () => {
  const p = page(); await p.register('first');
  const oldPoll = p.nextPoll(), oldRequest = p.requests.at(-1);
  p.element('restart').listeners.click();
  await p.register('second');
  const newPoll = p.nextPoll(), newRequest = p.requests.at(-1);
  assert.equal(newRequest.url, '/api/signups/second');
  oldRequest.resolve(Response.json({ status: 'ready', chatUrl: 'https://wa.me/358400000000' })); await oldPoll;
  assert.equal(p.element('open-whatsapp').hidden, true);
  newRequest.resolve(Response.json({ status: 'ready', chatUrl: 'https://wa.me/358400000001' })); await newPoll;
  assert.equal(p.element('open-whatsapp').hidden, false);
  assert.equal(p.element('open-whatsapp').href, 'https://wa.me/358400000001');
});
