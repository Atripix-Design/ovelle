import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.OVELLE_WEBSITE_URL || 'http://127.0.0.1:5174';
const output = process.env.OVELLE_REFINEMENT_OUTPUT || '/tmp/ovelle-refinement';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440,390,320]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.goto(base); await page.evaluate(() => document.fonts.ready);
    await page.locator('.home img').evaluateAll(async nodes => Promise.all(nodes.map(n => { n.loading='eager'; return n.decode(); })));
    const geometry = await page.evaluate(() => {
      const image = selector => { const n=document.querySelector(selector); const s=getComputedStyle(n); return {y:new DOMMatrix(s.transform).m42,height:n.getBoundingClientRect().height,fit:s.objectFit}; };
      const mask=getComputedStyle(document.querySelector('.home-coast-edge'));
      return {river:image('.home-program-photo > img'),companion:image('.home-companion-photo > img'),mask:mask.maskImage,composite:mask.maskComposite};
    });
    if (width===1440) {
      assert.ok(Math.abs(geometry.river.y+201.6)<.1, 'Figma riverside crop: source image translation −201.6px');
      assert.ok(Math.abs(geometry.companion.y+12)<.1, 'Figma companion crop: source image translation −12px');
      assert.equal(await page.locator('.home-demo-action .ov-icon-action').evaluate(n=>n.getBoundingClientRect().width),44);
      assert.equal(await page.locator('.ov-pinned-heading h2').evaluate(n=>getComputedStyle(n).fontSize),'44px');
    } else {
      assert.equal(await page.locator('.home-mobile-navigation .ov-mobile-header').evaluate(n=>n.getBoundingClientRect().height),54,'Home source navigation instance overrides the shared 64px default');
      assert.notEqual(geometry.mask,'none','Both bundled native SVG feather masks must be valid CSS URLs');
      assert.ok(geometry.composite.split(', ').every(value=>value==='intersect'));
      assert.equal(geometry.river.y,0); assert.equal(geometry.companion.y,0);
      assert.equal(geometry.river.fit,'cover'); assert.equal(geometry.companion.fit,'cover');
    }
    await page.screenshot({path:`${output}/home-${width}.png`,fullPage:true});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await page.goto(base);
  const root=page.locator('.ov-pinned-workflow[data-pinned]'); await root.waitFor();
  const {top,runway}=await root.evaluate(n=>({top:n.getBoundingClientRect().top+scrollY,runway:n.offsetHeight-innerHeight}));
  const scroll=async value=>{await page.evaluate(({top,runway,value})=>scrollTo(0,top+runway*value),{top,runway,value});await page.waitForTimeout(70);};
  const fills=()=>root.locator('.ov-workflow-progress span').evaluateAll(ns=>ns.map(n=>new DOMMatrix(getComputedStyle(n).transform).m11));
  await scroll(.05); const first=await fills(); await scroll(.2); const second=await fills();
  assert.equal(await root.getAttribute('data-stage'),'find'); assert.ok(second[0]>first[0]+.4,'Progress grows continuously within a phase');
  await scroll(.4);
  assert.equal(await root.getAttribute('data-stage'),'enrich');
  assert.equal((await fills())[0],1,'Completed phase stays filled');
  const overlap=await root.evaluate(n=>{const active=n.querySelector('[data-workflow-active] > section');const outgoing=n.querySelector('.ov-pinned-exiting');return {active:Number(getComputedStyle(active).opacity),outgoing:outgoing&&Number(getComputedStyle(outgoing).opacity),inert:outgoing?.inert,header:Number(getComputedStyle(n.querySelector('header')).opacity)};});
  assert.ok(overlap.active>0&&overlap.active<1&&overlap.outgoing>0,'Both source stages remain visible during transition');
  assert.equal(overlap.inert,true); assert.equal(overlap.header,1);
  await page.screenshot({path:`${output}/crossfade.png`}); await page.waitForTimeout(450);
  assert.equal(await root.locator('.ov-pinned-exiting').count(),0);
  await scroll(.5); await page.waitForTimeout(450); await page.screenshot({path:`${output}/midpoint.png`});
  await scroll(.9); assert.equal(await root.getAttribute('data-stage'),'follow-up');
  await scroll(.1); assert.equal(await root.getAttribute('data-stage'),'find');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(80);
  assert.equal(await root.locator('.ov-pinned-exiting').count(),0);
  assert.equal(await page.locator('.ov-pinned-workflow .ov-workflow-section').count(),3);
  await page.close();
  for (const [name,url] of [['web',`${base}/components`],['desktop',process.env.OVELLE_DESKTOP_PREVIEW_URL||'http://127.0.0.1:5175/?components']]) {
    const gallery=await browser.newPage({viewport:{width:1600,height:1000}});await gallery.goto(url);await gallery.evaluate(()=>document.fonts.ready);
    for(const stage of ['find','enrich','follow-up']) {
      const specimen=gallery.locator(`[data-workflow-progress-source="${stage}"] .ov-pinned-workflow`);
      await specimen.waitFor(); await specimen.evaluate(n=>{const section=n.closest(".website-variants");section.style.contain="none";section.style.overflow="visible";}); assert.ok((await specimen.boundingBox()).height===900);
      assert.ok(Math.abs((await specimen.locator('.ov-workflow-progress span').evaluateAll(ns=>ns.map(n=>new DOMMatrix(getComputedStyle(n).transform).m11)))[['find','enrich','follow-up'].indexOf(stage)]-.5)<.001);
      await specimen.screenshot({path:`${output}/${name}-${stage}-mid.png`});
    }
    await gallery.getByRole('switch',{name:'Liquid Glass'}).check();
    await gallery.getByRole('switch',{name:'Reduce transparency'}).check();
    assert.equal(await gallery.locator('[data-workflow-progress-source="find"] .ov-workflow-records').evaluate(n=>getComputedStyle(n).backdropFilter),'none','Reduced transparency applies to the nested results glass');
    await gallery.close();
  }
  console.log('Exact desktop image crops, bundled mobile source masks, native typography, continuous reversible progress, overlapping inert transitions, reduced motion and shared website/Electron specimens verified.');
} finally {await browser.close();}
