import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const userData=await fs.mkdtemp(path.join(os.tmpdir(),'yijian-alignment-'));
const app=await electron.launch({args:['.'],env:{...process.env,YIJIAN_TEST_DATA:userData}});
try {
 const page=await app.firstWindow();await page.waitForSelector('[data-cell]');
 for(const size of [13,15,19])for(const width of [920,1360,1760])for(const pieces of ['ink','classic','flat','glass']){
  await app.evaluate(({BrowserWindow},{width})=>BrowserWindow.getAllWindows()[0].setSize(width,980),{width});
  await page.evaluate(({size,pieces})=>{
   const saved=JSON.parse(localStorage.getItem('yijian-save-v1'))||{version:1,settings:{},records:[]};
   Object.assign(saved.settings,{mode:'local',level:'rapfi',human:1,size,forbidden:false,board:'paper',background:'paper',pieces,numbers:true,sound:false});
   const center=Math.floor(size*size/2);saved.game={id:'alignment',settings:{...saved.settings},moves:[0,size-1,center,center+1,size*(size-1),size*size-1],result:null,assisted:false};
   localStorage.setItem('yijian-save-v1',JSON.stringify(saved));
  },{size,pieces});
  await page.reload();await page.waitForSelector('.occupied .piece');
  // Simulate the larger font metrics that exposed an intrinsic grid track
  // offset on a CI Mac. Stone centers must be independent of text line height.
  if(pieces!=='ink')await page.addStyleTag({content:'.piece{line-height:32px}'});
  await page.waitForTimeout(220);
  const errors=await page.locator('[data-cell].occupied').evaluateAll((cells,size)=>{
   const grid=document.querySelector('.board-grid'),matrix=grid.getScreenCTM();
   return cells.map(cell=>{
    const i=Number(cell.dataset.cell),p=new DOMPoint(6+i%size*88/(size-1),6+Math.floor(i/size)*88/(size-1)).matrixTransform(matrix);
    const mark=cell.querySelector('.ink-mark')||cell.querySelector('.piece'),r=mark.getBoundingClientRect();
    return {i,x:Math.abs(r.x+r.width/2-p.x),y:Math.abs(r.y+r.height/2-p.y)};
   });
  },size);
  for(const e of errors)assert.ok(e.x<.6&&e.y<.6,`${size}/${width}/${pieces}: ${JSON.stringify(e)}`);
 }
 // Reproduce the reported theme at a typical window size, with move numbers off.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1360,980));
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('yijian-save-v1'));Object.assign(s.settings,{size:15,pieces:'ink',numbers:false});s.game.settings={...s.settings};s.game.moves=[112,98,113,82,128,96];localStorage.setItem('yijian-save-v1',JSON.stringify(s));});
 await page.reload();await page.waitForSelector('.ink-mark');await page.waitForTimeout(220);
 await page.screenshot({path:'test-results/ink-alignment-after.png',fullPage:true});
 await page.locator('[data-page=appearance]').first().click();assert.equal(await page.locator('.preview-paper .ink-mark').count(),3);
 console.log('PASS: 36 combinations of board size, window size and piece style align to actual SVG intersections; paper preview uses vector marks.');
} finally {await app.close();await fs.rm(userData,{recursive:true,force:true});}
