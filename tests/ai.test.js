import test from 'node:test';
import assert from 'node:assert/strict';
import { COACH, ENGINE, normalizeAI, searchOptions } from '../src/ai.js';

test('coach strength is independent of thinking time and zero is valid', () => {
  for (const thinkMs of [500,1000,3000,10000,60000]) {
    assert.deepEqual(searchOptions({level:COACH.level,strength:0,thinkMs}), {strength:0,thinkMs});
  }
  for (const strength of [undefined,null,'20',-1,100,NaN,Infinity,2.5]) {
    assert.equal(normalizeAI({level:COACH.level,strength}).strength,COACH.strength);
  }
});
test('hints always use full strength with at least the full default budget', () => {
  const settings={level:COACH.level,strength:20,thinkMs:500};
  assert.deepEqual(searchOptions(settings,'hint'),{strength:100,thinkMs:ENGINE.thinkMs});
  assert.deepEqual(searchOptions({...settings,thinkMs:60000},'hint'),{strength:100,thinkMs:60000});
  assert.deepEqual(settings,{level:COACH.level,strength:20,thinkMs:500});
  assert.equal(searchOptions({level:'rapfi',strength:20,thinkMs:500}).strength,100);
});
