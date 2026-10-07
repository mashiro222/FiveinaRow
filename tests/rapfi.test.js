import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createBoard,inspectMove } from '../src/engine.js';
const require=createRequire(import.meta.url);
const {RapfiEngine,ENGINE_ID,boardCommand,validatePosition}=require('../electron/rapfi.cjs');
const directory=path.resolve('native/rapfi');
const engine=new RapfiEngine(directory,{threads:2,hashMB:64});
const position=(moves,extra={})=>({id:1,size:15,moves,forbidden:false,thinkMs:250,...extra});
const native=process.env.YIJIAN_NATIVE_TEST==='1';
test.after(()=>engine.close());
test('Piskvork positions preserve move order and relative self/opponent colors',()=>{
 assert.equal(boardCommand(position([112])),'BOARD\n7,7,2\nDONE');
 assert.equal(boardCommand(position([112,113])),'BOARD\n7,7,1\n8,7,2\nDONE');
 assert.equal(boardCommand(position([])),'BOARD\nDONE');
});
test('native adapter rejects malformed positions, duplicate points, non-15 Renju and excessive compute',()=>{
 for(const bad of [position([112,112]),position([-1]),position([225]),position([],{size:14}),position([],{thinkMs:Infinity}),position([],{thinkMs:60001}),position([],{id:';quit'}),position([],{size:19,forbidden:true}),...[-1,101,1.5,'20',null,NaN].map(strength=>position([],{strength}))])assert.throws(()=>validatePosition(bad));
});
test('commands wait for readiness when a move was printed before search cleanup finished',async()=>{
 const guarded=new RapfiEngine(directory);const writes=[];let probes=0;
 guarded.start=()=>{guarded.child={stdin:{write(text){
  writes.push(text);
  if(text==='ABOUT\n'){
   if(++probes===3)queueMicrotask(()=>guarded.receive('name="Rapfi", version="test"'));
  }else{
   queueMicrotask(()=>{guarded.receive('MESSAGE Evaluator set to mix9svq');guarded.receive('7,7');});
  }
 }},kill(){},killed:false};};
 try{
  const result=await guarded.analyze(position([]));
  assert.equal(result.index,112);assert.deepEqual(writes.slice(0,3),['ABOUT\n','ABOUT\n','ABOUT\n']);
  assert.equal(writes.length,4);assert.match(writes[3],/INFO RULE 0\nINFO THREAD_NUM \d+\nSTART 15/);
 }finally{guarded.close();}
});
test('Rapfi WINRATE is converted from side-to-move into black probability, including streamed updates', async () => {
 for (const moves of [[112], [112,113]]) {
  const updates=[], adapter=new RapfiEngine(directory,{onProgress:p=>updates.push(p)});
  adapter.start=()=>{adapter.child={stdin:{write(text){queueMicrotask(()=>{
   if(text==='ABOUT\n')adapter.receive('name="Rapfi", version="test"');
   else {adapter.receive('MESSAGE Evaluator set to mix9svq');adapter.receive('INFO WINRATE 0.8');adapter.receive('INFO WINRATE NaN');adapter.receive('INFO WINRATE 200');adapter.receive('6,7');}
  });}},kill(){},killed:false};};
  try {const result=await adapter.analyze(position(moves));assert.ok(Math.abs(result.blackWinRate-(moves.length%2?.2:.8))<1e-9);assert.equal(updates.length,1);assert.equal(updates[0].blackWinRate,result.blackWinRate);}
  finally{adapter.close();}
 }
});
test('native Rapfi loads pretrained networks for every supported size and both Renju colors',{skip:!native,timeout:30000},async()=>{
 for(const [size,forbidden,moves] of [[13,false,[84]],[15,false,[112]],[19,false,[180]],[15,true,[112]],[15,true,[112,113]]]){
  const r=await engine.analyze(position(moves,{size,forbidden}));
  assert.equal(r.engineId,ENGINE_ID);assert.equal(r.neuralLoaded,true,`${size}, ${forbidden}`);
  const board=createBoard(size);moves.forEach((i,ply)=>board[i]=ply%2+1);
  assert.equal(inspectMove(board,r.index,moves.length%2+1,{size,forbidden}).legal,true);
  assert.ok(r.depth>4,'Search must actually run beyond the previous shallow search');
  assert.ok(Number.isFinite(r.blackWinRate) && r.blackWinRate >= 0 && r.blackWinRate <= 1, 'Native engine must emit a valid probability');
 }
});
test('native Rapfi takes an immediate win and prevents a forced loss',{skip:!native,timeout:15000},async()=>{
 // Black has four at (3..6,7), white has blocked (2,7). Both turns tested.
 const win=[108,107,109,0,110,2,111,4];
 assert.equal((await engine.analyze(position(win))).index,112);
 const defense=[108,107,109,0,110,2,111];
 assert.equal((await engine.analyze(position(defense))).index,112);
});
test('three live evaluators replace opening searches and still score the latest position', {skip:!native,timeout:60000}, async () => {
 const evaluators=Array.from({length:3},()=>new RapfiEngine(directory,{threads:2,hashMB:128,freshSearch:true}));
 try {
  for(let round=0;round<3;round++)await Promise.all(evaluators.map(async adapter=>{
   await adapter.analyze(position([],{id:100+round*3,forbidden:true}));
   const old=adapter.analyze(position([112],{id:101+round*3,forbidden:true,thinkMs:1500}));
   const cancelled=old.catch(error=>{if(error.code!=='CANCELLED')throw error;});
   await new Promise(resolve=>setTimeout(resolve,40));adapter.cancel(101+round*3);await cancelled;
   const latest=await adapter.analyze(position([112,113],{id:102+round*3,forbidden:true,thinkMs:1500}));
   assert.equal(latest.id,102+round*3);assert.ok(Number.isFinite(latest.blackWinRate));assert.ok(latest.neuralLoaded);
  }));
 } finally {for(const adapter of evaluators)adapter.close();}
});
test('Renju AI never takes the tempting central double-three',{skip:!native,timeout:10000},async()=>{
 const moves=[111,96,113,128,97,98,127,126];
 const r=await engine.analyze(position(moves,{forbidden:true}));
 const board=createBoard();moves.forEach((i,ply)=>board[i]=ply%2+1);
 assert.notEqual(r.index,112);assert.equal(inspectMove(board,r.index,1,{forbidden:true}).legal,true);
});
test('cancellation rejects old work and cannot cancel a later request',{skip:!native,timeout:15000},async()=>{
 const first=engine.analyze(position([112],{id:41,thinkMs:10000}));
 const rejected=assert.rejects(first,e=>e.code==='CANCELLED');
 await new Promise(r=>setTimeout(r,60));engine.cancel(41);await rejected;
 const second=engine.analyze(position([112],{id:42}));engine.cancel(41);
 assert.equal((await second).id,42);
});
test('missing engine files fail instead of falling back to the old AI',async()=>{
 const invalid=new RapfiEngine(path.resolve('tests/fixtures'));
 await assert.rejects(invalid.analyze(position([112])));assert.equal(invalid.child,null);
});
test('corrupted model fails integrity verification before spawning any engine',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rapfi-corrupt-'));
 try {
  await fs.writeFile(path.join(temp,'weight.bin'),'corrupted');
  await fs.writeFile(path.join(temp,'manifest.json'),JSON.stringify({engineId:ENGINE_ID,platform:process.platform,arch:process.arch,files:{'weight.bin':'0'.repeat(64)}}));
  const invalid=new RapfiEngine(temp);
  await assert.rejects(invalid.analyze(position([112])),/文件损坏/);assert.equal(invalid.child,null);
 } finally {await fs.rm(temp,{recursive:true,force:true});}
});

