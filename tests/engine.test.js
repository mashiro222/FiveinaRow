import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoard,inspectMove,fours,coordinate,availableMoves} from '../src/engine.js';
import {chooseMove,LEVELS} from './fixtures/legacy-ai.js';
import {newGame,play,undo,boardOf,recordResult,summarize,load,save,DEFAULTS} from '../src/state.js';
import {OPENINGS} from '../src/openings.js';
const idx=(x,y,s=15)=>y*s+x;
function setup(black=[],white=[],size=15){const b=createBoard(size);black.forEach(([x,y])=>b[idx(x,y,size)]=1);white.forEach(([x,y])=>b[idx(x,y,size)]=2);return b;}
const renju={forbidden:true,size:15};
test('all four axes win for either color, at the board edge',()=>{
 for(const [dx,dy,x,y] of [[1,0,0,0],[0,1,0,0],[1,1,0,0],[1,-1,0,4]])for(const color of [1,2]){
  const b=createBoard();for(let k=0;k<4;k++)b[idx(x+dx*k,y+dy*k)]=color;
  const snapshot=[...b];assert.equal(inspectMove(b,idx(x+dx*4,y+dy*4),color).win,true);assert.deepEqual(b,snapshot);
 }
});
test('occupied and out-of-board moves are rejected',()=>{const b=setup([[7,7]]);for(const i of [112,-1,225,NaN,1.5])assert.equal(inspectMove(b,i,1).legal,false);});
test('free play permits overline; forbidden black overline rejected; white permitted',()=>{
 const b=setup([[2,7],[3,7],[4,7],[6,7],[7,7]]);assert.equal(inspectMove(b,idx(5,7),1).win,true);assert.equal(inspectMove(b,idx(5,7),1,renju).reason,'长连');assert.equal(inspectMove(b.map(v=>v?2:0),idx(5,7),2,renju).win,true);
});
test('exact five takes precedence over simultaneous forbidden patterns (RIF 9.2)',()=>{const b=setup([[3,7],[4,7],[5,7],[6,7],[7,4],[7,5],[7,6],[7,8],[7,9]]);assert.deepEqual(inspectMove(b,idx(7,7),1,renju),{legal:true,win:true});});
test('cross double three rejected; white double three allowed',()=>{const b=setup([[6,7],[8,7],[7,6],[7,8]]);const original=[...b];assert.equal(inspectMove(b,idx(7,7),1,renju).reason,'三三禁手');assert.deepEqual(b,original);assert.equal(inspectMove(b.map(v=>v?2:0),idx(7,7),2,renju).legal,true);});
test('cross double four rejected',()=>{const b=setup([[5,7],[6,7],[8,7],[7,5],[7,6],[7,8]]);assert.equal(inspectMove(b,idx(7,7),1,renju).reason,'四四禁手');});
test('a straight four with two winning ends counts as one four',()=>{const b=setup([[5,7],[6,7],[8,7]]);assert.equal(inspectMove(b,idx(7,7),1,renju).legal,true);b[idx(7,7)]=1;assert.equal(fours(b,idx(7,7)).length,1);assert.equal(fours(b,idx(7,7))[0].ends.size,2);});
test('two fours in the same direction are forbidden',()=>{const b=setup([[3,7],[5,7],[6,7],[9,7]]);assert.equal(inspectMove(b,idx(7,7),1,renju).reason,'四四禁手');});
test('an edge or a white blocker makes a three false',()=>{const b=setup([[0,7],[1,7],[2,6],[2,8]]);assert.equal(inspectMove(b,idx(2,7),1,renju).legal,true);const c=setup([[6,7],[8,7],[7,6],[7,8]],[[4,7],[9,7]]);assert.equal(inspectMove(c,idx(7,7),1,renju).legal,true);});
test('a broken three is still a real three',()=>{const b=setup([[5,7],[8,7],[7,6],[7,8]]);assert.equal(inspectMove(b,idx(7,7),1,renju).reason,'三三禁手');});
test('pseudo-three whose extensions both make overlines is legal',()=>{
 const b=setup([[6,7],[8,7],[7,6],[7,8],[5,4],[5,5],[5,6],[5,8],[5,9],[9,4],[9,5],[9,6],[9,8],[9,9]]);
 assert.equal(inspectMove(b,idx(7,7),1,renju).legal,true);
});
test('13, 15 and 19 boards all use their own center and bounds',()=>{for(const size of [13,15,19]){const b=createBoard(size);assert.deepEqual(availableMoves(b,1,{size}),[Math.floor(size**2/2)]);assert.equal(inspectMove(b,size**2,1,{size}).legal,false);}assert.equal(coordinate(112),'H8');assert.equal(coordinate(8),'J15');});
test('all difficulty levels take immediate wins and block immediate losses',()=>{
 for(const level of Object.keys(LEVELS)){
  const b=setup([[3,7],[4,7],[5,7],[6,7]],[[2,7]]);const original=[...b];assert.equal(chooseMove(b,1,{},level).index,idx(7,7));assert.equal(chooseMove(b,2,{},level).index,idx(7,7));assert.deepEqual(b,original);
 }
});
test('AI returns legal moves under forbidden rules',()=>{const b=setup([[6,7],[8,7],[7,6],[7,8]],[[6,6],[8,8],[8,6],[6,8]]);for(const level of Object.keys(LEVELS)){const r=chooseMove(b,1,renju,level,()=>0);assert.equal(inspectMove(b,r.index,1,renju).legal,true);}});
test('AI returns null on a full board',()=>assert.equal(chooseMove(Array(225).fill(1),2).index,null));
test('26 opening patterns have unique standard first triples and valid example moves',()=>{
 assert.equal(OPENINGS.length,26);assert.equal(new Set(OPENINGS.map(o=>o.moves.slice(0,3).join(','))).size,26);
 for(const o of OPENINGS){const g=newGame(DEFAULTS);for(const i of o.moves)assert.equal(play(g,i).legal,true,o.name);assert.equal(g.result,null,o.name);}
 const flower=OPENINGS.find(o=>o.name==='花月');assert.deepEqual(flower.moves.slice(0,3),[112,97,98]);const pu=OPENINGS.find(o=>o.name==='浦月');assert.deepEqual(pu.moves.slice(0,3),[112,98,128]);
});
test('game stops after a win and result is counted exactly once',()=>{const g=newGame(DEFAULTS);[0,15,1,16,2,17,3,18,4].forEach(i=>play(g,i));assert.equal(g.result.winner,1);assert.equal(play(g,20).legal,false);let records=recordResult([],g);assert.equal(recordResult(records,g).length,1);assert.equal(summarize(records).wins,1);});
test('undo human/AI pair, undo while thinking, and preserve AI first move',()=>{
 const g=newGame(DEFAULTS);[112,113,97,98].forEach(i=>play(g,i));assert.equal(undo(g),true);assert.deepEqual(g.moves,[112,113]);assert.equal(g.assisted,true);play(g,97);undo(g);assert.deepEqual(g.moves,[112,113]);
 const white=newGame({...DEFAULTS,human:2});play(white,112);assert.equal(undo(white),false);[113,97].forEach(i=>play(white,i));undo(white);assert.deepEqual(white.moves,[112]);
});
test('local mode undo removes one move; practice excluded from win rates; local excluded from history',()=>{const g=newGame({...DEFAULTS,mode:'local'});play(g,112);play(g,113);undo(g);assert.deepEqual(g.moves,[112]);g.result={winner:1};assert.deepEqual(recordResult([],g),[]);const h=newGame(DEFAULTS,[],true);h.result={winner:1};const r=recordResult([],h);assert.equal(r.length,1);assert.equal(summarize(r).total,0);});
test('per-level stats include draws in denominator',()=>{const records=[{level:'beginner',result:'win'},{level:'beginner',result:'draw'},{level:'strong',result:'loss'},{level:'beginner',result:'loss',assisted:true}];assert.equal(summarize(records,'beginner').rate,50);assert.equal(summarize(records,null).total,3);assert.equal(summarize(records).total,0);});
test('saved settings, unfinished game and results restore; malformed data recovers',()=>{let value=null;const storage={getItem:()=>value,setItem:(_k,v)=>value=v};const g=newGame(DEFAULTS);play(g,112);assert.equal(save(storage,DEFAULTS,g,[]),true);const restored=load(storage);assert.deepEqual(restored.game,g);assert.deepEqual(boardOf(restored.game),boardOf(g));value='garbage';assert.equal(load(storage),null);value=JSON.stringify({version:1,settings:{size:2}});assert.equal(load(storage),null);});
test('v1.0 saves retain history and migrate unfinished old AI games into practice',()=>{
 const settings={...DEFAULTS,level:'expert'};delete settings.engineId;delete settings.thinkMs;
 const game=newGame(settings,[112,113]);
 const records=[{id:'old',at:1,level:'expert',result:'win',moves:[112],assisted:false}];
 const restored=load({getItem:()=>JSON.stringify({version:1,settings,game,records})});
 assert.deepEqual(restored.records,records);assert.equal(summarize(restored.records).total,0);
 assert.equal(restored.settings.level,'rapfi');assert.equal(restored.settings.thinkMs,10000);
 assert.deepEqual(restored.game.moves,game.moves);assert.equal(restored.game.migrated,true);assert.equal(restored.game.assisted,true);
 restored.game.result={winner:1,reason:'测试'};
 assert.equal(summarize(recordResult(restored.records,restored.game)).total,0);
});
test('completed old games keep their opponent identity; new Rapfi records carry model and time budget',()=>{
 const settings={...DEFAULTS,level:'expert'};const game=newGame(settings,[112]);game.result={winner:2};
 const restored=load({getItem:()=>JSON.stringify({version:1,settings,game,records:[]})});
 assert.equal(restored.game.settings.level,'expert');assert.equal(restored.game.assisted,false);
 const fresh=newGame({...DEFAULTS,thinkMs:60000});fresh.result={winner:1};
 const records=recordResult([],fresh);assert.equal(records[0].engineId,DEFAULTS.engineId);assert.equal(records[0].thinkMs,60000);assert.equal(summarize(records).wins,1);
});

