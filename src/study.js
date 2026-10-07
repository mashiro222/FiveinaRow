import {coordinate} from './engine.js';
import {OPENING_ANALYSIS} from './opening-lines.js';

export {OPENING_ANALYSIS};
export function studyLines(opening,rule){return OPENING_ANALYSIS.openings[opening.code]?.[rule]?.variations || [];}
export function studyMoves(opening,rule,variation=0){return studyLines(opening,rule)[variation]?.moves || opening.moves;}
export function studyChoices(opening,rule,variation,step){
  const prefix=studyMoves(opening,rule,variation).slice(0,step),seen=new Set();
  if(step<3||step>=6)return [];
  return studyLines(opening,rule).flatMap((line,index)=>{
    const move=line.moves[step];
    if(!line.moves.slice(0,step).every((m,i)=>m===prefix[i])||seen.has(move))return [];
    seen.add(move);return [{move,variation:index,label:String.fromCharCode(65+index)}];
  });
}
const firstNotes=['黑 1 · 天元落子，保留四个方向的空间。','白 2 · 选择直指或斜指接应，形成开局的基本方向。','黑 3 · 到这里，开局名称确定。旋转或镜像后仍属于同一开局。'];
export function studyNote(moves,step){
  if(step<=3)return firstNotes[step-1];
  const index=moves[step-1],color=(step-1)%2+1,board=Array(225).fill(0);
  moves.slice(0,step-1).forEach((i,ply)=>board[i]=ply%2+1);
  const x=index%15,y=Math.floor(index/15),links=[];
  for(const [dx,dy]of [[1,0],[0,1],[1,1],[1,-1]])for(const sign of [-1,1]){
    for(let distance=1;distance<=4;distance++){
      const nx=x+dx*sign*distance,ny=y+dy*sign*distance;
      if(nx<0||nx>=15||ny<0||ny>=15)break;
      const i=ny*15+nx;if(board[i]&&board[i]!==color)break;
      if(board[i]===color)links.push(coordinate(i));
    }
  }
  const name=color===1?'黑':'白',location=coordinate(index);
  const observation=links.length?`与 ${links.join('、')} 的同色棋子在未被对手截断的线上呼应。`:'这一步没有直接连到四格内的同色棋子，重点观察接下来双方怎样接应。';
  return `${name} ${step} · ${location}。${observation}${step===6?' 六手演示到此，可从当前局面接着练习。':' 先想想对方会怎样应对，再看下一手。'}`;
}
