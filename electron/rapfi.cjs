const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const ENGINE_ID = 'rapfi-nnue-3c94c2a-e32ad77';
function validatePosition(position) {
  const { id, size, moves, forbidden, thinkMs = 10000 } = position || {};
  if (!Number.isSafeInteger(id) || ![13,15,19].includes(size) || !Array.isArray(moves) || moves.length >= size * size || new Set(moves).size !== moves.length || moves.some(i => !Number.isInteger(i) || i < 0 || i >= size * size) || typeof forbidden !== 'boolean') throw new Error('无效的棋盘局面');
  if (forbidden && size !== 15) throw new Error('Rapfi 禁手神经网络支持 15 路棋盘，请新开一局 15 路对局。');
  if (!Number.isInteger(thinkMs) || thinkMs < 100 || thinkMs > 60000) throw new Error('无效的思考时限');
  return { id, size, moves: [...moves], forbidden, thinkMs };
}
function boardCommand({ size, moves }) {
  const self = moves.length % 2;
  // Piskvork: 1 is the engine's side, 2 its opponent. Keep chronological order
  // so Rapfi knows which side is black (essential for Renju's two networks).
  return ['BOARD', ...moves.map((i, ply) => `${i % size},${Math.floor(i / size)},${ply % 2 === self ? 1 : 2}`), 'DONE'].join('\n');
}

