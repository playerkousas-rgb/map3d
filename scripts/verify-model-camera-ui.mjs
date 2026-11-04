import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Native DOM input + rendered pixels + actual STL. Also runs against built CSP;
 * no source imports, camera store pokes, test globals or disabled web security. */
export async function verifyModelCameraUi(page,{output,width,pass,mode}){
  const group=page.getByRole('group',{name:'Model view',exact:true});
  const fit=group.getByRole('button',{name:'Fit model',exact:true});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
  const dismiss=async()=>{const button=page.getByRole('button',{name:'Dismiss',exact:true});if(await button.count())await button.click();};
  const panel=page.getByRole('region',{name:'Model Settings',exact:true});
  await page.locator('canvas').waitFor({state:'visible'});await group.waitFor();await dismiss();
  if(mode==='gpx')await panel.getByRole('button',{name:'Hide settings',exact:true}).click();
  await page.mouse.move(0,0);await settle();
  const image=()=>page.screenshot({clip:{x:8,y:180,width:width-16,height:560},animations:'disabled'});
  const initial=await image();
  await fit.focus();await fit.press('Enter');await settle();const baseline=await image();
  assert.deepEqual(initial,baseline,'initial model must already use the same complete-model frame as Fit');
  const layout=async()=>{
    assert.equal(await group.getByRole('button').count(),4);
    for(const button of await group.getByRole('button').all())assert(await button.evaluate(el=>{const r=el.getBoundingClientRect(),hit=globalThis.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=globalThis.innerWidth&&(hit===el||el.contains(hit));}),'camera buttons must be44px, on-screen and unobscured');
    const rect=await group.boundingBox();
    for(const label of [mode==='gpx'?'Back':'Edit selection','Export']){const b=await page.getByRole('button',{name:label,exact:true}).boundingBox();assert(rect.y+rect.height<=b.y,'camera toolbar must stay above Back/Export');}
    if(mode==='gpx'){const p=await panel.boundingBox();assert(p.y+p.height<=rect.y,'camera toolbar must stay below the GPX settings card');}
    assert(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
  };
  await layout();
  pass(`${width}px ${mode}: initial complete-model frame matches native Fit; four named44px buttons leave Back/Export/settings clear`);
  const zoom=group.getByRole('button',{name:'Zoom in',exact:true});await zoom.focus();await zoom.press('Enter');await settle();const zoom1=await image();
  assert.notDeepEqual(zoom1,baseline,'first keyboard zoom must change actual model pixels');
  await zoom.press('Enter');await settle();const zoom2=await image();assert.notDeepEqual(zoom1,zoom2,'repeated same command must act again');
  await group.getByRole('button',{name:'Zoom out',exact:true}).press('Space');await settle();assert.notDeepEqual(await image(),zoom2);
  await group.getByRole('button',{name:'Top view',exact:true}).press('Space');await settle();assert.notDeepEqual(await image(),baseline);
  pass(`${width}px ${mode}: Enter/Space zoom twice, zoom out and top view change real rendered geometry, not just button state`);
  await fit.press('Enter');await settle();assert.deepEqual(await image(),baseline);
  await page.mouse.move(width*.2,650);await page.mouse.down({button:'right'});await page.mouse.move(width*.2+65,680,{steps:10});await page.mouse.up({button:'right'});await page.mouse.move(0,0);await settle();
  assert.notDeepEqual(await image(),baseline,'native orbit pan must really move the model');
  await fit.press('Space');await settle();assert.deepEqual(await image(),baseline,'fit must clear native pan inertia, restoring the exact model image');
  await fit.press('Enter');await settle();assert.deepEqual(await image(),baseline,'repeated fit is idempotent');
  await page.screenshot({path:path.join(output,`model-camera-${mode}-${width}.png`)});
  pass(`${width}px ${mode}: native pointer pan changes the model; keyboard Fit clears damping and restores exact pixels repeatedly`);

  const stl=async()=>{
    await page.getByRole('button',{name:'Export',exact:true}).click();
    const downloading=page.waitForEvent('download');await page.getByRole('dialog',{name:'Export 3D Model',exact:true}).getByRole('button',{name:'STL',exact:true}).click();
    const download=await downloading,buffer=await fs.readFile(await download.path());
    assert.equal(buffer.length,84+buffer.readUInt32LE(80)*50);assert(buffer.readUInt32LE(80)>0);
    await dismiss();return buffer;
  };
  const before=await stl();await group.getByRole('button',{name:'Top view',exact:true}).click();await zoom.click();
  const after=await stl();assert.deepEqual(before,after,'camera must not mutate model-space/STL vertices, normals or triangle count');await fit.click();
  pass(`${width}px ${mode}: actual native STL downloads before/after view changes are byte-identical, preserving printable coordinates`);

  if(mode==='gpx')await panel.getByRole('button',{name:'Show settings',exact:true}).click();
  for(const viewport of [{width:320,height:568},{width:390,height:320},{width:844,height:390}]){await page.setViewportSize(viewport);await settle();await layout();}
  await page.setViewportSize({width,height:900});await settle();
  await page.locator('[data-topnav] button').click();
  const zh=page.getByRole('group',{name:'模型視角',exact:true});assert.equal(await zh.getByRole('button',{name:'完整模型',exact:true}).count(),1);
  for(const name of ['俯視','放大','縮小'])assert.equal(await zh.getByRole('button',{name,exact:true}).count(),1);
  await zh.getByRole('button',{name:'完整模型',exact:true}).press('Enter');
  if(mode==='gpx')assert.equal(await page.getByRole('button',{name:'展開設定',exact:true}).getAttribute('aria-expanded'),'false','Fit reveals the entire GPX model by collapsing, not deleting, its settings');
  await page.screenshot({path:path.join(output,`model-camera-${mode}-zh-${width}.png`)});
  await page.locator('[data-topnav] button').click();await fit.click();await settle();
  if(mode==='gpx'){await panel.getByRole('button',{name:'Show settings',exact:true}).click();assert.equal(await panel.getByRole('slider',{name:'Base Height',exact:true}).inputValue(),'4','Fit preserves model settings');}
  pass(`${width}px ${mode}: short/narrow native resizes keep expanded settings/navigation clear; all view controls translate to Traditional Chinese`);
}
