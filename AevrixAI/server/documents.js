const { spawn } = require('node:child_process');
const path = require('node:path');
const { assert, fail, AppError } = require('./errors');
function chunks(pages){const result=[];for(const page of pages){const text=page.text.replace(/\0/g,'').trim();for(let start=0;start<text.length;start+=1300){result.push({page:page.page,text:text.slice(start,start+1600)});if(result.length>400)fail(413,'document_limit','Документ слишком большой. Максимум 400 фрагментов.');}}return result;}
async function extract(body,signal){
  assert(body&&typeof body.name==='string'&&body.name.length<=150&&typeof body.data==='string'&&body.data.length<=7*1024*1024);
  assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data));
  const data=Buffer.from(body.data,'base64');assert(data.length>0&&data.length<=5*1024*1024,'Файл должен быть до 5 МБ.');
  const name=path.basename(body.name).replace(/[\x00-\x1f]/g,'');const extension=path.extname(name).toLowerCase();let pages,mime;
  if(extension==='.pdf'){
    assert(data.subarray(0,5).toString()==='%PDF-','Содержимое не похоже на PDF.');mime='application/pdf';
    pages=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=192',path.join(__dirname,'pdf-worker.js')],{windowsHide:true,stdio:['pipe','pipe','ignore'],env:Object.fromEntries(['PATH','SystemRoot','TEMP','TMP','LANG'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))});let finished=false,size=0;const output=[];
      const end=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)child.kill();error?reject(error):resolve(value);};
      const abort=()=>end(new AppError(408,'cancelled','Чтение документа отменено.'));
      const timer=setTimeout(()=>end(new AppError(408,'document_timeout','Чтение PDF заняло слишком много времени.')),12000);
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)return end(new AppError(413,'document_limit','Текст документа слишком большой.'));output.push(chunk);});child.stdin.on('error',()=>{});child.on('error',()=>end(new AppError(400,'document_invalid','Не удалось прочитать PDF.')));
      child.on('close',code=>{if(finished)return;let result;try{result=JSON.parse(Buffer.concat(output).toString());}catch{}if(code!==0||!Array.isArray(result?.pages))end(new AppError(400,'document_invalid','PDF повреждён, защищён паролем или превышает лимит.'));else end(null,result.pages);});child.stdin.end(data);
    });
  }else{assert(['.txt','.md'].includes(extension),'Можно загрузить PDF, TXT или MD.');mime=extension==='.md'?'text/markdown':'text/plain';let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail(400,'document_encoding','Текстовый файл должен быть в UTF-8.');}assert(!text.includes('\0'),'Некорректный текстовый файл.');pages=[{page:1,text}];}
  assert(pages.length<=150,'Максимум 150 страниц.');assert(pages.reduce((n,p)=>n+p.text.length,0)<=400000,'Текст документа слишком большой.');
  const pieces=chunks(pages);if(!pieces.length)fail(400,'ocr_required','В PDF не найден текст. Для сканов нужен OCR; загрузи текстовую версию.');
  return {file:{name,mime,data},chunks:pieces};
}
module.exports={extract,chunks};
