import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceSession } from '../public/aimo-voice.js';

function fixture(options = {}) {
  const instances = []; const timers = new Map(); let id = 0;
  const states = []; const texts = []; const commits = []; const levels = [];
  const tracks = [{ stops: 0, stop() { this.stops++; } }];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    result(parts) { this.onresult?.({ results: parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) }); }
    end() { this.onend?.(); }
  }
  const env = {
    isSecureContext: true, SpeechRecognition: Recognition, navigator: {},
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; },
    clearTimeout(key) { timers.delete(key); }, cancelAnimationFrame() {},
    ...options.env,
  };
  const session = createVoiceSession({ env,
    onState: (state, message) => states.push({ state, message }),
    onText: (text) => texts.push(text), onLevel: (level) => levels.push(level),
    onCommit: (text) => { commits.push(text); return options.commit?.(text); },
  });
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  const run = (ms) => { for (const [key, timer] of [...timers]) if (timer.ms === ms) { timers.delete(key); timer.fn(); } };
  return { env, session, instances, timers, states, texts, commits, levels, tracks, flush, run };
}

test('sanelu päivittää välituloksia, odottaa Valmis-toimintoa ja tulkitsee kerran', async () => {
  const f = fixture(); f.session.start();
  const rec = f.instances[0];
  assert.equal(rec.lang, 'fi-FI'); assert.equal(rec.continuous, true);
  rec.result([['20 litraa kermaa', true], ['ja viisi kiloa', false]]);
  rec.result([['20 litraa kermaa', true], ['ja viisi kiloa voita perjantaiksi', true]]);
  assert.equal(f.texts.at(-1), '20 litraa kermaa ja viisi kiloa voita perjantaiksi');
  assert.deepEqual(f.commits, []);
  f.session.stop();
  assert.equal(f.session.state, 'stopping'); assert.equal(rec.stopped, true);
  rec.end(); await f.flush(); f.run(1500);
  assert.deepEqual(f.commits, ['20 litraa kermaa ja viisi kiloa voita perjantaiksi']);
  assert.equal(f.session.state, 'done'); assert.equal(f.timers.size, 0);
});

test('selaimen katkaisema jakso jatkuu ilman tuplarivejä', async () => {
  const f = fixture(); f.session.start();
  f.instances[0].result([['20 litraa kermaa', true]]); f.instances[0].end();
  f.run(250);
  assert.equal(f.instances.length, 2);
  f.instances[1].result([['ja 5 kiloa voita', true]]);
  f.session.stop(); f.instances[1].end(); await f.flush();
  assert.deepEqual(f.commits, ['20 litraa kermaa ja 5 kiloa voita']);
});

test('peruutus hylkää myöhäiset tulokset ja tulkinnan', async () => {
  const f = fixture(); f.session.start();
  const rec = f.instances[0]; const lateResult = rec.onresult; const lateEnd = rec.onend;
  rec.result([['5 kg voita', true]]); f.session.stop(); f.session.cancel();
  lateResult({ results: [] }); lateEnd(); f.run(1500); await f.flush();
  assert.equal(f.session.state, 'idle'); assert.equal(rec.aborted, true);
  assert.deepEqual(f.commits, []); assert.equal(f.timers.size, 0);
});

test('peruutettu mikrofonilupapyyntö ei jätä myöhemmin saatua ääniraitaa päälle', async () => {
  let resolve;
  const f = fixture({ env: { navigator: { mediaDevices: { getUserMedia: () => new Promise((r) => { resolve = r; }) } }, AudioContext: class {} } });
  f.session.start(); f.session.cancel();
  resolve({ getTracks: () => f.tracks }); await f.flush();
  assert.equal(f.tracks[0].stops, 1); assert.equal(f.session.state, 'idle');
});

test('äänimittari mittaa oikeaa signaalia ja vapauttaa mikrofonin lopetuksessa', async () => {
  let closed = 0;
  class Audio {
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(160); } }; }
    createMediaStreamSource() { return { connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { closed++; return Promise.resolve(); }
  }
  const f = fixture({ env: { AudioContext: Audio, navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => f.tracks }) } }, requestAnimationFrame: () => 1 } });
  f.session.start(); await f.flush();
  assert.ok(f.levels.some((level) => level > 0));
  f.session.stop(); assert.equal(f.tracks[0].stops, 1); assert.equal(closed, 1);
  f.session.cancel();
});

test('estetty lupa, verkkovirhe ja puuttuva selaintuki jättävät selkeän virhetilan', () => {
  for (const error of ['not-allowed', 'network', 'audio-capture']) {
    const f = fixture(); f.session.start(); f.instances[0].onerror({ error });
    assert.equal(f.session.state, 'error'); assert.ok(f.states.at(-1).message.length > 20);
    assert.equal(f.timers.size, 0); assert.deepEqual(f.commits, []);
  }
  for (const env of [{ SpeechRecognition: undefined }, { isSecureContext: false }]) {
    const f = fixture({ env }); f.session.start();
    assert.equal(f.session.state, 'error'); assert.equal(f.instances.length, 0);
  }
});

test('hiljaisuus, puuttuva end-tapahtuma ja tulkinnan peruutus päättyvät hallitusti', async () => {
  const silent = fixture(); silent.session.start(); silent.session.stop(); silent.run(1500);
  assert.equal(silent.session.state, 'error'); assert.deepEqual(silent.commits, []);
  let resolve;
  const f = fixture({ commit: () => new Promise((r) => { resolve = r; }) });
  f.session.start(); f.instances[0].result([['5 kg voita', false]]);
  f.session.stop(); f.run(1500);
  assert.equal(f.session.state, 'processing');
  f.session.cancel(); resolve(true); await f.flush();
  assert.equal(f.session.state, 'idle');
});

test('liian pitkää ostoslistaa ei lähetetä palvelimen hiljaa katkaistavaksi', () => {
  const f = fixture(); f.session.start();
  f.instances[0].result([['voita '.repeat(101), true]]);
  f.session.stop(); f.instances[0].end();
  assert.equal(f.session.state, 'error'); assert.match(f.states.at(-1).message, /600/);
  assert.deepEqual(f.commits, []);
});
