export const ENGINE = { id: 'rapfi-nnue-3c94c2a-e32ad77', name: 'Rapfi', model: 'Mix9SVQ NNUE', thinkMs: 10000 };
export const THINK_TIMES = [500,1000,3000,10000,30000,60000];
export const COACH = { level: 'rapfi-coach', strength: 20, thinkMs: 1000 };
export function opponentName(level, strength) {
  if (level === COACH.level) return `Rapfi 陪练${Number.isInteger(strength) ? ` · ${strength}` : ''}`;
  return level === 'rapfi' ? 'Rapfi' : '旧版 AI';
}
export function normalizeAI(settings) {
  const coach = settings.level === COACH.level;
  return { ...settings, level: coach ? COACH.level : 'rapfi', engineId: ENGINE.id,
    strength: coach ? Number.isInteger(settings.strength) && settings.strength >= 0 && settings.strength <= 90 ? settings.strength : COACH.strength : 100,
    thinkMs: THINK_TIMES.includes(settings.thinkMs) ? settings.thinkMs : coach ? COACH.thinkMs : ENGINE.thinkMs };
}
export function searchOptions(settings, purpose = 'move') {
  const s = normalizeAI(settings);
  return { strength: purpose === 'hint' ? 100 : s.strength,
    thinkMs: purpose === 'hint' ? Math.max(ENGINE.thinkMs, s.thinkMs) : s.thinkMs };
}
