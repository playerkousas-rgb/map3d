/** Bounded GPX subset: one continuous track segment OR one route, WGS84.
 * Schema reference and deliberate limits: docs/gpx-import-safety.md.
 */
import { ELEVATION_LIMITS, isElevationM } from "./elevationValue";

export interface GpxPoint { lat: number; lon: number; ele: number }
export interface GpxStats {
  name: string; pointCount: number; distanceKm: number; elevationGain: number;
  minEle: number; maxEle: number; hasElevation: boolean;
}
export interface GpxTrack {
  points: GpxPoint[]; stats: GpxStats;
  sourcePointCount: number; missingElevationCount: number;
}
export const GPX_LIMITS = {
  maxBytes: 10_000_000, maxSourcePoints: 50_000, maxModelPoints: 3_000,
  maxNameChars: 4_000, ...ELEVATION_LIMITS,
} as const;
export type GpxErrorCode = "GPX_INVALID" | "GPX_TOO_LARGE" | "NO_POINTS" | "GPX_POINT_LIMIT" | "GPX_DISCONNECTED" | "GPX_NO_EXTENT";
function fail(code: GpxErrorCode): never { throw new Error(code); }

/** xs:decimal lexical form, not parseFloat's permissive prefix or exponent parse. */
export function gpxDecimal(value: string | null): number {
  const text=value?.trim()??"";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return fail("GPX_INVALID");
  const n=Number(text);
  if (!Number.isFinite(n)) return fail("GPX_INVALID");
  return n;
}
export function isGpxElevation(value: unknown): value is number {
  return isElevationM(value);
}
export function haversine(a: {lat:number;lon:number}, b: {lat:number;lon:number}): number {
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 2*6371000*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}

/** Pure validation precedes decimation; a bad unsampled point never disappears. */
export function buildGpxTrack(source: readonly {lat:number;lon:number;ele:number|null}[], name: string): GpxTrack {
  if(source.length>GPX_LIMITS.maxSourcePoints)fail("GPX_POINT_LIMIT");
  if(source.length<2)fail("NO_POINTS");
  if(typeof name!=="string"||name.length>GPX_LIMITS.maxNameChars)fail("GPX_INVALID");
  let missing=0,minLon=Infinity,maxLon=-Infinity,extent=false;
  for(const p of source){
    if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat< -90||p.lat>90||p.lon< -180||p.lon>=180)fail("GPX_INVALID");
    if(p.ele===null)missing++;else if(!isGpxElevation(p.ele))fail("GPX_INVALID");
    minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon);
    if(haversine(source[0],p)>0.01)extent=true;
  }
  if(!extent||maxLon-minLon>180)fail("GPX_NO_EXTENT");
  const count=Math.min(source.length,GPX_LIMITS.maxModelPoints);
  const points=Array.from({length:count},(_,i)=>{
    const p=source[Math.round(i*(source.length-1)/(count-1))];
    // Never turn a missing middle elevation into an invented plunge to sea level.
    return {lat:p.lat,lon:p.lon,ele:missing?0:p.ele!};
  });
  return {points,stats:computeGpxStats(points,name.trim()||"GPX Track",missing===0),sourcePointCount:source.length,missingElevationCount:missing};
}
export function checkGpxText(text: string): void {
  if(!text.length||text.length>GPX_LIMITS.maxBytes||new TextEncoder().encode(text).length>GPX_LIMITS.maxBytes)fail("GPX_TOO_LARGE");
  // No DTD/entity expansion or external resource declarations. Native XML
  // well-formedness is still checked below; this is not an XSD validator.
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))fail("GPX_INVALID");
}
export function parseGpx(xmlText: string): GpxTrack {
  checkGpxText(xmlText);
  const doc=new DOMParser().parseFromString(xmlText,"application/xml"),root=doc.documentElement;
  const ns=root.namespaceURI??"";
  if(doc.getElementsByTagNameNS("*","parsererror").length||root.localName!=="gpx"||
    !["","http://www.topografix.com/GPX/1/0","http://www.topografix.com/GPX/1/1"].includes(ns))fail("GPX_INVALID");
  const version=root.getAttribute("version");
  if(version!==null&&!["1.0","1.1"].includes(version))fail("GPX_INVALID");
  const children=(el:Element,name:string)=>Array.from(el.children).filter(c=>c.localName===name&&(c.namespaceURI??"")===ns);
  const tracks=children(root,"trk"),routes=children(root,"rte");
  if(tracks.length+routes.length>1)fail("GPX_DISCONNECTED");
  const container=tracks[0]??routes[0];
  if(!container)fail("NO_POINTS");
  const segments=tracks.length?children(container,"trkseg"):[];
  if(tracks.length&&segments.length>1)fail("GPX_DISCONNECTED");
  const nodes=tracks.length?(segments[0]?children(segments[0],"trkpt"):[]):children(container,"rtept");
  if(nodes.length>GPX_LIMITS.maxSourcePoints)fail("GPX_POINT_LIMIT");
  const source=nodes.map(el=>{
    const elevation=children(el,"ele");
    if(elevation.length>1||elevation[0]?.children.length)fail("GPX_INVALID");
    return {lat:gpxDecimal(el.getAttribute("lat")),lon:gpxDecimal(el.getAttribute("lon")),ele:elevation.length?gpxDecimal(elevation[0].textContent):null};
  });
  const metadata=children(root,"metadata")[0];
  const name=children(container,"name")[0]??(metadata?children(metadata,"name")[0]:undefined);
  return buildGpxTrack(source,name?.textContent??"GPX Track");
}

/** Model statistics, after endpoint-preserving decimation; not original survey totals. */
export function computeGpxStats(points: GpxPoint[], name: string, hasElevation=true): GpxStats {
  let distance=0,gain=0,minEle=Infinity,maxEle=-Infinity;
  for(let i=0;i<points.length;i++){
    const p=points[i];minEle=Math.min(minEle,p.ele);maxEle=Math.max(maxEle,p.ele);
    if(i){distance+=haversine(points[i-1],p);gain+=Math.max(0,p.ele-points[i-1].ele);}
  }
  return {name,pointCount:points.length,distanceKm:distance/1000,elevationGain:Math.round(gain),minEle:points.length?Math.round(minEle):0,maxEle:points.length?Math.round(maxEle):0,hasElevation:points.length>0&&hasElevation};
}

/** Read bounded UTF-8 bytes; advertised size is not the only guard. */
export async function readGpxFile(file: Pick<File,"size"|"stream">,signal:AbortSignal):Promise<string>{
  if(!Number.isFinite(file.size)||file.size<=0||file.size>GPX_LIMITS.maxBytes)fail("GPX_TOO_LARGE");
  signal.throwIfAborted();
  const reader=file.stream().getReader(),decoder=new TextDecoder("utf-8",{fatal:true});
  let bytes=0,text="";
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",cancel,{once:true});
  try{
    while(true){
      signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();
      if(done)break;bytes+=value.byteLength;if(bytes>GPX_LIMITS.maxBytes)fail("GPX_TOO_LARGE");
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();checkGpxText(text);return text;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}
}
