import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newGame, play, DEFAULTS } from '../src/state.js';
import { OPENINGS } from '../src/openings.js';
const { RapfiEngine, ENGINE_ID } = createRequire(import.meta.url)('../electron/rapfi.cjs');
const report = { engine:ENGINE_ID, createdAt:new Date().toISOString(), description:'Small strength-control smoke match, not human calibration or Elo. Coach 0 and 20 versus full 100, paired colors on two fixed openings (freestyle and Renju), all at 1000ms/2 threads/64MB. Random coach selections make results variable. 120-ply caps are not draws.', games:[] };
const output='reports/coach-match.json';
for (const strength of [0,20]) for (const [name,forbidden] of [['疏星',false],['流星',true]]) for (const coachColor of [1,2]) {
  const engines=[new RapfiEngine(path.resolve('native/rapfi'),{threads:2,hashMB:64}),new RapfiEngine(path.resolve('native/rapfi'),{threads:2,hashMB:64})];
  const game=newGame({...DEFAULTS,forbidden},OPENINGS.find(o=>o.name===name).moves.slice(0,3));
  const detail={opening:name,forbidden,coachColor,strength,thinkMs:1000,coachDepths:[],fullDepths:[]};
  try {
    while (!game.result&&game.moves.length<120) {
      const color=game.moves.length%2+1,coach=color===coachColor;
      const result=await engines[color-1].analyze({id:game.moves.length,size:15,moves:game.moves,forbidden,strength:coach?strength:100,thinkMs:1000});
      (coach?detail.coachDepths:detail.fullDepths).push(result.depth);
      const check=play(game,result.index);
      if(!check.legal)throw new Error(`Illegal ${coach?'coach':'full'} move: ${check.reason}`);
    }
    detail.result=!game.result?'move-cap':game.result.winner===0?'draw':game.result.winner===coachColor?'coach-win':'full-win';
    detail.moves=game.moves;detail.reason=game.result?.reason||'120-ply cap';report.games.push(detail);
    console.log(`${report.games.length}/8: coach ${strength}, ${name}, ${forbidden?'Renju':'freestyle'}, coach ${coachColor===1?'black':'white'}: ${detail.result}, ${game.moves.length} plies`);
  } finally {engines.forEach(e=>e.close());}
  await fs.mkdir('reports',{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
}
report.summary=Object.fromEntries(['coach-win','full-win','draw','move-cap'].map(result=>[result,report.games.filter(g=>g.result===result).length]));
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(report.summary);
