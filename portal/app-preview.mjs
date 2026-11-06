// Autor: Luis Montañez Escobar.
import {previewMode,canPreview} from './compact-preview.mjs';
import {journeyToolButtons,portalSections,secondarySections} from './journey-tools.mjs';
export const appPreviewEnabled=(user,search)=>previewMode(user,search)==='app';
export function previewEntry(user,active){
 if(!canPreview(user))return '';
 return active?'<button type="button" class="preview-launch" data-sandbox="exit">Salir de maqueta ↗</button>':'<a class="preview-launch" id="preview-launch" href="/?vista=app" target="_blank" rel="noopener noreferrer">Probar nueva vista ↗</a>';
}
export function appNavigation(view,icon){
 return [...portalSections.filter(s=>['picks','board','calendar'].includes(s.id)).map(s=>[s.id,s.icon,s.short]),['functions','grid','Funciones']].map(([v,i,label])=>`<button type="button" ${v==='functions'?'data-app-functions aria-haspopup="dialog"':`data-view="${v}"`} class="${v===view||v==='board'&&view==='ranking'?'active':''}" ${v===view||v==='board'&&view==='ranking'?'aria-current="page"':''}>${icon(i==='more'?'grid':i)}<span>${label}</span></button>`).join('');
}
export function appLayout(content,view){
 const tabs=['board','ranking'].includes(view)?`<nav class="app-group-tabs" aria-label="Vistas del grupo"><button type="button" data-view="board" aria-current="${view==='board'?'page':'false'}">Elecciones</button><button type="button" data-view="ranking" aria-current="${view==='ranking'?'page':'false'}">Clasificación</button></nav>`:'';
 return `<div class="app-preview-note" role="status"><span class="app-preview-dot" aria-hidden="true"></span>Maqueta · estás en tu copia de prueba</div>${tabs}<section class="app-stage">${content}</section>`;
}
export function closeAppFunctions(){document.querySelector('#app-functions')?.close();}
export function openAppFunctions(data,user,adminControls=''){
 closeAppFunctions();const previous=document.activeElement,dialog=document.createElement('dialog');dialog.id='app-functions';dialog.className='app-functions';dialog.setAttribute('aria-labelledby','app-functions-title');
 dialog.innerHTML=`<div class="dialog-top"><h2 id="app-functions-title">Funciones</h2><button type="button" class="icon-button" data-close-app-functions aria-label="Cerrar funciones">×</button></div><div class="app-function-list">${journeyToolButtons(data,{className:'app-function',details:true})}</div><nav class="app-secondary" aria-label="Otras secciones">${secondarySections(user).map(({id,title:label})=>`<button type="button" data-view="${id}">${label}<span aria-hidden="true">↗</span></button>`).join('')}</nav>${adminControls?`<details class="app-test-controls"><summary>Controles de prueba</summary>${adminControls}</details>`:''}`;
 document.body.append(dialog);dialog.querySelector('[data-close-app-functions]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();},{once:true});dialog.showModal();
}
