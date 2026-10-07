// Rapfi's INFO PV frames are provisional until every candidate at that depth
// has completed. Keep one complete iteration, never mix search depths/ranks.
function scoreValue(score) {
  if (/^-?\d+$/.test(score)) return Number(score);
  const mate=score.match(/^([+-])M(\d+|\*)$/);
  if(mate)return (mate[1]==='+'?1:-1)*(100000-(mate[2]==='*'?0:Number(mate[2])));
  return NaN;
}
class PvCollector {
  constructor(position) { this.position = position; this.current = null; this.iteration = []; this.completed = []; }
  receive(line) {
    const begin = line.match(/^INFO PV (\d+)$/);
    if (begin) { this.current = { slot:Number(begin[1]) }; return; }
    const frame = this.current;
    if (!frame) return;
    const number = line.match(/^INFO (NUMPV|DEPTH|SELDEPTH|TOTALNODES|TOTALTIME|WINRATE) (\S+)$/);
    if (number) { const n=Number(number[2]); if(Number.isFinite(n))frame[number[1]]=n; }
    const score = line.match(/^INFO EVAL (\S+)$/);
    if (score) frame.score=score[1];
    const pv = line.match(/^INFO BESTLINE (.+)$/);
    if (pv) {
      const {size,moves}=this.position, seen=new Set(moves), result=[];
      for(const token of pv[1].trim().split(/\s+/)) {
        const m=token.match(/^(\d+),(\d+)$/);
        if(!m){result.length=0;break;}
        const x=Number(m[1]),y=Number(m[2]),i=y*size+x;
        if(x>=size||y>=size||seen.has(i)){result.length=0;break;}
        seen.add(i);result.push(i);
      }
      frame.moves=result;
    }
    if(line!=='INFO PV DONE')return;
    this.current=null;
    if(!frame.moves?.length||!Number.isInteger(frame.DEPTH)||!Number.isInteger(frame.NUMPV)||frame.NUMPV<1||frame.NUMPV>8||!(frame.WINRATE>=0&&frame.WINRATE<=1)||!frame.score||!Number.isFinite(scoreValue(frame.score)))return;
    if(frame.slot===0)this.iteration=[];
    if(frame.slot!==this.iteration.length||this.iteration.some(f=>f.DEPTH!==frame.DEPTH||f.NUMPV!==frame.NUMPV)){this.iteration=[];return;}
    this.iteration.push(frame);
    if(this.iteration.length===frame.NUMPV&&new Set(this.iteration.map(f=>f.moves[0])).size===frame.NUMPV)this.completed=this.iteration.map(f=>({...f}));
  }
  result() {
    return this.completed.map(f=>({moves:f.moves,score:f.score,winRate:f.WINRATE,depth:f.DEPTH,selectiveDepth:f.SELDEPTH,nodes:f.TOTALNODES,searchMs:f.TOTALTIME}))
      .sort((a,b)=>scoreValue(b.score)-scoreValue(a.score));
  }
}
module.exports={PvCollector,scoreValue};
