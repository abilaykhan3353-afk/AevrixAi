const { parentPort,workerData }=require('node:worker_threads');
const { PDFParse }=require('pdf-parse');
(async()=>{const parser=new PDFParse({data:new Uint8Array(workerData),isEvalSupported:false});try{const info=await parser.getInfo();if(info.total>150)throw new Error('page limit');const result=await parser.getText();parentPort.postMessage({pages:result.pages.map(p=>({page:p.num,text:p.text}))});}finally{await parser.destroy();}})().catch(()=>parentPort.postMessage({error:true}));
