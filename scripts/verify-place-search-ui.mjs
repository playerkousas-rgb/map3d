import assert from 'node:assert/strict';
import path from 'node:path';

/** Native search workflow on either dev or built CSP; no source imports/actions. */
export async function verifyPlaceSearchUi(page,{base,output,width,pass,production=false}){
  const prefix=production?'production-':'',calls=[],held=new Map(),done=new Map();let validRetry=false;
  const literal='<img src=x onerror="globalThis.__searchInjected=true">';
  const good=(name='Fresh search fixture')=>[{display_name:name,lat:'22.32',lon:'114.17',boundingbox:['22.31','22.33','114.16','114.18']},{display_name:'Other search fixture',lat:'22.33',lon:'114.18'}];
  const pattern='https://nominatim.openstreetmap.org/**';
  const handler=async route=>{
    const url=new URL(route.request().url()),q=url.searchParams.get('q');calls.push({q,viewbox:url.searchParams.get('viewbox')});
    if(q.startsWith('hold-')){
      let finish;const finished=new Promise(resolve=>{finish=resolve;});done.set(q,finished);
      await new Promise(resolve=>held.set(q,resolve));
      if(!route.request().failure())await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify([{lat:'-33.86',lon:'151.21',display_name:'STALE SYDNEY'}])});
      finish();return;
    }
    const body=q==='invalid-fixture'&&!validRetry?[{lat:'22oops',lon:'114.17',display_name:'MALFORMED RESULT'}]:good(q==='invalid-fixture'?literal:q==='newer-fixture'?'Newer search fixture':undefined);
    await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(body)});
  };
  const dataPattern=/https:\/\/[^/]+\/(?:v1\/(?:elevation|srtm30m)|api\/interpreter|osm\/tools\/overpass\/api\/interpreter)(?:\?.*)?$/;
  const dataHandler=route=>{
    const u=new URL(route.request().url());let body;
    if(u.pathname.includes('interpreter'))body={elements:[]};
    else if(u.hostname==='api.open-meteo.com')body={elevation:Array(u.searchParams.get('latitude').split(',').length).fill(0)};
    else body={status:'OK',results:[]};
    return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(body)});
  };
  await page.context().route(pattern,handler);await page.context().route(dataPattern,dataHandler);
  const input=()=>page.getByRole('searchbox',{name:'Search',exact:true});
  const submit=async q=>{await input().fill(q);await input().press('Enter');};
  const begin=async q=>{
    const requested=page.waitForRequest(r=>new URL(r.url()).hostname==='nominatim.openstreetmap.org'&&new URL(r.url()).searchParams.get('q')===q);
    await submit(q);await requested;
    await page.waitForFunction(()=>globalThis.document.querySelector('form[role="search"]')?.getAttribute('aria-busy')==='true');
  };
  const abortEvent=q=>page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).hostname==='nominatim.openstreetmap.org'&&new URL(r.url()).searchParams.get('q')===q});
  const release=async q=>{held.get(q)?.();await done.get(q);};
  try{
    await page.goto(base);await submit('invalid-fixture');
    await page.getByText('Search is temporarily unavailable. Please try again later.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'MALFORMED RESULT',exact:true}).count(),0);
    await page.screenshot({path:path.join(output,`${prefix}place-search-invalid-${width}.png`)});
    pass(`${width}px: malformed provider latitude produces visible failure, not a guessed coordinate/candidate/map jump`);
    validRetry=true;await input().press('Enter');await page.getByRole('button',{name:literal,exact:true}).waitFor();
    assert.equal(calls.filter(c=>c.q==='invalid-fixture').length,2);
    assert(await page.evaluate(()=>globalThis.__searchInjected===undefined&&globalThis.document.querySelector('img[src="x"]')===null));
    assert.equal(await page.getByText('Search is temporarily unavailable. Please try again later.',{exact:true}).count(),0);
    pass(`${width}px: same-query retry reaches provider after invalid response; candidate labels stay escaped text, not executable HTML`);

    await begin('hold-clear');const beforeClear=calls.find(c=>c.q==='hold-clear').viewbox,abortedClear=abortEvent('hold-clear');
    await page.getByRole('button',{name:'Clear',exact:true}).click();await abortedClear;await release('hold-clear');
    assert.equal(await input().inputValue(),'');assert(await input().evaluate(el=>el===globalThis.document.activeElement));
    const beforeTyping=calls.length;await input().fill('fresh-fixture');await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));assert.equal(calls.length,beforeTyping);
    await input().press('Enter');await page.getByRole('button',{name:'Fresh search fixture',exact:true}).waitFor();
    assert.equal(calls.find(c=>c.q==='fresh-fixture').viewbox,beforeClear);assert.equal(await page.getByRole('button',{name:'STALE SYDNEY',exact:true}).count(),0);
    pass(`${width}px: Clear aborts active fetch, restores input focus; no type-ahead requests or stale viewport movement`);

    await begin('hold-edit');const beforeEdit=calls.find(c=>c.q==='hold-edit').viewbox,abortedEdit=abortEvent('hold-edit');
    await input().fill('newer-fixture');await abortedEdit;await release('hold-edit');await input().press('Enter');await page.getByRole('button',{name:'Newer search fixture',exact:true}).waitFor();
    assert.equal(calls.find(c=>c.q==='newer-fixture').viewbox,beforeEdit);
    await page.screenshot({path:path.join(output,`${prefix}place-search-latest-${width}.png`)});
    pass(`${width}px: editing invalidates pending search immediately; only explicitly submitted newer candidates publish without moving selection`);

    await begin('hold-mode');const abortedMode=abortEvent('hold-mode');await page.getByRole('button',{name:'GPX → 3D Print Model',exact:true}).click();await abortedMode;await release('hold-mode');
    await page.getByRole('button',{name:'Map → 3D Buildings',exact:true}).click();await input().waitFor();assert.equal(await input().inputValue(),'');
    assert.equal(await page.getByRole('button',{name:'STALE SYDNEY',exact:true}).count(),0);
    pass(`${width}px: leaving map mode aborts/unmounts old search; returning starts a clean form without late candidates or errors`);

    await page.getByRole('button',{name:'3D Orienteering',exact:true}).click();
    const course={app:'map3d-orienteering',version:1,exportedAt:'2026-11-03T00:00:00.000Z',course:{name:'Search cancellation fixture',playMode:'linear',controls:[]}};
    // A visible name field predates the async import. Hold the actual File.text
    // boundary to prove we wait for the committed import, not just its picker.
    await page.evaluate(()=>{
      const original=File.prototype.text;let release;const gate=new Promise(resolve=>{release=resolve;});
      globalThis.__searchImportHeld=false;
      globalThis.__finishSearchImport=()=>{File.prototype.text=original;release();};
      File.prototype.text=function(){
        if(this.name!=='search.json')return original.call(this);
        globalThis.__searchImportHeld=true;return gate.then(()=>original.call(this));
      };
    });
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({name:'search.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(course))});
    await page.waitForFunction(()=>globalThis.__searchImportHeld===true);
    assert.notEqual(await page.getByRole('textbox',{name:'Course name',exact:true}).inputValue(),course.course.name);
    await page.evaluate(()=>globalThis.__finishSearchImport());
    await page.waitForFunction(name=>globalThis.document.querySelector('input[aria-label="Course name"]')?.value===name,course.course.name);
    await page.getByRole('button',{name:'Select Box',exact:true}).click();const map=page.locator('.leaflet-container');await map.scrollIntoViewIfNeeded();const b=await map.boundingBox();
    await page.mouse.move(b.x+b.width*.4,b.y+b.height*.4);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.6,{steps:8});await page.mouse.up();
    await begin('hold-hidden');const abortedHidden=abortEvent('hold-hidden');await page.getByRole('button',{name:'Get 3D scene',exact:true}).click();await abortedHidden;await release('hold-hidden');
    await page.getByRole('button',{name:'Next Step',exact:true}).click();await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
    assert.equal(await page.getByRole('button',{name:'STALE SYDNEY',exact:true}).count(),0);
    pass(`${width}px: entering processing/3D aborts search even while selection map remains mounted; scene still opens normally`);
  }catch(error){
    await page.screenshot({path:path.join(output,`${prefix}place-search-failure-${width}.png`)}).catch(()=>{});
    console.error(`search ${width}/${production?'production':'dev'} failure state`,await page.evaluate(()=>({url:globalThis.location.href,course:globalThis.document.querySelector('input[aria-label="Course name"]')?.value,canvas:[...globalThis.document.querySelectorAll('canvas')].map(el=>({label:el.getAttribute('aria-label'),width:el.clientWidth,height:el.clientHeight})),buttons:[...globalThis.document.querySelectorAll('button')].filter(el=>el.getClientRects().length).map(el=>el.innerText||el.getAttribute('aria-label'))})).catch(()=>null));
    throw error;
  }finally{
    await page.evaluate(()=>globalThis.__finishSearchImport?.()).catch(()=>{});
    for(const resolve of held.values())resolve();
    await Promise.all([...done.values()]);
    await page.context().unroute(pattern,handler);await page.context().unroute(dataPattern,dataHandler);
  }
}
