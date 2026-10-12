const {config}=require('./config'),{createDatabase,migrate}=require('./database'),{createApp}=require('./app');
async function start(){
  const cfg=config(),db=createDatabase(cfg);try{if(db)await migrate(db,{allowLegacy:process.env.LEGACY_BACKUP_CONFIRMED==='true'});}catch(error){await db?.close().catch(()=>{});throw error;}
  const {app,coordinator}=createApp({cfg,db});const server=app.listen(cfg.port,()=>console.log(`Aevrix AI 3.1: http://localhost:${cfg.port}`));let closing=false;
  async function shutdown(code=0){if(closing)return;closing=true;for(const session of coordinator.active.values()){session.cancelled=true;session.controller.abort();}server.close();const timer=setTimeout(()=>process.exit(code||1),10000);timer.unref();while(coordinator.active.size)await new Promise(resolve=>setTimeout(resolve,50));await db?.close();clearTimeout(timer);process.exitCode=code;}
  process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());process.on('uncaughtException',()=>{console.error(JSON.stringify({event:'uncaught_exception'}));shutdown(1);});process.on('unhandledRejection',()=>{console.error(JSON.stringify({event:'unhandled_rejection'}));shutdown(1);});
  if(db&&cfg.retentionDays>0){const cleanup=setInterval(async()=>{try{await db.transaction(async tx=>{await tx.query("DELETE FROM reports WHERE created_at<now()-($1::int*interval '1 day')",[cfg.retentionDays]);await tx.query("DELETE FROM conversations WHERE updated_at<now()-($1::int*interval '1 day')",[cfg.retentionDays]);});}catch{console.error(JSON.stringify({event:'retention_cleanup_failed'}));}},86400000);cleanup.unref();}
  return {server,db};
}
module.exports={start};
