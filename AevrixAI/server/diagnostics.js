// Owner-requested checks. Results contain statuses only, never credentials or provider errors.
const {Providers}=require('./providers');
async function checkProviders(cfg,db,fetchImpl=fetch){
 const p=new Providers(cfg,fetchImpl),signal=AbortSignal.timeout(45000);
 const check=async(name,configured,run)=>{if(!configured)return{name,status:'not_configured'};try{return{name,status:'ok',...await run()};}catch(error){return{name,status:error.providerStatus===401||error.providerStatus===403?'access_denied':error.providerStatus===429?'rate_limited':error.providerStatus===402?'quota_or_payment_required':error.providerStatus===404?'model_or_endpoint_unavailable':'failed',httpStatus:error.providerStatus||null,code:error.code||'request_failed'};}};
 const rows=await Promise.all([
  check('database',!!db,async()=>{await db.query('SELECT 1');return{connected:true};}),
  check('groq',!!cfg.groqKey,async()=>{const data=await p.json('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+cfg.groqKey}},signal);const available=new Set(data.data?.map(m=>m.id));return{models:[cfg.chatModel,cfg.visionModel,cfg.fallbackModel,'openai/gpt-oss-120b'].filter(Boolean).filter((m,i,a)=>a.indexOf(m)===i).map(model=>({model,available:available.has(model)}))};}),
  check('groq_120b',!!cfg.groqKey,async()=>{const reply=await p.groq([{role:'user',content:'Answer only: OK'}],signal,{model:'openai/gpt-oss-120b',maxTokens:500});return{model:reply.model,replyReceived:!!reply.text};}),
  check('gemini',!!cfg.geminiKey,async()=>{const data=await p.json('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(cfg.geminiModel)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':cfg.geminiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Answer only: OK'}]}],generationConfig:{maxOutputTokens:100}})},signal,25000);return{model:cfg.geminiModel,replyReceived:!!data.candidates?.[0]?.content};}),
  check('tavily',!!cfg.tavilyKey,async()=>{const data=await p.json('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.tavilyKey},body:JSON.stringify({query:'official PostgreSQL documentation',max_results:1,search_depth:'basic',include_answer:false})},signal);return{results:Array.isArray(data.results)?data.results.length:0};}),
  check('brave',!!cfg.braveKey,async()=>{const data=await p.json('https://api.search.brave.com/res/v1/web/search?q=PostgreSQL&count=1',{headers:{Accept:'application/json','X-Subscription-Token':cfg.braveKey}},signal);return{results:data.web?.results?.length||0};}),
  check('pollinations',!!cfg.pollinationsKey,async()=>{const img=await new Providers({...cfg,imageProvider:'pollinations'},fetchImpl).image('A small green tree',signal);return{imageValidated:!!img.data};}),
  check('cloudflare',!!(cfg.cloudflareKey&&cfg.cloudflareAccount),async()=>{const data=await p.json('https://api.cloudflare.com/client/v4/user/tokens/verify',{headers:{Authorization:'Bearer '+cfg.cloudflareKey}},signal);if(!data.success||data.result?.status!=='active')throw Error('token_not_active');return{tokenActive:true};}),
  check('newsdata',!!cfg.newsdataKey,async()=>{const data=await p.json('https://newsdata.io/api/1/latest?'+new URLSearchParams({q:'technology',apikey:cfg.newsdataKey}),{},signal);if(data.status!=='success')throw Error('invalid_response');return{results:data.results?.length||0};}),
  check('gnews',!!cfg.gnewsKey,async()=>{const data=await p.json('https://gnews.io/api/v4/search?'+new URLSearchParams({q:'technology',max:'1',apikey:cfg.gnewsKey}),{},signal);return{results:data.articles?.length||0};}),
  check('telegram',!!cfg.telegramToken,async()=>{const data=await p.json('https://api.telegram.org/bot'+cfg.telegramToken+'/getMe',{},signal);if(!data.ok)throw Error('invalid_response');return{botVerified:true};}),
  check('weather',true,async()=>{const data=await p.json('https://geocoding-api.open-meteo.com/v1/search?name=Almaty&count=1',{},signal);return{results:data.results?.length||0};}),
  check('currency',true,async()=>{const data=await p.json('https://open.er-api.com/v6/latest/USD',{},signal);if(!data.rates?.KZT)throw Error('invalid_response');return{ratesAvailable:true};})
 ]);
 return{event:'provider_checks',date:new Date().toISOString(),results:rows,credentialsPrinted:false};
}
module.exports={checkProviders};
