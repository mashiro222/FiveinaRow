import { ENGINE, THINK_TIMES } from './ai.js';
import { createBoard, inspectMove, winningLine } from './engine.js';
export const DEFAULTS = { mode: 'ai', level: 'rapfi', engineId: ENGINE.id, thinkMs: ENGINE.thinkMs, human: 1, size: 15, forbidden: false, board: 'wood', background: 'ivory', pieces: 'classic', numbers: false, sound: true };
export function newGame(settings, moves = [], practice = false) {
  return { id: globalThis.crypto.randomUUID(), settings: { ...settings }, moves: [...moves], result: null, assisted: practice, practice, created: Date.now() };
}
export function boardOf(game) {
  const board = createBoard(game.settings.size);
  game.moves.forEach((index, i) => board[index] = i % 2 + 1);
  return board;
}
export function play(game, index) {
  if (game.result) return { legal: false, reason: '本局已结束' };
  const board = boardOf(game), color = game.moves.length % 2 + 1;
  const check = inspectMove(board, index, color, game.settings);
  if (!check.legal) return check;
  game.moves.push(index);
  board[index] = color;
  if (check.win) game.result = { winner: color, reason: '连五', line: winningLine(board, index, color, game.settings.size) };
  else if (game.moves.length === board.length) game.result = { winner: 0, reason: '棋盘已满', line: [] };
  return check;
}
export function undo(game) {
  if (game.result || !game.moves.length) return false;
  const { mode, human } = game.settings;
  if (mode === 'ai') {
    // Remove up to and including the last human move. AI's opening cannot be undone alone.
    let last = game.moves.length - 1;
    while (last >= 0 && last % 2 + 1 !== human) last--;
    if (last < 0) return false;
    game.moves.splice(last);
  } else game.moves.pop();
  game.assisted = true;
  return true;
}
export function recordResult(records, game) {
  if (!game.result || game.settings.mode !== 'ai' || records.some(r => r.id === game.id)) return records;
  const winner = game.result.winner;
  const result = winner === 0 ? 'draw' : winner === game.settings.human ? 'win' : 'loss';
  return [{ id: game.id, at: Date.now(), level: game.settings.level, engineId: game.settings.engineId, thinkMs: game.settings.thinkMs, human: game.settings.human, forbidden: game.settings.forbidden, size: game.settings.size, result, assisted: game.assisted || game.practice, moves: [...game.moves], reason: game.result.reason }, ...records].slice(0, 1000);
}
export function summarize(records, level = 'rapfi') {
  const games = records.filter(r => !r.assisted && (!level || r.level === level));
  const wins = games.filter(r => r.result === 'win').length;
  return { total: games.length, wins, losses: games.filter(r => r.result === 'loss').length, draws: games.filter(r => r.result === 'draw').length, rate: games.length ? Math.round(wins / games.length * 100) : 0 };
}
const KEY = 'yijian-save-v1';
export function load(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY));
    if (!data || data.version !== 1) return null;
    const s = { ...DEFAULTS, ...data.settings };
    if (![13, 15, 19].includes(s.size) || !['ai', 'local'].includes(s.mode) || ![1, 2].includes(s.human) || !['rapfi', 'beginner', 'casual', 'strong', 'expert'].includes(s.level)) return null;
    s.level = 'rapfi'; s.engineId = ENGINE.id;
    if (!THINK_TIMES.includes(s.thinkMs)) s.thinkMs = ENGINE.thinkMs;
    let game = data.game;
    if (game) {
      if (!Array.isArray(game.moves) || ![13, 15, 19].includes(game.settings?.size) || game.moves.length > game.settings.size ** 2 || new Set(game.moves).size !== game.moves.length || game.moves.some(i => !Number.isInteger(i) || i < 0 || i >= game.settings.size ** 2) || !['ai', 'local'].includes(game.settings.mode) || ![1, 2].includes(game.settings.human)) game = null;
    }
    if (game && !game.result) {
      if (game.settings.level !== 'rapfi' && game.settings.mode === 'ai' && game.moves.length) { game.assisted = true; game.migrated = true; }
      game.settings = { ...game.settings, level: 'rapfi', engineId: ENGINE.id, thinkMs: THINK_TIMES.includes(game.settings.thinkMs) ? game.settings.thinkMs : ENGINE.thinkMs };
    }
    const records = Array.isArray(data.records) ? data.records.filter(r => r && ['win', 'loss', 'draw'].includes(r.result) && ['rapfi', 'beginner', 'casual', 'strong', 'expert'].includes(r.level) && typeof r.at === 'number').slice(0, 1000) : [];
    return { settings: s, game, records };
  } catch { return null; }
}
export function save(storage, settings, game, records) {
  try { storage.setItem(KEY, JSON.stringify({ version: 1, settings, game, records })); return true; }
  catch { return false; }
}
