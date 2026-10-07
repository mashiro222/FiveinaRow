import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {PvCollector,scoreValue}=createRequire(import.meta.url)('../electron/rapfi-pv.cjs');
const frame=(slot,depth,score,pv)=>[`INFO PV ${slot}`,'INFO NUMPV 2',`INFO DEPTH ${depth}`,`INFO EVAL ${score}`,'INFO WINRATE 0.5',`INFO BESTLINE ${pv}`,'INFO PV DONE'];
test('analysis retains a complete MultiPV iteration and sorts provisional slots by score',()=>{
 const c=new PvCollector({size:15,moves:[112,97,98]});
 [...frame(0,18,'-300','6,8 8,5 8,7'),...frame(1,18,'-200','9,5 6,7 8,7'),...frame(0,19,'-190','8,7 6,5 7,5')].forEach(l=>c.receive(l));
 assert.equal(c.result().length,2);assert.deepEqual(c.result().map(p=>p.depth),[18,18]);
 assert.equal(c.result()[0].moves[0],84);assert.equal(c.result()[0].score,'-200');
});
test('analysis rejects invalid coordinates, occupied points, repeated moves and mismatched depths',()=>{
 for(const bad of ['7,7 6,6','15,0 6,6','6,6 6,6','NaN,7','PASS']){
  const c=new PvCollector({size:15,moves:[112]});[...frame(0,8,'10',bad),...frame(1,8,'0','6,8 8,5')].forEach(l=>c.receive(l));assert.deepEqual(c.result(),[]);
 }
 const c=new PvCollector({size:15,moves:[112]});[...frame(0,8,'10','6,8'),...frame(1,9,'0','8,8')].forEach(l=>c.receive(l));assert.deepEqual(c.result(),[]);
});
test('mate scores remain ordered even when displayed probabilities both round to zero or one',()=>{
 assert.ok(scoreValue('+M9')>scoreValue('+M11'));assert.ok(scoreValue('-M20')>scoreValue('-M10'));
 assert.ok(scoreValue('-M20')<scoreValue('-2000'));assert.ok(scoreValue('+M20')>scoreValue('2000'));
});
