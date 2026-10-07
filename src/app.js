import { BLACK, coordinate, inspectMove, availableMoves } from './engine.js';
import { ENGINE, THINK_TIMES, opponentName } from './ai.js';
import { DEFAULTS, newGame, boardOf, play, undo, recordResult, summarize, load, save } from './state.js';
import { OPENINGS, STEP_NOTES, LESSONS } from './openings.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  grid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
  book: '<path d="M12 5v15M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Z"/>',
  chart: '<path d="M4 4v16h17M9 16v-5M14 16V6M19 16V9"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3c-1-2 0-3 2-3h2c4 0 4-5 1-8a10 10 0 0 0-7-4Z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="15" cy="7" r=".7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(1 -2)"/>',
  bulb: '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 3C7 1 2 8 6 15s15 3 14-12ZM5 21 16 9"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  reset: '<path d="M4 10a8 8 0 1 1 0 6M4 3v7h7"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
let persisted;
try { persisted = load(localStorage); } catch {}
let settings = persisted?.settings || {...DEFAULTS};
let game = persisted?.game || newGame(settings);
let records = persisted?.records || [];
let page = 'play', busy = false, progress = null, request = 0, hint = null, toastTimer, audioContext;
let opening = OPENINGS.find(o=>o.name==='花月'), step = 3, openingFilter = '全部', studySide = 'black', replay = null, replayStep = 0;
let keyboardCell = Math.floor(game.settings.size ** 2 / 2);
function persist() { if (!save(localStorage, settings, game, records)) toast('本机存储空间不足，当前战绩未能保存。请导出备份。'); }
function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>node.classList.remove('visible'),3500); }
function sound() {
  if (!settings.sound) return;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type='sine'; o.frequency.setValueAtTime(800,audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(220,audioContext.currentTime+.045); g.gain.setValueAtTime(.12,audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.075); o.connect(g).connect(audioContext.destination); o.start();o.stop(audioContext.currentTime+.08); } catch {}
}
function cancelAI() { window.rapfi?.cancel(request); request++; busy=false; progress=null; }
function scheduleAI() {
  if (game.result || game.settings.mode !== 'ai' || game.moves.length % 2 + 1 === game.settings.human || busy) return;
  compute('move');
}
window.rapfi?.onProgress(data => {
  if (!busy || data.id !== request) return;
  progress = data;
  const node = $('#engine-progress');
  if (node) node.textContent = `已搜索 ${data.depth} 层 · ${(data.nodes || 0).toLocaleString('zh-CN')} 个节点`;
});
async function compute(purpose) {
  cancelAI();busy=true;const id=++request;render();
  try {
    if (!window.rapfi) throw new Error('Rapfi 强力 AI 需要桌面版；浏览器预览可使用本地双人模式。');
    const data = await window.rapfi.analyze({id,moves:[...game.moves],size:game.settings.size,forbidden:game.settings.forbidden,thinkMs:game.settings.thinkMs || ENGINE.thinkMs});
    if (id !== request) return;
    busy=false;
    if (!data.ok) { if (data.cancelled) return; throw new Error(data.error); }
    const check = inspectMove(boardOf(game), data.index, game.moves.length % 2 + 1, game.settings);
    if (!check.legal) throw new Error(`Rapfi 返回的落点未通过规则校验：${check.reason}。请重试。`);
    progress = data;
    if (purpose === 'hint') { hint=data.index;render();toast(`Rapfi 建议 ${coordinate(data.index,game.settings.size)} · 本局记为练习`);return; }
    place(data.index,true);
  } catch (error) {
    if (id !== request) return;
    cancelAI();render();toast(error.message || 'Rapfi 暂时未能完成计算，请点击“重试 AI”。');
  }
}
function finish() { records=recordResult(records,game);persist(); }
function place(index,fromAI=false) {
  const keepFocus = document.activeElement?.matches('[data-cell]');
  if(game.result)return;
  if(busy)return;
  if(game.settings.mode==='ai' && game.moves.length%2+1!==game.settings.human && !fromAI) {toast('请等待 AI 落子');return;}
  const result=play(game,index);
  if(!result.legal){toast(result.reason+(result.reason.includes('禁手')||result.reason==='长连'?'：黑棋不能落在这里，请选择其他位置。':''));return;}
  hint=null;keyboardCell=index;sound();
  if(!game.result && game.settings.forbidden && game.moves.length%2+1===BLACK && !availableMoves(boardOf(game),BLACK,game.settings).length) game.result={winner:2,reason:'黑棋无合法落点',line:[]};
  if(game.result)finish();else persist();
  render();if(keepFocus)$(`[data-cell="${index}"]`)?.focus({preventScroll:true});scheduleAI();
}
function stone(color,extra='') {return `<span class="stone-dot ${color===1?'black':'white'} ${extra}"></span>`;}
function boardMarkup(moves,size,{interactive=true,small=false,result=null}={}) {
  const board=Array(size*size).fill(0);moves.forEach((v,i)=>board[v]=i%2+1);
  const inset=6,unit=88/(size-1),pos=i=>inset+i*unit;
  let grid='';for(let i=0;i<size;i++)grid+=`<line x1="${pos(i)}" y1="6" x2="${pos(i)}" y2="94"/><line x1="6" y1="${pos(i)}" x2="94" y2="${pos(i)}"/>`;
  const starPositions=size===19?[3,9,15]:size===15?[3,7,11]:[3,6,9];
  let stars='';for(const [x,y] of [[starPositions[0],starPositions[0]],[starPositions[2],starPositions[0]],[starPositions[1],starPositions[1]],[starPositions[0],starPositions[2]],[starPositions[2],starPositions[2]]])stars+=`<circle cx="${pos(x)}" cy="${pos(y)}" r=".38"/>`;
  let labels='';if(!small) for(let i=0;i<size;i++)labels+=`<text x="${pos(i)}" y="2.8">${'ABCDEFGHJKLMNOPQRST'[i]}</text><text x="2.5" y="${pos(i)+.55}">${size-i}</text>`;
  const cells=board.map((color,i)=>{
    const moveNumber=moves.indexOf(i)+1,last=i===moves.at(-1),win=result?.line?.includes(i);
    return `<button type="button" class="intersection ${color?'occupied color-'+color:''} ${last?'last':''} ${win?'winning':''} ${interactive&&hint===i?'hint':''}" style="left:${pos(i%size)}%;top:${pos(Math.floor(i/size))}%;width:${unit*.88}%;height:${unit*.88}%" ${interactive?`data-cell="${i}" tabindex="${i===keyboardCell?0:-1}"`:'tabindex="-1" disabled'} aria-label="${coordinate(i,size)}${color?'，'+(color===1?'黑':'白')+'棋，第'+moveNumber+'手':'，空位'}">${color?`<span class="piece">${settings.pieces==='ink'?color===1?'×':'○':(settings.numbers||!interactive)?moveNumber:''}</span>${last?'<span class="last-mark"></span>':''}`:interactive&&hint===i?'<span class="hint-ring"></span>':''}</button>`;
  }).join('');
  return `<div class="board-shell ${small?'mini':''}"><div class="board board-${settings.board} pieces-${settings.pieces} turn-${moves.length%2+1} ${!interactive||busy||result?'locked':''}" data-board-size="${size}" role="group" aria-label="${size}乘${size}五子棋棋盘"><svg class="board-grid" viewBox="0 0 100 100" aria-hidden="true"><g class="grid-lines">${grid}</g><g class="stars">${stars}</g><g class="coordinates">${labels}</g></svg>${cells}</div></div>`;
}
function nav() {return `<aside class="sidebar"><a class="brand" href="#" data-action="nav" data-page="play"><img src="assets/favicon.svg" alt=""/><div>弈间<span>FIVE IN A ROW</span></div></a><div class="nav-caption">一方棋盘，万般可能</div><nav aria-label="主导航">${[['play','grid','对弈','落子，见天地'],['learn','book','棋谱研习','从一手，到全局'],['stats','chart','我的战绩','看见每一步成长'],['appearance','palette','棋室装扮','布置你的方寸之间']].map(([id,ic,name,sub])=>`<button data-action="nav" data-page="${id}" class="nav-item ${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(ic)}<span>${name}<small>${sub}</small></span>${page===id?'<i></i>':''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="zen-mark">五</div><p>落子无言<br/>自有回响。</p><div class="offline-label"><span></span> 离线棋室 <b>v1.1.0</b></div></div></aside>`;}
function topbar() {return `<header class="topbar"><div class="breadcrumb">我的棋室 <span>/</span> ${ {play:'自由对弈',learn:'棋谱研习',stats:'我的战绩',appearance:'棋室装扮'}[page]}</div><div class="top-actions"><span class="local-badge"><i></i> 所有对局 · 本地保存</span><button class="icon-button" data-action="sound" title="${settings.sound?'关闭':'开启'}落子音效" aria-label="${settings.sound?'关闭':'开启'}落子音效">${icon(settings.sound?'volume':'mute')}</button><div class="avatar">弈</div></div></header>`;}
function title(eyebrow,heading,desc,action='') {return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p>${desc}</p></div>${action}</div>`;}
function currentName(color) {return game.settings.mode==='local'?`${color===1?'黑':'白'}方棋手`:color===game.settings.human?'你':opponentName(game.settings.level);}
function playPage() {
  const s=game.settings,turn=game.moves.length%2+1,stats=summarize(records);
  const result=game.result;
  const status=result?(result.winner===0?'和棋 · 棋逢对手':`${currentName(result.winner)}获胜`):busy?'静候一手好棋':`${currentName(turn)}的回合`;
  return `${title('A MOMENT OF FOCUS','好棋，慢慢下。','在黑白之间，留一点时间给思考。',`<button class="primary" data-action="new">${icon('grid')} 开始新对局 ${icon('arrow')}</button>`)}
  <div class="game-layout"><section class="arena"><div class="arena-top"><div class="mode-label">${icon(s.mode==='ai'?'spark':'grid')} ${s.mode==='ai'?'人机对弈':'本地双人'}<span class="divider"></span><span>${s.size} 路棋盘</span></div><span class="pill">${game.practice?'开局练习':game.assisted?'辅助对局':s.forbidden?'禁手开启':'自由规则'}</span></div>
  <div class="players"><div class="player ${turn===1&&!result?'current':''}">${stone(1)}<div><b>${currentName(1)}</b><span>执黑 · 先手</span></div>${turn===1&&!result?'<i></i>':''}</div><div class="versus">VS<span>${String(game.moves.length).padStart(2,'0')} 手</span></div><div class="player ${turn===2&&!result?'current':''}">${stone(2)}<div><b>${currentName(2)}</b><span>执白 · 后手</span></div>${turn===2&&!result?'<i></i>':''}</div></div>
  ${boardMarkup(game.moves,s.size,{result})}
  <div class="board-status" aria-live="polite"><span class="${busy?'thinking':'status-dot'}"></span><b>${status}</b><span>${result?result.reason:busy?'Rapfi 正在全力搜索…':game.moves.length?`上一手 ${coordinate(game.moves.at(-1),s.size)}`:'点击交叉点，开始这一局'}</span></div>
  <div class="board-toolbar"><button class="text-button" data-action="undo" ${!game.moves.length||result?'disabled':''}>${icon('undo')} 悔棋</button><button class="text-button" data-action="hint" ${busy||result||s.mode==='ai'&&turn!==s.human?'disabled':''}>${icon('bulb')} 提示</button><label class="number-toggle"><input type="checkbox" data-setting="numbers" ${settings.numbers?'checked':''}/> 显示手数</label><button class="text-button resign" data-action="resign" ${!game.moves.length||result?'disabled':''}>${icon('flag')} 认输</button></div>
  ${!busy&&!result&&s.mode==='ai'&&turn!==s.human?'<button class="retry" data-action="retry">重试 AI</button>':''}
  ${result?`<div class="result-banner"><div>${icon('spark')} ${result.winner===0?'好对手，下一局再见。':result.winner===s.human||s.mode==='local'?'这一局，落得漂亮。':'每一次交锋，都是进步。'}<small>${s.mode==='ai'?(game.assisted?'已保存为练习对局，不计入正式胜率':`本局结果已计入${opponentName(s.level)}对战记录`):'本地双人对局不计入 AI 战绩'}</small></div><button class="primary" data-action="again">再来一局 ${icon('arrow')}</button></div>`:''}
  </section><aside class="game-rail"><section class="panel match-panel"><div class="section-label">本局设置 <button class="small-link" data-action="new">更改 ${icon('chevron')}</button></div><div class="opponent-icon">${icon(s.mode==='ai'?'spark':'grid')}</div><h2>${s.mode==='ai'?opponentName(s.level):'同屏，棋逢对手'}</h2><p>${s.mode==='ai'?(s.level==='rapfi'?'神经网络 · 全力搜索':'旧版对局 · 历史保留'):'把这一手，交给身旁的朋友。'}</p>${s.mode==='ai'&&s.level==='rapfi'?`<div class="engine-badge">${icon('check')} 官方预训练模型 · 离线运行</div><div class="settings-row"><span>每手思考预算</span><b>${(s.thinkMs || ENGINE.thinkMs)/1000} 秒</b></div><div class="engine-progress" id="engine-progress" aria-live="polite">${progress?`已搜索 ${progress.depth} 层 · ${(progress.nodes||0).toLocaleString('zh-CN')} 个节点`:busy?'Rapfi 正在分析棋形…':'充分思考，不刻意让子'}</div>`:''}<div class="settings-row"><span>落子规则</span><b>${s.forbidden?'黑棋禁手':'自由五子棋'}</b></div><div class="settings-row"><span>你的执子</span><b>${s.mode==='local'?'双方轮流':s.human===1?'黑棋 · 先手':'白棋 · 后手'}</b></div><div class="settings-row"><span>对局记录</span><b>${game.assisted?'练习对局':'标准对局'}</b></div>${s.forbidden?'<p class="rule-note">黑棋禁三三、四四、长连；禁手点会被拦截，可重新选点。</p>':''}</section>
  <section class="panel stats-preview"><div class="section-label">${s.mode==='ai'?'Rapfi · 我的战绩':'我的人机战绩'} ${icon('chart')}</div><div class="rate-row"><div class="rate-number">${s.mode==='ai'?stats.rate:summarize(records).rate}<small>%</small></div><div><b>对 AI 胜率</b><span>${s.mode==='ai'?stats.total:summarize(records).total} 局正式对局</span></div></div><div class="stat-bar"><i style="width:${s.mode==='ai'?stats.rate:summarize(records).rate}%"></i></div><button class="small-link" data-action="nav" data-page="stats">查看全部战绩 ${icon('arrow')}</button></section>
  <button class="learning-teaser" data-action="nav" data-page="learn"><span class="tag">每一局，都学一点</span><h3>落子之前，<br/>先识棋形。</h3><p>探索 26 种经典开局</p><span class="teaser-arrow">${icon('arrow')}</span><div class="teaser-stones"><i></i><i></i><i></i></div></button>
  <p class="rail-note">${icon('leaf')} 不争一时，静观全局。</p></aside></div>`;
}
function learnPage() {
  const filtered=OPENINGS.filter(o=>openingFilter==='全部'||o.family===openingFilter);
  return `${title('THE OPENING LIBRARY','始于一子，成于布局。','26 种经典开局，从先手构思到后手应对。')}<div class="learn-layout"><section class="panel opening-list"><div class="section-label">开局目录 <span>26</span></div><div class="segmented">${['全部','直指','斜指'].map(f=>`<button class="${openingFilter===f?'selected':''}" data-action="filter" data-filter="${f}">${f}</button>`).join('')}</div><div class="opening-scroll">${filtered.map(o=>`<button data-action="opening" data-code="${o.code}" class="opening-item ${o===opening?'selected':''}"><span>${o.code}</span><b>${o.name}</b><small>${o.family}</small>${icon('chevron')}</button>`).join('')}</div></section><section class="panel opening-detail"><div class="opening-header"><div><span class="eyebrow">${opening.family} · ${opening.code}</span><h2>${opening.name}<small>开局</small></h2></div><span class="pill">${step<=3?'标准前三手':'教学续走示例'}</span></div><p class="opening-intro">${opening.intro}</p>${boardMarkup(opening.moves.slice(0,step),15,{interactive:false})}<div class="step-controls"><button class="icon-button" data-action="step" data-delta="-1" ${step===1?'disabled':''} aria-label="上一步">${icon('undo')}</button><input type="range" min="1" max="6" value="${step}" id="study-range" aria-label="演示步数"/><span>${step} / 6</span><button class="icon-button" data-action="step" data-delta="1" ${step===6?'disabled':''} aria-label="下一步">${icon('arrow')}</button></div><p class="step-note">${STEP_NOTES[step-1]}</p></section><aside class="study-rail"><section class="panel study-notes"><div class="section-label">这一局，怎么下 ${icon('book')}</div><div class="segmented"><button data-action="side" data-side="black" class="${studySide==='black'?'selected':''}">先手思路</button><button data-action="side" data-side="white" class="${studySide==='white'?'selected':''}">后手应对</button></div><h3>${studySide==='black'?'执黑，主动构形':'执白，防中有攻'}</h3><p>${opening[studySide]}</p><div class="proof-note"><b>${icon('bulb')} 有没有必胜策略？</b><p>${opening.verdict}</p></div><button class="primary wide" data-action="practice">从第 ${step} 手开始练习 ${icon('arrow')}</button><small class="practice-note">执${studySide==='black'?'黑':'白'}对战 Rapfi · 不计正式胜率</small></section><section class="source-note"><b>关于本棋谱库</b><p>前三手按国际连珠联盟开局图校对。第 4–6 手为自编演示，并非定式最优解。这里采用自由落子，可单独开启禁手；不包含交换与五手两打。</p><a href="https://www.renju.net/openings/" target="_blank" rel="noreferrer">开局名称来源 ↗</a><a href="https://www.renju.net/rifrules/" target="_blank" rel="noreferrer">禁手规则参考 ↗</a></section></aside></div><div class="lessons">${LESSONS.map((l,i)=>`<article class="panel"><span class="lesson-number">0${i+1}</span><h3>${l.name}</h3><p>${l.text}</p></article>`).join('')}</div>`;
}
function statsPage() {
  const stats=summarize(records), recent=records.slice(0,20);
  return `${title('EVERY GAME COUNTS','每一步，都算数。','与 Rapfi 认真交锋。胜率 = 胜局 ÷ Rapfi 正式对局数（含和棋）。',`<button class="secondary" data-action="export">${icon('download')} 导出战绩</button>`)}<div class="stats-cards">${[['正式对局',stats.total,'局'],['对 AI 胜率',stats.rate,'%'],['获胜',stats.wins,'局'],['失败 / 和棋',`${stats.losses} / ${stats.draws}`,'局']].map(([label,value,unit])=>`<section class="panel"><span>${label}</span><strong>${value}<small>${unit}</small></strong></section>`).join('')}</div><section class="panel engine-stats"><div><span class="eyebrow">RAPFI · NNUE</span><h2>一个对手，全力以赴。</h2><p>当前胜率只统计与 Rapfi 的正式对局。旧版 AI 的 ${records.filter(r=>r.level!=='rapfi').length} 条记录保留在历史中，不混入新引擎胜率。</p></div><div class="engine-stats-icon">${icon('spark')}</div></section><section class="panel history"><div class="section-label">最近对局 <span>保存最近 1,000 局 · 此处展示 20 局</span></div>${recent.length?`<div class="table-wrap"><table><thead><tr><th>时间</th><th>对手</th><th>执子 / 规则</th><th>手数</th><th>结果</th><th>记录</th><th></th></tr></thead><tbody>${recent.map((r,i)=>`<tr><td>${new Date(r.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td>${opponentName(r.level)}</td><td>${r.human===1?'黑':'白'} · ${r.forbidden?'禁手':'自由'}</td><td>${r.moves?.length||0}</td><td><span class="outcome ${r.result}">${{win:'胜利',loss:'惜败',draw:'和棋'}[r.result]}</span></td><td>${r.assisted?'练习':'正式'}</td><td><button class="small-link" data-action="replay" data-record="${i}">复盘 ${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state">${icon('chart')}<h3>第一局，值得期待。</h3><p>完成人机对弈后，你的战绩会出现在这里。</p><button class="primary" data-action="nav" data-page="play">去下一盘 ${icon('arrow')}</button></div>`}</section><p class="fineprint">练习、提示和悔棋对局单独保存；本地双人对局不计入人机胜率。中途新开一局不产生结果；认输计为负局。数据仅保存在这台设备。</p>`;
}
const presets=[{id:'wood',name:'松间',sub:'温润木纹 · 经典黑白',board:'wood',background:'ivory',pieces:'classic'},{id:'paper',name:'课间',sub:'方格草稿纸 · 手写 O / X',board:'paper',background:'paper',pieces:'ink'},{id:'slate',name:'夜阑',sub:'静谧石板 · 月下对弈',board:'slate',background:'night',pieces:'glass'},{id:'jade',name:'竹影',sub:'浅青棋盘 · 一室清风',board:'jade',background:'sage',pieces:'flat'}];
function appearancePage() {return `${title('MAKE ROOM FOR PLAY','你的棋室，你的心境。','换一方棋盘，换一种落子的心情。所有设置即时生效。')}<div class="theme-grid">${presets.map(p=>`<button class="theme-card ${settings.board===p.board&&settings.background===p.background&&settings.pieces===p.pieces?'selected':''}" data-action="preset" data-preset="${p.id}"><div class="theme-preview preview-${p.id}"><div class="sample-grid"></div><span class="sample-piece p1">${p.id==='paper'?'×':''}</span><span class="sample-piece p2">${p.id==='paper'?'○':''}</span><span class="sample-piece p3">${p.id==='paper'?'×':''}</span><span class="theme-check">${icon('check')}</span></div><div class="theme-description"><b>${p.name}</b><span>${p.sub}</span></div></button>`).join('')}</div><div class="customization-layout"><section class="panel customize"><div class="section-label">自由搭配 ${icon('palette')}</div><label>棋盘材质<select data-setting="board">${[['wood','温润木纹'],['paper','方格草稿纸'],['slate','深色石板'],['jade','浅青竹影']].map(([v,l])=>`<option value="${v}" ${settings.board===v?'selected':''}>${l}</option>`).join('')}</select></label><label>棋室背景<select data-setting="background">${[['ivory','暖白'],['paper','纸白'],['night','深夜'],['sage','鼠尾草绿']].map(([v,l])=>`<option value="${v}" ${settings.background===v?'selected':''}>${l}</option>`).join('')}</select></label><label>棋子样式<select data-setting="pieces">${[['classic','经典黑白'],['ink','手写 O / X'],['glass','琉璃质感'],['flat','极简平面']].map(([v,l])=>`<option value="${v}" ${settings.pieces===v?'selected':''}>${l}</option>`).join('')}</select></label><label>落子音效<input type="checkbox" data-setting="sound" ${settings.sound?'checked':''}/></label><label>显示手数<input type="checkbox" data-setting="numbers" ${settings.numbers?'checked':''}/></label><p class="fineprint">手写棋子以 × 表示黑棋、○ 表示白棋。棋盘路数在“开始新对局”中设置。</p></section><section class="panel live-preview"><div class="section-label">即刻预览 <span>心境不同，棋趣相同</span></div>${boardMarkup([112,113,97,128,98,127,82],15,{interactive:false})}</section></div>`;}
function render() {
  document.documentElement.dataset.background=settings.background;
  $('#app').innerHTML=`${nav()}<div class="main">${topbar()}<main>${page==='play'?playPage():page==='learn'?learnPage():page==='stats'?statsPage():appearancePage()}<footer><span>弈间 <i>·</i> FIVE IN A ROW</span><span>专注眼前这一手。</span></footer></main></div>`;
}
function showModal(html) {const m=$('#modal');m.innerHTML=html;if(!m.open)m.showModal();}
function closeModal() {$('#modal').close();replay=null;}
function newDialog() {
  const s=game.settings;
  showModal(`<form id="new-form"><div class="modal-header"><div><span class="eyebrow">A NEW BEGINNING</span><h2>开一局好棋</h2></div><button type="button" class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><div class="engine-intro"><b>Rapfi · 全力搜索</b><span>官方神经网络权重 · 不设难度，不刻意让子</span></div><label class="field">对弈模式<select name="mode"><option value="ai" ${s.mode==='ai'?'selected':''}>人机对弈</option><option value="local" ${s.mode==='local'?'selected':''}>本地双人 · 同屏轮流</option></select></label><div class="form-row"><label class="field">Rapfi 思考预算<select name="thinkMs">${THINK_TIMES.map(ms=>`<option value="${ms}" ${(s.thinkMs||ENGINE.thinkMs)===ms?'selected':''}>每手最多 ${ms/1000} 秒</option>`).join('')}</select></label><label class="field">你的执子<select name="human"><option value="1" ${s.human===1?'selected':''}>执黑 · 先手</option><option value="2" ${s.human===2?'selected':''}>执白 · 后手</option></select></label></div><label class="field">棋盘大小<select name="size">${[13,15,19].map(n=>`<option value="${n}" ${s.size===n?'selected':''}>${n} × ${n}${n===15?' · 标准棋盘':''}</option>`).join('')}</select></label><label class="rule-switch"><div><b>开启黑棋禁手</b><small>禁止三三、四四、长连；白棋无限制</small></div><input name="forbidden" type="checkbox" ${s.forbidden?'checked':''}/></label><p class="fineprint" id="engine-rules-note">Rapfi 禁手模型仅支持 15 路；无禁手支持 13 / 15 / 19 路。思考预算是单手上限，确定应手时会提前落子。</p><p class="fineprint">自由规则下，双方连成五子或以上获胜。开启禁手后，黑棋须恰好连五；禁手落点会被拦截。本应用不使用交换开局规则。</p>${game.moves.length&&!game.result?'<p class="replace-note">开始后将替换当前未完成对局，不计入胜负。</p>':''}<button class="primary wide" type="submit">落子，开始 ${icon('arrow')}</button></form>`);
  updateFormMode();
}
function updateFormMode(){const form=$('#new-form');if(!form)return;const local=form.elements.mode.value==='local';form.elements.thinkMs.disabled=local;form.elements.human.disabled=local;const renju=!local&&form.elements.forbidden.checked;for(const option of form.elements.size.options)option.disabled=renju&&option.value!=='15';if(renju)form.elements.size.value='15';}
function confirmDialog(title,text,action) {showModal(`<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><p class="modal-copy">${text}</p><div class="modal-actions"><button class="secondary" data-action="close">继续当前对局</button><button class="primary" data-action="${action}">确认</button></div>`);}
function launch(s,moves=[],practice=false) {$('#toast').classList.remove('visible');clearTimeout(toastTimer);cancelAI();settings={...settings,...s,level:'rapfi',engineId:ENGINE.id};game=newGame(settings,moves,practice);hint=null;keyboardCell=Math.floor(settings.size**2/2);page='play';persist();closeModal();render();scheduleAI();}
function startPractice() {launch({size:15,mode:'ai',human:studySide==='black'?1:2,level:'rapfi',engineId:ENGINE.id,thinkMs:ENGINE.thinkMs,forbidden:false},opening.moves.slice(0,step),true);}
function replayDialog(){if(!replay)return;showModal(`<div class="modal-header"><div><span class="eyebrow">GAME REVIEW</span><h2>重看这一局</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div>${boardMarkup((replay.moves||[]).slice(0,replayStep),replay.size||15,{interactive:false})}<div class="step-controls"><button class="icon-button" data-action="replay-step" data-delta="-1" ${replayStep===0?'disabled':''} aria-label="复盘上一步">${icon('undo')}</button><input id="replay-range" type="range" min="0" max="${replay.moves?.length||0}" value="${replayStep}" aria-label="复盘步数"/><span>${replayStep} / ${replay.moves?.length||0}</span><button class="icon-button" data-action="replay-step" data-delta="1" ${replayStep===replay.moves?.length?'disabled':''} aria-label="复盘下一步">${icon('arrow')}</button></div><p class="fineprint">${opponentName(replay.level)} · ${replay.forbidden?'有禁手':'自由规则'} · ${esc(replay.reason||'对局结束')}</p>`);}

document.addEventListener('click',e=>{
  const cell=e.target.closest('[data-cell]');if(cell){place(Number(cell.dataset.cell));return;}
  const button=e.target.closest('[data-action]');if(!button)return;e.preventDefault();
  const {action}=button.dataset;
  if(action==='nav'){$('#toast').classList.remove('visible');clearTimeout(toastTimer);page=button.dataset.page;render();window.scrollTo(0,0);}
  if(action==='new')newDialog();
  if(action==='close')closeModal();
  if(action==='again')launch({...game.settings,board:settings.board,background:settings.background,pieces:settings.pieces,numbers:settings.numbers,sound:settings.sound});
  if(action==='sound'){settings.sound=!settings.sound;persist();render();}
  if(action==='undo'){
    if(game.result)return;
    // Only cancel the engine if there is a human move to take back.
    const can=game.settings.mode==='local'||game.moves.some((_m,i)=>i%2+1===game.settings.human);
    if(!can){toast('AI 的首手无法单独悔棋。');return;}
    cancelAI();if(undo(game)){hint=null;persist();render();toast('已悔棋。本局标记为练习，不计正式胜率。');scheduleAI();}
  }
  if(action==='hint'){if(busy||game.result)return;game.assisted=true;persist();compute('hint');}
  if(action==='resign')confirmDialog('结束这一局？','认输后本局立即结束，人机正式对局将计入胜负。','confirm-resign');
  if(action==='confirm-resign'){if(game.result){closeModal();toast('本局已经结束，结果已保存。');return;}cancelAI();game.result={winner:game.settings.mode==='ai'?3-game.settings.human:3-(game.moves.length%2+1),reason:'认输',line:[]};finish();closeModal();render();}
  if(action==='retry')scheduleAI();
  if(action==='filter'){openingFilter=button.dataset.filter;render();}
  if(action==='opening'){opening=OPENINGS.find(o=>o.code===button.dataset.code);step=3;render();}
  if(action==='step'){step=Math.max(1,Math.min(6,step+Number(button.dataset.delta)));render();}
  if(action==='side'){studySide=button.dataset.side;render();}
  if(action==='practice'){if(game.moves.length&&!game.result)confirmDialog('从棋谱开始练习？','这会替换当前未完成对局；练习不会计入正式胜率。','confirm-practice');else startPractice();}
  if(action==='confirm-practice')startPractice();
  if(action==='preset'){const p=presets.find(p=>p.id===button.dataset.preset);Object.assign(settings,{board:p.board,background:p.background,pieces:p.pieces});persist();render();}
  if(action==='export'){
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`yijian-records-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('战绩已导出为 JSON 文件。');
  }
  if(action==='replay'){replay=records[Number(button.dataset.record)];replayStep=replay.moves?.length||0;replayDialog();}
  if(action==='replay-step'){replayStep=Math.max(0,Math.min(replay.moves?.length||0,replayStep+Number(button.dataset.delta)));replayDialog();}
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-setting]')){const key=e.target.dataset.setting;settings[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;persist();render();}
  if(e.target.matches('#new-form [name="mode"], #new-form [name="forbidden"]'))updateFormMode();
  if(e.target.id==='study-range'){step=Number(e.target.value);render();}
  if(e.target.id==='replay-range'){replayStep=Number(e.target.value);replayDialog();}
});
document.addEventListener('submit',e=>{if(e.target.id!=='new-form')return;e.preventDefault();const f=e.target.elements;launch({mode:f.mode.value,level:'rapfi',engineId:ENGINE.id,thinkMs:Number(f.thinkMs.value),human:Number(f.human.value),size:Number(f.size.value),forbidden:f.forbidden.checked});});
document.addEventListener('keydown',e=>{
  const cell=e.target.closest('[data-cell]');if(!cell)return;const i=Number(cell.dataset.cell),s=game.settings.size,x=i%s,y=Math.floor(i/s);
  const next={ArrowLeft:y*s+Math.max(0,x-1),ArrowRight:y*s+Math.min(s-1,x+1),ArrowUp:Math.max(0,y-1)*s+x,ArrowDown:Math.min(s-1,y+1)*s+x}[e.key];
  if(next!==undefined){e.preventDefault();keyboardCell=next;cell.tabIndex=-1;const target=$(`[data-cell="${next}"]`);target.tabIndex=0;target.focus();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
render();scheduleAI();

if(game.migrated)toast('当前旧版 AI 对局已切换为 Rapfi 练习局；旧战绩已保留。');
window.addEventListener('beforeunload', () => window.rapfi?.cancel(request));
