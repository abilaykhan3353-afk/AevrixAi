require('dotenv').config();
const{config}=require('../server/config'),{Providers}=require('../server/providers');
(async()=>{const cfg=config(),p=new Providers(cfg),signal=AbortSignal.timeout(20000),result={date:new Date().toISOString(),live:true};
if(cfg.groqKey){const data=await p.json('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+cfg.groqKey}},signal);const ids=new Set(data.data?.map(m=>m.id));result.groq=[cfg.chatModel,cfg.visionModel,cfg.fallbackModel].filter(Boolean).map(model=>({model,available:ids.has(model)}));}else result.groq='not configured';
if(cfg.geminiKey){const data=await p.json('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':cfg.geminiKey}},signal);result.gemini={model:cfg.geminiModel,available:data.models?.some(m=>m.name==='models/'+cfg.geminiModel)};}else result.gemini='not configured';
console.log(JSON.stringify(result,null,2));
})().catch(()=>{console.error('Model check failed. Check keys, network and permissions; no keys were printed.');process.exitCode=1;});