class RapfiEngine {
  constructor(directory, { threads, hashMB = 256, freshSearch = false, onProgress = () => {} } = {}) {
    this.directory = directory;
    this.threads = threads || Math.max(1, Math.min(8, (os.availableParallelism?.() || os.cpus().length) - 2));
    this.hashMB = hashMB;
    this.onProgress = onProgress;
    this.freshSearch = freshSearch;
    this.child = null;
    this.pending = null;
    this.boardKey = null;
    this.verified = false;
    this.nnueConfigured = false;
    this.neuralLoaded = false;
  }
  verifyFiles() {
    if (this.verified) return;
    const manifest = JSON.parse(fs.readFileSync(path.join(this.directory, 'manifest.json'), 'utf8'));
    if (manifest.engineId !== ENGINE_ID || manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('Rapfi 引擎与当前系统不匹配，请安装对应平台的版本。');
    for (const [file, sha256] of Object.entries(manifest.files)) {
      if (path.basename(file) !== file || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('引擎文件清单无效');
      const data = fs.readFileSync(path.join(this.directory, file));
      if (crypto.createHash('sha256').update(data).digest('hex') !== sha256) throw new Error('Rapfi 引擎或神经网络文件损坏，请重新安装。');
    }
    this.verified = true;
  }
  start() {
    if (this.child) return;
    this.verifyFiles();
    const executable = path.join(this.directory, process.platform === 'win32' ? 'pbrain-rapfi.exe' : 'pbrain-rapfi');
    const child = spawn(executable, [], { cwd: this.directory, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child = child;
    this.boardKey = null;
    this.nnueConfigured = false;
    this.neuralLoaded = false;
    let buffer = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return this.fail(new Error('引擎输出异常'));
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        this.receive(line);
      }
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-2000); });
    child.stdin.on('error', () => { if (this.child === child) this.fail(new Error('无法与 Rapfi 引擎通信')); });
    child.on('error', () => { if (this.child === child) this.fail(new Error('Rapfi 引擎无法启动，请检查安装是否完整。')); });
    child.on('exit', code => { if (this.child === child) this.fail(new Error(`Rapfi 引擎意外退出（${code}），请重试。`)); });
  }
  receive(line) {
    if (/Evaluator set to mix9svq/.test(line)) this.nnueConfigured = true;
    if (/nnue: weight loaded/.test(line)) this.neuralLoaded = true;
    // Never hide a failed neural evaluator behind the engine's classical fallback.
    if (/^ERROR\b|Evaluator .* disabled|Failed to load from|failed to initialized/i.test(line)) return this.fail(Object.assign(new Error('Rapfi 神经网络加载或计算失败，请重新安装或重试。'), {engineDetail: line}));
    const pending = this.pending;
    if (!pending) return;
    (pending.trace ||= []).push(line);
    if (pending.trace.length > 30) pending.trace.shift();
    if (pending.waiting && /^name="Rapfi",/.test(line)) {
      pending.waiting = false;
      clearInterval(pending.readyTimer);
      this.child.stdin.write(pending.commands.join('\n') + '\n');
      return;
    }
    const info = line.match(/^INFO (DEPTH|TOTALNODES|TOTALTIME) (\d+)$/);
    if (info) {
      pending.stats[{DEPTH:'depth',TOTALNODES:'nodes',TOTALTIME:'searchMs'}[info[1]]] = Number(info[2]);
      if (Date.now() - pending.lastProgress > 150) {
        pending.lastProgress = Date.now();
        this.onProgress({ id: pending.position.id, ...pending.stats });
      }
    }
    const probability = line.match(/^INFO WINRATE (\S+)$/);
    if (probability) {
      const value = Number(probability[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        pending.stats.blackWinRate = pending.position.moves.length % 2 === 0 ? value : 1 - value;
        this.onProgress({ id: pending.position.id, ...pending.stats });
      }
    }
    const move = line.match(/^(\d+),(\d+)$/);
    if (!move) return;
    const x = Number(move[1]), y = Number(move[2]), { size, moves, id } = pending.position;
    const index = y * size + x;
    if (x >= size || y >= size || moves.includes(index) || !this.nnueConfigured) return this.fail(new Error('Rapfi 返回了无效落点或未启用神经网络。'));
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve({ id, index, engineId: ENGINE_ID, engine: 'Rapfi NNUE', neuralLoaded: this.neuralLoaded, threads: this.threads, elapsedMs: Date.now() - pending.started, ...pending.stats });
  }
  analyze(input) {
    let position;
    try { position = validatePosition(input); } catch (error) { return Promise.reject(error); }
    this.cancel();
    // Live analysis can replace positions within milliseconds, including after
    // the engine's immediate opening reply. Use a fresh protocol/search state
    // for this mode; ordinary AI games keep their warm transposition table.
    if (this.freshSearch) this.close();
    try { this.start(); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const pending = { position, resolve, reject, started: Date.now(), lastProgress: 0, waiting: true, stats: {depth:0,nodes:0,searchMs:0} };
      this.pending = pending;
      pending.timer = setTimeout(() => this.fail(Object.assign(new Error('Rapfi 响应超时，请点击重试。'), {
        engineDetail: { phase: pending.waiting ? 'readiness' : 'search', moves: position.moves, stats: pending.stats, output: pending.trace || [] }
      })), position.thinkMs + 15000);
      const commands = [];
      const key = `${position.size}:${position.forbidden}`;
      if (key !== this.boardKey) {
        // START lazily creates the default one-thread pool. Replacing that pool
        // immediately can destroy a worker before its init task has started,
        // deadlocking Rapfi's SearchThread destructor on Windows. Set the final
        // pool size first so START never creates a short-lived default worker.
        commands.push(`INFO RULE ${position.forbidden ? 4 : 0}`, `INFO THREAD_NUM ${this.threads}`, `START ${position.size}`, `INFO HASH_SIZE ${this.hashMB * 1024}`, 'INFO STRENGTH 100', 'INFO SHOW_DETAIL 2', 'INFO PONDERING 0');
        this.boardKey = key;
        this.neuralLoaded = false;
      }
      commands.push(`INFO TIMEOUT_TURN ${position.thinkMs}`, 'INFO TIMEOUT_MATCH 2147483647', 'INFO TIME_LEFT 2147483647', boardCommand(position));
      pending.commands = commands;
      // Rapfi prints its move just before clearing its `thinking` flag. Commands
      // received in that gap are discarded token by token (not line by line).
      // ABOUT has no arguments and is safe to retry until the engine answers;
      // only then send settings/BOARD. This matters on Windows pipe scheduling.
      const probe = () => { if (this.pending === pending && pending.waiting) this.child.stdin.write('ABOUT\n'); };
      pending.readyTimer = setInterval(probe, 25);
      probe();
    });
  }
  cancel(id) {
    if (!this.pending || (id !== undefined && this.pending.position.id !== id)) return;
    this.fail(Object.assign(new Error('已取消计算'), { code: 'CANCELLED' }));
  }
  fail(error) {
    const pending = this.pending;
    this.pending = null;
    const child = this.child;
    this.child = null;
    this.boardKey = null;
    if (child && !child.killed) child.kill();
    if (pending) { clearTimeout(pending.timer); clearInterval(pending.readyTimer); pending.reject(error); }
  }
  close() { this.fail(Object.assign(new Error('引擎已关闭'), { code: 'CANCELLED' })); }
}
module.exports = { RapfiEngine, ENGINE_ID, validatePosition, boardCommand };
