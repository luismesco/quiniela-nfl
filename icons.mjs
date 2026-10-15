const paths={
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4"/>',
ball:'<path d="M20 4C10 1 1 10 4 20c10 3 19-6 16-16Zm-4 4-8 8m1-6 5 5m-2-8 5 5"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
chart:'<path d="M4 21V3m0 18h17M8 16v-5m5 5V7m5 9V4"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
refresh:'<path d="M20 7a9 9 0 0 0-15 0L3 10m0-6v6h6m-5 7a9 9 0 0 0 15 0l2-3m0 6v-6h-6"/>',
arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
cards:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/>'};
export function icon(name){return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.grid}</svg>`;}
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
