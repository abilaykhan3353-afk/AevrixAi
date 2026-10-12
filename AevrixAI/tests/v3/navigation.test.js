const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {config}=require('../../server/config'),{createApp}=require('../../server/app');
const cfg=config({PUBLIC_ORIGIN:'https://aevrixai.onrender.com'}),{app}=createApp({cfg});
const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',Referer:'https://dashboard.render.com/'};
test('external links can open the public page, including query strings and HEAD',async()=>{
 for(const url of ['/','/?from=render','/index.html']){const res=await request(app).get(url).set(navigation).expect(200);assert.match(res.headers['content-type'],/text\/html/);assert.match(res.text,/Aevrix AI/);await request(app).head(url).set(navigation).expect(200);}
});
test('external navigation does not permit API reads, writes or private paths',async()=>{
 for(const url of ['/api/auth/me','/api/config','/api/conversations','/admin'])await request(app).get(url).set(navigation).expect(403);
 for(const url of ['/','/api/auth/login','/api/conversations'])await request(app).post(url).set(navigation).send({}).expect(403);
 await request(app).get('/').set({...navigation,'Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'}).expect(403);
 await request(app).get('/').set({...navigation,'Sec-Fetch-Mode':'no-cors','Sec-Fetch-Dest':'iframe'}).expect(403);
});
test('foreign Origin stays blocked; direct and same-origin requests still work',async()=>{
 await request(app).get('/').set({...navigation,Origin:'https://evil.example'}).expect(403);
 await request(app).post('/api/auth/login').set('Origin','https://evil.example').send({}).expect(403);
 await request(app).get('/').expect(200);
 await request(app).get('/api/config').set({'Origin':cfg.origin,'Sec-Fetch-Site':'same-origin'}).expect(200);
});
