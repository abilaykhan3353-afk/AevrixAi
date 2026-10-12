// Reproduce a user opening the app from a different site's link.
const {chromium}=require('playwright'),{setup}=require('../tests/v3/helpers');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 let s,server,browser;const live=process.argv[2]==='--local'?null:process.argv[2],output=path.resolve(process.argv[3]||path.join(__dirname,'../test-results/navigation'));fs.mkdirSync(output,{recursive:true});
 if(!live){s=await setup();s.cfg.preview=true;server=s.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));}
 const base=live||'http://127.0.0.1:'+server.address().port,profile=fs.mkdtempSync(path.join(__dirname,'../.browser-profile-navigation-')),errors=[];
 try{
  browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1280,height:900}});const page=await browser.newPage();page.on('requestfailed',req=>console.error(JSON.stringify({failedUrl:req.url(),error:req.failure()})));page.on('pageerror',error=>errors.push(error.message));
  // Reserved test domain: content is fulfilled locally, no external site is contacted.
  const launcher=live?'https://launch.example.test/':'http://localhost:33333/';
  await page.route(launcher,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><a href="'+base+'/?from=render-test">Открыть Aevrix</a>'}));
  await page.goto(launcher);const [response]=await Promise.all([page.waitForResponse(response=>response.url().startsWith(base)&&response.request().isNavigationRequest()),page.getByRole('link',{name:'Открыть Aevrix'}).click()]);
  assert.equal(response.status(),200);await page.waitForFunction(()=>!document.querySelector('#mode-trigger')?.disabled);const config=await page.evaluate(()=>fetch('/api/config').then(r=>r.json()));assert.equal(config.version,'3.1.1');
  await page.locator('#mode-trigger').click();await page.getByRole('option',{name:'Объясни тему',exact:false}).click();await page.waitForFunction(()=>document.querySelector('#mode').value==='explain'&&!document.querySelector('#mode-trigger').disabled);await page.screenshot({path:path.join(output,'opened-from-external-link.png'),fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);const requestHeaders=await response.request().allHeaders();const result={version:config.version,navigationStatus:response.status(),secFetchSite:requestHeaders['sec-fetch-site'],ready:true,dropdown:true,errors};if(live)assert.equal(result.secFetchSite,'cross-site');fs.writeFileSync(path.join(output,'navigation-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();if(server){server.closeAllConnections();server.close();await s.db.close();}if(path.resolve(profile).startsWith(path.resolve(__dirname,'..')+path.sep+'.browser-profile-navigation-'))fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
