import {animate} from './motion.js';
const controls=new Map();let active=null,sequence=0;
const descriptions={
  mode:{chat:'Общение, идеи и повседневные задачи',explain:'Разбираем сложное простыми словами',hint:'Подсказка без готового решения',check:'Находим ошибки и объясняем их',quiz:'Проверяем знания коротким тестом'},
  searchMode:{auto:'Бот выбирает, когда нужны свежие данные',on:'Искать источники для этого диалога',off:'Ответы без обращения к внешним источникам'}
};
function close(restore=false) {
  if(!active)return;const c=active;active=null;
  if(c.panel.hidePopover&&c.panel.matches(':popover-open'))c.panel.hidePopover();
  c.panel.hidden=true;c.trigger.setAttribute('aria-expanded','false');c.trigger.removeAttribute('aria-activedescendant');
  if(restore&&!c.trigger.disabled)c.trigger.focus();
}
function position(c) {
  const r=c.trigger.getBoundingClientRect(),v=window.visualViewport;
  const width=Math.min(Math.max(r.width,c.select.id==='mode'?290:280),(v?.width||innerWidth)-24);
  const left=Math.max(12,Math.min(r.left,(v?.width||innerWidth)-width-12));
  const height=v?.height||innerHeight,offset=v?.offsetTop||0;
  c.panel.style.width=width+'px';c.panel.style.left=left+'px';
  c.panel.style.maxHeight=Math.max(100,height-32)+'px';
  const desired=Math.min(c.panel.scrollHeight,height-32,360);
  const below=height+offset-r.bottom-12;
  c.panel.style.top=(below>=desired?r.bottom+8:Math.max(offset+12,r.top-desired-8))+'px';
  c.panel.style.maxHeight=Math.max(100,Math.min(360,below>=desired?below:r.top-offset-20))+'px';
}
function highlight(c,index) {
  const options=Array.from(c.select.options);
  if(!options.length)return;
  index=(index+options.length)%options.length;
  for(let n=0;n<options.length&&options[index].disabled;n++)index=(index+1)%options.length;
  c.index=index;c.trigger.setAttribute('aria-activedescendant',c.rows[index].id);
  c.rows.forEach((row,n)=>row.classList.toggle('highlighted',n===index));
  c.rows[index].scrollIntoView({block:'nearest'});
}
function open(c) {
  if(c.select.disabled)return;close();refresh(c);active=c;
  c.panel.hidden=false;
  if(c.panel.showPopover)c.panel.showPopover();
  c.trigger.setAttribute('aria-expanded','true');position(c);highlight(c,c.select.selectedIndex);
  animate(c.panel,[{opacity:0,transform:'translateY(-5px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:190});
}
function choose(c,index) {
  const option=c.select.options[index];if(c.select.disabled||!option||option.disabled)return;
  const changed=c.select.value!==option.value;c.select.value=option.value;refresh(c);close(true);
  if(changed){c.select.dispatchEvent(new Event('input',{bubbles:true}));c.select.dispatchEvent(new Event('change',{bubbles:true}));}
}
function refresh(c) {
  const value=c.select.selectedOptions[0]?.textContent||'Выбрать';if(c.label.textContent!==value)c.label.textContent=value;
  c.trigger.disabled=c.select.disabled;c.trigger.setAttribute('aria-busy',String(c.select.dataset.pending==='true'));
  c.rows.forEach((row,index)=>row.setAttribute('aria-selected',String(index===c.select.selectedIndex)));
  if(c.select.disabled&&active===c)close();
}
function enhance(select) {
  if(controls.has(select))return;
  const wrapper=document.createElement('div');wrapper.className='smart-select';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.id=(select.id||'select-'+(++sequence))+'-trigger';
  const label=document.createElement('span');label.className='select-value';
  const arrow=document.createElement('span');arrow.className='select-arrow';arrow.setAttribute('aria-hidden','true');
  trigger.append(label,arrow);trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent||'Выбор');
  for(const associatedLabel of Array.from(select.labels||[]))associatedLabel.htmlFor=trigger.id;
  const panel=document.createElement('div');panel.className='select-panel';panel.id=trigger.id+'-options';panel.hidden=true;panel.setAttribute('role','listbox');panel.setAttribute('aria-label',trigger.getAttribute('aria-label'));panel.setAttribute('popover','manual');trigger.setAttribute('aria-controls',panel.id);
  const c={select,wrapper,trigger,label,panel,rows:[],index:select.selectedIndex,typed:'',typedTimer:0};
  for(const [index,option]of Array.from(select.options).entries()) {
    const row=document.createElement('button');row.type='button';row.className='select-option';row.id=panel.id+'-'+index;row.tabIndex=-1;row.setAttribute('role','option');row.disabled=option.disabled;
    const text=document.createElement('span');text.className='option-text';const title=document.createElement('strong');title.textContent=option.textContent;text.append(title);
    const description=descriptions[select.id]?.[option.value];if(description){const hint=document.createElement('small');hint.textContent=description;text.append(hint);}
    const mark=document.createElement('span');mark.className='option-check';mark.textContent='✓';mark.setAttribute('aria-hidden','true');row.append(text,mark);
    row.onclick=()=>choose(c,index);row.addEventListener('pointermove',()=>highlight(c,index));panel.append(row);c.rows.push(row);
  }
  select.before(wrapper);wrapper.append(select,trigger);(select.closest('dialog')||document.body).append(panel);
  select.classList.add('native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  controls.set(select,c);trigger.onclick=()=>active===c?close():open(c);
  trigger.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(active!==c)open(c);highlight(c,event.key==='Home'?0:event.key==='End'?c.rows.length-1:c.index+(event.key==='ArrowDown'?1:-1));
    }else if(['Enter',' '].includes(event.key)){event.preventDefault();if(active===c)choose(c,c.index);else open(c);}
    else if(event.key==='Tab')close();
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(active!==c)open(c);clearTimeout(c.typedTimer);c.typed+=event.key.toLocaleLowerCase();const index=Array.from(select.options).findIndex(o=>o.textContent.toLocaleLowerCase().startsWith(c.typed));if(index>=0)highlight(c,index);c.typedTimer=setTimeout(()=>{c.typed='';},600);}
  });
  select.addEventListener('change',()=>refresh(c));
  new MutationObserver(()=>refresh(c)).observe(select,{attributes:true,attributeFilter:['disabled','data-pending']});refresh(c);
}
export function syncSelects(){for(const [select,c]of controls){if(!select.isConnected){if(active===c)close();c.panel.remove();controls.delete(select);}else refresh(c);}}
export function closeSelects(){close();}
export function initSelects(){
  const scan=root=>{if(root.matches?.('select'))enhance(root);for(const select of root.querySelectorAll?.('select')||[])enhance(select);};scan(document);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node);syncSelects();}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('pointerdown',event=>{if(active&&!active.trigger.contains(event.target)&&!active.panel.contains(event.target))close();},true);
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}},true);
  window.addEventListener('resize',()=>close());window.visualViewport?.addEventListener('resize',()=>close());
  window.addEventListener('scroll',event=>{if(active&&!active.panel.contains(event.target))position(active);},true);
}
