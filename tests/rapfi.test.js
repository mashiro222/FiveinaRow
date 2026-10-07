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
 for(const bad of [position([112,112]),position([-1]),position([225]),position([],{size:14}),position([],{thinkMs:Infinity}),position([],{thinkMs:60001}),position([],{id:';quit'}),position([],{size:19,forbidden:true})])assert.throws(()=>validatePosition(bad));
});
test('native Rapfi loads pretrained networks for every supported size and both Renju colors',{skip:!native,timeout:30000},async()=>{
 for(const [size,forbidden,moves] of [[13,false,[84]],[15,false,[112]],[19,false,[180]],[15,true,[112]],[15,true,[112,113]]]){
  const r=await engine.analyze(position(moves,{size,forbidden}));
  assert.equal(r.engineId,ENGINE_ID);assert.equal(r.neuralLoaded,true,`${size}, ${forbidden}`);
  const board=createBoard(size);moves.forEach((i,ply)=>board[i]=ply%2+1);
  assert.equal(inspectMove(board,r.index,moves.length%2+1,{size,forbidden}).legal,true);
  assert.ok(r.depth>4,'Search must actually run beyond the previous shallow search');
 }
});
test('native Rapfi takes an immediate win and prevents a forced loss',{skip:!native,timeout:15000},async()=>{
 // Black has four at (3..6,7), white has blocked (2,7). Both turns tested.
 const win=[108,107,109,0,110,2,111,4];
 assert.equal((await engine.analyze(position(win))).index,112);
 const defense=[108,107,109,0,110,2,111];
 assert.equal((await engine.analyze(position(defense))).index,112);
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
