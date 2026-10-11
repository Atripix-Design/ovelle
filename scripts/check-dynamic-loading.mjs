import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
try {
 await page.goto(process.env.OVELLE_PREVIEW_URL || 'http://127.0.0.1:5174/components');
 const demo=page.locator('.preview-loading'), content=demo.locator('.preview-dynamic-layout'), input=demo.getByLabel('Workspace name');
 await input.fill('Persisted input'); const original=await input.elementHandle();
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000}); const before=await content.boundingBox();
  await demo.getByRole('button',{name:'Load page',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.preview-loading .ov-skeleton-map rect'));
  const during=await content.boundingBox(); assert.equal(before.width,during.width);assert.equal(before.height,during.height);
  assert.equal(await demo.locator('.ov-skeleton').evaluate(n=>n.inert),true);
  await original.evaluate(n=>n.focus());assert.equal(await original.evaluate(n=>n===document.activeElement),false);
  // Custom HTML, native media, an unchecked CSS indicator and UI controls all yield masks.
  const shapeCovered=await demo.evaluate(root=>{const origin=root.querySelector('.ov-skeleton-content').getBoundingClientRect(), indicator=root.querySelector('.ov-check').getBoundingClientRect();return [...root.querySelectorAll('.ov-skeleton-map rect')].some(n=>Math.abs(Number(n.getAttribute('x'))-(indicator.x-origin.x))<.5&&Math.abs(Number(n.getAttribute('width'))-indicator.width)<.5)});assert.ok(shapeCovered,'Unchecked painted shape missing');
  const blocks=await demo.locator('.ov-skeleton-map rect').count();assert.ok(blocks>=8,`Only ${blocks} blocks`);
  await demo.getByRole('button',{name:'Change content'}).click();await page.waitForTimeout(100);
  assert.notEqual((await content.boundingBox()).height,during.height);
  const maskBounds=await demo.locator('.ov-skeleton-map rect').evaluateAll(ns=>Math.max(...ns.map(n=>Number(n.getAttribute('y'))+Number(n.getAttribute('height')))));
  assert.ok(maskBounds<=(await content.boundingBox()).height+.5);
  await demo.getByRole('button',{name:'Finish loading'}).click();
  assert.equal(await input.inputValue(),'Persisted input');assert.equal(await original.evaluate(n=>n.isConnected),true);
  await input.focus();assert.equal(await input.evaluate(n=>n===document.activeElement),true);
  assert.equal(await demo.locator('.ov-skeleton-map').count(),0);assert.equal(await demo.locator('[role=status]').count(),0);
 }
 await page.setViewportSize({width:1440,height:1000});
 const preview=page.locator('.preview-interactive');await preview.getByRole('button',{name:/Report date/}).click();
 const cells=await preview.locator('.ov-calendar-day').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
 assert.ok(cells.length>=28);for(const c of cells)assert.equal(c.w,c.h);
 await preview.locator('.ov-date-group').screenshot({path:'/tmp/ovelle-calendar-app.png'});
 await page.keyboard.press('Escape');
 await page.getByRole('switch',{name:'Liquid Glass',exact:true}).check();
 for(const dark of [false,true]) {await page.getByRole('switch',{name:'Dark theme',exact:true}).setChecked(dark);await page.locator('[data-variant-case="Checkbox"]').screenshot({path:`/tmp/ovelle-checkbox-${dark?'dark':'light'}.png`});}
 console.log('DYNAMIC_LOADING_PASS: arbitrary HTML, live mutation, responsive masks, inert controls, retained mounted state; square calendar cells; checkbox theme captures.');
} finally {await browser.close();}
