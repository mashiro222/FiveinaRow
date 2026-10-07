import { inspectMove, nearbyMoves, availableMoves, DIRECTIONS, inside } from '../../src/engine.js';
export const LEVELS = {
  beginner: { name: '入门', subtitle: '轻松熟悉棋盘', depth: 1, width: 5, time: 100 },
  casual: { name: '进阶', subtitle: '懂得进攻与防守', depth: 2, width: 8, time: 350 },
  strong: { name: '高手', subtitle: '多步推演，步步为营', depth: 3, width: 10, time: 900 },
  expert: { name: '挑战', subtitle: '更深搜索，耐心应战', depth: 4, width: 12, time: 2200 }
};
const WIN = 1e8;
function potential(board, index, color, size) {
  const x = index % size, y = Math.floor(index / size);
  let score = 0, threats = 0;
  for (const [dx, dy] of DIRECTIONS) {
    let best = 0;
    for (let start = -4; start <= 0; start++) {
      let count = 0, valid = true;
      for (let k = start; k < start + 5; k++) {
        const xx = x + k * dx, yy = y + k * dy;
        if (!inside(xx, yy, size) || (board[yy * size + xx] && board[yy * size + xx] !== color)) { valid = false; break; }
        if (k === 0 || board[yy * size + xx] === color) count++;
      }
      if (!valid) continue;
      let open = 0;
      for (const k of [start - 1, start + 5]) {
        const xx = x + k * dx, yy = y + k * dy;
        if (inside(xx, yy, size) && !board[yy * size + xx]) open++;
      }
      const value = [0, 2, 24, 210, 4500, WIN][count] * (1 + open * 0.28);
      best = Math.max(best, value);
    }
    if (best >= 210) threats++;
    score += best;
  }
  if (threats > 1) score += 650 * threats;
  return score;
}
function ranked(board, color, options) {
  const size = options.size || 15, opponent = 3 - color;
  return nearbyMoves(board, size).map(index => {
    const own = inspectMove(board, index, color, options);
    if (!own.legal) return null;
    const other = inspectMove(board, index, opponent, options);
    const attack = potential(board, index, color, size);
    const defend = other.legal ? potential(board, index, opponent, size) : 0;
    return { index, win: own.win, block: other.legal && other.win, score: own.win ? WIN * 4 : other.legal && other.win ? WIN * 2 : attack + defend * 1.05 - Math.hypot(index % size - size / 2, Math.floor(index / size) - size / 2) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

export function chooseMove(original, color, options = {}, level = 'casual', random = Math.random) {
  const board = [...original], config = LEVELS[level] || LEVELS.casual;
  const deadline = performance.now() + config.time;
  let nodes = 0, completedDepth = 1, timedOut = false;
  const all = ranked(board, color, options);
  if (!all.length) return { index: availableMoves(board, color, options)[0] ?? null, nodes, depth: 0 };
  if (all[0].win) return { index: all[0].index, nodes, depth: 1, reason: '连五取胜' };
  if (all[0].block) return { index: all[0].index, nodes, depth: 1, reason: '阻止对手连五' };
  if (level === 'beginner') {
    const count = Math.min(5, all.length);
    const pick = random() < 0.6 ? 0 : Math.floor(random() * count);
    return { index: all[pick].index, nodes, depth: 1, reason: '寻找连接与空间' };
  }
  const roots = all.slice(0, config.width);
  let best = roots[0].index;
  const search = (turn, depth, alpha, beta, ply) => {
    nodes++;
    if (performance.now() > deadline) { timedOut = true; return 0; }
    const moves = ranked(board, turn, options);
    if (!moves.length) return 0;
    if (moves[0].win) return WIN - ply * 10000;
    if (moves.filter(m => m.block).length > 1) return -WIN + (ply + 1) * 10000;
    if (!depth) {
      const own = potential(board, moves[0].index, turn, options.size || 15);
      const enemy = potential(board, moves[0].index, 3 - turn, options.size || 15);
      return own - enemy * 1.1;
    }
    const candidates = moves[0].block ? moves.filter(m => m.block) : moves.slice(0, Math.max(5, config.width - ply * 2));
    let value = -Infinity;
    for (const move of candidates) {
      board[move.index] = turn;
      const next = -search(3 - turn, depth - 1, -beta, -alpha, ply + 1);
      board[move.index] = 0;
      if (timedOut) return 0;
      value = Math.max(value, next);
      alpha = Math.max(alpha, next);
      if (alpha >= beta) break;
    }
    return value;
  };
  for (let depth = 2; depth <= config.depth; depth++) {
    let score = -Infinity, currentBest = best;
    for (const move of roots) {
      board[move.index] = color;
      const value = -search(3 - color, depth - 1, -Infinity, -score, 1) + move.score * 0.001;
      board[move.index] = 0;
      if (timedOut) break;
      if (value > score) { score = value; currentBest = move.index; }
    }
    if (timedOut) break;
    best = currentBest;
    completedDepth = depth;
    roots.sort((a, b) => (b.index === best) - (a.index === best));
  }
  return { index: best, nodes, depth: completedDepth, reason: '兼顾进攻与防守的候选点' };
}
