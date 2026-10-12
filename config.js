// Explicit local verification only. Production server never imports test providers or PGlite.
if(process.env.NODE_ENV==='production')throw new Error('Preview cannot run in production.');
const{setup}=require('../tests/v3/helpers');
(async()=>{const s=await setup();s.cfg.preview=true;
const server=s.app.listen(3033,'127.0.0.1',()=>console.log('LOCAL TEST PREVIEW http://127.0.0.1:3033 — fixture replies, in-memory PostgreSQL'));
const stop=async()=>{server.closeAllConnections();server.close();await s.db.close();process.exitCode=0;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
