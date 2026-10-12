const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const ease = 'cubic-bezier(.22,1,.36,1)';
export function animate(node, frames, options = {}) {
  if (!node || reduced.matches || !node.animate) return null;
  return node.animate(frames, {duration: 300, easing: ease, ...options});
}
export function revealMessage(node) {
  animate(node, [{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}]);
}
export function revealConversation() {
  animate(document.getElementById('timeline'), [{opacity:.45,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}], {duration:230});
}
const knownRows = new Set();
export function revealRows(nav) {
  let index=0;
  for (const row of nav.querySelectorAll('[data-conversation-id]')) {
    if (!knownRows.has(row.dataset.conversationId)) {
      knownRows.add(row.dataset.conversationId);
      animate(row, [{opacity:0,transform:'translateX(-8px)'},{opacity:1,transform:'translateX(0)'}], {duration:260,delay:Math.min(index++,7)*25});
    }
  }
}
export function showModal(dialog) {
  dialog.getAnimations().forEach(a=>a.cancel());dialog.dataset.closing='false';
  if(!dialog.open)dialog.showModal();
  animate(dialog,[{opacity:0,transform:'translateY(16px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280});
}
export function hideModal(dialog) {
  if(!dialog.open||dialog.dataset.closing==='true')return;
  dialog.dataset.closing='true';
  const animation=animate(dialog,[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(10px) scale(.98)'}],{duration:150});
  const close=()=>{if(dialog.dataset.closing==='true'){dialog.close();dialog.dataset.closing='false';}};
  if(animation)animation.finished.then(close,()=>{});else close();
}
export function generating(active) {document.body.dataset.generating=String(active);}
export function finishMessage(node) {animate(node,[{opacity:.65},{opacity:1}],{duration:220});}
export function notify(node) {animate(node,[{opacity:0,transform:'translate(-50%, 10px)'},{opacity:1,transform:'translate(-50%, 0)'}],{duration:220});}
export function themeTransition(apply) {
  if(!reduced.matches&&document.startViewTransition&&!document.querySelector('dialog[open]')) {
    const transition=document.startViewTransition(apply);transition.finished.catch(()=>{});
  } else apply();
}
export function initMotion() {
  document.body.classList.add('motion-ready');
  document.addEventListener('pointerdown',event=>{
    if(reduced.matches||event.button!==0)return;
    const button=event.target.closest('button');
    if(!button||button.disabled||button.closest('.select-panel'))return;
    button.style.setProperty('--press-x',(event.clientX-button.getBoundingClientRect().left)+'px');
    button.style.setProperty('--press-y',(event.clientY-button.getBoundingClientRect().top)+'px');
    button.classList.remove('pressed');requestAnimationFrame(()=>button.classList.add('pressed'));
  });
  document.addEventListener('animationend',event=>{if(event.animationName==='press-light')event.target.classList.remove('pressed');});
  const hero=document.getElementById('hero');let pending=0;
  hero.addEventListener('pointermove',event=>{
    if(!finePointer.matches||reduced.matches)return;
    if(pending)return;
    pending=requestAnimationFrame(()=>{const r=hero.getBoundingClientRect();hero.style.setProperty('--spot-x',(event.clientX-r.left)+'px');hero.style.setProperty('--spot-y',(event.clientY-r.top)+'px');pending=0;});
  });
  hero.addEventListener('pointerleave',()=>{hero.style.removeProperty('--spot-x');hero.style.removeProperty('--spot-y');});
}
