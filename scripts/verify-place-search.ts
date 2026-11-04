import {GEOCODE_LIMITS,parsePlaceResults,searchPlaces} from '../src/utils/geocode';

export async function verifyPlaceSearch(ok:(condition:boolean,label:string)=>void){
  const item={lat:'22.32',lon:'114.17',display_name:'Search fixture',boundingbox:['22.31','22.33','114.16','114.18']};
  const rejects=(body:unknown)=>{try{parsePlaceResults(body);return false;}catch{return true;}};
  for(const pair of [[0,0],[-90,-180],[90,180],[-22.3,-114.1]]){
    const n=parsePlaceResults([{lat:String(pair[0]),lon:String(pair[1])}])[0];ok(n.lat===pair[0]&&n.lon===pair[1],`place coordinates: strict decimal preserves valid${pair}`);
  }
  ok(parsePlaceResults([item])[0].bounds?.[0][0]===22.31&&parsePlaceResults([item])[0].bounds?.[1][1]===114.18,'place bbox: source south/north/west/east order maps exactly to Leaflet corners');
  ok(parsePlaceResults([{...item,boundingbox:['22.32','22.32','114.17','114.17']}])[0].bounds===undefined,'place degenerate bbox: use valid point, not an invented extent');
  ok(parsePlaceResults([{lat:22.32,lon:114.17}])[0].name==='22.32, 114.17','place missing optional name/bbox uses finite coordinate label');
  ok(parsePlaceResults([]).length===0,'place genuinely empty result remains a successful no-result response');
  for(const value of ['22oops','22,3','1e2','0x10','',null,undefined,false,{},[],Infinity,NaN,91,-91]){
    ok(rejects([{...item,lat:value}]),`place latitude rejects nondecimal/nonfinite/out-of-range${String(value)}`);
  }
  for(const value of ['114tail',181,-181,true,null,Infinity])ok(rejects([{...item,lon:value}]),`place longitude rejects${String(value)}`);
  for(const b of [null,{},[],['22','23','114'],['23','22','114','115'],['22','23','115','114'],['-91','23','114','115'],['22','23','114','181'],['22x','23','114','115']]){
    ok(rejects([{...item,boundingbox:b}]),`place bbox rejects malformed/range/reversed${JSON.stringify(b)}`);
  }
  for(const body of [null,{},[null],[[]],[item,{...item,lat:'22bad'}],Array(6).fill(item),[{...item,display_name:{text:'bad'}}],[{...item,display_name:'x'.repeat(GEOCODE_LIMITS.maxNameChars+1)}]])ok(rejects(body),'place response rejects entire malformed/overbudget array, never publishes/cache partial candidates');
  ok(parsePlaceResults([{...item,display_name:'<img src=x onerror=alert(1)>'}])[0].name.includes('<img'),'place label remains plain text; React, not unsafe HTML, renders it');

  const originalFetch=globalThis.fetch,originalNow=Date.now;
  let calls=0;const json=(body:unknown)=>new Response(JSON.stringify(body));
  const rejected=async(work:Promise<unknown>)=>{try{await work;return false;}catch{return true;}};
  try{
    const starts:number[]=[];globalThis.fetch=async()=>{calls++;starts.push(Date.now());return json([item]);};
    await Promise.all(['one','two','three'].map(q=>searchPlaces(`parallel-${q}`,{lang:'en'})));
    ok(starts.length===3&&starts[1]-starts[0]>=GEOCODE_LIMITS.minIntervalMs&&starts[2]-starts[1]>=GEOCODE_LIMITS.minIntervalMs,'place shared start queue actually separates three concurrent network starts by1100ms (real timers)');
    let now=originalNow()+1_000_000;Date.now=()=>now;
    const next=(q:string,opts:Parameters<typeof searchPlaces>[1]={lang:'en'})=>{now+=2000;return searchPlaces(q,opts);};
    const before=calls;await next('cached-valid');await next('cached-valid');ok(calls===before+1,'place successful validated response is cached');
    await next('exact-view',{lang:'en',viewbox:[114.1,22.3,114.2,22.4]});const prior=calls;
    await next('exact-view',{lang:'en',viewbox:[114.11,22.3,114.21,22.4]});ok(calls===prior+1,'place cache key preserves exact viewbox rather than conflating nearby viewports');
    let requested:URL|undefined;
    globalThis.fetch=async(input,init)=>{calls++;requested=new URL(String(input));ok(init?.credentials==='omit','place direct requests omit credentials');return json([item]);};
    await next('wrapped-view',{lang:'zh',viewbox:[190,-20,200,20]});ok(!requested!.searchParams.has('viewbox')&&requested!.searchParams.get('accept-language')==='zh-HK,zh-TW,zh,en','place invalid world-copy bias is omitted; Chinese language preserved');
    const count=calls;ok(await rejected(next('x'.repeat(GEOCODE_LIMITS.maxQueryChars+1)))&&calls===count,'place query budget rejects before network, never silently truncates');
    const aborted=new AbortController();aborted.abort();ok(await rejected(next('cached-valid',{lang:'en',signal:aborted.signal}))&&calls===count,'place already-aborted caller rejects even on cache hit');
    const responses=[()=>json([{...item,lat:'22oops'}]),()=>new Response('<html>bad</html>'),()=>new Response(new Uint8Array([255,254])),()=>new Response('',{status:503}),()=>json(Array(6).fill(item))];
    for(const [i,response] of responses.entries()){
      globalThis.fetch=async()=>{calls++;return response();};ok(await rejected(next(`bad-http-${i}`)),`place HTTP/JSON/UTF8/value/array-limit failure${i} rejects`);
      globalThis.fetch=async()=>{calls++;return json([item]);};const n=calls;ok((await next(`bad-http-${i}`)).length===1&&calls===n+1,`place failed response${i} is not cached and can retry`);
    }
    let cancelled=false;
    globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(GEOCODE_LIMITS.maxBytes+1));},cancel(){cancelled=true;}}));
    ok(await rejected(next('oversize-stream'))&&cancelled,'place real streamed-byte budget cancels oversize body, regardless of absent header');
    cancelled=false;globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({cancel(){cancelled=true;}}),{headers:{'Content-Length':String(GEOCODE_LIMITS.maxBytes+1)}});
    ok(await rejected(next('oversize-header'))&&cancelled,'place advertised overbudget response cancels body without waiting for data');
    let signalSeen:AbortSignal|undefined,started:()=>void=()=>{};let seen=new Promise<void>(resolve=>{started=resolve;});
    globalThis.fetch=async(_input,init)=>{signalSeen=init!.signal!;started();return new Promise<Response>((_resolve,reject)=>signalSeen!.addEventListener('abort',()=>reject(signalSeen!.reason),{once:true}));};
    const controller=new AbortController(),active=next('active-cancel',{lang:'en',signal:controller.signal});await seen;controller.abort();
    ok(await rejected(active)&&!!signalSeen?.aborted,'place external cancel reaches the real active fetch signal');
    let deliver:((r:Response)=>void)|undefined;
    seen=new Promise<void>(resolve=>{started=resolve;});
    globalThis.fetch=async()=>{started();return new Promise<Response>(resolve=>{deliver=resolve;});};
    const ignoredController=new AbortController(),ignored=next('ignored-cancel',{lang:'en',signal:ignoredController.signal});await seen;ignoredController.abort();
    ok(await rejected(ignored),'place cancellation rejects even if a transport/mock ignores AbortSignal');
    deliver!(json([item]));globalThis.fetch=async()=>{calls++;return json([item]);};const afterIgnored=calls;
    ok((await next('ignored-cancel')).length===1&&calls===afterIgnored+1,'place late cancelled transport response cannot populate successful cache');
    let bodyStarted:()=>void=()=>{};seen=new Promise<void>(resolve=>{bodyStarted=resolve;});cancelled=false;
    globalThis.fetch=async()=>{
      const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}}),getReader=stream.getReader.bind(stream);
      Object.defineProperty(stream,'getReader',{value:()=>{const reader=getReader();bodyStarted();return reader;}});
      return new Response(stream);
    };
    const bodyController=new AbortController(),body=next('body-cancel',{lang:'en',signal:bodyController.signal});await seen;bodyController.abort();
    ok(await rejected(body)&&cancelled,'place cancel also releases stalled response reader, not only header fetch');
    globalThis.fetch=async()=>{calls++;return json([item]);};await next('queue-anchor');
    const queuedController=new AbortController(),queued=searchPlaces('queued-cancel',{lang:'en',signal:queuedController.signal});const beforeQueue=calls;queuedController.abort();
    ok(await rejected(queued)&&calls===beforeQueue,'place cancel while throttled rejects promptly without network');
    ok((await next('after-queued-cancel')).length===1,'place cancelled queued work cannot poison later searches');
    const emptyBefore=calls;ok((await next('   ')).length===0&&calls===emptyBefore,'place empty explicit query does not contact provider');
  }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
}
