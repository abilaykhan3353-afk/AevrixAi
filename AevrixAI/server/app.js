const express=require('express'),helmet=require('helmet'),cookieParser=require('cookie-parser');
const path=require('node:path'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {Repository}=require('./repository'),{Providers}=require('./providers');
const {Coordinator,makeChat}=require('./chat');
const {limiter,authMiddleware,required,originGuard,admin}=require('./security');
const {AppError,asyncRoute:route,assert,uuid,fail}=require('./errors');
const {extract}=require('./documents');
function createApp({cfg,db=null,providers=new Providers(cfg)}){
  const app=express(),repo=db?new Repository(db):null,coordinator=new Coordinator(cfg),metrics=[];
  app.disable('x-powered-by');app.set('trust proxy',cfg.proxyHops);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:cfg.production?[]:null}},crossOriginEmbedderPolicy:false}));
  app.use(originGuard(cfg));app.use('/api',limiter(180,60000));app.use(express.json({limit:'12mb',strict:true}));app.use(cookieParser());
  app.use(authMiddleware(cfg,db));
  app.use((req,res,next)=>{res.set('X-Request-ID',req.requestId);if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');next();});
  app.use(express.static(path.join(__dirname,'../public'),{dotfiles:'deny',index:'index.html',fallthrough:true}));
  const accountReady=()=>{if(!db||!cfg.jwtSecret)fail(503,'accounts_disabled','Аккаунты не настроены: нужны DATABASE_URL и JWT_SECRET.');};
  const cookieOptions={httpOnly:true,secure:cfg.production,sameSite:'lax',path:'/'};
  const setToken=(res,user)=>res.cookie('token',jwt.sign({id:user.id,v:user.session_version},cfg.jwtSecret,{algorithm:'HS256',expiresIn:'7d',issuer:'aevrix',audience:'aevrix-web'}),{...cookieOptions,maxAge:7*86400000});
  app.get('/api/config',(req,res)=>res.json({version:'3.0.0',preview:cfg.preview===true,accounts:!!db,chat:!!cfg.groqKey,vision:!!(cfg.groqKey||cfg.geminiKey),search:!!(cfg.tavilyKey||cfg.braveKey),images:!!cfg.pollinationsKey,documents:!!db,deadlineMs:cfg.deadlineMs,retentionDays:cfg.retentionDays}));
  app.get('/healthz',(req,res)=>res.json({ok:true,version:'3.0.0'}));
  app.get('/readyz',route(async(req,res)=>{if(db)await db.query('SELECT 1');res.json({ok:true,database:!!db});}));
  const loginLimit=limiter(8,15*60000);
  app.post('/api/auth/register',loginLimit,route(async(req,res)=>{
    accountReady();const {username,password}=req.body||{};
    assert(typeof username==='string'&&/^[A-Za-z0-9_]{3,20}$/.test(username),'Имя: 3–20 латинских букв, цифр или подчёркиваний.');
    assert(typeof password==='string'&&password.length>=8&&Buffer.byteLength(password)<=72&&!password.includes('\0'),'Пароль: минимум 8 символов, максимум 72 байта UTF-8.');
    const passwordHash=await bcrypt.hash(password,12);let user;
    try{user=(await db.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username,session_version',[username,passwordHash])).rows[0];}catch(error){if(error.code==='23505')fail(409,'username_taken','Это имя уже занято.');throw error;}
    setToken(res,user);res.status(201).json({user:{id:user.id,username:user.username}});
  }));
  const dummyHash=bcrypt.hashSync('aevrix-dummy-password-not-an-account',10);
  app.post('/api/auth/login',loginLimit,route(async(req,res)=>{
    accountReady();const {username,password}=req.body||{};assert(typeof username==='string'&&username.length<=20&&typeof password==='string'&&password.length<=1024);
    const user=(await db.query('SELECT * FROM users WHERE username=$1',[username])).rows[0];
    const good=await bcrypt.compare(password,user?.password_hash||dummyHash);if(!user||!good)fail(401,'invalid_credentials','Неверное имя пользователя или пароль.');
    setToken(res,user);res.json({user:{id:user.id,username:user.username}});
  }));
  app.get('/api/auth/me',(req,res)=>res.json({user:req.user?{id:req.user.id,username:req.user.username}:null}));
  app.post('/api/auth/logout',route(async(req,res)=>{if(req.user){const active=coordinator.active.get(req.actor);if(active)coordinator.cancel(req.actor,active.id);await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[req.user.id]);}res.clearCookie('token',cookieOptions);res.json({ok:true});}));
  const cid=(req,res,next)=>uuid(req.params.id)?next():next(new AppError(400,'invalid_id','Неверный ID диалога.'));
  const idle=(req,res,next)=>[...coordinator.active.values()].some(s=>s.cid===req.params.id)?next(new AppError(409,'already_running','Сначала останови текущий ответ.')):next();
  app.get('/api/conversations',required,route(async(req,res)=>{assert(!req.query.q||typeof req.query.q==='string'&&req.query.q.length<=100);res.json({conversations:await repo.list(req.user.id,req.query.archived==='true',req.query.q||'')});}));
  app.post('/api/conversations',required,route(async(req,res)=>{const b=req.body||{};assert(b.title===undefined||typeof b.title==='string'&&b.title.trim().length>0&&b.title.length<=100);assert(b.mode===undefined||['chat','explain','hint','check','quiz'].includes(b.mode));res.status(201).json({conversation:await repo.create(req.user.id,b.title?.trim(),b.mode)});}));
  app.patch('/api/conversations/:id',required,cid,idle,route(async(req,res)=>{const p=req.body||{};assert(p.title===undefined||typeof p.title==='string'&&p.title.trim().length>0&&p.title.length<=100);assert(p.mode===undefined||['chat','explain','hint','check','quiz'].includes(p.mode));assert(p.search_mode===undefined||['auto','on','off'].includes(p.search_mode));assert(p.archived===undefined||typeof p.archived==='boolean');res.json({conversation:await repo.update(req.user.id,req.params.id,p)});}));
  app.delete('/api/conversations/:id',required,cid,idle,route(async(req,res)=>{await repo.delete(req.user.id,req.params.id);res.json({ok:true});}));
  app.get('/api/conversations/:id/messages',required,cid,route(async(req,res)=>{const before=req.query.before?Number(req.query.before):2147483647;assert(Number.isInteger(before)&&before>0&&before<=2147483647);const messages=await repo.messages(req.user.id,req.params.id,{before});res.json({messages,nextBefore:messages.length===100?messages[0].id:null});}));
  app.get('/api/conversations/:id/export',required,cid,route(async(req,res)=>{
    const conversation=await repo.owned(req.user.id,req.params.id),messages=await repo.messages(req.user.id,req.params.id,{all:true});
    if(req.query.format==='markdown'){res.type('text/markdown').set('Content-Disposition','attachment; filename="aevrix-conversation.md"').send('# '+conversation.title+'\n\n'+messages.map(m=>`## ${m.role==='user'?'Вы':'Aevrix AI'}\n\n${m.content}\n\n${m.status!=='completed'?'Статус: '+m.status+'\n':''}${(m.sources||[]).map(s=>`Источник: ${s.title} (${s.url})`).join('\n')}`).join('\n\n'));}
    else res.json({version:3,conversation,messages});
  }));
  app.post('/api/conversations/:id/fork',required,cid,idle,route(async(req,res)=>{const b=req.body||{};assert(Number.isInteger(b.messageId)&&b.messageId>0&&typeof b.text==='string'&&b.text.trim().length>0&&b.text.length<=20000);res.status(201).json({conversation:await repo.fork(req.user.id,req.params.id,b.messageId,b.text)});}));
  app.get('/api/conversations/:id/versions/:message',required,cid,route(async(req,res)=>{const message=Number(req.params.message);assert(Number.isInteger(message)&&message>0);res.json({versions:await repo.versions(req.user.id,req.params.id,message)});}));
  app.post('/api/conversations/:id/select-version',required,cid,idle,route(async(req,res)=>{assert(Number.isInteger(req.body?.messageId)&&req.body.messageId>0);await repo.selectVersion(req.user.id,req.params.id,req.body.messageId);res.json({ok:true});}));
  app.get('/api/preferences',required,route(async(req,res)=>res.json(await repo.preferences(req.user.id))));
  app.put('/api/preferences',required,route(async(req,res)=>{const b=req.body||{};assert(typeof b.instructions==='string'&&b.instructions.length<=2000&&typeof b.memory_enabled==='boolean');await repo.setPreferences(req.user.id,b);res.json({ok:true});}));
  app.delete('/api/preferences',required,route(async(req,res)=>{await repo.setPreferences(req.user.id,{instructions:'',memory_enabled:false});res.json({ok:true});}));
  app.get('/api/conversations/:id/memory',required,cid,route(async(req,res)=>{await repo.owned(req.user.id,req.params.id);res.json({summary:(await db.query('SELECT content,covered_end,version,updated_at FROM conversation_summaries WHERE conversation_id=$1',[req.params.id])).rows[0]||null});}));
  app.delete('/api/conversations/:id/memory',required,cid,idle,route(async(req,res)=>{await repo.owned(req.user.id,req.params.id);await db.query('DELETE FROM conversation_summaries WHERE conversation_id=$1',[req.params.id]);res.json({ok:true});}));
  app.get('/api/bookmarks',required,route(async(req,res)=>res.json({bookmarks:(await db.query('SELECT m.*,c.title FROM bookmarks b JOIN messages m ON m.id=b.message_id JOIN conversations c ON c.id=m.conversation_id WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 200',[req.user.id])).rows})));
  app.post('/api/bookmarks/:message',required,route(async(req,res)=>{const id=Number(req.params.message);assert(Number.isInteger(id)&&id>0);if(!(await db.query('SELECT id FROM messages WHERE id=$1 AND user_id=$2',[id,req.user.id])).rows.length)fail(404,'not_found','Сообщение не найдено.');await db.query('INSERT INTO bookmarks(user_id,message_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,id]);res.json({ok:true});}));
  app.delete('/api/bookmarks/:message',required,route(async(req,res)=>{const id=Number(req.params.message);assert(Number.isInteger(id)&&id>0);await db.query('DELETE FROM bookmarks WHERE user_id=$1 AND message_id=$2',[req.user.id,id]);res.json({ok:true});}));
  app.get('/api/conversations/:id/documents',required,cid,route(async(req,res)=>res.json({documents:await repo.documents(req.user.id,req.params.id)})));
  app.post('/api/conversations/:id/documents',required,cid,idle,limiter(6,60000),route(async(req,res)=>{
    await repo.owned(req.user.id,req.params.id);const signal=AbortSignal.timeout(15000);const parsed=await extract(req.body,signal);const id=await repo.addDocument(req.user.id,req.params.id,parsed.file,parsed.chunks);res.status(201).json({id,filename:parsed.file.name,chunks:parsed.chunks.length});
  }));
  app.delete('/api/conversations/:id/documents/:asset',required,cid,idle,route(async(req,res)=>{assert(uuid(req.params.asset));await repo.owned(req.user.id,req.params.id);const asset=await repo.asset(req.user.id,req.params.asset);if(asset.conversation_id!==req.params.id||asset.kind!=='document')fail(404,'not_found','Документ не найден.');await db.query('DELETE FROM attachments WHERE id=$1 AND user_id=$2',[req.params.asset,req.user.id]);res.json({ok:true});}));
  app.get('/api/attachments/:asset',required,route(async(req,res)=>{assert(uuid(req.params.asset));const a=await repo.asset(req.user.id,req.params.asset);res.type(a.mime_type).set('Content-Disposition',`${a.kind==='image'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`).send(Buffer.from(a.data));}));
  app.post('/api/chat/stream',limiter(cfg.ratePerMinute,60000),route(makeChat({cfg,repo,providers,coordinator,metrics})));
  app.post('/api/chat/:requestId/stop',route(async(req,res)=>{assert(uuid(req.params.requestId));coordinator.cancel(req.actor,req.params.requestId);res.json({ok:true});}));
  app.post('/api/report',limiter(3,60000),route(async(req,res)=>{
    const b=req.body||{};assert(['bug','idea','other'].includes(b.category)&&typeof b.comment==='string'&&b.comment.trim().length>0&&b.comment.length<=2000);const context=b.context||[];assert(Array.isArray(context)&&context.length<=6&&context.every(m=>m&&typeof m.text==='string'&&m.text.length<=1000&&['user','bot'].includes(m.role)));
    if(!db)fail(503,'reports_disabled','Обращения не настроены. Сообщение не отправлено.');
    const id=randomUUID();await db.query('INSERT INTO reports(id,user_id,category,comment,context) VALUES($1,$2,$3,$4,$5)',[id,req.user?.id||null,b.category,b.comment.trim(),JSON.stringify(context)]);
    let delivered=false;if(cfg.telegramToken&&cfg.telegramChat){try{const result=await providers.json(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:cfg.telegramChat,text:`Aevrix · ${b.category}\nReport ${id}\n${b.comment.slice(0,2000)}`})},AbortSignal.timeout(6000),5000);delivered=!!result.ok;if(delivered)await db.query('UPDATE reports SET delivered_at=now() WHERE id=$1',[id]);}catch{}}
    res.status(201).json({id,stored:true,delivered});
  }));
  app.post('/api/telegram/webhook',limiter(30,60000),route(async(req,res)=>{
    if(!cfg.webhookSecret||!cfg.telegramToken)fail(503,'webhook_disabled','Webhook отключён.');const actual=Buffer.from(req.get('x-telegram-bot-api-secret-token')||''),expected=Buffer.from(cfg.webhookSecret);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail(403,'invalid_secret','Неверный секрет.');
    const message=req.body?.message;if(!message)return res.sendStatus(200);assert(typeof message.text==='string'&&message.text.length<=4096&&Number.isSafeInteger(message.chat?.id));
    if(['/start','/help','/id'].includes(message.text.split(' ')[0]))await providers.json(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:message.text.startsWith('/id')?`chat_id: ${message.chat.id}`:'Aevrix Support. Сюда поступают обращения из веб-чата. /id — ID чата.'})},AbortSignal.timeout(6000),5000);
    res.sendStatus(200);
  }));
  app.get('/admin',limiter(8,15*60000),admin(cfg),(req,res)=>res.type('html').send('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Aevrix Admin</title><h1>Aevrix · техническая статистика</h1><p>Содержание разговоров и IP не журналируются. Данные живут до перезапуска.</p><pre>'+JSON.stringify({active:coordinator.active.size,today:coordinator.total,recent:metrics.slice(-20)},null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre></html>'));
  app.get('/api/admin/reports',limiter(8,60000),admin(cfg),route(async(req,res)=>{if(!db)fail(503,'database_unavailable','БД недоступна.');res.json({reports:(await db.query('SELECT id,category,comment,created_at,delivered_at FROM reports ORDER BY created_at DESC LIMIT 100')).rows});}));
  app.use((req,res)=>res.status(404).json({error:'Не найдено.',code:'not_found'}));
  app.use((error,req,res,next)=>{if(res.headersSent)return res.destroy();const status=error.status||500;const message=error instanceof AppError?error.message:error.type==='entity.too.large'?'Запрос слишком большой.':error instanceof SyntaxError?'Некорректный JSON.':'Сервис временно недоступен.';if(status>=500)console.error(JSON.stringify({event:'request_error',requestId:req.requestId,code:error.code||'internal_error'}));res.status(status).json({error:message,code:error.code||'internal_error'});});
  return {app,repo,coordinator,metrics};
}
module.exports={createApp};
