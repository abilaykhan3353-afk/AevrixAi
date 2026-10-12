const {PGlite}=require('@electric-sql/pglite');
const {config}=require('../../server/config');
const {migrate}=require('../../server/database');
const {createApp}=require('../../server/app');
const {AppError}=require('../../server/errors');
async function database(){const engine=new PGlite();await engine.waitReady;return{engine,query:(sql,args)=>engine.query(sql,args),exec:sql=>engine.exec(sql),transaction:fn=>engine.transaction(tx=>fn({query:(sql,args)=>tx.query(sql,args),exec:sql=>tx.exec(sql)})),close:()=>engine.close()};}
class FixtureProviders{
  constructor(){this.messages=[];this.behaviour='normal';this.aborted=false;this.calls=0;}
  async groq(messages,signal,options={}){
    this.calls++;this.messages.push(messages);
    if(!options.stream)return{text:'Сводка: пользователь решает задачу, важные ограничения сохранены.',model:'fixture',usage:{total_tokens:20}};
    if(this.behaviour==='fail-before')throw new AppError(503,'provider_error','Fixture failure');
    const text=this.behaviour==='slow'?'Длинный ответ для проверки остановки.':'Проверенный тестовый ответ.';
    for(const part of[text.slice(0,10),text.slice(10)]){
      if(this.behaviour==='slow')await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,5000);const abort=()=>{clearTimeout(timer);this.aborted=true;reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
      signal.throwIfAborted();await options.onDelta(part);
      if(this.behaviour==='partial')throw new AppError(502,'incomplete_stream','Fixture truncated');
    }
    return{text,model:'fixture',usage:{total_tokens:30},status:'completed',finishReason:'stop'};
  }
  async classify(){return{module:'none'};}
  async tool(){return{sources:[{title:'Fixture',url:'https://example.org'}],facts:{value:1}};}
  async vision(messages,image,signal){return{text:'Fixture image',status:'completed',model:'fixture'};}
}
async function setup(overrides={}){const db=await database();await migrate(db);const cfg=config({DATABASE_URL:'postgresql://fixture',JWT_SECRET:'x'.repeat(48),GROQ_API_KEY:'fixture-only',CHAT_REQUESTS_PER_MINUTE:'100',...overrides});const providers=new FixtureProviders();return{db,cfg,providers,...createApp({cfg,db,providers})};}
function events(text){return text.split(/\r?\n\r?\n/).filter(frame=>frame.startsWith('data:')).map(frame=>JSON.parse(frame.slice(5)));}
module.exports={setup,database,FixtureProviders,events};
