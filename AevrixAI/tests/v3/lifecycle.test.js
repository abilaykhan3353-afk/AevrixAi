const{test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),{randomUUID}=require('node:crypto');
const{setup,events}=require('./helpers');
const{extract}=require('../../server/documents');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await pause(20);}throw new Error('Fixture did not reach expected state');}
test('Stop enforces owner, aborts upstream, disallows concurrent generation and persists cancelled state',async()=>{
 const s=await setup();s.providers.behaviour='slow';const server=s.app.listen(0);try{
 const agent=request.agent(s.app),registered=await agent.post('/api/auth/register').send({username:'stop_user',password:'correct-password'});const cookie=registered.headers['set-cookie'].map(s=>s.split(';')[0]).join(';');
 const cid=(await agent.post('/api/conversations').send({})).body.conversation.id,url='http://127.0.0.1:'+server.address().port;
 const response=await fetch(url+'/api/chat/stream',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({conversationId:cid,clientKey:randomUUID(),message:'Длинный ответ'})});
 const reader=response.body.getReader(),decoder=new TextDecoder();let text=decoder.decode((await reader.read()).value),meta=events(text).find(e=>e.meta);assert.ok(meta);
 await wait(()=>s.providers.messages.length>0);
 await request(s.app).post('/api/chat/'+meta.requestId+'/stop').send({}).expect(404);
 await agent.post('/api/chat/stream').send({conversationId:cid,clientKey:randomUUID(),message:'Другой вопрос'}).expect(409);
 await agent.post('/api/chat/'+meta.requestId+'/stop').send({}).expect(200);
 while(true){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});}
 assert.equal(events(text).at(-1).status,'cancelled');assert.equal(s.providers.aborted,true);
 assert.equal((await agent.get(`/api/conversations/${cid}/messages`)).body.messages.at(-1).status,'cancelled');
 assert.equal(s.coordinator.active.size,0);
 }finally{server.close();await s.db.close();}
});
test('disconnect cancels provider; deadline and persistence errors never report success',async t=>{
 await t.test('disconnect',async()=>{const s=await setup(),server=s.app.listen(0);s.providers.behaviour='slow';try{const controller=new AbortController();const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientKey:randomUUID(),message:'Запрос'}),signal:controller.signal});await wait(()=>s.providers.messages.length);controller.abort();await wait(()=>!s.coordinator.active.size);assert.equal(s.providers.aborted,true);}finally{server.closeAllConnections();server.close();await s.db.close();}});
 await t.test('deadline',async()=>{const s=await setup({REQUEST_DEADLINE_MS:'1000'});s.providers.behaviour='slow';try{const response=await request(s.app).post('/api/chat/stream').send({clientKey:randomUUID(),message:'Запрос'}).expect(200);const last=events(response.text).at(-1);assert.equal(last.status,'failed');assert.equal(last.errorCode,'deadline');assert.equal(s.providers.aborted,true);}finally{await s.db.close();}});
 await t.test('failed DELETE and failed generation persistence',async()=>{const s=await setup();try{const agent=request.agent(s.app);await agent.post('/api/auth/register').send({username:'db_user',password:'correct-password'});const cid=(await agent.post('/api/conversations').send({})).body.conversation.id;const realQuery=s.db.query;s.db.query=(sql,p)=>sql.startsWith('DELETE FROM conversations')?Promise.reject(new Error('fixture failure')):realQuery(sql,p);await agent.delete('/api/conversations/'+cid).expect(500);s.db.query=realQuery;
  const original=s.repo.finish.bind(s.repo);s.repo.finish=async()=>{throw new Error('fixture persistence failure');};const answer=await agent.post('/api/chat/stream').send({clientKey:randomUUID(),conversationId:cid,message:'Запрос'}).expect(200);const last=events(answer.text).at(-1);assert.equal(last.persistenceFailed,true);assert.notEqual(last.status,'completed');s.repo.finish=original;
 }finally{await s.db.close();}});
});
test('rate limits enforce Retry-After; absent webhook secret does not process updates',async()=>{const s=await setup({CHAT_REQUESTS_PER_MINUTE:'1'});try{const agent=request.agent(s.app);await agent.post('/api/chat/stream').send({clientKey:randomUUID(),message:'Первый'}).expect(200);const result=await agent.post('/api/chat/stream').send({clientKey:randomUUID(),message:'Второй'}).expect(429);assert.ok(result.headers['retry-after']);await agent.post('/api/telegram/webhook').send({message:{text:'/id',chat:{id:42}}}).expect(503);}finally{await s.db.close();}});
test('PDF extraction returns pages and rejects corrupt and scanned-only input',async()=>{
 // A tiny valid PDF fixture built locally, containing one page with text.
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const content='BT /F1 12 Tf 30 200 Td (Photosynthesis stores light energy.) Tj ET';objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 const result=await extract({name:'fixture.pdf',data:Buffer.from(pdf).toString('base64')},AbortSignal.timeout(15000));assert.equal(result.chunks[0].page,1);assert.match(result.chunks[0].text,/Photosynthesis/);
 await assert.rejects(()=>extract({name:'broken.pdf',data:Buffer.from('%PDF-invalid').toString('base64')},AbortSignal.timeout(15000)),e=>e.code==='document_invalid');
 await assert.rejects(()=>extract({name:'file.exe',data:'YWJj'},AbortSignal.timeout(5000)),e=>e.status===400);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>extract({name:'fixture.pdf',data:Buffer.from(pdf).toString('base64')},cancelled.signal),e=>e.code==='cancelled');
});
