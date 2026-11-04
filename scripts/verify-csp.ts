import { uiStagePlan } from './ui-stage-plan.mjs';
import { readFileSync } from "node:fs";
import { DATA_SOURCES } from "../src/config/dataSources";
import { OVERPASS_ENDPOINTS } from "../src/utils/overpass";

export function verifyCsp(ok: (condition: boolean, label: string) => void) {
  ok(JSON.stringify(uiStagePlan())===JSON.stringify({dev:true,production:true}),"UI runner default retains both complete stages");
  ok(JSON.stringify(uiStagePlan('all'))===JSON.stringify(uiStagePlan()),"explicit all stage equals default");
  ok(JSON.stringify(uiStagePlan('dev'))===JSON.stringify({dev:true,production:false}),"CI dev stage selects entire dev suite");
  ok(JSON.stringify(uiStagePlan('production'))===JSON.stringify({dev:false,production:true}),"CI production stage selects entire built CSP suite");
  for(const bad of ['', 'unknown']){let failed=false;try{uiStagePlan(bad);}catch{failed=true;}ok(failed,`invalid UI stage ${JSON.stringify(bad)} cannot silently skip gates`);}
  const ci=readFileSync('.github/workflows/ci.yml','utf8');
  ok(ci.includes('npm run verify:ui:isolated -- dev')&&ci.includes('npm run verify:ui:isolated -- production'),"CI explicitly retains both complete browser stages across dependent jobs");
  ok((ci.match(/name: verified-dist/g)??[]).length===2&&ci.includes('needs: check'),"CI production consumes the same run's checked dist before independent CAD");
  ok(/timeout-minutes: 20/.test(ci)&&/timeout-minutes: 10/.test(ci),"CI check/CAD time budgets remain20/10 minutes, not increased to hide combined runtime");
  console.log("\n[CSP] production header contract and provider compatibility");
  const hosting = JSON.parse(readFileSync("vercel.json", "utf8"));
  const headers = hosting.headers.filter((r: {source:string})=>r.source==="/(.*)").flatMap((r: {headers:{key:string;value:string}[]})=>r.headers);
  const policies = headers.filter((h: {key:string})=>h.key.toLowerCase()==="content-security-policy");
  ok(policies.length===1,"one enforced production CSP, not report-only or conflicting duplicate policies");
  const entries = policies[0].value.split(';').map((s:string)=>s.trim().split(/\s+/));
  const policy = new Map<string,string[]>(entries.map(([key,...values]:string[])=>[key,values]));
  ok(policy.size===entries.length,"CSP directives are unique, without shadowed duplicate directives");
  const exact: Record<string,string[]> = {
    "default-src":["'self'"], "script-src":["'self'"], "script-src-attr":["'none'"],
    "base-uri":["'none'"], "object-src":["'none'"], "form-action":["'none'"],
    "frame-src":["'none'"], "worker-src":["'none'"], "font-src":["'self'"],
    "manifest-src":["'self'"], "media-src":["'none'"],
  };
  for(const [key,values] of Object.entries(exact))ok(JSON.stringify(policy.get(key))===JSON.stringify(values),`${key}: exact least-capability baseline`);
  ok(!policy.get('script-src')!.some(s=>s.includes('unsafe-')||s==='*'||s==='https:'||s==='blob:'||s==='data:'),"scripts cannot use inline/eval/data/blob/blanket-HTTPS escape hatches");
  ok(JSON.stringify(policy.get('style-src'))===JSON.stringify(["'self'","'unsafe-inline'"]),"Emotion/Leaflet inline styles remain an explicit style-only exception, not a script exception");
  const allowsOrigin=(directive:string,url:string)=>policy.get(directive)!.includes(new URL(url).origin);
  for(const source of DATA_SOURCES){
    if(source.kind==='download'){
      ok(!allowsOrigin('connect-src',source.url)&&!allowsOrigin('img-src',source.url),`${source.id}: bulk reference not accidentally granted browser data/image privileges`);continue;
    }
    if(source.kind==='geojson')ok(allowsOrigin('connect-src',source.url),`${source.id}: pinned GeoJSON origin explicitly allowed for direct fetch`);
    else for(const sub of source.url.includes('{s}')?['a','b','c']:['']){
      ok(allowsOrigin('img-src',source.url.replace('{s}',sub)),`${source.id}/${sub||'host'}: actual tile/image origin explicitly allowed`);
    }
  }
  for(const url of OVERPASS_ENDPOINTS)ok(allowsOrigin('connect-src',url),`${new URL(url).host}: every actual Overpass fallback remains browser-direct`);
  for(const file of ['src/utils/elevation.ts','src/utils/terrain.ts','src/utils/geocode.ts']){
    const text=readFileSync(file,'utf8');
    const urls=[...text.matchAll(/const \w+_URL = "(https:\/\/[^"]+)"/g)].map(m=>m[1]);
    ok(urls.length>0&&urls.every(url=>allowsOrigin('connect-src',url)),`${file}: actual elevation/geocoder URL constants covered without generic HTTPS permission`);
  }
  const network=[...policy.get('connect-src')!,...policy.get('img-src')!];
  ok(network.every(s=>["'self'",'data:','blob:'].includes(s)||/^https:\/\/[^/*]+$/.test(s)),"network sources are exact HTTPS origins, not wildcard hosts, HTTP or scheme-wide access");
  const ancestors=policy.get('frame-ancestors')!;
  ok(ancestors.includes("'self'")&&ancestors.includes('https://arena.ai')&&ancestors.includes('https://*.arena.ai')&&ancestors.includes('https://*.e2b.app')&&!ancestors.includes('*'),"framing policy retains documented Arena preview origins, not arbitrary embedding");
  ok(headers.some((h:{key:string;value:string})=>h.key==='Permissions-Policy'&&h.value.includes('geolocation=()'))&&headers.some((h:{key:string;value:string})=>h.key==='X-Content-Type-Options'&&h.value==='nosniff'),"CSP does not replace existing permissions/nosniff headers");
  const html=readFileSync('index.html','utf8');
  ok(!/<script\b[^>]*>\s*[^<\s]/i.test(html)&&!/<meta[^>]+http-equiv=["']Content-Security-Policy/i.test(html),"HTML has no inline executable bootstrap or weaker duplicate meta policy");
  const vite=readFileSync('vite.config.ts','utf8');
  ok(vite.includes('headers: productionHeaders')&&vite.includes('"./vercel.json"')&&!vite.includes('unsafe-eval'),"production preview derives real hosting headers; dev refresh is not used to loosen production policy");
}