test('strength changes clear full-strength caches, while equal-strength moves reuse the process',async()=>{
 const adapter=new RapfiEngine(directory), writes=[];let starts=0,kills=0;
 adapter.start=()=>{
  if(adapter.child)return;
  starts++;
  adapter.child={stdin:{write(text){
   writes.push(text);
   queueMicrotask(()=>{
    if(text==='ABOUT\n')adapter.receive('name="Rapfi", version="test"');
    else {adapter.receive('MESSAGE Evaluator set to mix9svq');adapter.receive('6,6');}
   });
  }},kill(){kills++;},killed:false};
 };
 try{
  for(const strength of [20,20,100,20,0])assert.equal((await adapter.analyze(position([112,113],{strength}))).strength,strength);
  assert.equal(starts,4);assert.equal(kills,3);
  const commands=writes.filter(w=>w.startsWith('INFO'));
  assert.deepEqual(commands.map(c=>Number(c.match(/INFO STRENGTH (\d+)/)[1])),[20,20,100,20,0]);
  assert.ok(!commands[1].includes('START 15'),'Same-strength search should retain its table');
  assert.ok(commands[2].includes('START 15')&&commands[3].includes('START 15'),'Hints and coach each need fresh initialization');
  assert.equal(validatePosition(position([])).strength,100);
 }finally{adapter.close();}
});
test('native coach limits depth, handles every board and Renju color, and survives full hints',{skip:!native,timeout:30000},async()=>{
 const coach=new RapfiEngine(directory,{threads:2,hashMB:64});
 try{
  for(const [size,forbidden,moves] of [[13,false,[84,85]],[15,false,[112,113]],[19,false,[180,181]],[15,true,[112]],[15,true,[112,113]]]){
   const r=await coach.analyze(position(moves,{size,forbidden,strength:0,thinkMs:1000}));
   const board=createBoard(size);moves.forEach((i,ply)=>board[i]=ply%2+1);
   assert.equal(inspectMove(board,r.index,moves.length%2+1,{size,forbidden}).legal,true);
   assert.ok(r.neuralLoaded);assert.ok(r.depth>0&&r.depth<=4,`Coach 0 depth was ${r.depth}`);
  }
  const moves=[112,113,97,127];
  const full=await coach.analyze(position(moves,{strength:100,thinkMs:1000}));
  assert.ok(full.depth>4);
  const low=await coach.analyze(position(moves,{strength:20,thinkMs:1000}));
  assert.ok(low.depth>0&&low.depth<=7,`Coach 20 depth was ${low.depth}`);
  const forbidden=[111,96,113,128,97,98,127,126];
  const r=await coach.analyze(position(forbidden,{forbidden:true,strength:0,thinkMs:1000}));
  const board=createBoard();forbidden.forEach((i,ply)=>board[i]=ply%2+1);
  assert.notEqual(r.index,112);assert.equal(inspectMove(board,r.index,1,{forbidden:true}).legal,true);
 }finally{coach.close();}
});
