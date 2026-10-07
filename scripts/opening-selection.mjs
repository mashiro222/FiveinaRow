import {createRequire} from 'node:module';
const {scoreValue}=createRequire(import.meta.url)('../electron/rapfi-pv.cjs');
const transforms=[(x,y)=>[x,y],(x,y)=>[-x,y],(x,y)=>[x,-y],(x,y)=>[-x,-y],(x,y)=>[y,x],(x,y)=>[-y,x],(x,y)=>[y,-x],(x,y)=>[-y,-x]];
const transformed=(i,fn)=>{const [x,y]=fn(i%15-7,Math.floor(i/15)-7);return (y+7)*15+x+7;};
export const SELECTION={maxWinRateLoss:.08,maxScoreLoss:200,maxLines:3,symmetryDeduplicated:true};
export function canonicalLine(moves,prefix){return transforms.filter(fn=>prefix.every(i=>transformed(i,fn)===i)).map(fn=>moves.map(i=>transformed(i,fn)).join(',')).sort()[0];}
function candidates(position){
 const ranked=[...position.candidates].sort((a,b)=>scoreValue(b.score)-scoreValue(a.score)),best=ranked[0];
 return ranked.filter(c=>best.winRate-c.winRate<=SELECTION.maxWinRateLoss&&scoreValue(best.score)-scoreValue(c.score)<=SELECTION.maxScoreLoss)
  .map(c=>({moves:[...position.moves,...c.moves.slice(0,6-position.moves.length)],rank:ranked.indexOf(c)+1,score:c.score,blackWinRate:position.moves.length%2?1-c.winRate:c.winRate,depth:c.depth,analysisPly:position.moves.length}));
}
export function selectVariations(position,extras=[]){
 const analyses=extras.map(extra=>({prefix:extra.moves,lines:candidates(extra)})).sort((a,b)=>a.prefix.length-b.prefix.length);
 const matches=(moves,prefix)=>prefix.every((m,i)=>moves[i]===m);
 // A dedicated child search supersedes the older PV tail, but preserves the
 // choices of that child search itself. Do not retain a move now shown inferior
 // merely to reach three variations.
 const refine=line=>{
  let result=line;
  for(const a of analyses)if(a.prefix.length>result.analysisPly&&matches(result.moves,a.prefix))result=a.lines[0];
  return result;
 };
 const roots=candidates(position).map(refine);
 const continuations=analyses.flatMap(a=>a.lines.map(refine));
 const seen=new Set(),selected=[];
 for(const v of [...roots,...continuations]){
  if(analyses.some(a=>matches(v.moves,a.prefix)&&!a.lines.some(c=>c.moves[a.prefix.length]===v.moves[a.prefix.length])))continue;
  const key=canonicalLine(v.moves,position.moves);
  if(seen.has(key))continue;seen.add(key);selected.push({...v,id:`${position.rule}-${selected.length+1}`});
  if(selected.length===SELECTION.maxLines)break;
 }
 return selected;
}
