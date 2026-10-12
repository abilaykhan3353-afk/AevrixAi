const {test}=require('node:test'),assert=require('node:assert/strict'),{checkProviders}=require('../../server/diagnostics');
test('provider diagnostics isolate failures and never include keys or raw upstream errors',async()=>{
 const secret='PRIVATE_TEST_CREDENTIAL',cfg={groqKey:secret,chatModel:'openai/gpt-oss-20b',visionModel:'qwen/qwen3.8-27b',geminiKey:secret,geminiModel:'fixture',tavilyKey:secret,braveKey:secret,cloudflareKey:secret,cloudflareAccount:'a'.repeat(32)};
 const result=await checkProviders(cfg,{query:async()=>({rows:[{}]})},async url=>{
  if(url.includes('groq.com')&&url.endsWith('models'))return Response.json({data:[{id:cfg.chatModel},{id:cfg.visionModel},{id:'openai/gpt-oss-120b'}]});
  if(url.includes('groq.com'))return Response.json({choices:[{message:{content:'OK'},finish_reason:'stop'}]});
  if(url.includes('googleapis'))return Response.json({error:{message:secret}},{status:403});
  if(url.includes('brave.com'))return new Response(secret,{status:429});
  if(url.includes('tavily'))return Response.json({results:[{url:'https://example.org'}]});
  if(url.includes('cloudflare'))return Response.json({success:true,result:{status:'active'}});
  if(url.includes('open-meteo'))return Response.json({results:[{}]});
  return Response.json({rates:{KZT:500}});
 });
 assert.equal(result.results.find(r=>r.name==='gemini').status,'access_denied');assert.equal(result.results.find(r=>r.name==='brave').status,'rate_limited');assert.equal(result.results.find(r=>r.name==='tavily').status,'ok');assert.equal(result.results.find(r=>r.name==='pollinations').status,'not_configured');assert.equal(result.results.find(r=>r.name==='cloudflare').status,'ok');assert.equal(JSON.stringify(result).includes(secret),false);
});
test('selected provider checks avoid unrelated API calls and distinguish timeouts',async()=>{
 const calls=[],result=await checkProviders({geminiKey:'private',geminiModel:'fixture',groqKey:'other'},null,async url=>{calls.push(url);if(url.includes('generateContent'))throw new DOMException('Timeout','TimeoutError');return Response.json({models:[{name:'models/fixture'}]});},{only:['gemini']});
 assert.equal(calls.length,2);assert.ok(calls.every(url=>url.includes('googleapis.com')));assert.equal(result.results.find(row=>row.name==='gemini_access').available,true);assert.equal(result.results.find(row=>row.name==='gemini').status,'timeout');assert.equal(JSON.stringify(result).includes('private'),false);
});
