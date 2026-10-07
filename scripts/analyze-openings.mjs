import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {OPENINGS} from '../src/openings.js';
import {createBoard,inspectMove} from '../src/engine.js';
const {RapfiEngine,ENGINE_ID}=createRequire(import.meta.url)('../electron/rapfi.cjs');
const thinkMs=30000,multiPv=6,threads=2,hashMB=256;
const concurrency=Math.max(1,Math.min(3,Math.floor(os.availableParallelism()/threads)-1));
const output='reports/opening-analysis.json';
const manifest=JSON.parse(await fs.readFile('native/rapfi/manifest.json','utf8'));
let report={schema:1,engineId:ENGINE_ID,sourceCommit:manifest.sourceCommit,networksCommit:manifest.networksCommit,createdAt:new Date().toISOString(),settings:{strength:100,thinkMs,multiPv,threads,hashMB,concurrency,size:15},positions:{}};
try {const previous=JSON.parse(await fs.readFile(output,'utf8'));if(JSON.stringify(previous.settings)===JSON.stringify(report.settings)&&previous.engineId===report.engineId&&previous.sourceCommit===report.sourceCommit&&previous.networksCommit===report.networksCommit&&OPENINGS.every(o=>['renju','freestyle'].every(rule=>!previous.positions[`${o.code}:${rule}`]||JSON.stringify(previous.positions[`${o.code}:${rule}`].moves)===JSON.stringify(o.moves))))report=previous;} catch(error){if(error.code!=='ENOENT')throw error;}
const tasks=OPENINGS.flatMap(o=>['renju','freestyle'].map(rule=>({o,rule,key:`${o.code}:${rule}`}))).filter(t=>!report.positions[t.key]);
let next=0,completed=Object.keys(report.positions).length,write=Promise.resolve();
function validate(moves,forbidden){const board=createBoard();for(const [ply,i]of moves.entries()){const r=inspectMove(board,i,ply%2+1,{size:15,forbidden});if(!r.legal)throw new Error(`Illegal PV at ply ${ply+1}: ${r.reason}`);board[i]=ply%2+1;}}
function persist(){const data=JSON.stringify(report,null,2)+'\n';write=write.then(async()=>{await fs.writeFile(output+'.tmp',data);await fs.rename(output+'.tmp',output);});return write;}
await fs.mkdir('reports',{recursive:true});
await Promise.all(Array.from({length:concurrency},async()=>{
 const engine=new RapfiEngine(path.resolve('native/rapfi'),{threads,hashMB,freshSearch:true});
 try {
  while(next<tasks.length){
   const {o,rule,key}=tasks[next++],forbidden=rule==='renju';
   const result=await engine.analyze({id:next,size:15,moves:o.moves.slice(0,3),forbidden,thinkMs,strength:100,multiPv});
   if(!result.neuralLoaded||result.candidates.length<2)throw new Error(`${key}: incomplete neural analysis`);
   for(const c of result.candidates){if(c.moves.length<3)throw new Error(`${key}: short PV`);validate([...o.moves.slice(0,3),...c.moves.slice(0,3)],forbidden);}
   report.positions[key]={opening:o.name,rule,moves:o.moves.slice(0,3),elapsedMs:result.elapsedMs,bestMove:result.index,candidates:result.candidates};
   await persist();console.log(`${++completed}/52 ${o.name} ${rule}: depth ${result.candidates[0].depth}, ${result.candidates.length} lines, ${result.elapsedMs}ms`);
  }
 }finally{engine.close();}
}));
await write;
console.log(`Saved ${Object.keys(report.positions).length} full-strength analyses to ${output}`);
