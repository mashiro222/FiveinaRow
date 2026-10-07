// Public deployment smoke test. Uses only the normal game protocol.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { normalizeServer } from '../src/online-client.js';

const url = normalizeServer(process.argv[2] || '');
const health = new URL(url); health.protocol = health.protocol === 'wss:' ? 'https:' : 'http:'; health.pathname = '/health';
const clients = [];
let exitCode = 0;
async function connect(token) {
  const ws = new WebSocket(url, { handshakeTimeout: 90_000 });
  const pending = new Map(), listeners = new Set();
  let sequence = 0, room = null, identity;
  const client = { ws, pending, get room() { return room; } };
  clients.push(client);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Room handshake timed out')), 95_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token })));
    ws.on('message', raw => {
      const data = JSON.parse(raw);
      if (data.type === 'welcome') { clearTimeout(timer); room = data.room; identity = data; resolve(); }
      if (data.type === 'state') { room = data.room; for (const check of listeners) check(); }
      const waiter = pending.get(data.requestId);
      if (waiter && ['ack', 'error'].includes(data.type)) { pending.delete(data.requestId); waiter.resolve(data); }
    });
    ws.on('error', error => { clearTimeout(timer); reject(error); });
    ws.on('close', () => { clearTimeout(timer); reject(new Error('Socket closed before welcome')); for (const p of pending.values()) p.reject(new Error('Connection closed')); pending.clear(); });
  });
  await ready;
  client.identity = identity;
  client.send = (type, fields = {}) => new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Request timed out: ${type}`)); }, 8000);
    pending.set(requestId, { resolve: data => { clearTimeout(timer); resolve(data); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ ...fields, type, requestId }));
  });
  client.wait = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(check); reject(new Error('Room update timed out')); }, 8000);
    const check = () => { if (predicate(room)) { clearTimeout(timer); listeners.delete(check); resolve(room); } };
    listeners.add(check); check();
  });
  return client;
}
async function ack(client, type, fields) { assert.equal((await client.send(type, fields)).type, 'ack', type); }
try {
  const response = await fetch(health, { signal: AbortSignal.timeout(120_000) });
  assert.equal(response.status, 200); assert.equal((await response.json()).service, 'yijian-rooms');
  console.log(`PASS: ${health.protocol.slice(0, -1).toUpperCase()} health check`);
  const a = await connect(), b = await connect(), watcher = await connect();
  await ack(a, 'create'); const room = await a.wait(r => r?.code);
  assert.match(room.code, /^\d{4}$/);
  await ack(b, 'join', { code: room.code }); await ack(watcher, 'join', { code: room.code });
  await ack(a, 'seat', { seat: 0, name: '部署验证·黑' }); await ack(b, 'seat', { seat: 1, name: '部署验证·白' });
  assert.equal((await watcher.send('seat', { seat: 1, name: '部署验证·观众' })).type, 'error');
  await ack(a, 'settings', { forbidden: true, turnSeconds: 60 });
  await ack(a, 'ready', { ready: true }); await ack(b, 'ready', { ready: true });
  const started = await watcher.wait(r => r?.phase === 'playing');
  assert.equal(started.settings.forbidden, true);
  assert.equal(started.settings.turnSeconds, 60);
  await ack(a, 'move', { index: 112, ply: 0, gameId: started.gameId });
  for (const c of [a, b, watcher]) await c.wait(r => r?.moves.length === 1);
  assert.equal((await watcher.send('move', { index: 113, ply: 1, gameId: started.gameId })).type, 'error');
  b.ws.close(); await new Promise(resolve => b.ws.once('close', resolve));
  const resumed = await connect(b.identity.token);
  assert.equal(resumed.identity.id, b.identity.id); assert.deepEqual(resumed.room.moves, [112]);
  await ack(resumed, 'move', { index: 113, ply: 1, gameId: started.gameId });
  for (const c of [a, resumed, watcher]) await c.wait(r => r?.moves.length === 2);
  await ack(a, 'resign', { gameId: started.gameId });
  for (const c of [a, resumed, watcher]) await c.wait(r => r?.result?.winner === 2);
  console.log(`PASS: ${new URL(url).protocol.slice(0, -1).toUpperCase()} room code, named seats, spectator restrictions, shared rules, moves, reconnect and result`);
} catch (error) {
  console.error(`FAIL: ${error.message}`); exitCode = 1;
} finally {
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN && client.send) {
      try { await client.send('leave'); } catch {}
    }
    client.ws.terminate();
  }
}
process.exitCode = exitCode;
