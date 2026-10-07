import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {OPENINGS} from '../src/openings.js';
import {studyLines,studyChoices} from '../src/study.js';
import {coordinate} from '../src/engine.js';
const userData=await fs.mkdtemp(path.join(os.tmpdir(),'yijian-study-'));
const app=await electron.launch({args:['.'],env:{...process.env,YIJIAN_TEST_DATA:userData,YIJIAN_TEST_ENGINE_MS:'300'}});
try{
 const p=await app.firstWindow(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('[data-cell]');
 await p.locator('[data-page=learn]').first().click();
 for(const opening of OPENINGS){
  await p.locator(`[data-code=${opening.code}]`).click();
  for(const rule of ['renju','freestyle']){
   await p.locator(`[data-action=study-rule][data-rule=${rule}]`).click();
   const lines=studyLines(opening,rule);assert.equal(await p.locator('.variation-card').count(),lines.length);
   assert.equal(await p.locator('.opening-detail .occupied').count(),3);
   assert.equal(await p.locator('.study-marker').count(),studyChoices(opening,rule,0,3).length);
   for(let v=0;v<lines.length;v++){
    await p.locator('.variation-card').nth(v).click();
    const actual=await p.locator('.opening-detail .occupied').evaluateAll(nodes=>nodes.map(n=>({ply:Number(n.textContent),label:n.getAttribute('aria-label').split('，')[0]})).sort((a,b)=>a.ply-b.ply));
    assert.equal(actual.length,6);assert.deepEqual(actual.map(a=>a.ply),[1,2,3,4,5,6]);assert.deepEqual(actual.map(a=>a.label),lines[v].moves.map(i=>coordinate(i)));
    await p.locator('[data-action=study-step][data-step="3"]').click();
    await p.locator('.study-marker').first().click();assert.equal(await p.locator('.opening-detail .occupied').count(),4);
    assert.equal(await p.locator('#study-range').inputValue(),'4');
   }
  }
 }
 // The chosen branch, side and rule survive the transition to practice.
 await p.locator('[data-code=D04]').click();await p.locator('[data-action=study-rule][data-rule=renju]').click();await p.locator('.variation-card').last().click();
 const expected=studyLines(OPENINGS.find(o=>o.code==='D04'),'renju').at(-1).moves;
 await p.locator('[data-action=side][data-side=black]').click();await p.selectOption('#study-opponent','rapfi-coach');
 await p.screenshot({path:'test-results/study-renju-after.png',fullPage:true});
 await p.locator('[data-action=practice]').click();await p.waitForSelector('[data-cell]');
 let game=await p.evaluate(()=>JSON.parse(localStorage.getItem('yijian-save-v1')).game);
 assert.deepEqual(game.moves,expected);assert.equal(game.settings.forbidden,true);assert.equal(game.settings.level,'rapfi-coach');assert.equal(game.settings.strength,20);assert.equal(game.practice,true);
 await p.locator('[data-page=learn]').first().click();await p.locator('[data-action=study-rule][data-rule=freestyle]').click();await p.locator('.variation-card').first().click();
 await p.locator('[data-action=side][data-side=white]').click();await p.selectOption('#study-opponent','rapfi');
 await p.locator('[data-action=practice]').click();await p.locator('[data-action=confirm-practice]').click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-cell].occupied').length===7,{},{timeout:15000});
 game=await p.evaluate(()=>JSON.parse(localStorage.getItem('yijian-save-v1')).game);
 assert.equal(game.settings.forbidden,false);assert.equal(game.settings.level,'rapfi');assert.equal(game.settings.strength,100);assert.equal(game.settings.human,2);
 assert.deepEqual(game.moves.slice(0,6),studyLines(OPENINGS.find(o=>o.code==='D04'),'freestyle')[0].moves);
 assert.deepEqual(errors,[]);console.log('PASS: all opening/rule/branch selectors, six-ply boards, clickable candidates, and native practice with matching side/rule/strength.');
}finally{await app.close();await fs.rm(userData,{recursive:true,force:true});}
