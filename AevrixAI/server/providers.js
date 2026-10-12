const { AppError, assert, fail } = require('./errors');
const{trace,recordUsage}=require('./telemetry');
function sources(values) {
  const seen = new Set();
  return (Array.isArray(values)?values:[]).flatMap(item=>{
    try { const url=new URL(item.url); if(!['http:','https:'].includes(url.protocol)||url.username||url.password||seen.has(url.href))return []; seen.add(url.href); return [{url:url.href,title:String(item.title||url.hostname).slice(0,200),date:item.date||null}]; } catch{return [];}
  }).slice(0,8);
}
async function* sseEvents(body) {
  const reader=body.getReader(),decoder=new TextDecoder(); let buffer='';
  try {
    while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      if(buffer.length>2*1024*1024)fail(502,'bad_stream','Слишком большой ответ сервиса.');
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))){const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n'); if(data)yield data;
      }
      if(done)break;
    }
    if(buffer.trim())fail(502,'incomplete_stream','Поток сервиса оборвался до завершения.');
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
class Providers {
  constructor(cfg,fetchImpl=fetch){this.cfg=cfg;this.fetch=fetchImpl;}
  async request(url,options,signal,timeout=20000){
    const telemetry=trace.getStore();if(telemetry)telemetry.externalCalls++;
    const combined=AbortSignal.any([signal,AbortSignal.timeout(timeout)]);
    let res;
    try{res=await this.fetch(url,{...options,signal:combined,redirect:'error'});}catch(error){if(combined.aborted||error.name==='TimeoutError')throw error;fail(503,'provider_unavailable','Внешний сервис сейчас недоступен.');}
    if(!res.ok){await res.body?.cancel().catch(()=>{});const error=new AppError(res.status===429?429:503,'provider_error',res.status===429?'Лимит внешнего сервиса исчерпан. Попробуй позже.':res.status===401||res.status===403?'Сервис отклонил доступ. Владелец бота может проверить подключение.':res.status===402?'Бесплатный лимит сервиса исчерпан или для этой функции требуется доступ.':'Внешний сервис временно недоступен. Попробуй позже.');error.providerStatus=res.status;throw error;}
    return res;
  }
  async json(url,options,signal,timeout=15000,maxBytes=2*1024*1024){
    const res=await this.request(url,options,signal,timeout);const reader=res.body.getReader();let size=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)fail(502,'large_response','Слишком большой ответ сервиса.');chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString());}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async groq(messages,signal,{model=this.cfg.chatModel,stream=false,onDelta=()=>{},maxTokens=this.cfg.outputTokens}={}){
    if(!this.cfg.groqKey)fail(503,'chat_disabled','ИИ пока не настроен. Добавь GROQ_API_KEY на сервере.');
    const options={method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.cfg.groqKey},body:JSON.stringify({model,messages,temperature:0.4,max_completion_tokens:maxTokens,stream,...(stream?{stream_options:{include_usage:true}}:{})})};
    if(!stream){const data=await this.json('https://api.groq.com/openai/v1/chat/completions',options,signal,25000);recordUsage(model,data.usage);const choice=data.choices?.[0];if(!choice?.message?.content)fail(502,'empty_reply','Сервис вернул пустой ответ.');if(choice.finish_reason==='length')fail(502,'summary_truncated','Ответ сервиса не поместился в лимит.');return {text:choice.message.content,usage:data.usage||{},model,finishReason:choice.finish_reason};}
    const res=await this.request('https://api.groq.com/openai/v1/chat/completions',options,signal,45000);
    let text='',terminal=false,finishReason=null,usage={};
    for await(const event of sseEvents(res.body)){
      if(event==='[DONE]'){terminal=true;break;}
      let data;try{data=JSON.parse(event);}catch{fail(502,'bad_stream','Сервис вернул повреждённый поток.');}
      if(data.error)fail(503,'provider_error','Сервис прервал генерацию.');
      if(data.usage)usage=data.usage;
      const choice=data.choices?.[0];if(choice?.finish_reason)finishReason=choice.finish_reason;
      const delta=choice?.delta?.content;if(typeof delta==='string'&&delta){text+=delta;if(text.length>100000)fail(502,'large_reply','Ответ превысил допустимый размер.');await onDelta(delta);}
    }
    if(!terminal||!finishReason)fail(502,'incomplete_stream','Ответ сервиса не завершён. Можно повторить запрос.');
    if(!text)fail(502,'empty_reply','Сервис вернул пустой ответ.');
    recordUsage(model,usage);return {text,usage,model,finishReason,status:finishReason==='length'?'partial':'completed'};
  }
  async vision(messages,image,signal){
    const multimodal=messages.map((m,i)=>i===messages.length-1?{...m,content:[{type:'text',text:m.content},{type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data.toString('base64')}`}}]}:m);
    const groq=async()=>({...await this.groq(multimodal,signal,{model:this.cfg.visionModel}),status:'completed'});
    const gemini=async()=>{
      const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));contents.at(-1).parts.push({inlineData:{mimeType:image.mimeType,data:image.data.toString('base64')}});
      const data=await this.json('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(this.cfg.geminiModel)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.cfg.geminiKey},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:this.cfg.outputTokens}})},signal,30000);
      const candidate=data.candidates?.[0],text=candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');if(!text)fail(502,'empty_vision_reply','Анализ изображения не дал ответа. Попробуй другое фото.');recordUsage(this.cfg.geminiModel,data.usageMetadata);return{text,model:this.cfg.geminiModel,usage:data.usageMetadata||{},finishReason:candidate.finishReason,status:candidate.finishReason==='MAX_TOKENS'?'partial':'completed'};
    };
    const order=this.cfg.visionProvider==='gemini'?['gemini','groq']:['groq','gemini'];let last;
    for(const name of order){if(name==='groq'?!this.cfg.groqKey:!this.cfg.geminiKey)continue;try{return await(name==='groq'?groq():gemini());}catch(error){if(signal.aborted)throw error;last=error;}}
    if(last)throw last;fail(503,'vision_disabled','Анализ изображений ещё не подключён.');
  }
  async search(query,signal){
    if(this.cfg.tavilyKey){try{const data=await this.json('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.cfg.tavilyKey},body:JSON.stringify({query:query.slice(0,2000),max_results:5,include_answer:false,search_depth:'basic'})},signal);
      const found=sources(data.results);return {sources:found,facts:(data.results||[]).slice(0,5).map(r=>({title:r.title,url:r.url,text:String(r.content||'').slice(0,2200)})),fetchedAt:new Date().toISOString()};
    }catch(error){if(signal.aborted||!this.cfg.braveKey)throw error;}}
    if(this.cfg.braveKey){const data=await this.json('https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:query.slice(0,2000),count:'5'}),{headers:{Accept:'application/json','X-Subscription-Token':this.cfg.braveKey}},signal);
      const rows=data.web?.results||[];return {sources:sources(rows),facts:rows.slice(0,5).map(r=>({title:r.title,url:r.url,text:r.description})),fetchedAt:new Date().toISOString()};}
    fail(503,'search_disabled','Веб-поиск не настроен. Добавь TAVILY_API_KEY или BRAVE_API_KEY; актуальные сведения сейчас подтвердить не могу.');
  }
  async classify(text,history,signal){
    const latest=history.filter(m=>m.role==='user').slice(-1).map(m=>m.content).join('\n');
    const follow=/^(а\s|а\?|там|завтра|послезавтра|сегодня|а что|а сколько|подробнее|что насч[её]т|what about)/i.test(text.trim());
    const prior=history.slice(-6).map(m=>m.role+': '+String(m.content).slice(0,1200)).join('\n');
    const combined=follow?prior+'\nТекущий вопрос: '+text:text;
    let module=/погод|weather|температур|прогноз/i.test(combined)?'weather':/курс.*(?:валют|доллар|евро|рубл|тенге)|конверт|\b(?:USD|EUR|KZT|RUB)\b/i.test(combined)?'currency':/новост|news|что нового/i.test(combined)?'news':/сегодня|сейчас|найди|поищи|проверь|источник|актуальн|последн.*верси|сколько стоит|цена|биткоин|bitcoin|криптовалют|котиров|акции|\bBTC\b|\bETH\b|выборы|результат матча|сч[её]т матча|кто выиграл|вышел ли|вышла ли|today|latest|search/i.test(text)?'search':'none';
    const educational=/^(?:найди|проверь|реши|вычисли)\s+(?:x\b|х\b|корн|сумм|значени|ошибк|решени|производн|интеграл|предел)/i.test(text.trim());
    if(educational&&!/интернет|источник|актуальн|веб/i.test(text))module='none';
    if(['none','search','news'].includes(module))return {module,query:(follow?prior.slice(-2200)+'\n':'')+text};
    const result=await this.groq([{role:'system',content:'Extract parameters only. Return JSON: {"module":"weather|currency","city":null,"country":null,"from":null,"to":null,"amount":1,"daysAhead":0}. Use conversation to understand follow-ups. daysAhead is 0 today,1 tomorrow,2 day after tomorrow,max 7. Currency ISO codes, ask for missing target instead of guessing. No explanations.'},{role:'user',content:combined}],signal,{maxTokens:400});
    let parsed;try{parsed=JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{fail(502,'intent_failed','Не удалось определить параметры. Укажи город или валютную пару.');}
    assert(parsed.module===module);
    if(module==='weather'){assert(typeof parsed.city==='string'&&parsed.city.length<=100,'Укажи город, для которого нужна погода.');assert(Number.isInteger(parsed.daysAhead)&&parsed.daysAhead>=0&&parsed.daysAhead<=7,'Прогноз доступен на ближайшие 7 дней.');}
    else{assert(/^[A-Z]{3}$/.test(parsed.from)&&/^[A-Z]{3}$/.test(parsed.to),'Укажи обе валюты, например USD и KZT.');assert(Number.isFinite(parsed.amount)&&parsed.amount>0&&parsed.amount<=1e12);}
    return parsed;
  }
  async tool(intent,signal){
    if(intent.module==='weather'){
      const geo=await this.json('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:intent.city,count:'5',language:'ru'}),{},signal);
      const places=geo.results||[],filtered=intent.country?places.filter(p=>p.country_code?.toLowerCase()===String(intent.country).toLowerCase()||p.country?.toLowerCase()===String(intent.country).toLowerCase()):places;
      if(!filtered.length)fail(404,'city_not_found','Город не найден. Укажи страну и название.');
      if(filtered.length>1&&!intent.country)fail(400,'ambiguous_city','Найдено несколько городов с таким названием. Укажи страну.');
      const p=filtered[0],url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:p.latitude,longitude:p.longitude,timezone:'auto',current:'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',forecast_days:'8'});
      const data=await this.json(url,{},signal),i=intent.daysAhead;
      return {sources:[{title:'Open-Meteo · '+p.name,url:'https://open-meteo.com/en/docs',date:new Date().toISOString()}],facts:{city:p.name,country:p.country,timezone:data.timezone,current:i===0?data.current:undefined,currentUnits:data.current_units,forecastUnits:data.daily_units,forecast:{date:data.daily?.time?.[i],min:data.daily?.temperature_2m_min?.[i],max:data.daily?.temperature_2m_max?.[i],rainProbability:data.daily?.precipitation_probability_max?.[i],weatherCode:data.daily?.weather_code?.[i]}},fetchedAt:new Date().toISOString()};
    }
    if(intent.module==='currency'){
      const data=await this.json('https://open.er-api.com/v6/latest/'+intent.from,{},signal);
      const rate=data.rates?.[intent.to];if(data.result!=='success'||!Number.isFinite(rate))fail(404,'currency_not_found','Эта валютная пара недоступна.');
      return {facts:{from:intent.from,to:intent.to,rate,amount:intent.amount,result:Number((rate*intent.amount).toFixed(6)),updatedAt:data.time_last_update_utc},sources:[{title:'ExchangeRate-API',url:'https://www.exchangerate-api.com/',date:data.time_last_update_utc}],fetchedAt:new Date().toISOString()};
    }
    if(intent.module==='news'&&this.cfg.newsdataKey){try{const data=await this.json('https://newsdata.io/api/1/latest?'+new URLSearchParams({q:intent.query.slice(0,300),language:'ru,en',apikey:this.cfg.newsdataKey}),{},signal);const rows=data.results||[];return {facts:rows.slice(0,5).map(r=>({title:r.title,text:r.description,date:r.pubDate,url:r.link})),sources:sources(rows.slice(0,5).map(r=>({title:r.title,url:r.link,date:r.pubDate}))),fetchedAt:new Date().toISOString()};}catch(error){if(signal.aborted||(!this.cfg.gnewsKey&&!this.cfg.tavilyKey&&!this.cfg.braveKey))throw error;}}
    if(intent.module==='news'&&this.cfg.gnewsKey){try{const data=await this.json('https://gnews.io/api/v4/search?'+new URLSearchParams({q:intent.query.slice(0,300),lang:'ru',max:'5',apikey:this.cfg.gnewsKey}),{},signal);const rows=data.articles||[];return {facts:rows.map(r=>({title:r.title,text:r.description,date:r.publishedAt,url:r.url})),sources:sources(rows.map(r=>({...r,date:r.publishedAt}))),fetchedAt:new Date().toISOString()};}catch(error){if(signal.aborted||(!this.cfg.tavilyKey&&!this.cfg.braveKey))throw error;}}
    return this.search(intent.query||intent.city,signal);
  }
  async image(prompt,signal){
    const cf=this.cfg.cloudflareKey&&/^[a-f0-9]{32}$/i.test(this.cfg.cloudflareAccount||'');
    if((this.cfg.imageProvider==='auto'||!this.cfg.imageProvider||this.cfg.imageProvider==='cloudflare')&&cf){
      const data=await this.json('https://api.cloudflare.com/client/v4/accounts/'+this.cfg.cloudflareAccount+'/ai/run/@cf/black-forest-labs/flux-1-schnell',{
        method:'POST',headers:{Authorization:'Bearer '+this.cfg.cloudflareKey,'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.slice(0,2048),steps:4})
      },signal,45000,9*1024*1024);
      if(data.success===false||typeof data.result?.image!=='string')fail(503,'image_provider_error','Генератор не вернул изображение. Попробуй позже.');
      const raw=data.result.image;if(raw.length>8*1024*1024)fail(502,'image_too_large','Изображение превысило лимит.');
      const bytes=Buffer.from(raw,'base64'),mimeType=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'?'image/webp':'image/png';
      return {...require('./security').imageBytes({data:raw,mimeType}),model:'@cf/black-forest-labs/flux-1-schnell'};
    }
    if(this.cfg.imageProvider==='cloudflare'||!this.cfg.pollinationsKey)fail(503,'image_disabled','Генератор изображений ещё не подключён. Анализ прикреплённых фотографий доступен отдельно.');
    const url='https://gen.pollinations.ai/image/'+encodeURIComponent(prompt.slice(0,1500))+'?'+new URLSearchParams({model:this.cfg.imageModel,width:'1024',height:'1024',seed:String(Math.floor(Math.random()*1000000))});
    const res=await this.request(url,{headers:{Authorization:'Bearer '+this.cfg.pollinationsKey,'Pollinations-Safe':'privacy'}},signal,45000);
    const reader=res.body.getReader();let length=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>6*1024*1024)fail(502,'image_too_large','Изображение превысило лимит.');chunks.push(Buffer.from(value));}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    return {...require('./security').imageBytes({data:Buffer.concat(chunks).toString('base64'),mimeType:res.headers.get('content-type')?.split(';')[0]}),model:this.cfg.imageModel};
  }
}
module.exports={Providers,sseEvents,sources};
