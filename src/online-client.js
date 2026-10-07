export const DEFAULT_ROOM_SERVER = 'wss://five-in-a-row-rooms.onrender.com/room';
export function normalizeServer(value) {
  const url = new URL(value.trim());
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('请输入 ws:// 或 wss:// 房间服务地址');
  if (url.pathname === '/') url.pathname = '/room';
  if (url.pathname !== '/room') throw new Error('房间服务地址应以 /room 结尾');
  return url.href;
}
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

export class OnlineClient {
  constructor(onChange) {
    this.onChange = onChange; this.room = null; this.id = null; this.status = 'idle'; this.offset = 0;
    this.url = read('yijian-room-server') || DEFAULT_ROOM_SERVER;
    this.pending = new Map(); this.sequence = 0; this.retry = 0; this.generation = 0;
  }
  tokenKey() { return `yijian-room-token:${this.url}`; }
  hasSession() { return !!read(this.tokenKey()); }
  async connect(value = this.url) {
    const url = normalizeServer(value);
    if (this.status === 'connected' && url === this.url) return;
    if (this.connecting && url === this.url) return this.connecting;
    if (this.room && this.url !== url) throw new Error('请先离开当前房间，再切换服务');
    this.stop(); this.url = url; write('yijian-room-server', url);
    return this.startConnecting();
  }
  startConnecting(reconnecting = false) {
    const connecting = this.connectWithRetry(this.generation, reconnecting);
    this.connecting = connecting;
    const done = () => { if (this.connecting === connecting) this.connecting = null; };
    connecting.then(done, done);
    return connecting;
  }
  async connectWithRetry(generation, reconnecting) {
    // A sleeping free host can take about a minute to accept its first socket.
    const deadline = Date.now() + 120_000;
    this.retry = 0;
    while (generation === this.generation) {
      this.status = reconnecting ? 'disconnected' : this.retry ? 'waking' : 'connecting'; this.onChange();
      try { await this.open(generation, Math.min(70_000, deadline - Date.now())); return; }
      catch (error) {
        if (generation !== this.generation) throw error;
        if (error.replaced || Date.now() >= deadline) {
          this.status = error.replaced ? 'replaced' : 'failed'; this.onChange();
          throw new Error(error.replaced ? '此会话已在另一窗口打开' : '两分钟内未能连接，请检查网络或稍后重试');
        }
        this.retry++;
        this.status = reconnecting ? 'disconnected' : 'waking'; this.onChange();
        await new Promise((resolve, reject) => {
          this.cancelRetry = reject;
          this.reconnectTimer = setTimeout(() => { this.cancelRetry = null; resolve(); }, Math.min(8000, 1000 * 2 ** Math.min(this.retry - 1, 3), deadline - Date.now()));
        });
      }
    }
    throw new Error('已取消连接');
  }
  open(generation, timeoutMs) {
    return new Promise((resolve, reject) => {
      let welcomed = false, ended = false;
      const socket = new WebSocket(this.url); this.socket = socket;
      const end = (error, code) => {
        if (ended) return;
        ended = true; clearTimeout(timeout);
        if (this.cancelOpen === cancel) this.cancelOpen = null;
        if (code === 4001) error.replaced = true;
        if (!welcomed) reject(error);
        if (generation === this.generation && welcomed) {
          clearInterval(this.pingTimer); this.rejectPending();
          this.status = code === 4001 ? 'replaced' : 'disconnected'; this.onChange();
          if (code !== 4001) this.reconnectTimer = setTimeout(() => this.startConnecting(true).catch(() => {}), 1000);
        }
        socket.close();
      };
      const cancel = () => end(new Error('已取消连接'));
      this.cancelOpen = cancel;
      const timeout = setTimeout(() => end(new Error('等待服务唤醒')), Math.max(0, timeoutMs));
      socket.onopen = () => { if (!ended && generation === this.generation) socket.send(JSON.stringify({ type: 'hello', token: read(this.tokenKey()) })); };
      socket.onmessage = event => {
        if (ended || generation !== this.generation) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'welcome' && !welcomed) {
          clearTimeout(timeout); welcomed = true; this.retry = 0;
          if (this.cancelOpen === cancel) this.cancelOpen = null;
          this.id = data.id; write(this.tokenKey(), data.token); this.status = 'connected';
          this.room = data.room; this.offset = data.serverNow - Date.now(); this.onChange(); resolve();
          this.syncClock(); this.pingTimer = setInterval(() => this.syncClock(), 10_000);
        } else if (!welcomed) return;
        else if (data.type === 'state') {
          this.room = data.room; this.onChange();
        } else if (data.type === 'ack' || data.type === 'error') {
          const pending = this.pending.get(data.requestId);
          if (pending) { this.pending.delete(data.requestId); clearTimeout(pending.timer); data.type === 'ack' ? pending.resolve(data) : pending.reject(new Error(data.error)); }
        }
      };
      socket.onerror = () => end(new Error('暂时无法连接房间服务'));
      socket.onclose = event => end(new Error('连接已断开'), event.code);
    });
  }
  async syncClock() {
    const start = Date.now();
    try { const data = await this.send('ping'); this.offset = data.serverNow - (start + Date.now()) / 2; } catch {}
  }
  send(type, fields = {}) {
    if (this.status !== 'connected') return Promise.reject(new Error('连接恢复后才能操作'));
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('请求超时，请等待连接恢复后再试')); }, 8000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ ...fields, type, requestId }));
    });
  }
  rejectPending() { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('连接已断开')); } this.pending.clear(); }
  stop() {
    this.generation++; clearTimeout(this.reconnectTimer); clearInterval(this.pingTimer);
    this.cancelOpen?.(); this.cancelRetry?.(new Error('已取消连接'));
    this.cancelOpen = null; this.cancelRetry = null; this.connecting = null;
    this.socket?.close(); this.rejectPending(); this.status = 'idle'; this.retry = 0;
  }
  abandon() {
    this.stop(); write(this.tokenKey(), ''); this.room = null; this.id = null; this.onChange();
  }
  now() { return Date.now() + this.offset; }
}
