import {fetchHeightField, flatHeightField, heightAt, fieldRange} from '../src/utils/terrain';
import {isElevationM} from '../src/utils/elevationValue';
import {isGpxElevation} from '../src/utils/gpx';
import {useSceneStore} from '../src/state/sceneStore';
import type {LatLng} from '../src/utils/course';

export async function verifyTerrainIntegrity(ok:(condition:boolean,label:string)=>void){
  const area:[LatLng,LatLng]=[{lat:22.3,lng:114.16},{lat:22.31,lng:114.17}];
  const oldFetch=globalThis.fetch,oldWarn=console.warn;
  let calls:string[]=[];
  const count=(url:URL)=>url.hostname==='api.open-meteo.com'?(url.searchParams.get('latitude')??'').split(',').length:(url.searchParams.get('locations')??'').split('|').length;
  const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200});
  const install=(primary:(n:number)=>unknown,backup:(n:number)=>unknown)=>{
    calls=[];globalThis.fetch=async input=>{
      const url=new URL(String(input));calls.push(url.hostname);
      if(url.hostname==='api.open-meteo.com')return json(primary(count(url)));
      if(url.hostname==='api.opentopodata.org')return json(backup(count(url)));
      if(url.pathname.includes('interpreter'))return json({elements:[]});
      throw new Error(`Unexpected terrain-test host: ${url.hostname}`);
    };
  };
  const good=(n:number,value=50)=>({elevation:Array(n).fill(value)});
  const topo=(n:number,value=50)=>({status:'OK',results:Array.from({length:n},()=>({elevation:value}))});
  const rejects=async(label:string)=>{let rejected=false;try{await fetchHeightField(area);}catch{rejected=true;}ok(rejected,label);};
  console.warn=()=>{};
  try{
    const flat=flatHeightField(area);
    ok(flat.source==='Flat reference (unmeasured)'&&flat.heights.every(h=>h===0),'DEM explicit flat helper never claims a measured provider source');
    for(const value of [0,-0,-400,-12000,10000,8848.86]){
      ok(isElevationM(value)&&isGpxElevation(value),`DEM shared bounds: valid ${value} metres, including sea level/negative elevation`);
    }
    for(const value of [null,undefined,false,true,'0','100','',NaN,Infinity,-Infinity,-12000.01,10000.01,{},[]]){
      ok(!isElevationM(value)&&!isGpxElevation(value),`DEM shared bounds: reject ${String(value)} without coercing to sea level`);
    }
    for(const value of [0,-400,-12000,10000]){
      install(n=>good(n,value),n=>topo(n,99));const f=await fetchHeightField(area);
      ok(f.source==='Open-Meteo (Copernicus DEM)'&&f.heights.length===f.cols*f.rows&&f.heights.every(h=>h===value)&&calls.length===1,`DEM primary: complete constant${value} is real data, never a missing-data fallback`);
    }
    for(const invalid of [null,false,'12',{},[],10000.1,-12000.1]){
      install(n=>({elevation:[invalid,...Array(n-1).fill(900)]}),n=>topo(n,50));const f=await fetchHeightField(area);
      ok(calls.length===2&&f.source==='OpenTopoData (SRTM)'&&f.heights.every(h=>h===50),`DEM primary ${JSON.stringify(invalid)}: discard entire grid/use complete fallback, never mix900/zero`);
    }
    const malformedPrimary=[(n:number)=>({elevation:Array(n-1).fill(50)}),(n:number)=>({elevation:Array(n+1).fill(50)}),()=>({elevation:50}),()=>({}), (n:number)=>({...good(n),error:true})];
    for(const [i,primary] of malformedPrimary.entries()){
      install(primary,n=>topo(n,60));const f=await fetchHeightField(area);ok(f.source==='OpenTopoData (SRTM)'&&f.heights.every(h=>h===60),`DEM primary structure${i}: exact cardinality/status required before publishing`);
    }
    for(const value of [0,-400,-12000,10000]){
      install(()=>({elevation:null}),n=>topo(n,value));const f=await fetchHeightField(area);
      ok(f.source==='OpenTopoData (SRTM)'&&fieldRange(f).min===value&&fieldRange(f).max===value&&heightAt(f,{lat:22.305,lng:114.165})===value,`DEM fallback: complete${value} field samples/range honestly`);
    }
    const malformedBackup=[
      (n:number)=>({status:'OK',results:[{elevation:null},...Array.from({length:n-1},()=>({elevation:100}))]}),
      (n:number)=>({status:'OK',results:Array.from({length:n-1},()=>({elevation:50}))}),
      (n:number)=>({status:'OK',results:Array.from({length:n+1},()=>({elevation:50}))}),
      ()=>({status:'OK',results:[]}),()=>({status:'OK',results:{}}),()=>({status:'SERVER_ERROR',results:[]}),
      (n:number)=>topo(n,'50' as unknown as number),(n:number)=>topo(n,10000.1),
    ];
    for(const [i,backup] of malformedBackup.entries()){
      install(n=>({elevation:Array(n).fill(null)}),backup);await rejects(`DEM both invalid${i}: reject, never return partial/flat-success heightfield`);
    }
    for(const step of [.0001,.01,.1]){
      install(n=>good(n),n=>topo(n));const f=await fetchHeightField([area[0],{lat:area[0].lat+step,lng:area[0].lng+step}]);
      ok(f.cols>=5&&f.cols<=10&&f.rows===f.cols&&f.heights.length===f.cols*f.rows&&f.heights.length<=100,`DEM grid ${step}: existing bounded5–10 grid/count contract preserved`);
    }
    install(n=>({elevation:[0,...Array.from({length:n-1},(_,i)=>i+1)]}),n=>topo(n));
    const ordered=await fetchHeightField(area);
    ok(ordered.heights[0]===0&&ordered.heights.at(-1)===ordered.heights.length-1,'DEM mixed finite grid: source order preserved, zero cell not treated missing');

    const settled=()=>new Promise<void>((resolve,reject)=>{
      if(['ready','error'].includes(useSceneStore.getState().terrain)){resolve();return;}
      const timeout=setTimeout(()=>{off();reject(new Error('Terrain store did not settle'));},3000);
      const off=useSceneStore.subscribe(s=>{if(['ready','error'].includes(s.terrain)){clearTimeout(timeout);off();resolve();}});
    });
    install(n=>good(n,75),n=>topo(n));useSceneStore.getState().load(area);await settled();
    ok(useSceneStore.getState().terrain==='ready'&&useSceneStore.getState().terrainMin===75&&!!useSceneStore.getState().field,'DEM actual scene store: valid complete grid publishes ready/source/range');
    install(n=>({elevation:Array(n).fill(null)}),n=>topo(n,null as unknown as number));
    useSceneStore.getState().retry('terrain');
    ok(useSceneStore.getState().terrain==='loading'&&useSceneStore.getState().field===null&&useSceneStore.getState().terrainSource==='','DEM retry: clears old grid/source before replacement, cannot label stale terrain current');
    await settled();
    ok(useSceneStore.getState().terrain==='error'&&useSceneStore.getState().field===null&&useSceneStore.getState().terrainMin===0&&useSceneStore.getState().terrainMax===0,'DEM store: both incomplete sources produce error/null, not ready0m');
    install(n=>good(n,0),n=>topo(n));useSceneStore.getState().retry('terrain');await settled();
    ok(useSceneStore.getState().terrain==='ready'&&useSceneStore.getState().field?.heights.every(h=>h===0)&&useSceneStore.getState().terrainSource==='Open-Meteo (Copernicus DEM)','DEM store retry: complete true0m recovers ready and source, not an unavailable placeholder');

    let finishOld:((r:Response)=>void)|undefined;
    install(n=>good(n,120),n=>topo(n));const currentFetch=globalThis.fetch;
    let held=false;
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.hostname==='api.open-meteo.com'&&!held){held=true;return new Promise<Response>(resolve=>{finishOld=resolve;});}
      return currentFetch(input,init);
    };
    useSceneStore.getState().load(area);
    const newer:[LatLng,LatLng]=[{lat:22.32,lng:114.18},{lat:22.33,lng:114.19}];
    useSceneStore.getState().load(newer);await settled();finishOld!(json(good(25,999)));
    // Drain the resolved request/validation/publication chain, no fixed sleep.
    await new Promise<void>(resolve=>setImmediate(resolve));
    ok(useSceneStore.getState().terrainMin===120&&useSceneStore.getState().field?.south===22.32,'DEM late previous-area response cannot replace current valid grid');
  }finally{globalThis.fetch=oldFetch;console.warn=oldWarn;useSceneStore.getState().reset();}
}
