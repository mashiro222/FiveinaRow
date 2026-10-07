import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineClient } from '../src/online-client.js';

const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100_000 });
  const saved = { WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
  const storage = new Map(), sockets = [];
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; this.messages = []; sockets.push(this); }
    send(raw) {
      const data = JSON.parse(raw); this.messages.push(data);
      if (data.type === 'ping') this.message({ type: 'ack', requestId: data.requestId, serverNow: Date.now() });
    }
    close() { this.closed = true; this.onclose?.({ code: 1000 }); }
    fail() { this.onerror?.({}); }
    message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    welcome(room = null, id = 'player') {
      this.onopen?.();
      this.message({ type: 'welcome', id, token: 'session-token', room, serverNow: Date.now() });
    }
  };
  const client = new OnlineClient(() => {});
  t.after(() => {
    client.stop();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const tick = async ms => { t.mock.timers.tick(ms); await flush(); };
  return { client, sockets, storage, tick };
}

test('a cold host can take a full minute; the original connect waits for welcome', async t => {
  const f = fixture(t); let connected = false;
  const connection = f.client.connect('wss://example.com/room').then(() => connected = true);
  await f.tick(60_000);
  assert.equal(connected, false); assert.equal(f.sockets.length, 1);
  f.sockets[0].welcome(); await connection;
  assert.equal(f.client.status, 'connected'); assert.equal(f.client.connecting, null);
});

test('initial failures retry automatically and callers share the same connection', async t => {
  const f = fixture(t);
  const first = f.client.connect('wss://example.com/room');
  const second = f.client.connect('wss://example.com/room');
  f.sockets[0].fail(); await flush();
  assert.equal(f.client.status, 'waking');
  await f.tick(1000); assert.equal(f.sockets.length, 2);
  f.sockets[1].fail(); await flush(); await f.tick(2000);
  f.sockets[2].welcome(); await Promise.all([first, second]);
  assert.equal(f.client.status, 'connected'); assert.equal(f.client.retry, 0);
});

test('an unreachable service fails after two minutes and stops retrying', async t => {
  const f = fixture(t);
  const rejected = assert.rejects(f.client.connect('wss://example.com/room'), /两分钟/);
  await f.tick(70_000); await f.tick(1000); await f.tick(49_000);
  await rejected;
  assert.equal(f.client.status, 'failed'); assert.equal(f.client.connecting, null);
  const attempts = f.sockets.length; await f.tick(120_000);
  assert.equal(f.sockets.length, attempts); assert.ok(f.sockets.every(socket => socket.closed));
});

test('cancel while waiting for a cold host settles the promise and ignores late messages', async t => {
  const f = fixture(t);
  const rejected = assert.rejects(f.client.connect('wss://example.com/room'), /取消/);
  f.client.stop(); await rejected; f.sockets[0].welcome({ code: '9999' });
  await f.tick(120_000);
  assert.equal(f.client.status, 'idle'); assert.equal(f.client.room, null); assert.equal(f.sockets.length, 1);
});

test('switching services during retry cancels the old operation without clearing the new one', async t => {
  const f = fixture(t);
  const old = assert.rejects(f.client.connect('wss://old.example/room'), /取消/);
  f.sockets[0].fail(); await flush();
  const next = f.client.connect('wss://new.example/room');
  await old; assert.ok(f.client.connecting);
  f.sockets[0].welcome({ code: '9999' }, 'old-player');
  f.sockets[1].welcome(null, 'new-player'); await next; await f.tick(10_000);
  assert.equal(f.client.id, 'new-player'); assert.equal(f.client.url, 'wss://new.example/room');
  assert.equal(f.sockets.length, 2);
});

test('reconnection reuses the session and applies the server snapshot, including a cleared room', async t => {
  const f = fixture(t), room = { code: '1234', moves: [112] };
  const initial = f.client.connect('wss://example.com/room'); f.sockets[0].welcome(room); await initial;
  f.sockets[0].close(); assert.equal(f.client.status, 'disconnected'); await f.tick(1000);
  f.sockets[1].welcome(room); await flush();
  assert.equal(f.sockets[1].messages[0].token, 'session-token'); assert.deepEqual(f.client.room, room);
  f.sockets[1].close(); await f.tick(1000); f.sockets[2].welcome(null); await flush();
  assert.equal(f.client.room, null); assert.equal(f.client.status, 'connected');
});

test('a replaced session does not retry or take over the other window', async t => {
  const f = fixture(t);
  const initial = f.client.connect('wss://example.com/room'); f.sockets[0].welcome(); await initial;
  f.sockets[0].onclose({ code: 4001 }); await f.tick(120_000);
  assert.equal(f.client.status, 'replaced'); assert.equal(f.sockets.length, 1);
});