test('coach saves and results retain their strength without becoming legacy practice',()=>{
 const settings={...DEFAULTS,level:'rapfi-coach',strength:0,thinkMs:500},game=newGame(settings,[112,113]);
 const restored=load({getItem:()=>JSON.stringify({version:1,settings,game,records:[]})});
 assert.deepEqual(restored.settings,settings);assert.deepEqual(restored.game,game);
 let records=[];
 for(const [level,strength,winner,assisted] of [['rapfi',100,1,false],['rapfi-coach',0,1,false],['rapfi-coach',20,2,false],['rapfi-coach',0,0,false],['rapfi-coach',0,2,true]]){
  const g=newGame({...settings,level,strength});g.result={winner,reason:'测试'};g.assisted=assisted;records=recordResult(records,g);
 }
 assert.equal(summarize(records).total,1);assert.equal(summarize(records,'rapfi-coach').total,3);
 assert.equal(summarize(records,'rapfi-coach',0).rate,50);assert.equal(summarize(records,'rapfi-coach',20).losses,1);
 const history=load({getItem:()=>JSON.stringify({version:1,settings,game,records})});assert.deepEqual(history.records,records);
});
test('v1.2 Rapfi saves retain full strength and historical statistics',()=>{
 const settings={...DEFAULTS};delete settings.strength;
 const game=newGame(settings,[112,113]),records=[{at:1,level:'rapfi',result:'win'}];
 const restored=load({getItem:()=>JSON.stringify({version:1,settings,game,records})});
 assert.equal(restored.game.settings.strength,100);assert.equal(restored.game.assisted,false);
 assert.equal(summarize(restored.records).rate,100);
});
