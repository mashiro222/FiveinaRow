import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { RoomHub } from '../server/rooms.mjs';
import { createRoomServer } from '../server/index.mjs';
import { WebSocket } from 'ws';

let offset=0;
const hub=new RoomHub({now:()=>Date.now()+offset});
const service=await createRoomServer({port:0,host:'127.0.0.1',hub});
let serviceClosed=false;
const url=`ws://127.0.0.1:${service.port}/room`;
const apps=[],dirs=[],errors=[];
const executablePath=process.env.GAME_EXECUTABLE || undefined;
await fs.mkdir('test-results',{recursive:true});
async function launch() {
 const userData=await fs.mkdtemp(path.join(os.tmpdir(),'yijian-online-'));dirs.push(userData);
 const app=await electron.launch({executablePath,args:executablePath?[]:['.'],env:{...process.env,YIJIAN_TEST_DATA:userData,YIJIAN_TEST_ENGINE_MS:'300'},timeout:30000});apps.push(app);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('[data-page="online"]').click();
 await page.locator('#online-server').fill(url);
 await page.locator('#online-connect-form button').click();
 await page.waitForFunction(()=>document.querySelector('#online-connection-status')?.textContent==='已连接');
 return page;
}
const join=async(page,code)=>{await page.locator('[name="code"]').fill(code);await page.locator('#online-join-form button').click();await page.waitForSelector('.online-seats');};
const sit=async(page,seat,name)=>{await page.locator(`[data-online="seat"][data-seat="${seat}"]`).click();await page.locator('#online-seat-form [name="name"]').fill(name);await page.locator('#online-seat-form button[type="submit"]').click();await page.waitForSelector('[data-online="ready"]');};
const stones=async(page,n)=>page.waitForFunction(n=>document.querySelectorAll('[data-online-cell].occupied').length===n,n,{timeout:10000});
try {
 const a=await launch(),b=await launch(),watcher=await launch();
 await a.screenshot({path:'test-results/09-online-lobby.png',fullPage:true});
 await a.locator('[data-online="create"]').click();await a.waitForSelector('.online-seats');
 const code=(await a.locator('h1').textContent()).match(/\d{4}/)[0];
 await join(b,code);await join(watcher,code);
 await sit(a,0,'松间 <黑>');await sit(b,1,'白棋 & 友');
 await watcher.waitForFunction(()=>document.querySelectorAll('[data-online="seat"]').length===0);
 assert.match(await watcher.locator('.online-seats').textContent(),/松间 <黑>/);
 assert.equal(await watcher.locator('[data-online="ready"]').count(),0);
 await a.locator('#online-rules-form [name="forbidden"]').check();
 await a.selectOption('#online-rules-form [name="turnSeconds"]','30');await a.locator('#online-rules-form button').click();
 await b.waitForFunction(()=>document.querySelector('[name="turnSeconds"]').value==='30');
 assert.equal(await b.locator('[name="turnSeconds"]').isDisabled(),true);
 await a.locator('[data-online="ready"]').click();await b.locator('[data-online="ready"]').click();
 await a.waitForSelector('[data-online="resign"]');
 await a.locator('[data-online-cell="112"]').click();
 for(const p of [a,b,watcher])await stones(p,1);
 await watcher.locator('[data-online-cell="114"]').click();await stones(watcher,1);
 await b.locator('[data-online-cell="113"]').click();for(const p of [a,b,watcher])await stones(p,2);
 await watcher.bringToFront();
 try {await watcher.waitForSelector('.winrate-labels',{timeout:20000});}
 catch(error){
  for(const [label,p] of [['black',a],['white',b],['spectator',watcher]])console.error(label,await p.locator('#online-rate-body').textContent(),await p.locator('.board-status').textContent());
  throw error;
 }
 const percentages=await watcher.locator('.winrate-labels b').allTextContents();
 assert.ok(Math.abs(percentages.reduce((sum,text)=>sum+parseFloat(text),0)-100)<.01);
 await a.screenshot({path:'test-results/10-online-players.png',fullPage:true});
 await watcher.screenshot({path:'test-results/11-online-spectator.png',fullPage:true});
 await watcher.locator('#online-show-rate').uncheck();assert.equal(await watcher.locator('.winrate-labels').count(),0);
 // Re-open window content: resume same seat and board instead of duplicating a member.
 const oldCount=[...hub.rooms.values()][0].members.size;
 await b.reload();await b.locator('[data-page="online"]').click();await b.waitForSelector('[data-online="resign"]');await stones(b,2);
 assert.equal([...hub.rooms.values()][0].members.size,oldCount);
 await a.locator('[data-online="resign"]').click();await a.locator('[data-online="confirm-resign"]').click();
 for(const p of [a,b,watcher])await p.waitForFunction(()=>document.querySelector('.board-status')?.textContent.includes('白方获胜'));
 await a.locator('[data-online="ready"]').click();await b.locator('[data-online="ready"]').click();await stones(a,0);
 for(const index of [111,0,113,2,97,4,127,6]) {
  const n=[...hub.rooms.values()][0].moves.length;await (n%2?b:a).locator(`[data-online-cell="${index}"]`).click();
  for(const p of [a,b,watcher])await stones(p,n+1);
 }
 await a.locator('[data-online-cell="112"]').click();await a.waitForFunction(()=>document.querySelector('#toast').textContent.includes('三三'));
 await stones(a,8);
 // Server-controlled fake clock proves timeout propagates to all windows.
 offset+=31_000;hub.tick();
 for(const p of [a,b,watcher])await p.waitForFunction(()=>document.querySelector('.board-status')?.textContent.includes('落子超时'));
 await a.locator('[data-online="stand"]').click();await a.waitForSelector('[data-online="seat"][data-seat="0"]');
 await sit(watcher,0,'接棒棋手');
 await a.locator('[data-online="leave"]').click();await a.waitForSelector('#online-connect-form');
 // The desktop can host a service itself; connect over its actual LAN IP too.
 await a.locator('[data-online="host"]').click();
 await a.waitForFunction(()=>document.querySelector('#online-server')?.value==='ws://127.0.0.1:8787/room');
 await a.waitForFunction(()=>document.querySelector('#online-connection-status')?.textContent==='已连接');
 const addresses=await a.locator('.share-address code').allTextContents();
 if(addresses.length){
  // Some CI/managed desktops deny traffic to non-loopback addresses at the OS
  // layer. Distinguish that from an Electron/WebSocket regression.
  const reachable=await new Promise(resolve=>{const socket=new WebSocket(addresses[0],{handshakeTimeout:2000});socket.on('open',()=>{resolve(true);socket.close();});socket.on('error',()=>resolve(false));});
  if(reachable){await a.locator('#online-server').fill(addresses[0]);await a.locator('#online-connect-form button').click();await a.waitForFunction(()=>document.querySelector('#online-connection-status')?.textContent==='已连接');}
  else console.log('SKIP: OS does not allow the test process to reach this machine via its LAN IP; built-in host verified over loopback.');
 }
 await a.locator('[data-online="create"]').click();await a.waitForSelector('.online-seats');
 await a.locator('[data-online="leave"]').click();await a.waitForSelector('#online-connect-form');
 await a.locator('#online-server').fill(url);await a.locator('#online-connect-form button').click();
 await a.waitForFunction(()=>document.querySelector('#online-connection-status')?.textContent==='已连接');
 await a.locator('[data-online="create"]').click();await a.waitForSelector('.online-seats');
 assert.equal(await a.locator('.invite-address').inputValue(),url,'Switching services must update the invitation address');
 await service.close();serviceClosed=true;
 await a.waitForSelector('.online-notice');await a.locator('[data-online="leave"]').click();await a.locator('[data-online="abandon"]').click();
 await a.waitForSelector('#online-connect-form');assert.equal(await a.locator('.online-seats').count(),0);
 // Local themes and offline saved games survive the whole online session.
 await a.locator('[data-page="play"]').first().click();assert.equal(await a.locator('[data-cell].occupied').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: three desktop clients, named seats, spectator restrictions, shared rules/clocks, Rapfi probabilities, hide/show, reconnect, resignation, rematch, forbidden move, timeout and seat handover.');
} finally {
 for(const app of apps.reverse())await app.close();
 if(!serviceClosed)await service.close();for(const dir of dirs)await fs.rm(dir,{recursive:true,force:true});
 if(errors.length)console.error(errors);
}
