import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomHub } from './rooms.mjs';

export async function createRoomServer({ port = 8787, host = '0.0.0.0', hub = new RoomHub(), maxConnections = 1000 } = {}) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(req.url === '/health' ? 200 : 404);
    res.end(JSON.stringify(req.url === '/health' ? { ok: true, service: 'yijian-rooms', version: 1 } : { error: 'Not found' }));
  });
  const wss = new WebSocketServer({ server, path: '/room', maxPayload: 4096, perMessageDeflate: false });
  // The HTTP server also reports listen errors to the startup promise below.
  // ws forwards those errors; handle that event so failed startup can clean up.
  wss.on('error', () => {});
  const connections = new Map();
  wss.on('connection', (socket, req) => {
    const address = req.socket.remoteAddress;
    if (wss.clients.size > maxConnections || (connections.get(address) || 0) >= 40) { socket.close(1013, 'Server busy'); return; }
    connections.set(address, (connections.get(address) || 0) + 1);
    let session, started = Date.now(), count = 0;
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    const send = data => { if (socket.readyState === WebSocket.OPEN) {
      if (socket.bufferedAmount > 1024 * 1024) socket.terminate();
      else socket.send(JSON.stringify(data));
    } };
    const handshake = setTimeout(() => { if (!session) socket.close(1008, 'Hello required'); }, 5000);
    socket.on('message', (raw, binary) => {
      if (Date.now() - started >= 1000) { started = Date.now(); count = 0; }
      if (++count > 40 || binary) { socket.close(1008, 'Invalid traffic'); return; }
      let message;
      try {
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('无效请求');
        if (!session) {
          if (message.type !== 'hello') throw new Error('请先连接');
          session = hub.connect(message.token, send, () => socket.close(4001, 'Session replaced'));
          clearTimeout(handshake);
        } else {
          if (session.send !== send) throw new Error('会话已在另一窗口打开');
          if (!Number.isSafeInteger(message.requestId)) throw new Error('无效请求编号');
          const result = hub.request(session, message);
          send({ type: 'ack', requestId: message.requestId, ...result });
        }
      } catch (error) { send({ type: 'error', requestId: Number.isSafeInteger(message?.requestId) ? message.requestId : null, error: error.message }); }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(handshake);
      const remaining = (connections.get(address) || 1) - 1;
      if (remaining) connections.set(address, remaining); else connections.delete(address);
      if (session?.send === send) hub.disconnect(session);
    });
  });
  const timer = setInterval(() => hub.tick(), 200);
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) { if (!socket.alive) socket.terminate(); else { socket.alive = false; socket.ping(); } }
  }, 10_000);
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) { clearInterval(timer); clearInterval(heartbeat); wss.close(); throw error; }
  return { server, hub, port: server.address().port, close: async () => {
    clearInterval(timer); clearInterval(heartbeat);
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = await createRoomServer({ port: Number(process.env.PORT || 8787), host: process.env.HOST || '0.0.0.0' });
  console.log(`弈间房间服务正在监听 ${service.port}，WebSocket 路径 /room`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
}
