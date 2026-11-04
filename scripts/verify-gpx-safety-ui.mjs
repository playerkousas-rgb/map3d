/** Native DOMParser contracts plus real file-picker/race/download GPX UI gates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const p=(lat='22.30',lon='114.16',ele='0')=>`<trkpt lat="${lat}" lon="${lon}">${ele===null?'':`<ele>${ele}</ele>`}</trkpt>`;
const second=p('22.301','114.161');
const xml=(points,name='Safe track')=>`<gpx version="1.1"><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`;
export async function verifyGpxSafetyUi(page,{base,output,width,pass}){
  await page.goto(base);
  // This matrix is specifically dev-only/native XML, not a claim to execute
  // source imports on dist or to emulate DOMParser in a Node assertion.
  const fixtures=[
    [xml(p()+second),null],
    [xml(p()+second).replace('<gpx version="1.1">','<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">'),null],
    [xml(p()+second).replace('<gpx version="1.1">','<gpx xmlns="http://www.topografix.com/GPX/1/0" version="1.0">'),null],
    ['<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:rte><g:name>Prefixed route</g:name><g:rtept lat="22.3" lon="114.16"><g:ele>0</g:ele></g:rtept><g:rtept lat="22.301" lon="114.161"><g:ele>0</g:ele></g:rtept></g:rte></g:gpx>',null],
    ['<html>'+xml(p()+second)+'</html>','GPX_INVALID'],
    [xml(p()+second).replace('<gpx version="1.1">','<gpx xmlns="https://attacker.invalid/">'),'GPX_INVALID'],
    [xml(p()+second).replace('version="1.1"','version="2.0"'),'GPX_INVALID'],
    [xml(p('Infinity')+second),'GPX_INVALID'],[xml(p('22abc')+second),'GPX_INVALID'],
    [xml(p('91')+second),'GPX_INVALID'],[xml(p('22','180')+second),'GPX_INVALID'],
    [xml(p('22.3','114.16','oops')+second),'GPX_INVALID'],
    [xml(p('22.3','114.16','')+second),'GPX_INVALID'],
    [xml(p('22.3','114.16','1e2')+second),'GPX_INVALID'],
    [xml(p().replace('<ele>0</ele>','<ele>0</ele><ele>1</ele>')+second),'GPX_INVALID'],
    ['<!DOCTYPE gpx [<!ENTITY x "22.3">]>'+xml(p('&x;')+second),'GPX_INVALID'],
    ['<gpx><trk>','GPX_INVALID'],[xml(''),'NO_POINTS'],
    [xml(p()+p()),'GPX_NO_EXTENT'],
    [xml(p()+second).replace('</trkseg>','</trkseg><trkseg>'+p()+second+'</trkseg>'),'GPX_DISCONNECTED'],
    ['<gpx><rte/><trk><trkseg>'+p()+second+'</trkseg></trk></gpx>','GPX_DISCONNECTED'],
    ['<gpx><extensions>'+xml(p()+second)+'</extensions></gpx>','NO_POINTS'],
  ];
  const results=await page.evaluate(async fixtures=>{
    const {parseGpx}=await import('/src/utils/gpx.ts');
    return fixtures.map(([text])=>{try{return {error:null,name:parseGpx(text).stats.name};}catch(error){return {error:error.message};}});
  },fixtures);
  results.forEach((r,i)=>assert.equal(r.error,fixtures[i][1],`native XML fixture ${i}`));
  assert.equal(results[3].name,'Prefixed route');
  pass(`${width}px GPX safety: 22 native XML contracts cover namespaces/routes, strict numbers, DTD/root/duplicate elevation and disconnected-segment rejection`);
  await page.getByRole('button',{name:'GPX → 3D Print Model',exact:true}).click();
  const input=page.locator('input[type=file][accept*=gpx]');
  const upload=async(text,name='safe.gpx')=>input.setInputFiles({name,mimeType:'application/gpx+xml',buffer:Buffer.from(text)});
  const panel=page.getByRole('region',{name:'Model Settings',exact:true});
  await upload(xml(p('NaN')+second));await page.getByRole('alert').waitFor();assert.equal(await page.locator('canvas').count(),0);
  await page.locator('[data-topnav] button').click();assert((await page.getByRole('alert').textContent()).includes('數值無效'));
  await page.locator('[data-topnav] button').click();
  await upload(xml(p()+second,'Valid sea level'));await panel.waitFor();
  assert.equal(await panel.getByRole('button',{name:'Fill in elevation from terrain data',exact:true}).count(),0);
  assert.equal(await page.getByRole('alert').count(),0);
  pass(`${width}px GPX safety: invalid picker input stays on front with translated alert; same-file recovery accepts complete all-zero elevation`);

  await page.getByRole('button',{name:'Back',exact:true}).click();
  await upload(xml(p('22.3','114.16','200')+p('22.301','114.161',null),'Partial heights'));
  await panel.waitFor();await panel.getByText(/Some points have no elevation/).waitFor();
  const event=page.waitForEvent('download');await panel.getByRole('button',{name:'Export STL (3D Print)',exact:true}).click();
  const buffer=await fs.readFile(await(await event).path());assert.equal(buffer.length,84+buffer.readUInt32LE(80)*50);
  let maxY=-Infinity;
  for(let t=0;t<buffer.readUInt32LE(80);t++)for(let v=0;v<3;v++){const y=buffer.readFloatLE(84+t*50+12+v*12+4);assert(Number.isFinite(y));maxY=Math.max(maxY,y);}
  assert(Math.abs(maxY-9)<1e-4,'partial elevations must produce flat 4mm base +2mm track +3mm markers, not a fabricated 200m cliff');
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await panel.getByText(/Some points have no elevation/).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`gpx-safety-partial-${width}.png`)});
  pass(`${width}px GPX safety: partial-elevation warning and actual STL readback prove flat fallback instead of invented sea-level drop`);

  await page.getByRole('button',{name:'Back',exact:true}).click();
  await upload(xml(p()+second).replace('</trkseg>','</trkseg><trkseg>'+p()+second+'</trkseg>'));
  await page.getByRole('alert').waitFor();assert((await page.getByRole('alert').textContent()).includes('one continuous track'));
  await page.screenshot({path:path.join(output,`gpx-safety-disconnected-${width}.png`)});
  pass(`${width}px GPX safety: native multi-segment file is rejected visibly without joining GPS reception gaps`);

  const dense=Array.from({length:3001},(_,i)=>p(String(22.3+i*.000001),'114.16','0')).join('');
  await upload(xml(dense,'Dense track'));await panel.waitFor();
  const simplified=panel.getByRole('status');assert((await simplified.textContent()).includes('3001 → 3000'));
  await simplified.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`gpx-safety-dense-${width}.png`)});
  pass(`${width}px GPX safety: real 3001-point picker file is endpoint-decimated to 3000 with visible approximation notice`);

  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.evaluate(()=>{
    globalThis.__originalGpxStream=File.prototype.stream;
    File.prototype.stream=function(){
      if(!this.name.startsWith('slow-'))return globalThis.__originalGpxStream.call(this);
      const file=this;let cancelled=false;globalThis.__gpxStreamCancelled=false;
      return new ReadableStream({start(controller){globalThis.__releaseGpx=async()=>{if(cancelled)return;controller.enqueue(new Uint8Array(await file.arrayBuffer()));controller.close();};},cancel(){cancelled=true;globalThis.__gpxStreamCancelled=true;}});
    };
  });
  try{
    await upload(xml(p()+second,'Old slow track'),'slow-valid.gpx');await page.waitForFunction(()=>typeof globalThis.__releaseGpx==='function');
    await upload(xml(p()+second,'Latest track'));
    await panel.getByText('Latest track',{exact:true}).waitFor();
    assert(await page.evaluate(()=>globalThis.__gpxStreamCancelled));
    await page.evaluate(()=>globalThis.__releaseGpx());
    assert.equal(await panel.getByText('Old slow track',{exact:true}).count(),0);
    assert.equal(await page.getByRole('alert').count(),0);
    pass(`${width}px GPX safety: a newer native picker selection cancels the older stream and retains only the latest track`);
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.evaluate(()=>{globalThis.__releaseGpx=null;});
    await upload(xml(p()+second,'Should never open'),'slow-mode.gpx');await page.waitForFunction(()=>typeof globalThis.__releaseGpx==='function');
    await page.getByRole('button',{name:'3D Orienteering',exact:true}).click();
    await page.getByRole('textbox',{name:'Course name',exact:true}).waitFor();
    assert(await page.evaluate(()=>globalThis.__gpxStreamCancelled));
    await page.evaluate(()=>globalThis.__releaseGpx());
    assert.equal(await panel.count(),0);assert.equal(await page.locator('canvas').count(),0);
    pass(`${width}px GPX safety: leaving GPX aborts a stalled read, which cannot hijack the new mode or mount a model`);
  }finally{await page.evaluate(()=>{File.prototype.stream=globalThis.__originalGpxStream;delete globalThis.__originalGpxStream;delete globalThis.__releaseGpx;delete globalThis.__gpxStreamCancelled;});}
}
