const { Worker } = require('node:worker_threads');
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
    pages=await new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'pdf-worker.js'),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:192}});let finished=false;
      const end=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
      const abort=()=>end(new AppError(408,'cancelled','Чтение документа отменено.'));
      const timer=setTimeout(()=>end(new AppError(408,'document_timeout','Чтение PDF заняло слишком много времени.')),12000);
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      worker.on('message',msg=>msg.error?end(new AppError(400,'document_invalid','PDF повреждён, защищён паролем или превышает лимит.')):end(null,msg.pages));worker.on('error',()=>end(new AppError(400,'document_invalid','Не удалось прочитать PDF.')));
      worker.on('exit',code=>{if(!finished)end(new AppError(400,'document_invalid','Чтение PDF не завершено.'));});
    });
  }else{assert(['.txt','.md'].includes(extension),'Можно загрузить PDF, TXT или MD.');mime=extension==='.md'?'text/markdown':'text/plain';let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail(400,'document_encoding','Текстовый файл должен быть в UTF-8.');}assert(!text.includes('\0'),'Некорректный текстовый файл.');pages=[{page:1,text}];}
  assert(pages.length<=150,'Максимум 150 страниц.');assert(pages.reduce((n,p)=>n+p.text.length,0)<=400000,'Текст документа слишком большой.');
  const pieces=chunks(pages);if(!pieces.length)fail(400,'ocr_required','В PDF не найден текст. Для сканов нужен OCR; загрузи текстовую версию.');
  return {file:{name,mime,data},chunks:pieces};
}
module.exports={extract,chunks};
