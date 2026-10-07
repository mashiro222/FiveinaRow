import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {selectVariations} from './opening-selection.mjs';
import {createBoard,inspectMove} from '../src/engine.js';
const {RapfiEngine}=createRequire(import.meta.url)('../electron/rapfi.cjs');
const source=JSON.parse(await fs.readFile('reports/opening-analysis.json','utf8'));
const output='reports/opening-extra-analysis.json';
let report={schema:1,engineId:source.engineId,settings:source.settings,positions:{}};
try{const previous=JSON.parse(await fs.readFile(output,'utf8'));if(previous.engineId===source.engineId&&JSON.stringify(previous.settings)===JSON.stringify(source.settings))report=previous;}catch(e){if(e.code!=='ENOENT')throw e;}
const tasks=Object.entries(source.positions).filter(([k,p])=>selectVariations(p,report.positions[k]||[]).length<3);
let next=0,done=0,write=Promise.resolve();
await Promise.all(Array.from({length:3},async()=>{
 const engine=new RapfiEngine(path.resolve('native/rapfi'),{threads:2,hashMB:256,freshSearch:true});
 try{while(next<tasks.length){
  const [key,root]=tasks[next++];
  for(const ply of [5,4]){
   const existing=report.positions[key]||[],lines=selectVariations(root,existing);
   if(lines.length>=3)break;
   if(existing.some(p=>p.moves.length===ply))continue;
   const moves=lines[0].moves.slice(0,ply),forbidden=root.rule==='renju';
   const result=await engine.analyze({id:next*10+ply,moves,size:15,forbidden,strength:100,multiPv:6,thinkMs:30000});
   if(!result.neuralLoaded||!result.candidates.length)throw new Error(`${key}: no neural candidates`);
   for(const c of result.candidates){
    if(c.moves.length<6-ply)throw new Error(`${key}: short PV`);
    const board=createBoard();for(const [n,i]of [...moves,...c.moves.slice(0,6-ply)].entries()){const check=inspectMove(board,i,n%2+1,{size:15,forbidden});if(!check.legal)throw new Error(check.reason);board[i]=n%2+1;}
   }
   report.positions[key]=[...existing,{moves,rule:root.rule,elapsedMs:result.elapsedMs,candidates:result.candidates}];
   const data=JSON.stringify(report,null,2)+'\n';write=write.then(async()=>{await fs.writeFile(output+'.tmp',data);await fs.rename(output+'.tmp',output);});await write;
   console.log(`${key} ply ${ply+1}: ${selectVariations(root,report.positions[key]).length} selected lines`);
  }
  console.log(`Enriched ${++done}/${tasks.length}: ${key}`);
 }}finally{engine.close();}
}));
await write;
