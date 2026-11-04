import { buildGpxTrack, checkGpxText, computeGpxStats, gpxDecimal, GPX_LIMITS, haversine, readGpxFile } from "../src/utils/gpx";
import { fillTrackElevation } from "../src/utils/elevation";

export async function verifyGpx(ok:(condition:boolean,label:string)=>void){
  console.log("\n[GPX] strict numbers, bounded input, complete elevation and endpoint-safe decimation");
  const rejects=async(label:string,work:()=>unknown)=>{let failed=false;try{await work();}catch{failed=true;}ok(failed,label);};
  for(const value of [null,""," ","22abc","NaN","Infinity","-Infinity","1e2","0x10","1,2","1_2","1 2","+","."]){
    await rejects(`GPX decimal rejects ${JSON.stringify(value)}`,()=>gpxDecimal(value));
  }
  for(const [text,n]of [["+22.30",22.3],[" -.5 ",-.5],["1.",1],["0",0],["-0",0]] as const)ok(gpxDecimal(text)===n,`GPX decimal accepts full xs:decimal ${text}`);
  const a={lat:22.3,lon:114.16,ele:0},b={lat:22.301,lon:114.161,ele:0};
  const flat=buildGpxTrack([a,b],"Zero");
  ok(flat.stats.hasElevation&&flat.missingElevationCount===0,"valid zero/constant elevations are present, not missing by elevation range");
  const constant=buildGpxTrack([{...a,ele:-20},{...b,ele:-20}],"Below sea");
  ok(constant.stats.hasElevation&&constant.stats.minEle===-20&&constant.stats.elevationGain===0,"valid constant negative elevation is retained");
  const partial=buildGpxTrack([{...a,ele:200},{...b,ele:null}],"Partial");
  ok(!partial.stats.hasElevation&&partial.missingElevationCount===1&&partial.points.every(p=>p.ele===0),"partial elevation flattens whole model with explicit missing count, no zero spike");
  const missing=buildGpxTrack([{...a,ele:null},{...b,ele:null}],"Missing");
  ok(!missing.stats.hasElevation&&missing.missingElevationCount===2,"wholly missing elevations are distinct from valid all-zero data");
  for(const patch of [{lat:NaN},{lat:Infinity},{lat:91},{lat:-91},{lon:Infinity},{lon:180},{lon:-181},{ele:Infinity},{ele:NaN},{ele:10_001},{ele:-12_001},{ele:undefined}]){
    await rejects(`invalid GPX point rejected atomically: ${JSON.stringify(patch)}`,()=>buildGpxTrack([a,{...b,...patch}],"Bad"));
  }
  await rejects("duplicate-only track cannot pretend to be a printable path",()=>buildGpxTrack([a,a],"Stationary"));
  await rejects("antimeridian track refuses false world-spanning local plate",()=>buildGpxTrack([{...a,lon:179},{...b,lon:-179}],"Wrap"));
  await rejects("fewer than two points rejected",()=>buildGpxTrack([a],"One"));
  await rejects("overlong name rejected, not silently truncated",()=>buildGpxTrack([a,b],"x".repeat(GPX_LIMITS.maxNameChars+1)));
  ok(buildGpxTrack([a,b],"x".repeat(GPX_LIMITS.maxNameChars)).stats.name.length===4000,"name boundary preserved");
  const dense=Array.from({length:GPX_LIMITS.maxSourcePoints},(_,i)=>({...a,lat:a.lat+i*.000001,ele:i%100}));
  const sampled=buildGpxTrack(dense,"Dense");
  ok(sampled.points.length===3000&&sampled.sourcePointCount===50_000,"source and exact model-point budgets are separate");
  ok(sampled.points[0].lat===dense[0].lat&&sampled.points.at(-1)!.lat===dense.at(-1)!.lat,"decimation retains both source endpoints");
  ok(sampled.points.every((p,i)=>!i||p.lat>sampled.points[i-1].lat),"sample indices remain unique and ordered");
  await rejects("source over budget rejected before sampling",()=>buildGpxTrack([...dense,b],"Over"));
  dense[1]={...dense[1],ele:Infinity};
  await rejects("invalid unsampled source point is never hidden by decimation",()=>buildGpxTrack(dense,"Bad dense"));
  const stats=computeGpxStats([{lat:0,lon:0,ele:0},{lat:0,lon:1,ele:10}],"Equator");
  ok(Math.abs(stats.distanceKm-111.19492664455873)<1e-8&&stats.elevationGain===10,"independent equatorial distance and gain");
  ok(Number.isFinite(haversine({lat:0,lon:0},{lat:0,lon:180})),"antipodal haversine clamps floating-point h before asin");
  ok(computeGpxStats([],"Empty").hasElevation===false,"empty statistics do not claim elevation");
  for(const text of ["<!DOCTYPE gpx><gpx/>","<!ENTITY boom 'x'><gpx/>"," ".repeat(GPX_LIMITS.maxBytes+1),"中".repeat(Math.ceil(GPX_LIMITS.maxBytes/3))])await rejects("text guard rejects DTD/entity or actual UTF-8 overflow",()=>checkGpxText(text));
  checkGpxText(" ".repeat(GPX_LIMITS.maxBytes));ok(true,"exact byte boundary allowed by pre-XML text guard (not a claim that whitespace is valid GPX)");
  const signal=new AbortController().signal;
  let read=false;
  await rejects("oversized advertised file rejected before stream access",()=>readGpxFile({size:GPX_LIMITS.maxBytes+1,stream:()=>{read=true;return new Blob().stream();}},signal));
  ok(!read,"oversized source never read");
  await rejects("false small size cannot bypass streamed bytes",()=>readGpxFile({size:1,stream:()=>new Blob([new Uint8Array(GPX_LIMITS.maxBytes+1)]).stream()},signal));
  await rejects("malformed UTF-8 rejected rather than replacing bytes",()=>readGpxFile(new Blob([new Uint8Array([255])]),signal));
  const cancelled=new AbortController();cancelled.abort();
  await rejects("pre-aborted GPX read rejected",()=>readGpxFile(new Blob(["<gpx/>"]),cancelled.signal));
  const pending=new AbortController();let didCancel=false;
  const reading=readGpxFile({size:1,stream:()=>new ReadableStream<Uint8Array>({cancel(){didCancel=true;}})},pending.signal);pending.abort();
  await rejects("actively pending stream is cancelled without publishing",()=>reading);
  ok(didCancel,"aborting import releases pending source reader");
  const bytes=new TextEncoder().encode("<gpx><!--中--></gpx>");
  const utf=await readGpxFile({size:bytes.length,stream:()=>new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}})},signal);
  ok(utf.includes("中"),"UTF-8 decoder handles multi-byte characters split across stream chunks");

  const originalFetch=globalThis.fetch;
  try{
    let fallback=0;
    globalThis.fetch=async input=>{
      const primary=String(input).includes('open-meteo');if(!primary)fallback++;
      return new Response(JSON.stringify(primary?{elevation:[null,0]}:{status:"OK",results:[{elevation:0},{elevation:0}]}),{headers:{"content-type":"application/json"}});
    };
    const filled=await fillTrackElevation(missing);
    ok(fallback===1&&filled.source.startsWith("OpenTopoData")&&filled.track.stats.hasElevation,"missing primary elevation falls back; valid all-zero fallback remains complete");
    ok(filled.track.missingElevationCount===0&&filled.track.sourcePointCount===missing.sourcePointCount,"successful fill clears missing state, retains original source count");
    globalThis.fetch=async()=>new Response(JSON.stringify({elevation:[null,0],status:"OK",results:[{elevation:null},{elevation:0}]}));
    await rejects("both providers with null data fail instead of inventing sea-level success",()=>fillTrackElevation(missing));
    globalThis.fetch=async()=>new Response(JSON.stringify({elevation:[Infinity,0],status:"OK",results:[{elevation:1e20},{elevation:0}]}));
    await rejects("provider non-finite/out-of-model elevations fail instead of zero coercion",()=>fillTrackElevation(missing));
    ok(missing.points.every(p=>p.ele===0)&&!missing.stats.hasElevation,"failed provider fill never mutates the original track");
  }finally{globalThis.fetch=originalFetch;}
}
