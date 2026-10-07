export const BLACK = 1, WHITE = 2;
export const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const createBoard = (size = 15) => Array(size * size).fill(0);
export const inside = (x, y, size) => x >= 0 && y >= 0 && x < size && y < size;
export const coordinate = (index, size = 15) => `${'ABCDEFGHJKLMNOPQRST'[index % size]}${size - Math.floor(index / size)}`;

export function line(board, index, color, dx, dy, size) {
  const x = index % size, y = Math.floor(index / size), result = [index];
  for (const sign of [-1, 1]) {
    for (let d = 1; ; d++) {
      const xx = x + dx * d * sign, yy = y + dy * d * sign;
      if (!inside(xx, yy, size) || board[yy * size + xx] !== color) break;
      result.push(yy * size + xx);
    }
  }
  return result;
}

// Enumerate the distinct sets of four stones, not the number of winning ends.
// This distinguishes an open four (one four) from two fours on the same axis.
export function fours(board, origin, size = 15, onlyDirection = null) {
  const groups = new Map(), x = origin % size, y = Math.floor(origin / size);
  DIRECTIONS.forEach(([dx, dy], direction) => {
    if (onlyDirection !== null && direction !== onlyDirection) return;
    for (let start = -4; start <= 0; start++) {
      const stones = [], gaps = [];
      for (let k = start; k < start + 5; k++) {
        const xx = x + dx * k, yy = y + dy * k;
        if (!inside(xx, yy, size)) break;
        const i = yy * size + xx;
        if (board[i] === BLACK) stones.push(i);
        else if (!board[i]) gaps.push(i);
        else break;
      }
      if (stones.length !== 4 || gaps.length !== 1) continue;
      const gap = gaps[0];
      board[gap] = BLACK;
      const exact = line(board, gap, BLACK, dx, dy, size).length === 5;
      board[gap] = 0;
      if (!exact) continue;
      const key = stones.sort((a, b) => a - b).join(',');
      if (!groups.has(key)) groups.set(key, { stones, ends: new Set(), direction });
      groups.get(key).ends.add(gap);
    }
  });
  return [...groups.values()];
}

function classifyBlack(board, origin, size, memo) {
  const key = `${origin}:${board.join('')}`;
  if (memo.has(key)) return memo.get(key);
  const lengths = DIRECTIONS.map(([dx, dy]) => line(board, origin, BLACK, dx, dy, size).length);
  // RIF 9.2: a simultaneous exact five takes precedence over forbidden patterns.
  if (lengths.includes(5)) return { legal: true, win: true };
  if (lengths.some(n => n > 5)) return { legal: false, reason: '长连', win: false };
  if (fours(board, origin, size).length > 1) return { legal: false, reason: '四四禁手', win: false };
  const threes = new Set(), x = origin % size, y = Math.floor(origin / size);
  for (let direction = 0; direction < 4; direction++) {
    const [dx, dy] = DIRECTIONS[direction];
    for (let distance = -3; distance <= 3; distance++) {
      const xx = x + dx * distance, yy = y + dy * distance;
      if (!distance || !inside(xx, yy, size)) continue;
      const extension = yy * size + xx;
      if (board[extension]) continue;
      board[extension] = BLACK;
      const candidates = fours(board, origin, size, direction).filter(f =>
        f.ends.size === 2 && f.stones.includes(extension));
      // A real three must extend into a legal straight four without making five.
      if (candidates.length) {
        const check = classifyBlack(board, extension, size, memo);
        if (check.legal && !check.win) {
          for (const candidate of candidates) threes.add(candidate.stones.filter(i => i !== extension).join(','));
        }
      }
      board[extension] = 0;
      if (threes.size > 1) {
        const result = { legal: false, reason: '三三禁手', win: false };
        memo.set(key, result);
        return result;
      }
    }
  }
  const result = { legal: true, win: false };
  memo.set(key, result);
  return result;
}

export function inspectMove(board, index, color, { size = 15, forbidden = false } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= size * size) return { legal: false, reason: '超出棋盘' };
  if (board[index]) return { legal: false, reason: '这里已经有棋子了' };
  board[index] = color;
  try {
    if (forbidden && color === BLACK) return classifyBlack(board, index, size, new Map());
    const win = DIRECTIONS.some(([dx, dy]) => line(board, index, color, dx, dy, size).length >= 5);
    return { legal: true, win };
  } finally { board[index] = 0; }
}

export function winningLine(board, index, color, size = 15) {
  return DIRECTIONS.map(([dx, dy]) => line(board, index, color, dx, dy, size)).find(l => l.length >= 5) || [];
}

export function nearbyMoves(board, size = 15) {
  if (!board.some(Boolean)) return [Math.floor(size / 2) * size + Math.floor(size / 2)];
  const candidates = new Set();
  board.forEach((v, i) => {
    if (!v) return;
    const x = i % size, y = Math.floor(i / size);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      if (inside(x + dx, y + dy, size) && !board[(y + dy) * size + x + dx]) candidates.add((y + dy) * size + x + dx);
    }
  });
  return [...candidates];
}

export function availableMoves(board, color, options = {}) {
  const size = options.size || 15;
  const near = nearbyMoves(board, size).filter(i => inspectMove(board, i, color, options).legal);
  if (near.length) return near;
  return board.flatMap((v, i) => !v && inspectMove(board, i, color, options).legal ? [i] : []);
}
