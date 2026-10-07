import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVariations} from '../scripts/opening-selection.mjs';
const candidate=(moves,score='0',winRate=.5)=>({moves,score,winRate,depth:20});
test('deeper analysis replaces an outdated PV tail and excludes newly refuted branches',()=>{
 const root={rule:'renju',moves:[112,97,98],candidates:[candidate([111,96,80])]};
 const sixth={rule:'renju',moves:[112,97,98,111,96],candidates:[candidate([80]),candidate([94],'-30',.49)]};
 const fifth={rule:'renju',moves:[112,97,98,111],candidates:[candidate([113,99]),candidate([114,99],'-50',.45)]};
 const lines=selectVariations(root,[sixth,fifth]);
 assert.equal(lines.length,2);assert.deepEqual(lines.map(v=>v.moves[4]),[113,114]);
 assert.ok(lines.every(v=>v.moves.length===6&&v.analysisPly===4));
});
test('only near-best candidates survive both score and probability filters',()=>{
 const root={rule:'freestyle',moves:[112,97,98],candidates:[candidate([111,96,80]),candidate([113,99,100],'-201',.49),candidate([114,99,100],'-50',.41)]};
 assert.equal(selectVariations(root).length,1);
});
