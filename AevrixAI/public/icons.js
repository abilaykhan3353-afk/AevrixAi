// Small original SVGs: consistent controls without an external icon library.
const paths={
  menuBtn:'M4 6h16M4 12h16M4 18h16',
  closeSidebar:'M6 6l12 12M18 6L6 18',closeModal:'M6 6l12 12M18 6L6 18',removeAttachment:'M6 6l12 12M18 6L6 18',
  searchBtn:'M16 16l4 4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  exportBtn:'M12 15V3M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  renameBtn:'M4 16v4h4L20 8l-4-4L4 16M14 6l4 4',
  archiveBtn:'M4 4h16v4H4zM6 8v12h12V8M10 12h4',
  deleteBtn:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  attachBtn:'M8 12l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8',
  micBtn:'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V4M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8',
  emojiBtn:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M8 9h.01M16 9h.01M8 15s1.5 3 4 3 4-3 4-3',
  createImageBtn:'M4 3h16v18H4zM7 17l4-5 3 3 3-4M8 7h.01',
  sendButton:'M12 20V4M5 11l7-7 7 7',
  themeToggle:'M20 15a9 9 0 0 1-11-11A9 9 0 1 0 20 15'
};
export function initIcons(){
  const ns='http://www.w3.org/2000/svg';
  for(const[id,d]of Object.entries(paths)){
    const button=document.getElementById(id);if(!button)continue;
    const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');path.setAttribute('d',d);svg.append(path);button.replaceChildren(svg);
  }
}
