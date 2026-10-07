import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OPENINGS} from '../src/openings.js';
import {OPENING_ANALYSIS,studyLines,studyMoves,studyChoices,studyNote} from '../src/study.js';
import {createBoard,inspectMove} from '../src/engine.js';
import {canonicalLine,selectVariations} from '../scripts/opening-selection.mjs';
const roots=JSON.parse(fs.readFileSync('reports/opening-analysis.json','utf8'));
const extra=JSON.parse(fs.readFileSync('reports/opening-extra-analysis.json','utf8'));
test('all 26 openings have legal, distinct, full-strength six-ply variations for both rules',()=>{
 assert.equal(OPENING_ANALYSIS.settings.strength,100);assert.equal(OPENING_ANALYSIS.settings.thinkMs,30000);
 assert.equal(Object.keys(roots.positions).length,52);
 for(const opening of OPENINGS)for(const rule of ['renju','freestyle']){
  const lines=studyLines(opening,rule),keys=new Set();assert.ok(lines.length>=1&&lines.length<=3,`${opening.name} ${rule}`);
  for(const v of lines){
   assert.equal(v.moves.length,6);assert.deepEqual(v.moves.slice(0,3),opening.moves);
   assert.ok(v.depth>=10);assert.ok([3,4,5].includes(v.analysisPly));assert.ok(v.blackWinRate>=0&&v.blackWinRate<=1);
   const key=canonicalLine(v.moves,opening.moves);assert.ok(!keys.has(key));keys.add(key);
   const board=createBoard();for(const [ply,i]of v.moves.entries()){assert.equal(inspectMove(board,i,ply%2+1,{forbidden:rule==='renju'}).legal,true,`${opening.name} ${rule} ${ply}`);board[i]=ply%2+1;}
  }
 }
});
test('every displayed line is traceable to filtered native output, with exact rule and coordinates',()=>{
 for(const opening of OPENINGS)for(const rule of ['renju','freestyle']){
  const key=`${opening.code}:${rule}`;
  assert.deepEqual(studyLines(opening,rule),selectVariations(roots.positions[key],extra.positions[key]||[]));
 }
});
test('board branch choices preserve the displayed prefix and never leak another line or rule',()=>{
 for(const opening of OPENINGS)for(const rule of ['renju','freestyle'])for(const [index,v]of studyLines(opening,rule).entries())for(const step of [1,3,4,5,6]){
  const choices=studyChoices(opening,rule,index,step);assert.equal(new Set(choices.map(c=>c.move)).size,choices.length);
  for(const c of choices){const moves=studyMoves(opening,rule,c.variation);assert.deepEqual(moves.slice(0,step),v.moves.slice(0,step));assert.equal(moves[step],c.move);assert.equal(c.label,String.fromCharCode(65+c.variation));}
  assert.equal(typeof studyNote(v.moves,step),'string');
  if(step<3||step===6)assert.equal(choices.length,0);
 }
});
