import { randomInt, randomBytes, randomUUID } from 'node:crypto';
import { createBoard, inspectMove, winningLine, availableMoves } from '../src/engine.js';

const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export const ROOM_TTL = 10 * 60_000;
export const RECONNECT_GRACE = 30_000;

// All game authority lives here. Clients submit intentions, never board state,
// winners or clocks. The injected clock also makes deadline races testable.
export class RoomHub {
  constructor({ now = Date.now, codeNumber = () => randomInt(10000), emptyTTL = ROOM_TTL,
    grace = RECONNECT_GRACE, maxRooms = 1000, maxMembers = 100 } = {}) {
    Object.assign(this, { now, codeNumber, emptyTTL, grace, maxRooms, maxMembers });
    this.rooms = new Map();
    this.sessions = new Map();
  }
  connect(token, send, replace = () => {}) {
    this.tick();
    let session = typeof token === 'string' && this.sessions.get(token);
    if (!session) {
      session = { id: randomUUID(), token: randomBytes(32).toString('hex'), room: null, name: '', createdRooms: [] };
      this.sessions.set(session.token, session);
    }
    session.replace?.();
    Object.assign(session, { send, replace, connected: true, disconnectedAt: null });
    send({ type: 'welcome', id: session.id, token: session.token, serverNow: this.now(), room: this.snapshot(this.roomOf(session)) });
    this.broadcast(this.roomOf(session));
    return session;
  }
  disconnect(session) {
    if (!session?.connected) return;
    session.connected = false;
    session.disconnectedAt = this.now();
    session.send = null;
    session.replace = null;
    this.broadcast(this.roomOf(session));
  }
  roomOf(session) { return session?.room ? this.rooms.get(session.room) : null; }
  snapshot(room) {
    if (!room) return null;
    return {
      id: room.id, code: room.code, owner: room.owner, settings: { ...room.settings },
      phase: room.phase, seats: [...room.seats], ready: [...room.ready],
      members: [...room.members.values()].map(s => ({ id: s.id, name: s.name, connected: s.connected,
        reconnectUntil: s.connected ? null : s.disconnectedAt + this.grace })),
      gameId: room.gameId, moves: [...room.moves], result: room.result,
      deadline: room.deadline, serverNow: this.now()
    };
  }
  broadcast(room) {
    if (!room) return;
    const connected = [...room.members.values()].filter(s => s.connected);
    if (connected.length) room.emptySince = null;
    else room.emptySince ??= this.now();
    const data = { type: 'state', room: this.snapshot(room), serverNow: this.now() };
    for (const s of connected) s.send?.(data);
  }
  newCode() {
    requireThat(this.rooms.size < Math.min(this.maxRooms, 10000), '房间已满，请稍后再试');
    for (let n = 0; n < 32; n++) {
      const code = String(this.codeNumber()).padStart(4, '0');
      if (!this.rooms.has(code)) return code;
    }
    // Random collisions cannot create duplicate rooms, including near capacity.
    for (let n = 0; n < 10000; n++) {
      const code = String(n).padStart(4, '0');
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('房间号已用完，请稍后再试');
  }
  finish(room, winner, reason, line = []) {
    room.phase = 'finished'; room.result = { winner, reason, line };
    room.deadline = null; room.ready = [false, false];
  }
  removeMember(room, session, reason = '离开房间') {
    const seat = room.seats.indexOf(session.id);
    if (seat !== -1) {
      if (room.phase === 'playing') this.finish(room, 2 - seat, reason);
      room.seats[seat] = null; room.ready = [false, false];
    }
    room.members.delete(session.id); session.room = null;
    if (room.owner === session.id) room.owner = [...room.members.values()].find(s => s.connected)?.id || room.members.keys().next().value || null;
    this.broadcast(room);
  }
  request(session, message) {
    requireThat(session?.connected, '连接已断开');
    requireThat(message && typeof message === 'object' && !Array.isArray(message), '无效请求');
    this.tick(); // A move received at/after the deadline cannot beat the timer.
    const now = this.now(), type = message.type;
    let room = this.roomOf(session);
    if (type === 'ping') return { serverNow: now };
    if (type === 'create') {
      requireThat(!room, '请先离开当前房间');
      session.createdRooms = session.createdRooms.filter(t => now - t < 60_000);
      requireThat(session.createdRooms.length < 5, '创建太频繁，请稍后再试');
      const code = this.newCode();
      room = { id: randomUUID(), code, owner: session.id, members: new Map(), seats: [null, null],
        ready: [false, false], settings: { size: 15, forbidden: false, turnSeconds: 60 },
        phase: 'waiting', gameId: null, moves: [], result: null, deadline: null, emptySince: null };
      this.rooms.set(code, room); session.createdRooms.push(now);
      room.members.set(session.id, session); session.room = code;
    } else if (type === 'join') {
      requireThat(!room, '请先离开当前房间');
      requireThat(typeof message.code === 'string' && /^\d{4}$/.test(message.code), '请输入四位房间号');
      room = this.rooms.get(message.code);
      requireThat(room, '没有找到这个房间，可能已过期');
      requireThat(room.members.size < this.maxMembers, '房间观众已满');
      room.members.set(session.id, session); session.room = room.code;
      room.owner ||= session.id;
    } else {
      requireThat(room, '请先进入房间');
      const seat = room.seats.indexOf(session.id);
      if (type === 'leave') {
        this.removeMember(room, session);
        session.send?.({ type: 'state', room: null, serverNow: now });
        return {};
      }
      if (type === 'seat') {
        requireThat(room.phase !== 'playing', '对局中不能更换棋手');
        requireThat(message.seat === 0 || message.seat === 1, '无效席位');
        requireThat(!room.seats[message.seat] || room.seats[message.seat] === session.id, '这个席位已有人，请选择另一个席位或旁观');
        const name = typeof message.name === 'string' ? message.name.trim() : '';
        requireThat(name && [...name].length <= 16 && !/[\p{Cc}\p{Cf}]/u.test(name), '名字需要 1–16 个字，不能包含控制字符');
        if (seat !== -1) room.seats[seat] = null;
        session.name = name; room.seats[message.seat] = session.id; room.ready = [false, false];
      } else if (type === 'stand') {
        requireThat(seat !== -1, '你正在旁观');
        requireThat(room.phase !== 'playing', '请先认输，再退席');
        room.seats[seat] = null; room.ready = [false, false];
      } else if (type === 'settings') {
        requireThat(room.owner === session.id, '只有房主可以设置规则');
        requireThat(room.phase !== 'playing', '对局开始后不能更改规则');
        requireThat(typeof message.forbidden === 'boolean' && [30, 60, 120].includes(message.turnSeconds), '无效的规则设置');
        room.settings = { size: 15, forbidden: message.forbidden, turnSeconds: message.turnSeconds };
        room.ready = [false, false];
      } else if (type === 'ready') {
        requireThat(seat !== -1, '请先入座');
        requireThat(room.phase !== 'playing', '对局已经开始');
        requireThat(typeof message.ready === 'boolean', '无效的准备状态');
        room.ready[seat] = message.ready;
        if (room.seats.every(id => id && room.members.get(id)?.connected) && room.ready.every(Boolean)) {
          room.phase = 'playing'; room.moves = []; room.result = null; room.gameId = randomUUID();
          room.deadline = now + room.settings.turnSeconds * 1000;
        }
      } else if (type === 'move') {
        requireThat(room.phase === 'playing', '当前没有进行中的对局');
        requireThat(seat === room.moves.length % 2, seat === -1 ? '旁观者不能落子' : '还没轮到你落子');
        requireThat(message.gameId === room.gameId && message.ply === room.moves.length, '棋局已更新，请在最新棋盘上落子');
        const board = createBoard(); room.moves.forEach((i, p) => board[i] = p % 2 + 1);
        const color = seat + 1, check = inspectMove(board, message.index, color, room.settings);
        requireThat(check.legal, check.reason);
        board[message.index] = color; room.moves.push(message.index);
        if (check.win) this.finish(room, color, '连五', winningLine(board, message.index, color));
        else if (room.moves.length === 225) this.finish(room, 0, '棋盘已满');
        else if (room.settings.forbidden && color === 2 && !availableMoves(board, 1, room.settings).length) this.finish(room, 2, '黑棋无合法落点');
        else room.deadline = now + room.settings.turnSeconds * 1000;
      } else if (type === 'resign') {
        requireThat(seat !== -1 && room.phase === 'playing', '当前不能认输');
        requireThat(message.gameId === room.gameId, '棋局已更新');
        this.finish(room, 2 - seat, '认输');
      } else throw new Error('不支持的请求');
    }
    this.broadcast(room);
    return {};
  }
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      let changed = false;
      if (room.phase === 'playing' && now >= room.deadline) {
        this.finish(room, 2 - room.moves.length % 2, '落子超时'); changed = true;
      }
      for (const member of [...room.members.values()]) {
        if (!member.connected && now - member.disconnectedAt >= this.grace) {
          this.removeMember(room, member, '断线超过 30 秒'); changed = true;
        }
      }
      if (room.emptySince !== null && now - room.emptySince >= this.emptyTTL) this.rooms.delete(room.code);
      else if (changed) this.broadcast(room);
    }
    for (const [token, session] of this.sessions) {
      if (!session.connected && !session.room && now - session.disconnectedAt >= this.emptyTTL) this.sessions.delete(token);
    }
  }
}
