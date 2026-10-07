import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chooseMove } from '../tests/fixtures/legacy-ai.js';
import { newGame, play, boardOf, DEFAULTS } from '../src/state.js';
import { OPENINGS } from '../src/openings.js';
const require=createRequire(import.meta.url);
const {RapfiEngine,ENGINE_ID}=require('../electron/rapfi.cjs');
const cases=[['花月',false],['疏星',false],['浦月',true],['流星',true]];
const report={engine:ENGINE_ID,createdAt:new Date().toISOString(),description:'Small regression match, not an Elo or tournament-strength estimate. Four fixed three-ply openings, paired colors. Native Rapfi 400ms/2 threads versus previous expert 2200ms/single JS thread.',games:[]};
for(const [name,forbidden] of cases) for(const rapfiColor of [1,2]){
 const engine=new RapfiEngine(path.resolve('native/rapfi'),{threads:2,hashMB:64});
 const initial=OPENINGS.find(o=>o.name===name).moves.slice(0,3);
 const game=newGame({...DEFAULTS,forbidden},initial);
 const detail={opening:name,forbidden,rapfiColor,rapfiMs:400,oldMs:2200,rapfiDepths:[],rapfiNodes:[]};
 try{
  while(!game.result&&game.moves.length<120){
   const color=game.moves.length%2+1;
   const result=color===rapfiColor?await engine.analyze({id:game.moves.length,size:15,moves:game.moves,forbidden,thinkMs:400}):chooseMove(boardOf(game),color,game.settings,'expert');
   if(color===rapfiColor){detail.rapfiDepths.push(result.depth);detail.rapfiNodes.push(result.nodes);}
   if(result.index===null)throw new Error('No move');
   const verdict=play(game,result.index);
   if(!verdict.legal)throw new Error(`Illegal move: ${verdict.reason}`);
  }
  detail.result=game.result?game.result.winner===rapfiColor?'rapfi-win':game.result.winner===0?'draw':'legacy-win':'move-cap';
  detail.moves=game.moves;detail.reason=game.result?.reason || '120-ply cap';report.games.push(detail);
  console.log(`${report.games.length}/8 ${name} ${forbidden?'Renju':'Freestyle'} Rapfi ${rapfiColor===1?'Black':'White'}: ${detail.result} in ${game.moves.length} plies`,{depth:Math.max(...detail.rapfiDepths),nodes:detail.rapfiNodes.reduce((a,b)=>a+b,0)});
 }finally{engine.close();}
 await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/ai-match.json',JSON.stringify(report,null,2)+'\n');
}
report.summary={wins:report.games.filter(g=>g.result==='rapfi-win').length,losses:report.games.filter(g=>g.result==='legacy-win').length,draws:report.games.filter(g=>g.result==='draw').length,capped:report.games.filter(g=>g.result==='move-cap').length};
await fs.writeFile('reports/ai-match.json',JSON.stringify(report,null,2)+'\n');console.log(report.summary);
