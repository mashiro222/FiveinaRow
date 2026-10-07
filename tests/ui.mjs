import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=process.cwd();
const userData=await fs.mkdtemp(path.join(os.tmpdir(),'yijian-ui-'));
const executablePath=process.env.GAME_EXECUTABLE || undefined;
const app=await electron.launch({executablePath,args:executablePath?[]:['.'],env:{...process.env,YIJIAN_TEST_DATA:userData,YIJIAN_TEST_ENGINE_MS:'300'},timeout:30000});
let page;
const errors=[];
try{
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('.intersection');
 await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForSelector('.intersection');
 assert.equal(await page.locator('[data-cell]').count(),225);
 assert.equal(await page.locator('.match-panel h2').textContent(),'Rapfi');
 assert.equal(await page.locator('.difficulty-dots').count(),0);
 assert.match(await page.title(),/弈间/);
 await page.screenshot({path:'test-results/01-play.png',fullPage:true});
 // AI actually responds in the isolated native engine process.
 await page.locator('[data-cell="112"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-cell].occupied').length===2,{},{timeout:15000});
 await page.locator('[data-action="undo"]').click();
 assert.equal(await page.locator('[data-cell].occupied').count(),0);
 assert.match(await page.locator('.arena-top .pill').textContent(),/辅助/);
 // Hint marks game assisted and displays an actual suggested position.
 await page.locator('[data-action="hint"]').click();await page.waitForSelector('.hint-ring',{timeout:15000});
 // New local match and complete five-in-row.
 await page.locator('[data-action="new"]').first().click();
 await page.selectOption('[name="mode"]','local');
 assert.equal(await page.locator('[name="thinkMs"]').isDisabled(),true);
 await page.locator('#new-form button[type="submit"]').click();
 for(const i of [112,97,113,98,114,99,115,100,116])await page.locator(`[data-cell="${i}"]`).click();
 await page.waitForSelector('.result-banner');assert.equal(await page.locator('.winning').count(),5);
 await page.locator('[data-cell="101"]').click();assert.equal(await page.locator('[data-cell].occupied').count(),9);
 await page.screenshot({path:'test-results/02-local-win.png',fullPage:true});
 // Opening library, exact patterns, slider, and white practice.
 await page.locator('[data-page="learn"]').first().click();assert.equal(await page.locator('.opening-item').count(),26);
 await page.locator('[data-code="I07"]').click();assert.match(await page.locator('.opening-header h2').textContent(),/浦月/);
 await page.locator('[data-action="step"][data-delta="1"]').click();
 await page.locator('[data-action="side"][data-side="white"]').click();
 await page.waitForTimeout(200);await page.screenshot({path:'test-results/03-learn.png',fullPage:true});
 await page.locator('[data-action="practice"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-cell].occupied').length===5,{},{timeout:15000});
 assert.match(await page.locator('.arena-top .pill').textContent(),/开局练习/);
 // Theme changes take effect in an active game, without losing it.
 await page.locator('[data-page="appearance"]').first().click();await page.locator('[data-preset="paper"]').click();
 assert.equal(await page.locator('html').getAttribute('data-background'),'paper');
 await page.screenshot({path:'test-results/04-appearance.png',fullPage:true});
 await page.locator('[data-page="play"]').first().click();assert.equal(await page.locator('.board-paper.pieces-ink').count(),1);
 assert.equal(await page.locator('[data-cell].occupied').count(),5);
 await page.waitForTimeout(200);await page.screenshot({path:'test-results/05-paper.png',fullPage:true});
 await page.reload();await page.waitForSelector('[data-cell]');assert.equal(await page.locator('[data-cell].occupied').count(),5);assert.equal(await page.locator('.board-paper').count(),1);
 // Formal AI resignation is saved once across refresh and replay works.
 await page.locator('[data-action="new"]').first().click();await page.selectOption('[name="mode"]','ai');await page.selectOption('[name="human"]','2');await page.selectOption('[name="thinkMs"]','10000');
 await page.locator('#new-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-cell].occupied').length===1,{},{timeout:15000});
 await page.locator('[data-action="resign"]').click();await page.locator('[data-action="confirm-resign"]').click();
 await page.locator('[data-page="stats"]').first().click();assert.equal(await page.locator('tbody tr').count(),1);
 await page.locator('[data-action="replay"]').click();assert.equal(await page.locator('dialog .occupied').count(),1);await page.locator('[data-action="close"]').click();
 await page.screenshot({path:'test-results/06-stats.png',fullPage:true});
 await page.reload();await page.locator('[data-page="stats"]').first().click();assert.equal(await page.locator('tbody tr').count(),1);
 // Black forbidden double three does not consume a turn.
 await page.locator('[data-page="play"]').first().click();await page.locator('[data-action="new"]').first().click();await page.selectOption('[name="mode"]','local');await page.locator('[name="forbidden"]').check();await page.locator('#new-form button[type="submit"]').click();
 for(const i of [111,0,113,2,97,4,127,6])await page.locator(`[data-cell="${i}"]`).click();
 await page.locator('[data-cell="112"]').click();assert.equal(await page.locator('[data-cell].occupied').count(),8);assert.match(await page.locator('#toast').textContent(),/三三禁手/);
 // Smaller and larger boards, keyboard movement, and native engine cancellation.
 await page.locator('[data-action="new"]').first().click();await page.selectOption('[name="size"]','19');await page.locator('#new-form button[type="submit"]').click();assert.equal(await page.locator('[data-cell]').count(),361);
 await page.locator('[data-cell="180"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-cell="181"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.locator('[data-cell].occupied').count(),1);
 await page.locator('[data-action="new"]').first().click();await page.locator('[name="forbidden"]').uncheck();await page.selectOption('[name="size"]','13');await page.selectOption('[name="mode"]','ai');await page.selectOption('[name="human"]','1');await page.selectOption('[name="thinkMs"]','10000');await page.locator('#new-form button[type="submit"]').click();assert.equal(await page.locator('[data-cell]').count(),169);
 await page.locator('[data-cell="84"]').click();await page.locator('[data-action="new"]').first().click();await page.selectOption('[name="mode"]','local');await page.locator('#new-form button[type="submit"]').click();
 await page.waitForTimeout(2500);assert.equal(await page.locator('[data-cell].occupied').count(),0);
 // Renju neural networks require 15x15, while local boards remain unrestricted.
 await page.locator('[data-action="new"]').first().click();await page.selectOption('[name="mode"]','ai');await page.locator('[name="forbidden"]').check();
 assert.equal(await page.locator('[name="size"]').inputValue(),'15');assert.equal(await page.locator('[name="size"] option[value="19"]').evaluate(option=>option.disabled),true);
 assert.equal(await page.locator('[name="level"]').count(),0);await page.selectOption('[name="thinkMs"]','60000');
 await page.screenshot({path:'test-results/08-new-game.png',fullPage:true});
 await page.locator('#new-form button[type="submit"]').click();assert.equal(await page.locator('[data-cell]').count(),225);
 assert.match(await page.locator('.match-panel').textContent(),/60 秒/);
 // Upgrade a v1.0 save without erasing history or mixing win rates.
 await page.evaluate(()=>{
  const save=JSON.parse(localStorage.getItem('yijian-save-v1'));save.settings.level='expert';delete save.settings.thinkMs;
  save.game.settings.level='expert';save.game.moves=[112,113];save.game.settings.human=1;save.game.assisted=false;
  save.records=[{id:'legacy-test',at:Date.now(),level:'expert',human:1,size:15,forbidden:false,result:'win',assisted:false,moves:[112],reason:'连五'}];
  localStorage.setItem('yijian-save-v1',JSON.stringify(save));
 });
 await page.reload();await page.waitForSelector('[data-cell]');assert.equal(await page.locator('[data-cell].occupied').count(),2);
 assert.match(await page.locator('.arena-top .pill').textContent(),/辅助/);
 await page.locator('[data-page="stats"]').first().click();assert.match(await page.locator('tbody').textContent(),/旧版 AI/);
 assert.match(await page.locator('.stats-cards').textContent(),/正式对局0/);
 // Leave a clean, appealing default board for a real first launch.
 await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForSelector('[data-cell]');
 await page.screenshot({path:'test-results/07-final.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: Electron UI, native Rapfi NNUE, wins, forbidden moves, undo/hint, opening practice, all board sizes, keyboard, persistence, stats, replay, themes, cancellation.');
} finally {if(page&&errors.length)console.error(errors);await app.close();await fs.rm(userData,{recursive:true,force:true});}
