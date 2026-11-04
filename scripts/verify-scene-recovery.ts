import {canRetrySceneLayer} from '../src/utils/sceneRecovery';
import {useSceneStore,type LoadState} from '../src/state/sceneStore';
import type {LatLng} from '../src/utils/course';

export async function verifySceneRecovery(ok:(v:boolean,label:string)=>void){
  for(const state of ['idle','loading','ready','error'] as LoadState[]){
    for(const failed of [0,1,4]){
      ok(canRetrySceneLayer(state,failed)===(state==='error'||state==='ready'&&failed>0),`scene recovery: ${state}/${failed} failed cells uses explicit failure, not a zero count`);
    }
  }
  ok(!canRetrySceneLayer('ready'), 'scene recovery: legitimate empty dataset is success, not a reason for endless retries');
  ok(!canRetrySceneLayer('ready',0),'scene recovery: geometry skips/draw ceiling alone are not network-cell failures');
  const originalFetch=globalThis.fetch,originalWarn=console.warn,originalError=console.error;
  const area:[LatLng,LatLng]=[{lat:22.47,lng:114.27},{lat:22.5,lng:114.3}];
  let calls=0,buildingCalls=0,roadCalls=0,terrainCalls=0,badBuildingQuery='',failBuildings=true,failRoads=true;
  const building=(id=97001)=>({type:'way',id,tags:{building:'yes',height:'10'},geometry:[{lat:22.48,lon:114.28},{lat:22.48,lon:114.2801},{lat:22.4801,lon:114.2801},{lat:22.4801,lon:114.28},{lat:22.48,lon:114.28}]});
  const json=(body:unknown)=>new Response(JSON.stringify(body));
  const settled=()=>new Promise<void>((resolve,reject)=>{
    const done=()=>['buildings','roads','terrain'].every(k=>['ready','error'].includes(useSceneStore.getState()[k as 'buildings'|'roads'|'terrain']));
    if(done()){resolve();return;}
    const timeout=setTimeout(()=>{off();reject(new Error('Scene recovery store did not settle'));},3000);
    const off=useSceneStore.subscribe(()=>{if(done()){off();clearTimeout(timeout);resolve();}});
  });
  console.warn=()=>{};console.error=()=>{};
  try{
    useSceneStore.getState().reset();
    globalThis.fetch=async(input,init)=>{
      calls++;const url=new URL(String(input));
      if(url.hostname==='api.open-meteo.com'){terrainCalls++;return json({elevation:Array(url.searchParams.get('latitude')!.split(',').length).fill(30)});}
      if(!url.pathname.includes('interpreter'))throw new Error(`Unexpected recovery-test URL:${url}`);
      const query=String(init?.body??'');
      if(query.includes('"building"')){
        buildingCalls++;badBuildingQuery ||= query;
        if(failBuildings&&query===badBuildingQuery)return new Response('',{status:503});
        return json({elements:[building()]});
      }
      roadCalls++;if(failRoads)return new Response('',{status:503});
      return json({elements:[{type:'way',id:97002,tags:{highway:'footway'},geometry:[{lat:22.48,lon:114.28},{lat:22.4801,lon:114.2801}]}]});
    };
    for(const part of ['buildings','roads','terrain'] as const)useSceneStore.getState().retry(part);
    ok(calls===0,'scene recovery: idle/no-area retry never emits a request');
    useSceneStore.getState().load(area);await settled();let s=useSceneStore.getState();
    ok(s.buildings==='ready'&&s.buildingCount===1&&s.buildingCells.failed===1&&s.buildingCells.total>1,'scene recovery: actual partial building cells preserve valid data and expose failed/total');
    ok(canRetrySceneLayer(s.buildings,s.buildingCells.failed),'scene recovery: a ready-but-partial building layer is retryable');
    ok(s.roads==='error'&&s.roadCount===0,'scene recovery: all road mirrors/cells failing is unavailable, not successful zero roads');
    ok(s.terrain==='ready'&&s.terrainMin===30,'scene recovery: road/building failure does not cancel good DEM');
    const savedField=s.field,savedBuildings=s.buildingData,bc=buildingCalls,tc=terrainCalls;
    failRoads=false;s.retry('roads');const firstRoadAttempt=roadCalls;s.retry('roads');s.retry('roads');
    ok(roadCalls===firstRoadAttempt,'scene recovery: repeated activation during loading is coalesced by store');
    await settled();s=useSceneStore.getState();
    ok(s.roads==='ready'&&s.roadCount===1&&s.roadCells.failed===0,'scene recovery: actual road retry recovers valid geometry and resets failed-cell status');
    ok(s.buildingData===savedBuildings&&s.field===savedField&&buildingCalls===bc&&terrainCalls===tc,'scene recovery: retry roads preserves other data references and emits no unrelated requests');
    const savedRoads=s.roadData,rc=roadCalls;failBuildings=false;s.retry('buildings');await settled();s=useSceneStore.getState();
    ok(s.buildings==='ready'&&s.buildingCells.failed===0&&s.buildingCount===1,'scene recovery: partial building retry reuses valid cached cells and recovers missing cell without duplicates');
    ok(s.field===savedField&&s.roadData===savedRoads&&roadCalls===rc&&terrainCalls===tc,'scene recovery: retry buildings does not re-fetch DEM/roads');
    const finalBuildings=s.buildingData,finalRoads=s.roadData;s.retry('terrain');s.retry('terrain');await settled();s=useSceneStore.getState();
    ok(terrainCalls===tc+1&&s.terrain==='ready','scene recovery: terrain retry remains one bounded grid request');
    ok(s.buildingData===finalBuildings&&s.roadData===finalRoads,'scene recovery: terrain retry preserves recovered city geometry');

    let finish:((r:Response)=>void)|undefined,held=false;const currentFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      if(String(init?.body??'').includes('"building"')&&!held){held=true;return new Promise<Response>(resolve=>{finish=resolve;});}
      return currentFetch(input,init);
    };
    useSceneStore.getState().load([{lat:22.61,lng:114.31},{lat:22.6101,lng:114.3101}]);
    useSceneStore.getState().load([{lat:22.62,lng:114.32},{lat:22.6201,lng:114.3201}]);await settled();
    finish!(json({elements:[building(99999)]}));await new Promise<void>(resolve=>setImmediate(resolve));
    ok(useSceneStore.getState().buildingData.every(b=>b.id!==99999)&&useSceneStore.getState().dataArea?.[0].lat===22.62,'scene recovery: late old-area building request cannot replace the current recovered scene');
  }finally{globalThis.fetch=originalFetch;console.warn=originalWarn;console.error=originalError;useSceneStore.getState().reset();}
}
