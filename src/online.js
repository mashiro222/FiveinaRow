import { OnlineClient } from './online-client.js';
const stored = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

export class OnlineRoom {
  constructor(hooks) {
    this.h = hooks; this.visible = false; this.evaluationId = 0; this.analysisKey = '';
    this.showRate = stored('yijian-online-rate', 'true') === 'true';
    this.name = stored('yijian-online-name', ''); this.cursor = 112; this.hostAddresses = [];
    this.client = new OnlineClient(() => {
      const signature = this.client.room ? `${this.client.room.gameId}:${this.client.room.moves.length}` : '';
      if (this.lastSignature && signature !== this.lastSignature && this.client.room?.moves.length) this.h.sound();
      this.lastSignature = signature;
      this.syncAnalysis(); if (this.visible) this.h.render();
    });
    window.rapfi?.onEvaluation(data => { if (data.id === this.evaluationId && Number.isFinite(data.blackWinRate)) {
      this.evaluation = data; this.updateRate();
    } });
    this.clockTimer = setInterval(() => this.updateClock(), 200);
    document.addEventListener('click', event => this.click(event));
    document.addEventListener('submit', event => this.submit(event));
    document.addEventListener('change', event => {
      if (event.target.id !== 'online-show-rate') return;
      this.showRate = event.target.checked; store('yijian-online-rate', this.showRate);
      this.syncAnalysis(); this.h.render();
    });
    document.addEventListener('keydown', event => {
      const cell = event.target.closest('[data-online-cell]'); if (!cell) return;
      const i = Number(cell.dataset.onlineCell), x = i % 15, y = Math.floor(i / 15);
      const next = { ArrowLeft:y*15+Math.max(0,x-1), ArrowRight:y*15+Math.min(14,x+1), ArrowUp:Math.max(0,y-1)*15+x, ArrowDown:Math.min(14,y+1)*15+x }[event.key];
      if (next !== undefined) { event.preventDefault(); this.cursor = next; cell.tabIndex = -1; const target = document.querySelector(`[data-online-cell="${next}"]`); target.tabIndex = 0; target.focus(); }
    });
    window.addEventListener('beforeunload', () => { this.cancelAnalysis(); this.client.stop(); clearInterval(this.clockTimer); });
  }
  enter(visible) {
    this.visible = visible; this.syncAnalysis();
    if (visible && this.client.status === 'idle' && this.client.url && this.client.hasSession()) this.run(() => this.client.connect());
  }
  async run(task) { try { await task(); } catch (error) { this.h.toast(error.message); } }
  cancelAnalysis() { clearTimeout(this.analysisTimer); window.rapfi?.cancelEvaluation(this.evaluationId); this.evaluationId++; this.analysisKey = ''; this.evaluation = null; }
  syncAnalysis() {
    const room = this.client.room;
    if (!this.visible || !this.showRate || !room || room.phase !== 'playing' || this.client.status !== 'connected') { this.cancelAnalysis(); return; }
    const key = `${room.gameId}:${room.moves.length}`;
    if (this.analysisKey === key) return;
    this.cancelAnalysis(); this.analysisKey = key; this.analysisError = ''; this.evaluating = true;
    if (!window.rapfi?.evaluate) { this.analysisError = '胜率分析需要桌面版 Rapfi'; this.evaluating = false; return; }
    const id = ++this.evaluationId;
    // Collapse quick consecutive moves before loading another neural evaluator.
    // A cancelled/hidden position must not leave a delayed search behind.
    this.analysisTimer = setTimeout(() => {
    if (id !== this.evaluationId) return;
    window.rapfi.evaluate({ id, moves: [...room.moves], size: 15, forbidden: room.settings.forbidden }).then(data => {
      if (id !== this.evaluationId) return;
      this.evaluating = false;
      if (!data.ok) this.analysisError = data.cancelled ? '' : data.error;
      else if (Number.isFinite(data.blackWinRate)) this.evaluation = data;
      this.updateRate();
    }).catch(() => { if (id === this.evaluationId) { this.evaluating = false; this.analysisError = 'Rapfi 暂时无法分析'; this.updateRate(); } });
    }, 180);
  }
  statusText() {
    return { idle:'尚未连接', connecting:'正在连接…', connected:'已连接', disconnected:'连接断开，等待重连', replaced:'此会话已在另一窗口打开' }[this.client.status];
  }
  hostingCurrentService() { return this.client.url === this.hostLocal || this.hostAddresses.includes(this.client.url); }
  page() {
    const { esc, icon, title } = this.h, c = this.client, r = c.room;
    if (!r) return `${title('PLAY TOGETHER', '远近之间，共下一局。', '用四位房间号相约，入座对弈，也可以静静旁观。')}
      <section class="panel online-connection"><div><span class="eyebrow">连接棋室</span><h2>先连接同一个房间服务</h2><p>同一 Wi-Fi 下，一人开启局域网服务，再把地址发给朋友。跨网络使用公共服务地址。</p></div>
      <form id="online-connect-form"><label class="field">房间服务地址<input name="server" id="online-server" type="text" value="${esc(c.url)}" placeholder="wss://你的房间服务/room" required spellcheck="false" autocomplete="off"/></label><button class="secondary" type="submit">连接服务</button></form>
      <div class="online-connect-bottom"><span class="connection-dot ${c.status === 'connected' ? 'connected' : ''}"></span><span id="online-connection-status">${this.statusText()}</span>${window.roomsHost ? '<button class="small-link" data-online="host">开启局域网服务 →</button>' : ''}</div>
      ${this.hostingCurrentService() && this.hostAddresses.length ? `<div class="share-address"><b>朋友在同一 Wi-Fi 下填写这个地址</b>${this.hostAddresses.map(a => `<code>${esc(a)}</code>`).join('')}<small>保持此电脑和游戏运行；系统询问时允许局域网访问。</small></div>` : ''}</section>
      <div class="online-lobby"><section class="panel online-lobby-card"><span class="online-card-number">01 / 邀请朋友</span><h2>开一间棋室</h2><p>房间号由服务自动分配。进入后选择执黑或执白，双方准备即可开始。</p><button class="primary" data-online="create">${icon('grid')} 创建房间 ${icon('arrow')}</button></section>
      <section class="panel online-lobby-card"><span class="online-card-number">02 / 赴一场棋约</span><h2>输入房间号</h2><p>进入时默认旁观，有空位即可取名入座。</p><form id="online-join-form"><input name="code" aria-label="四位房间号" class="room-code-input" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="0000" required autocomplete="off"/><button class="primary" type="submit">进入房间 ${icon('arrow')}</button></form></section></div>
      <p class="online-footnote">房间号仅在同一服务内有效 · 空房间保留 10 分钟 · 联机棋盘为 15 路 · 无需注册账号</p>`;
    const seat = r.seats.indexOf(c.id), mine = seat !== -1, playing = r.phase === 'playing', connected = c.status === 'connected';
    const turn = r.moves.length % 2, canMove = playing && seat === turn && connected;
    const spectators = r.members.filter(m => !r.seats.includes(m.id));
    const owner = r.owner === c.id, disabled = !connected ? 'disabled' : '';
    const status = r.result ? (r.result.winner ? `${r.result.winner === 1 ? '黑' : '白'}方获胜 · ${r.result.reason}` : '和棋 · 棋逢对手') : playing ? `${turn === 0 ? '黑' : '白'}方思考中${seat === turn ? ' · 轮到你了' : ''}` : '双方入座并准备后开始';
    return `${title('A SHARED MOMENT', `房间 ${r.code}`, `${mine ? '你执' + (seat === 0 ? '黑' : '白') : '你正在旁观'} · ${owner ? '你是房主 · ' : ''}${this.statusText()}`, `<button class="secondary" data-online="leave">离开房间 ${icon('arrow')}</button>`)}
      ${!connected ? '<div class="online-notice" role="status">连接恢复前无法落子。断线后席位保留 30 秒，落子计时继续；超过宽限期判负。</div>' : ''}
      <div class="game-layout online-game"><section class="arena"><div class="arena-top"><div class="mode-label">${icon('grid')} 好友对弈 <span class="divider"></span><span>15 路棋盘</span></div><span class="pill">${r.settings.forbidden ? '黑棋禁手' : '自由规则'} · 每手 ${r.settings.turnSeconds === 120 ? '2 分钟' : r.settings.turnSeconds + ' 秒'}</span></div>
      <div class="online-seats">${[0, 1].map(i => {
        const member = r.members.find(m => m.id === r.seats[i]);
        return `<div class="online-seat ${playing && turn === i ? 'current' : ''}"><span class="stone-dot ${i === 0 ? 'black' : 'white'}"></span><div class="seat-person"><b>${member ? esc(member.name) : (i === 0 ? '黑棋席位' : '白棋席位')}</b><small>${member ? !member.connected ? '断线 · 等待重连' : playing ? (turn === i ? '正在思考' : '等待对手') : r.ready[i] ? '已准备' : '尚未准备' : i === 0 ? '先手 · 等待棋手' : '后手 · 等待棋手'}${member?.id === c.id ? ' · 你' : ''}</small></div>${member ? `<span class="turn-clock" data-online-clock="${i}">—</span>` : `<button class="secondary" data-online="seat" data-seat="${i}" ${playing ? 'disabled' : disabled}>取名入座</button>`}</div>`;
      }).join('')}</div>
      ${this.h.boardMarkup(r.moves, 15, { result: r.result, online: true, locked: !canMove, cursor: this.cursor })}
      <div class="board-status" aria-live="polite"><span class="status-dot"></span><b>${status}</b><span>${r.moves.length} 手</span></div>
      <div class="board-toolbar">${mine ? playing ? `<button class="text-button resign" data-online="resign" ${disabled}>${icon('flag')} 认输</button>` : `<button class="primary" data-online="ready" ${disabled}>${r.ready[seat] ? '取消准备' : r.phase === 'finished' ? '准备再来一局' : '准备开始'}</button><button class="text-button" data-online="stand" ${disabled}>退席旁观</button>` : `<span class="fineprint">${playing || r.seats.every(Boolean) ? '两位棋手对弈中，你可以旁观学习。' : '点击上方空位，取名后即可参加对弈。'}</span>`}<label class="number-toggle"><input type="checkbox" data-setting="numbers" ${this.h.numbers() ? 'checked' : ''}/> 显示手数</label></div>
      </section><aside class="game-rail"><section class="panel online-rate"><div class="section-label">Rapfi · 局势胜率<label class="rate-toggle"><input type="checkbox" id="online-show-rate" ${this.showRate ? 'checked' : ''}/>显示</label></div><div id="online-rate-body">${this.rateMarkup()}</div></section>
      <section class="panel online-rules"><div class="section-label">本局规则 <span>${owner ? '房主设置' : '由房主设置'}</span></div><form id="online-rules-form"><label class="rule-switch"><div><b>黑棋禁手</b><small>禁止三三、四四、长连</small></div><input type="checkbox" name="forbidden" ${r.settings.forbidden ? 'checked' : ''} ${!owner || playing || !connected ? 'disabled' : ''}/></label><label class="field">每手限时<select name="turnSeconds" ${!owner || playing || !connected ? 'disabled' : ''}>${[[30,'30 秒'],[60,'60 秒'],[120,'2 分钟']].map(([v,l])=>`<option value="${v}" ${r.settings.turnSeconds === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${owner && !playing ? `<button class="secondary wide" type="submit" ${disabled}>保存规则</button>` : ''}</form><p class="fineprint">${playing ? '本局规则已锁定，下一局开始前可修改。' : '修改规则后双方需要重新准备。'} 禁手落点会被拦截，计时继续。超时判负。</p></section>
      <section class="panel online-watchers"><div class="section-label">旁观席 <span>${spectators.length} 人</span></div><div class="watcher-list">${spectators.length ? spectators.map((m, i) => `<span>${esc(m.name || '观众 ' + (i + 1))}${m.id === c.id ? ' · 你' : ''}${!m.connected ? ' · 离线' : ''}</span>`).join('') : '<p>棋室已开，静候来客。</p>'}</div></section>
      <section class="panel online-invite"><div class="section-label">邀请朋友 <b>${r.code}</b></div><p class="fineprint">朋友先连接以下服务，再输入房间号。</p>${(this.hostingCurrentService() && this.hostAddresses.length ? this.hostAddresses : [c.url]).map(address => `<input class="invite-address" aria-label="邀请服务地址" readonly value="${esc(address)}"/>`).join('')}<small>选中地址即可复制；局域网服务仅供同一网络使用。</small></section>
      <p class="rail-note">空房间 10 分钟后清除 · 离开页面计时继续</p></aside></div>`;
  }
  rateMarkup() {
    const r = this.client.room;
    if (!this.showRate) return '<p class="fineprint">胜率已隐藏，专注自己的判断。</p>';
    if (r?.phase !== 'playing') return `<p class="fineprint">${r?.result ? '本局已结束。下一局开始后继续分析。' : '对局开始后，每次落子会更新胜率。'}</p>`;
    const value = this.evaluation?.blackWinRate;
    const black = Number.isFinite(value) ? (value * 100).toFixed(1) : null;
    return `${black !== null ? `<div class="winrate-labels"><div><span class="stone-dot black"></span> 黑 <b>${black}%</b></div><div>白 <b>${(100 - Number(black)).toFixed(1)}%</b><span class="stone-dot white"></span></div></div><div class="winrate-bar"><span style="width:${black}%"></span></div>` : '<div class="rate-waiting">— <span>等待局势评估</span> —</div>'}<p class="rate-detail">${this.analysisError ? this.h.esc(this.analysisError) : this.evaluating ? 'Rapfi 正在分析当前局面…' : this.evaluation ? `第 ${r.moves.length} 手后 · 搜索 ${this.evaluation.depth} 层` : '引擎尚未返回有效胜率'}</p><p class="fineprint">本机 Rapfi 的局势估计，非保证胜率。隐藏后暂停分析。</p>`;
  }
  updateRate() { const node = document.querySelector('#online-rate-body'); if (node) node.innerHTML = this.rateMarkup(); }
  updateClock() {
    const r = this.client.room; if (!this.visible || !r) return;
    document.querySelectorAll('[data-online-clock]').forEach(node => {
      const active = r.phase === 'playing' && Number(node.dataset.onlineClock) === r.moves.length % 2;
      const seconds = active ? Math.max(0, Math.ceil((r.deadline - this.client.now()) / 1000)) : r.settings.turnSeconds;
      node.textContent = r.phase === 'playing' ? seconds === 0 && active ? '判定中' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
      node.classList.toggle('urgent', active && seconds <= 10);
    });
  }
  async ensureConnected() {
    const field = document.querySelector('#online-server');
    const url = field?.value.trim() || this.client.url;
    if (!url) throw new Error('请先填写公共服务地址，或点击“开启局域网服务”');
    await this.client.connect(url);
  }
  click(event) {
    const cell = event.target.closest('[data-online-cell]');
    if (cell) {
      const r = this.client.room;
      if (!r || r.phase !== 'playing' || r.seats.indexOf(this.client.id) !== r.moves.length % 2) return;
      this.cursor = Number(cell.dataset.onlineCell);
      this.run(() => this.client.send('move', { index: this.cursor, gameId: r.gameId, ply: r.moves.length })); return;
    }
    const button = event.target.closest('[data-online]'); if (!button) return;
    event.preventDefault(); const action = button.dataset.online, r = this.client.room;
    this.run(async () => {
      if (action === 'host') {
        button.disabled = true;
        try {
          const data = await window.roomsHost.start(); if (!data.ok) throw new Error(data.error);
          this.hostAddresses = data.addresses; this.hostLocal = data.local;
          await this.client.connect(data.local); this.h.render();
          if (!data.addresses.length) this.h.toast('服务已开启，但未找到局域网地址；请先连接 Wi-Fi 或网线。');
        } finally { button.disabled = false; }
      } else if (action === 'create') { await this.ensureConnected(); await this.client.send('create'); }
      else if (action === 'seat') {
        this.h.showModal(`<form id="online-seat-form" data-seat="${button.dataset.seat}"><div class="modal-header"><div><span class="eyebrow">TAKE YOUR SEAT</span><h2>以何名入局？</h2></div><button type="button" class="icon-button" data-action="close" aria-label="关闭">${this.h.icon('x')}</button></div><label class="field">棋手名字<input name="name" value="${this.h.esc(this.name)}" maxlength="32" placeholder="1–16 个字" required autocomplete="nickname"/></label><p class="fineprint">你的名字会展示给房间内所有人。</p><button class="primary wide" type="submit">执${button.dataset.seat === '0' ? '黑' : '白'}入座</button></form>`);
        document.querySelector('#online-seat-form input').focus();
      } else if (action === 'ready') await this.client.send('ready', { ready: !r.ready[r.seats.indexOf(this.client.id)] });
      else if (action === 'stand') await this.client.send('stand');
      else if (action === 'leave' || action === 'resign') {
        if (this.client.status !== 'connected') this.h.showModal('<div class="modal-header"><h2>退出失联房间？</h2></div><p class="modal-copy">将停止重连。如果你是进行中的棋手，服务会在超时或断线宽限期结束时判负。</p><div class="modal-actions"><button class="secondary" data-action="close">继续等待</button><button class="primary" data-online="abandon">退出房间</button></div>');
        else if (r.phase === 'playing' && r.seats.includes(this.client.id)) this.h.showModal(`<div class="modal-header"><h2>${action === 'leave' ? '离开当前棋局？' : '确认认输？'}</h2></div><p class="modal-copy">本局将判为你负。${action === 'leave' ? '离开后空席可在下一局由其他人入座。' : '你可以留在房间准备下一局。'}</p><div class="modal-actions"><button class="secondary" data-action="close">继续下棋</button><button class="primary" data-online="confirm-${action}" data-game-id="${r.gameId}">确认</button></div>`);
        else await this.client.send('leave');
      } else if (action === 'confirm-leave' || action === 'confirm-resign') {
        if (button.dataset.gameId !== r?.gameId) throw new Error('棋局已更新，请关闭弹窗后重试');
        await this.client.send(action === 'confirm-leave' ? 'leave' : 'resign', { gameId: r.gameId }); this.h.closeModal();
      } else if (action === 'abandon') { this.client.abandon(); this.h.closeModal(); }
    });
  }
  submit(event) {
    if (!event.target.id.startsWith('online-')) return;
    event.preventDefault(); const form = event.target;
    // Capture input before connecting: a state update may redraw the lobby.
    const values = Object.fromEntries(new FormData(form));
    this.run(async () => {
      if (form.id === 'online-connect-form') { await this.client.connect(values.server); this.h.toast('已连接房间服务，可以创建或加入房间。'); }
      if (form.id === 'online-join-form') { await this.ensureConnected(); await this.client.send('join', { code: values.code }); }
      if (form.id === 'online-seat-form') { await this.client.send('seat', { seat: Number(form.dataset.seat), name: values.name }); this.name = values.name.trim(); store('yijian-online-name', this.name); this.h.closeModal(); }
      if (form.id === 'online-rules-form') { await this.client.send('settings', { forbidden: !!values.forbidden, turnSeconds: Number(values.turnSeconds) }); this.h.toast('规则已更新，请双方重新准备。'); }
    });
  }
}
