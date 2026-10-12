// PDF native bindings run in a separate process so crashes cannot stop the web server.
const { PDFParse }=require('pdf-parse');
(async()=>{
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>5*1024*1024)throw Error('file limit');chunks.push(chunk);}
 const parser=new PDFParse({data:new Uint8Array(Buffer.concat(chunks)),isEvalSupported:false});let pages;
 try{const info=await parser.getInfo();if(info.total>150)throw Error('page limit');const result=await parser.getText();pages=result.pages.map(p=>({page:p.num,text:p.text}));if(pages.reduce((sum,p)=>sum+p.text.length,0)>400000)throw Error('text limit');}finally{await parser.destroy();}
 process.stdout.write(JSON.stringify({pages}));
})().catch(()=>{process.exitCode=1;});
