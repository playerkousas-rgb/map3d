/** GPX in-flow help/card regression. Mock-network Chromium, not device certification. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyGpxLayoutUi(page, { output, width, pass }) {
  const panel=page.getByRole('region',{name:'Model Settings',exact:true});
  const help=page.locator('#gpx-scene-help');
  const back=page.getByRole('button',{name:'Back',exact:true});
  const exportButton=page.getByRole('button',{name:'Export',exact:true});
  const rect=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};});
  const inside=async locator=>{
    await locator.scrollIntoViewIfNeeded();
    const p=await rect(panel),r=await rect(locator);
    assert(r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.left>=p.left-1&&r.right<=p.right+1,'content must be reachable within the scrolling card');
  };
  const layout=async()=>{
    const p=await rect(panel),nav=await rect(page.locator('[data-topnav]')),b=await rect(back),e=await rect(exportButton);
    assert(p.top>=nav.bottom&&p.bottom<=Math.min(b.top,e.top)-4,`card must not overlap navigation or bottom actions: ${JSON.stringify({viewport:page.viewportSize(),panel:p,nav,back:b,export:e})}`);
    const v=page.viewportSize();assert(p.left>=0&&p.right<=v.width&&p.height>44);
    assert(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth),'no horizontal page overflow');
    for(const locator of [back,exportButton])assert(await locator.evaluate(el=>{const r=el.getBoundingClientRect();const hit=globalThis.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit);}),'bottom action must be hit-testable');
  };
  await panel.waitFor();
  const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});
  if(await dismiss.count())await dismiss.click();
  await layout();await inside(help);
  assert(await help.evaluate(el=>el.closest('[data-gpx-panel]')!==null));
  assert.equal(await help.evaluate(el=>globalThis.getComputedStyle(el).position),'static');
  await page.screenshot({path:path.join(output,`gpx-layout-${width}.png`)});
  pass(`${width}px GPX: named scrolling settings region contains unobscured in-flow help, clear navigation and bottom actions`);

  const hide=panel.getByRole('button',{name:'Hide settings',exact:true});
  await hide.focus();await hide.press('Enter');
  const show=panel.getByRole('button',{name:'Show settings',exact:true});
  assert.equal(await show.getAttribute('aria-expanded'),'false');
  assert.equal(await panel.getByRole('slider').count(),0,'collapsed settings must leave the accessibility/tab tree');
  assert(await show.evaluate(el=>el===globalThis.document.activeElement),'toggle retains focus');
  await layout();
  assert(await page.locator('canvas').evaluate(el=>{const r=el.getBoundingClientRect();return globalThis.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),'collapsed card must leave the model centre available to native pointer input');
  await page.screenshot({path:path.join(output,`gpx-layout-collapsed-${width}.png`)});
  await show.press('Space');
  assert.equal(await hide.getAttribute('aria-expanded'),'true');
  assert.equal(await panel.getByRole('slider',{name:'Base Height',exact:true}).inputValue(),'4');
  pass(`${width}px GPX: Enter/Space collapse and reopen settings, retain focus/parameters and expose the canvas centre`);

  const labels=['Elevation Exaggeration','Track Width','Base Height'];
  const values=['1.6','3.5','4.5'];
  await panel.focus();await page.keyboard.press('Tab');
  assert(await hide.evaluate(el=>el===globalThis.document.activeElement));
  await page.keyboard.press('Tab');
  assert(await panel.getByRole('slider',{name:labels[0],exact:true}).evaluate(el=>el===globalThis.document.activeElement));
  for(let i=0;i<labels.length;i++){
    const slider=panel.getByRole('slider',{name:labels[i],exact:true});
    await slider.focus();await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(),values[i]);
    assert((await slider.getAttribute('aria-valuetext')).includes(values[i]));
    await inside(slider);assert((await rect(slider)).height>=44);
    assert(await slider.evaluate(el=>{const r=el.getBoundingClientRect();return globalThis.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}));
  }
  const stl=panel.getByRole('button',{name:'Export STL (3D Print)',exact:true});
  await inside(stl);assert((await rect(stl)).height>=44);
  const event=page.waitForEvent('download');await stl.click();
  const download=await event,buffer=await fs.readFile(await download.path());
  assert(download.suggestedFilename().endsWith('.stl'));
  assert.equal(buffer.length,84+buffer.readUInt32LE(80)*50);
  const ys=[];
  for(let t=0;t<buffer.readUInt32LE(80);t++)for(let i=0;i<3;i++){
    const offset=84+t*50+12+i*12;
    for(let c=0;c<3;c++)assert(Number.isFinite(buffer.readFloatLE(offset+c*4)));
    ys.push(buffer.readFloatLE(offset+4));
  }
  assert(ys.some(y=>Math.abs(y-4.5)<1e-5),'keyboard base-height change must reach the actual STL base top');
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  pass(`${width}px GPX: three labelled 44px sliders update by native keyboard; actual STL download contains the changed 4.5mm base top`);

  for(const [w,h] of [[320,568],[390,320],[568,320],[844,390]]){
    await page.setViewportSize({width:w,height:h});
    // Dynamic viewport units update on the browser's rendering frame, not
    // necessarily before Playwright's setViewportSize promise resolves.
    await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
    await layout();await inside(help);
    for(const label of labels){const slider=panel.getByRole('slider',{name:label,exact:true});await slider.focus();await inside(slider);}
    await inside(stl);
    if(width===390)await page.screenshot({path:path.join(output,`gpx-layout-short-${w}x${h}.png`)});
  }
  pass(`${width}px GPX: real resize through 320×568,390×320,568×320,844×390 keeps help/sliders/STL reachable and bottom actions clear`);

  await page.setViewportSize({width:390,height:568});
  // Settle the real resize before changing a second independent condition.
  // Otherwise separate rect reads can straddle the media-query/inset frames.
  await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
  try{
    await page.evaluate(()=>{for(const [key,value]of Object.entries({'--safe-top':'24px','--safe-bottom':'20px','--safe-left':'8px','--safe-right':'8px'}))globalThis.document.documentElement.style.setProperty(key,value);});
    await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
    await layout();await inside(help);await inside(stl);
    if(width===390)await page.screenshot({path:path.join(output,'gpx-layout-insets-390.png')});
  }finally{
    await page.evaluate(()=>{for(const key of ['--safe-top','--safe-bottom','--safe-left','--safe-right'])globalThis.document.documentElement.style.removeProperty(key);});
    await page.setViewportSize({width,height:900});
  }
  pass(`${width}px GPX: synthetic safe-area insets preserve card/footer separation and are cleaned up`);

  await page.locator('[data-topnav] button').click();
  assert((await help.textContent()).includes('使用設定面板'));
  assert.equal(await page.getByRole('region').count(),1);
  assert.equal(await page.locator('[data-gpx-panel] input[type=range][aria-label][aria-valuetext]').count(),3);
  await help.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`gpx-layout-zh-${width}.png`)});
  await page.locator('[data-topnav] button').click();
  pass(`${width}px GPX: language toggle translates the in-flow help and all three named slider/value descriptions`);

  await back.click();
  const name='LongTrack'.repeat(125);
  await page.locator('input[type=file][accept*=gpx]').setInputFiles({name:'long-missing.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(`<gpx version="1.1"><trk><name>${name}</name><trkseg><trkpt lat="22.30" lon="114.16"/><trkpt lat="22.301" lon="114.161"/></trkseg></trk></gpx>`)});
  await panel.waitFor();await page.locator('canvas').waitFor();
  assert.equal(await panel.getByText(name,{exact:true}).textContent(),name,'long title must wrap, not truncate stored/DOM text');
  await layout();await inside(help);
  const fill=panel.getByRole('button',{name:'Fill in elevation from terrain data',exact:true});
  await inside(fill);assert((await rect(fill)).height>=44);
  const first=panel.getByRole('slider',{name:labels[0],exact:true});
  await first.focus();await inside(first);await inside(stl);
  await page.screenshot({path:path.join(output,`gpx-layout-long-missing-${width}.png`)});
  pass(`${width}px GPX: long unbroken title wraps without overflow; missing-elevation action, help and settings remain scroll-reachable`);
}
