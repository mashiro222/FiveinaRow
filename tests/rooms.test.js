import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomHub, ROOM_TTL, RECONNECT_GRACE } from '../server/rooms.mjs';
import { createRoomServer } from '../server/index.mjs';

function fixture(options = {}) {
  let time = 100_000;
  const hub = new RoomHub({ now: () => time, ...options });
  const messages = [];
  const a = hub.connect(null, d => messages.push(d)), b = hub.connect(null, () => {}), watcher = hub.connect(null, () => {});
  hub.request(a, { type: 'create' });
  const room = hub.roomOf(a);
  hub.request(b, { type: 'join', code: room.code }); hub.request(watcher, { type: 'join', code: room.code });
  const start = () => {
    hub.request(a, { type:'seat', seat:0, name:'黑方' }); hub.request(b, { type:'seat', seat:1, name:'白方' });
    hub.request(a, { type:'ready', ready:true }); hub.request(b, { type:'ready', ready:true });
  };
  const move = (player, index, extra = {}) => hub.request(player, { type:'move', index, ply:room.moves.length, gameId:room.gameId, ...extra });
  return { hub, a, b, watcher, room, messages, start, move, advance: ms => { time += ms; hub.tick(); } };
}
test('four-digit codes are unique even when random draws collide; empty rooms expire and codes can be reused', () => {
  const f = fixture({ codeNumber: () => 7 });
  assert.equal(f.room.code, '0007');
  const outsider = f.hub.connect(null, () => {}); f.hub.request(outsider, { type:'create' });
  assert.equal(f.hub.roomOf(outsider).code, '0000');
  for (const s of [f.a, f.b, f.watcher]) f.hub.request(s, { type:'leave' });
  f.advance(ROOM_TTL - 1); assert.equal(f.hub.rooms.has('0007'), true);
  f.advance(1); assert.equal(f.hub.rooms.has('0007'), false);
  f.hub.request(f.a, { type:'create' }); assert.equal(f.hub.roomOf(f.a).code, '0007');
  assert.notEqual(f.hub.roomOf(f.a).id, f.room.id);
});
test('only two named players can sit; join always starts as a spectator; seat claims are atomic', () => {
  const f = fixture();
  assert.deepEqual(f.room.seats, [null,null]);
  for (const name of ['', ' ', 'a\nB', 'x'.repeat(17)]) assert.throws(() => f.hub.request(f.a, {type:'seat',seat:0,name}));
  f.start();
  assert.equal(f.room.phase, 'playing');
  assert.throws(() => f.hub.request(f.watcher, {type:'seat',seat:0,name:'观众'}));
  assert.throws(() => f.move(f.watcher, 112), /旁观/);
  assert.throws(() => f.move(f.b, 112), /轮到/);
  const late = f.hub.connect(null, () => {}); f.hub.request(late, {type:'join',code:f.room.code});
  assert.equal(f.room.seats.includes(late.id), false);
  assert.equal(f.room.members.size,4);
});
test('only host changes settings, changing rules cancels readiness, game rules cannot change mid-game', () => {
  const f = fixture();
  assert.throws(() => f.hub.request(f.b, {type:'settings',forbidden:true,turnSeconds:30}), /房主/);
  for (const turnSeconds of [0,29,90,Infinity,'30']) assert.throws(() => f.hub.request(f.a, {type:'settings',forbidden:true,turnSeconds}));
  f.hub.request(f.a,{type:'seat',seat:0,name:'A'});f.hub.request(f.a,{type:'ready',ready:true});
  f.hub.request(f.a,{type:'settings',forbidden:true,turnSeconds:120});
  assert.deepEqual(f.room.ready,[false,false]);
  f.start(); assert.equal(f.room.deadline,220_000);
  assert.throws(() => f.hub.request(f.a,{type:'settings',forbidden:false,turnSeconds:30}), /开始/);
});
test('server checks turns, bounds, stale game/ply, wins; replayed and forbidden moves never consume time or a turn', () => {
  const f = fixture(); f.hub.request(f.a,{type:'settings',forbidden:true,turnSeconds:60});f.start();
  assert.throws(() => f.move(f.a,112,{gameId:'stale'})); assert.throws(() => f.move(f.a,112,{ply:1}));
  for (const i of [111,0,113,2,97,4,127,6]) f.move(f.room.moves.length%2 ? f.b:f.a,i);
  const deadline = f.room.deadline; assert.throws(() => f.move(f.a,112),/三三/);
  assert.equal(f.room.moves.length,8);assert.equal(f.room.deadline,deadline);
  assert.throws(() => f.move(f.a,225));assert.throws(() => f.move(f.a,111));
  assert.equal(f.room.moves.length,8);
  f.hub.request(f.a,{type:'resign',gameId:f.room.gameId}); assert.equal(f.room.result.winner,2);
  f.start();
  for (const i of [112,97,113,98,114,99,115,100,116]) f.move(f.room.moves.length%2 ? f.b:f.a,i);
  assert.equal(f.room.result.winner,1);assert.equal(f.room.result.line.length,5);
  assert.throws(() => f.move(f.b,101));assert.equal(f.room.moves.length,9);
});
test('all three clocks reset only on a legal move and the server rejects moves received at the deadline', () => {
  for(const turnSeconds of [30,60,120]) {
    const f=fixture();f.hub.request(f.a,{type:'settings',forbidden:false,turnSeconds});f.start();
    f.advance(turnSeconds*1000-1);f.move(f.a,112);
    f.advance(turnSeconds*1000);assert.equal(f.room.result.winner,1);assert.match(f.room.result.reason,/超时/);
    assert.throws(()=>f.move(f.b,113));
  }
});
test('reconnect restores identity, seat, board and original timer; old socket cannot displace the resumed session', () => {
  const f=fixture();f.start();f.move(f.a,112);
  const deadline=f.room.deadline;f.hub.disconnect(f.b);f.advance(10_000);
  const messages=[];const resumed=f.hub.connect(f.b.token,d=>messages.push(d));
  assert.equal(resumed.id,f.b.id);assert.equal(f.room.deadline,deadline);
  assert.deepEqual(messages[0].room.moves,[112]);assert.equal(f.room.seats[1],resumed.id);
  assert.equal(JSON.stringify(f.hub.snapshot(f.room)).includes(f.b.token),false);
  f.move(resumed,113);assert.equal(f.room.moves.length,2);
});
test('disconnect grace, resignation, leaving and host transfer end games once and retain spectators', () => {
  const f=fixture();f.start();f.hub.disconnect(f.a);f.advance(RECONNECT_GRACE-1);
  assert.equal(f.room.phase,'playing');f.advance(1);
  assert.equal(f.room.result.winner,2);assert.equal(f.room.seats[0],null);assert.equal(f.room.owner,f.b.id);
  assert.equal(f.room.members.has(f.watcher.id),true);
  f.hub.request(f.watcher,{type:'seat',seat:0,name:'新棋手'});
  f.hub.request(f.watcher,{type:'ready',ready:true});f.hub.request(f.b,{type:'ready',ready:true});
  f.hub.request(f.b,{type:'leave'});assert.equal(f.room.result.winner,1);assert.equal(f.room.owner,f.watcher.id);
});
test('bounded room and audience capacities fail without corrupting memberships', () => {
  const f=fixture({maxRooms:1,maxMembers:3});const outsider=f.hub.connect(null,()=>{});
  assert.throws(()=>f.hub.request(outsider,{type:'create'}),/房间已满/);
  assert.throws(()=>f.hub.request(outsider,{type:'join',code:f.room.code}),/观众已满/);
  assert.equal(outsider.room,null);assert.equal(f.room.members.size,3);
});

