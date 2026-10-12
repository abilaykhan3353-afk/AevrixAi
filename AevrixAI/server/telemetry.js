const{AsyncLocalStorage}=require('node:async_hooks');
const trace=new AsyncLocalStorage();
function recordUsage(model,value){const store=trace.getStore();if(!store)return;const usage={};for(const key of['prompt_tokens','completion_tokens','total_tokens','promptTokenCount','candidatesTokenCount','totalTokenCount'])if(Number.isFinite(value?.[key])&&value[key]>=0)usage[key]=value[key];store.usage.push({model,usage});}
module.exports={trace,recordUsage};
