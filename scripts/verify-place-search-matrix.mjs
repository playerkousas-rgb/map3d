import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {verifyPlaceSearchUi} from './verify-place-search-ui.mjs';

/** One isolated search context at a time, BEFORE the legacy suite.
 * Concurrent SwiftShader scenes/screenshots proved unreliable; do not
 * hide that with retries, longer timeouts or filtered errors.
 * Never skip/retry a case, weaken headers or share a planner's state.
 */
export async function verifyPlaceSearchMatrix({base,output,pass,production=false,expectedCsp}){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:JSON.parse(process.env.CHROMIUM_ARGS??'[]'),headless:true});
  const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+uYpAAVwArfgOL+2AAAAAElFTkSuQmCC','base64');
  try{
    let queue=Promise.resolve();
    const results=await Promise.allSettled([390,768,1440].map(width=>{
      const task=queue.then(async()=>{
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',bypassCSP:false});
      try{
        const page=await context.newPage(),errors=[],violations=[],headers=[];
        page.on('pageerror',e=>errors.push(e.message));
        if(production){
          await page.exposeFunction('__captureSearchCsp',event=>{violations.push(event);});
          await context.addInitScript(()=>{
            globalThis.document.addEventListener('securitypolicyviolation',e=>{
              void globalThis.__captureSearchCsp({directive:e.effectiveDirective,blocked:e.blockedURI});
            });
          });
          page.on('response',r=>{if(r.request().resourceType()==='document'&&new URL(r.url()).origin===new URL(base).origin)headers.push(r.headers()['content-security-policy']);});
        }
        await context.route('**/*',route=>{
          const u=new URL(route.request().url());
          if(u.origin===new URL(base).origin){
            if(u.pathname.startsWith('/_vercel/insights/'))return route.fulfill({status:200,contentType:'text/javascript',body:'/* test-only optional analytics stub */'});
            return route.continue();
          }
          if(u.pathname.endsWith('.png'))return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'image/png',body:tile});
          return route.abort();
        });
        await verifyPlaceSearchUi(page,{base,output,width,pass,production});
        assert.deepEqual(errors,[],`${width}: uncaught search browser errors`);
        if(production){
          assert(headers.length>0&&headers.every(value=>value===expectedCsp),`${width}: built search documents must enforce exact hosting CSP`);
          assert.deepEqual(violations,[],`${width}: search CSP violations across all navigations`);
        }
      }finally{await context.close();}
      });
      // Preserve each rejected task for allSettled while allowing the next
      // isolated width to run; no failure is retried, skipped or forgiven.
      queue=task.catch(()=>{});
      return task;
    }));
    const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(failures.length)throw new AggregateError(failures,'Place search matrix failed');
  }finally{await browser.close();}
}