test('real WebSocket service synchronizes players and spectators, resumes sessions and rejects malformed traffic', {timeout:15000}, async () => {
  const service=await createRoomServer({port:0,host:'127.0.0.1'});const clients=[];
  async function connect(token) {
    const ws=new WebSocket(`ws://127.0.0.1:${service.port}/room`);clients.push(ws);
    const messages=[];let requestId=0;
    ws.on('message',raw=>messages.push(JSON.parse(raw)));
    const wait=async predicate=>{for(let n=0;n<400;n++){const m=messages.find(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw new Error('Missing websocket message');};
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    ws.send(JSON.stringify({type:'hello',token}));const hello=await wait(m=>m.type==='welcome');
    return {ws,messages,hello,wait,send:async (type,fields={})=>{const id=++requestId;ws.send(JSON.stringify({type,...fields,requestId:id}));return wait(m=>m.requestId===id);}};
  }
  try {
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/health`)).status,200);
    const a=await connect(),b=await connect(),c=await connect();
    assert.equal((await a.send('create')).type,'ack');
    const state=await a.wait(m=>m.type==='state'&&m.room);const code=state.room.code;
    await b.send('join',{code});await c.send('join',{code});
    await a.send('seat',{seat:0,name:'A'});await b.send('seat',{seat:1,name:'B'});
    const race=await c.send('seat',{seat:1,name:'C'});assert.equal(race.type,'error');
    await a.send('ready',{ready:true});await b.send('ready',{ready:true});
    const started=await c.wait(m=>m.room?.phase==='playing');
    await a.send('move',{index:112,ply:0,gameId:started.room.gameId});
    for(const peer of [a,b,c])await peer.wait(m=>m.room?.moves.length===1);
    assert.equal((await c.send('move',{index:113,ply:1,gameId:started.room.gameId})).type,'error');
    b.ws.close();await new Promise(r=>b.ws.once('close',r));
    const resumed=await connect(b.hello.token);assert.equal(resumed.hello.id,b.hello.id);assert.deepEqual(resumed.hello.room.moves,[112]);
    assert.equal((await resumed.send('move',{index:113,ply:1,gameId:started.room.gameId})).type,'ack');
    await c.wait(m=>m.room?.moves.length===2);
    a.ws.send('null');await a.wait(m=>m.type==='error'&&m.requestId===null);
    a.ws.send('x'.repeat(5000));await new Promise(resolve=>a.ws.once('close',resolve));
  } finally {for(const ws of clients)ws.terminate();await service.close();}
});
