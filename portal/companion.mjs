import {investigate} from './investigator.mjs';
import {selectionModel,selectionFile,downloadFile} from './selection-export.mjs';
import {roundOutlookView} from './round-outlook.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=(d,t)=>t==='TIE'?'Empate · TIE':d.teams[t]?.nick||d.teams[t]?.name||t;
const clock=s=>new Date(s).toLocaleString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
let opened=null;
export function closeCompanion(){opened?.close();}
export function companionActions(data){
 const testMode=data.testMode;
 return (testMode?'':roundOutlookView(data))+`<section class="companion-actions" aria-label="Herramientas de mi quiniela"><img src="/assets/mascotas/ajolote-investigador.png" width="100" height="100" alt="Ajolote investigador con lupa"><div><span class="section-kicker">SIGUE TU JUGADA</span><h3>${testMode?'Tu selección, lista para compartir':'Investiga tus posibilidades.'}</h3><div class="companion-buttons">${testMode?'':'<button type="button" class="primary-button" data-companion="investigate" aria-haspopup="dialog">¿Qué necesito para ganar?</button>'}<button type="button" class="small-button" data-companion="share" aria-haspopup="dialog">Compartir mi selección</button></div></div></section>`;
}
export async function openCompanion(kind,{api,userId,roundId,dirty=false,toast}){
 opened?.close();
 const dialog=document.createElement('dialog');dialog.id='companion';dialog.setAttribute('aria-labelledby','companion-title');
 dialog.innerHTML=`<div class="companion-top"><span class="tiny">LA QUINIELA FISCALIZADA</span><button type="button" class="icon-button" id="companion-close" aria-label="Cerrar">×</button></div><div id="companion-body"><h2 id="companion-title">${kind==='share'?'Compartir mi selección':'¿Qué necesito para ganar?'}</h2><p role="status">Consultando tu jornada…</p></div>`;
 const returnFocus=document.activeElement;document.body.append(dialog);opened=dialog;dialog.showModal();
 let timeout=null,version=0,data,serverTime,fixed={},goal='lead';
 const q=s=>dialog.querySelector(s),body=()=>q('#companion-body');
 const cleanup=()=>{clearTimeout(timeout);version++;dialog.remove();if(opened===dialog)opened=null;returnFocus?.focus();};
 dialog.addEventListener('close',cleanup,{once:true});q('#companion-close').onclick=()=>dialog.close();
 function renderInvestigation(){
  const focus=document.activeElement?.id,report=investigate(data,userId,fixed);
  body().innerHTML=`<div class="investigator-heading"><img src="/assets/mascotas/ajolote-investigador.png" width="130" height="130" alt=""><div><span class="section-kicker">EL INVESTIGADOR DE TU JORNADA</span><h2 id="companion-title">¿Qué necesito para ganar?</h2><p>Para ${esc(data.participants.find(p=>p.id===userId)?.name)} · Semana ${data.week}</p></div></div><p class="scenario-note">Simula resultados de los partidos pendientes. Tus elecciones guardadas y los resultados finales se conservan.</p><p class="source-status" id="companion-updated">Consulta ${esc(clock(serverTime))} CDMX · Se actualiza mientras este panel está abierto.</p>${!data.captureClosed?'<p class="notice">La captura sigue abierta. El análisis usa las elecciones completas guardadas ahora; puede cambiar si el grupo las modifica.</p>':''}${!report.eligible?`<p class="notice" id="companion-result">${esc(report.reason)}</p>`:renderReport(report)}`;
  q('#companion-goal')?.addEventListener('change',e=>{goal=e.target.value;renderInvestigation();q('#companion-goal')?.focus();});
  dialog.querySelectorAll('[data-simulate]').forEach(select=>select.addEventListener('change',e=>{if(e.target.value)fixed[e.target.dataset.simulate]=e.target.value;else delete fixed[e.target.dataset.simulate];renderInvestigation();}));
  q('#companion-reset')?.addEventListener('click',()=>{fixed={};renderInvestigation();q('#companion-reset')?.focus();});
  q('#companion-example')?.addEventListener('click',()=>{for(const id of report.pending)fixed[id]=report.witness.results[id];renderInvestigation();q('#companion-reset')?.focus();});
  if(focus)q('#'+CSS.escape(focus))?.focus({preventScroll:true});
 }
 function renderOutlook(){
  body().innerHTML=`<h2 id="companion-title">¿Ya hay ganador?</h2><p class="source-status" id="companion-updated">Consulta ${esc(clock(serverTime))} CDMX · Se actualiza mientras este panel está abierto.</p>${roundOutlookView(data,{detail:true})}`;
 }
 function renderReport(r){
  const complete=r.completeSimulation,hasGames=r.pending.length>0,possible=goal==='solo'?r.canWinSolo:r.canLead;
  const title=!hasGames?(r.canWinSolo?'Ganaste el primer lugar':r.canLead?'Compartes el primer lugar':'La jornada terminó'):complete?(r.canWinSolo?'Ganas el primer lugar':r.canLead?'Compartes el primer lugar':'Fuera del primer lugar'):r.canWinSolo?'Puedes ganar el primer lugar':r.canLead?'Puedes compartir el primer lugar':'No queda una ruta al primer lugar';
  const routeText=route=>{const opts=route[goal];return opts.length===3?'Cualquier resultado conserva una ruta':opts.length===1?'Necesitas '+label(data,opts[0]):opts.length?'Conservan una ruta: '+opts.map(t=>label(data,t)).join(' o '):'Sin ruta con estas condiciones';};
  const leaders=r.witness.rows.filter(p=>r.witness.leaders.includes(p.id));
  return `<p class="source-status">${r.finished}/${data.games.length} partidos finalizados · ${r.pending.length-r.remaining}/${r.pending.length} pendientes simulados.</p><section class="scenario-verdict ${r.canWinSolo?'solo':r.canLead?'shared':'out'}" aria-live="polite" aria-atomic="true"><h3 id="companion-result">${title}</h3><p>${complete&&hasGames?'Con todos los resultados simulados.':!hasGames?'Con los resultados finales.':'Con los resultados finales y las condiciones que elegiste.'}</p><div class="scenario-facts"><span><b>${r.current}</b>Aciertos confirmados</span><span><b id="companion-solo">${r.canWinSolo?'Sí':'No'}</b>Ganar solo</span><span><b>${r.canLead?'Sí':'No'}</b>Alcanzar el primer lugar</span></div></section>${hasGames?`<div class="scenario-controls"><label for="companion-goal">Buscar una ruta para<select id="companion-goal"><option value="lead" ${goal==='lead'?'selected':''}>Ganar o compartir la bolsa</option><option value="solo" ${goal==='solo'?'selected':''}>Ganar solo</option></select></label><button type="button" class="small-button" id="companion-reset">Quitar simulación</button></div><div class="scenario-games">${data.games.filter(g=>r.pending.includes(g.id)).map(g=>{const route=r.routes.find(t=>t.gameId===g.id);return `<div class="scenario-game"><label for="sim-${esc(g.id)}"><strong>${esc(g.away)} vs ${esc(g.home)}</strong><small>${esc(label(data,data.participants.find(p=>p.id===userId).choices[g.id]))} · Tu elección guardada${g.status==='live'?' · En juego':''}</small></label><select id="sim-${esc(g.id)}" data-simulate="${esc(g.id)}"><option value="">Sin simular</option>${[g.away,g.home,'TIE'].map(t=>`<option value="${esc(t)}" ${fixed[g.id]===t?'selected':''}>${esc(label(data,t))}</option>`).join('')}</select><p>${route?esc(routeText(route)):'Resultado simulado'}</p></div>`;}).join('')}</div><p class="scenario-note">Cada condición conserva al menos una ruta con los demás partidos aún libres. Para comprobar una combinación, simula todos sus resultados. Un empate durante el juego puede cambiar; sólo el empate final acierta TIE.</p>${possible&&!complete?'<button type="button" class="primary-button" id="companion-example">Mostrar una ruta</button>':''}`:''}<section class="scenario-example"><h3>${complete?(hasGames?'Clasificación simulada':'Clasificación final'):r.canLead?'Una ruta al primer lugar':'Tu mejor cierre posible'}</h3>${!complete?`<p>${r.remaining} ${r.remaining===1?'partido aún libre se completa':'partidos aún libres se completan'} con tus elecciones guardadas para mostrar tu mejor resultado posible.</p>`:''}<p class="scenario-leaders" data-leaders="${esc(r.witness.leaders.join(' '))}"><strong>${complete?'Primer lugar':'En este cierre, primer lugar'}:</strong> ${esc(leaders.map(p=>p.name).join(', '))} · ${leaders[0].correct} aciertos${leaders.length>1?' · Bolsa compartida':''}.</p><div class="scenario-table-wrap"><table class="scenario-standings"><thead><tr><th scope="col">Participante</th><th scope="col">Aciertos</th></tr></thead><tbody>${r.witness.rows.map(p=>`<tr data-user="${esc(p.id)}" ${p.id===userId?'class="scenario-own"':''}><th scope="row">${esc(p.name)}${p.id===userId?' · Tú':''}</th><td data-points>${p.correct}</td></tr>`).join('')}</tbody></table></div></section>`;
 }
 async function poll(){
  try{const response=await api('/api/state?round='+encodeURIComponent(roundId));if(!dialog.open)return;data=response.data;serverTime=response.serverTime;fixed=Object.fromEntries(Object.entries(fixed).filter(([id])=>data.games.some(g=>g.id===id&&g.status!=='final')));if(kind==='outlook')renderOutlook();else renderInvestigation();}
  catch(error){if(!dialog.open)return;if(!data)body().innerHTML=`<h2 id="companion-title">No pudimos consultar la jornada</h2><p role="alert">${esc(error.message)}</p>`;else q('#companion-updated').textContent='No se pudo actualizar. Se conserva la última consulta de '+clock(serverTime)+' CDMX.';}
  finally{if(dialog.open)timeout=setTimeout(poll,30000);}
 }
 async function renderShare(){
  try{
   const response=await api('/api/state?round='+encodeURIComponent(roundId));if(!dialog.open)return;data=response.data;
   const model=selectionModel(data,userId);
   body().innerHTML=`<h2 id="companion-title">Compartir mi selección</h2><p class="selection-owner" id="selection-owner">${esc(model.name)}</p><p>Semana ${model.week} · ${model.season} · ${model.games.filter(g=>g.choice).length}/${model.games.length} elecciones guardadas</p>${dirty?'<p class="notice">Tienes cambios sin guardar. La descarga incluye tu selección guardada; tu borrador se conserva.</p>':''}${!model.complete?'<p class="notice">Tu selección está incompleta. Los partidos que faltan aparecerán como «Sin elección».</p>':''}${model.testMode?'<p class="notice">Selección de prueba. No participa en la bolsa.</p>':''}<label class="selection-format" for="selection-format">Formato<select id="selection-format"><option value="jpg">JPG cuadrado · para el grupo</option><option value="pdf">PDF · carta horizontal</option></select></label><div class="selection-preview-wrap"><img id="selection-preview" alt="Vista previa de mi selección guardada" hidden><p id="selection-status" role="status">Preparando tu selección…</p></div><div class="selection-buttons"><button type="button" class="primary-button" id="selection-download" disabled>Descargar JPG</button><button type="button" class="small-button" id="selection-share" hidden>Compartir archivo</button></div><p class="source-status" id="selection-help">Descarga el archivo y adjúntalo al grupo desde tu dispositivo.</p>`;
   const cache=new Map();let file;
   async function prepare(){
    const n=++version,format=q('#selection-format').value;q('#selection-download').disabled=true;q('#selection-share').hidden=true;q('#selection-status').hidden=false;q('#selection-status').textContent='Preparando tu selección…';
    try{
     if(!cache.has(format))cache.set(format,await selectionFile(model,format));if(!dialog.open||n!==version)return;file=cache.get(format);
     // A PDF preview uses the same composition, exposed as a JPEG page.
     let preview=file;
     if(format==='pdf'){const {selectionCanvas}=await import('./selection-export.mjs');const canvas=await selectionCanvas(model,'pdf');preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));}
     if(!dialog.open||n!==version)return;
     const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo preparar la vista previa.'));reader.readAsDataURL(preview);});
     if(!dialog.open||n!==version)return;
     q('#selection-preview').src=source;q('#selection-preview').hidden=false;
     q('#selection-status').hidden=true;q('#selection-download').textContent='Descargar '+(format==='pdf'?'PDF carta horizontal':'JPG cuadrado');q('#selection-download').disabled=false;
     const canShare=!!navigator.canShare?.({files:[file]});q('#selection-share').hidden=!canShare;
     q('#selection-help').textContent=canShare?'Comparte el archivo desde el menú de tu dispositivo o descárgalo para enviarlo al grupo.':'Descarga el archivo y adjúntalo al grupo desde tu dispositivo.';
    }catch(error){if(dialog.open&&n===version){q('#selection-status').hidden=false;q('#selection-status').textContent=error.message;}}
   }
   q('#selection-format').onchange=prepare;
   q('#selection-download').onclick=()=>{if(file)downloadFile(file);};
   q('#selection-share').onclick=async()=>{try{await navigator.share({files:[file],title:'Mi selección · La Quiniela Fiscalizada'});}catch(error){if(error.name!=='AbortError'){downloadFile(file);toast('Se descargó el archivo para que puedas adjuntarlo.');}}};
   await prepare();
  }catch(error){if(dialog.open)body().innerHTML=`<h2 id="companion-title">Compartir mi selección</h2><p role="alert">${esc(error.message)}</p>`;}
 }
 if(kind==='share')await renderShare();else await poll();
}
