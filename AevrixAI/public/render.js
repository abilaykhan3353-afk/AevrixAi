export const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function safeUrl(raw,{internal=false}={}){try{const url=new URL(raw,location.origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;if(url.origin===location.origin&&url.pathname.startsWith('/api/attachments/')&&!internal)return null;return url.href;}catch{return null;}}
// Repair only clear pipe tables; never change fenced code or ordinary prose.
export function normalizeTables(text){
 const lines=String(text).replace(/\r\n/g,'\n').split('\n');let fence=null;
 const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(s=>s.trim());
 for(let i=0;i<lines.length;i++){
  const marker=lines[i].match(/^\s*(`{3,}|~{3,})/);if(marker){if(!fence)fence=marker[1][0];else if(fence===marker[1][0])fence=null;continue;}if(fence||!/^\s*\|.*\|\s*$/.test(lines[i]))continue;
  const width=cells(lines[i]).length;if(width<2||!lines[i+1]||!/^\s*\|.*\|\s*$/.test(lines[i+1]))continue;
  const next=cells(lines[i+1]);if(next.length!==width)continue;
  if(next.every(s=>/^:?-+:?$/.test(s))){lines[i+1]='| '+next.map(s=>(s.startsWith(':')?':':'')+'---'+(s.endsWith(':')?':':'')).join(' | ')+' |';i++;}
  else if(i===0||!/^\s*\|.*\|\s*$/.test(lines[i-1])){lines.splice(i+1,0,'| '+Array(width).fill('---').join(' | ')+' |');i++;}
 }
 return lines.join('\n');
}
export async function copyText(text){if(!navigator.clipboard?.writeText)throw new Error('Копирование недоступно. Можно скачать текст файлом.');try{await navigator.clipboard.writeText(text);}catch{throw new Error('Браузер не разрешил копирование. Можно скачать текст файлом.');}}
function copyAction(button,getText){button.onclick=async()=>{const label=button.textContent;try{await copyText(getText());button.textContent='Скопировано ✓';}catch(error){button.textContent=error.message;}setTimeout(()=>{if(button.isConnected)button.textContent=label;},2200);};}
export function tableRows(table){return Array.from(table.rows).map(row=>Array.from(row.cells).map(cell=>cell.innerText??cell.textContent).map(value=>value.trim().replace(/\s*\n\s*/g,' ')));}
function spreadsheetCell(value){return /^[=+\-@\t\r]/.test(value)?"'"+value:value;}
export function tableCsv(table){return '\ufeff'+tableRows(table).map(row=>row.map(value=>'"'+spreadsheetCell(value).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function markdown(node,text,{streaming=false}={}){
 node.innerHTML=DOMPurify.sanitize(marked.parse(normalizeTables(text),{gfm:true,breaks:true}),{FORBID_TAGS:['iframe','form','input','button','style'],FORBID_ATTR:['style']});
 node.querySelectorAll('a').forEach(a=>{const url=safeUrl(a.getAttribute('href'));if(!url){a.removeAttribute('href');return;}a.href=url;a.target='_blank';a.rel='noopener noreferrer';});
 node.querySelectorAll('table').forEach((table,index)=>{
  const section=el('section',undefined,'table-card'),wrap=el('div',undefined,'table-wrap');table.before(section);wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица '+(index+1));wrap.tabIndex=0;wrap.append(table);section.append(wrap);
  for(const th of table.querySelectorAll('thead th'))th.scope='col';
  if(!streaming){const tools=el('div',undefined,'table-tools'),label=el('span',(table.rows.length-1)+' строк · прокрути по горизонтали при необходимости'),copy=el('button','Копировать таблицу'),download=el('button','Скачать CSV');copy.type=download.type='button';copyAction(copy,()=>tableRows(table).map(row=>row.map(spreadsheetCell).join('\t')).join('\n'));download.onclick=()=>saveFile('aevrix-table-'+(index+1)+'.csv',tableCsv(table),'text/csv;charset=utf-8');tools.append(label,copy,download);section.append(tools);}
 });
 if(!streaming)node.querySelectorAll('pre code').forEach(code=>{if(window.hljs)hljs.highlightElement(code);const tools=el('div',undefined,'code-tools'),copy=el('button','Копировать код'),download=el('button','Скачать');copy.type=download.type='button';copyAction(copy,()=>code.textContent);download.onclick=()=>saveFile('aevrix-code.txt',code.textContent,'text/plain');tools.append(copy,download);code.parentElement.after(tools);});
}
export function saveFile(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function sourceNodes(values){const wrapper=el('div',undefined,'sources');for(const item of(Array.isArray(values)?values:[])){const isDoc=typeof item.chunkId==='number'&&/^\/api\/attachments\/[\da-f-]{36}$/.test(item.url);const url=safeUrl(item.url,{internal:isDoc});if(!url)continue;const link=el('a',item.title||new URL(url).hostname);link.href=url;link.target='_blank';link.rel='noopener noreferrer';if(isDoc){const details=el('details'),summary=el('summary',item.title),fragment=el('p',item.snippet||'');details.append(summary,fragment,link);wrapper.append(details);}else{const row=el('div');row.append(link);if(item.date)row.append(el('span',' · '+item.date,'muted'));wrapper.append(row);}}return wrapper;}
