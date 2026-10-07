export const DEFAULT_ROOM_SERVER = ''; // Set to a deployed wss://…/room URL for a shared public lobby.
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
    this.connecting = this.open();
    try { await this.connecting; } finally { this.connecting = null; }
  }
  open() {
    const generation = ++this.generation;
    this.status = 'connecting'; this.onChange();
    return new Promise((resolve, reject) => {
      let welcomed = false, completed = false;
      const socket = new WebSocket(this.url); this.socket = socket;
      const fail = error => { if (!completed) { completed = true; reject(error); } };
      const timeout = setTimeout(() => { fail(new Error('连接超时，请检查服务地址和网络')); socket.close(); }, 8000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', token: read(this.tokenKey()) }));
      socket.onmessage = event => {
        if (generation !== this.generation) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'welcome') {
          clearTimeout(timeout); welcomed = true; completed = true; this.retry = 0;
          this.id = data.id; write(this.tokenKey(), data.token); this.status = 'connected';
          this.room = data.room; this.offset = data.serverNow - Date.now(); this.onChange(); resolve();
          this.syncClock(); this.pingTimer = setInterval(() => this.syncClock(), 10_000);
        } else if (data.type === 'state') {
          this.room = data.room; this.onChange();
        } else if (data.type === 'ack' || data.type === 'error') {
          const pending = this.pending.get(data.requestId);
          if (pending) { this.pending.delete(data.requestId); clearTimeout(pending.timer); data.type === 'ack' ? pending.resolve(data) : pending.reject(new Error(data.error)); }
        }
      };
      socket.onerror = () => fail(new Error('无法连接房间服务，请检查地址、服务是否开启及防火墙设置'));
      socket.onclose = event => {
        clearTimeout(timeout); fail(new Error('连接已断开'));
        if (generation !== this.generation) return;
        clearInterval(this.pingTimer);
        this.rejectPending(); this.status = event.code === 4001 ? 'replaced' : 'disconnected'; this.onChange();
        if (event.code !== 4001 && (welcomed || this.retry > 0)) {
          this.retry++;
          this.reconnectTimer = setTimeout(() => { this.connecting = this.open(); this.connecting.catch(() => {}).finally(() => this.connecting = null); }, Math.min(8000, 1000 * 2 ** Math.min(this.retry - 1, 3)));
        }
      };
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
    this.socket?.close(); this.rejectPending(); this.status = 'idle'; this.retry = 0;
  }
  abandon() {
    this.stop(); write(this.tokenKey(), ''); this.room = null; this.id = null; this.onChange();
  }
  now() { return Date.now() + this.offset; }
}
