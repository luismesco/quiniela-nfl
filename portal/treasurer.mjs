const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=n=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(100/n)+'%';
const colors=['#e8bd67','#db8584','#a8c4ad','#85abb4','#c1b0cc','#dbab81'];
let opened;
export function closeTreasurer(){opened?.close();}
export function treasurerCard(data){
 if(data.testMode)return '';
 const draw=data.treasurer;if(!draw)return '';
 const chosen=draw.winner,ready=draw.status==='ready';
 return `<section class="treasurer-card" aria-label="Tesorero de la semana"><img src="/assets/mascotas/ajolote-tesorero.png" width="155" height="170" alt="Ajolote tesorero con lentes y calculadora"><div><span class="section-kicker">LA ORGANIZACIÓN TAMBIÉN SE COMPARTE</span><h2>${chosen?`${esc(chosen.name)}<small>Tesorero de la semana ${data.week}</small>`:'¿Quién será el tesorero esta semana?'}</h2><p>${chosen?'El puesto corresponde al ganador de la ruleta entre quienes ganaron la jornada anterior.':'El puesto se rifa entre el ganador o los ganadores de la quiniela anterior.'} <strong>La misma probabilidad para todos.</strong></p><button type="button" class="small-button" data-treasurer aria-haspopup="dialog">${ready?'Ver video del sorteo':'Conocer la ruleta del tesorero'} <span aria-hidden="true">↗</span></button></div>${chosen?'<span class="treasurer-seal" aria-hidden="true">TESORERO<br>DE LA SEMANA</span>':''}</section>`;
}
function wheel(candidates,spinning=false){
 const n=candidates.length;if(!n)return '';
 const gradient=candidates.map((p,i)=>`${colors[i%colors.length]} ${i*100/n}% ${(i+1)*100/n}%`).join(',');
 return `<div class="treasurer-wheel-wrap" aria-hidden="true"><span class="treasurer-pointer"></span><div class="treasurer-wheel ${spinning?'is-spinning':''}" style="background:conic-gradient(${gradient})">${candidates.map((p,i)=>{const a=(i+.5)*2*Math.PI/n;return `<span class="wheel-name" style="left:${50+29*Math.sin(a)}%;top:${50-29*Math.cos(a)}%">${esc(p.name)}</span>`;}).join('')}<b>QF</b></div></div>`;
}
export async function openTreasurer({api,roundId,isAdmin,onUpdate,toast}){
 opened?.close();const previous=document.activeElement,dialog=document.createElement('dialog');opened=dialog;
 dialog.className='treasurer-dialog';dialog.setAttribute('aria-labelledby','treasurer-title');
 dialog.innerHTML='<div class="companion-top"><span class="tiny">LA QUINIELA FISCALIZADA</span><button type="button" class="icon-button" aria-label="Cerrar ruleta">×</button></div><div class="treasurer-body"><h2 id="treasurer-title">La ruleta del tesorero</h2><p role="status">Consultando la jornada…</p></div>';
 document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();
 let timer,busy=false,lastStatus;
 dialog.addEventListener('close',()=>{clearTimeout(timer);dialog.remove();if(opened===dialog)opened=null;previous?.focus();},{once:true});
 function render(d){
  const people=d.candidates||[],single=people.length===1,ready=d.status==='ready',processing=d.status==='rendering';
  const body=dialog.querySelector('.treasurer-body');
  body.innerHTML=`<div class="treasurer-heading"><img src="/assets/mascotas/ajolote-tesorero.png" width="100" height="115" alt=""><div><span class="section-kicker">SEMANA ${d.week} · ${d.season}</span><h2 id="treasurer-title">${ready?'Ya tenemos tesorero':'La ruleta del tesorero'}</h2></div></div>${d.status==='unavailable'?`<p class="notice" role="status">${esc(d.reason)}</p>`:`<p class="treasurer-rule">Participa el ganador o cada uno de los ganadores de la <strong>semana ${d.sourceRound.week}</strong>. ${single?'Hay un solo ganador: le corresponde el puesto con 100% de probabilidad.':`Una participación por persona y <strong>${percent(people.length)} de probabilidad para cada una</strong>.`}</p><div class="treasurer-stage">${ready?`<video id="treasurer-video" controls playsinline preload="metadata" poster="${esc(d.posterUrl)}" aria-label="Video del sorteo del tesorero de la semana ${d.week}"><source src="${esc(d.videoUrl)}" type="video/mp4"><p>Tu navegador no puede reproducir este video. <a href="${esc(d.videoUrl)}">Abrir video del sorteo</a>.</p></video>`:wheel(people,processing)}</div>${d.winner?`<div class="treasurer-result" role="status"><span>TESORERO DE LA SEMANA ${d.week}</span><strong>${esc(d.winner.name)}</strong><p>${single?'Ganador único de la quiniela anterior.':'Elegido entre los ganadores de la quiniela anterior.'}</p></div>`:''}<ul class="treasurer-candidates" aria-label="Participantes y probabilidades">${people.map((p,i)=>`<li><span class="candidate-dot" style="background:${colors[i%colors.length]}"></span><strong>${esc(p.name)}</strong><span>${percent(people.length)}</span></li>`).join('')}</ul><p class="treasurer-rule">${single?'Si hay un solo ganador, esa persona ocupa el puesto.':'Si hay empate en el primer lugar, todos los ganadores entran una vez, con segmentos iguales.'} Se elige un tesorero por semana. Recargar la página o volver a abrir el video conserva el resultado.</p><div class="treasurer-controls">${ready?`<a class="small-button" href="${esc(d.videoUrl)}" download="tesorero-semana-${d.week}.mp4">Descargar video</a>`:processing?'<p role="status">La ruleta está en curso. El video aparecerá aquí al terminar.</p>':isAdmin?`<button class="primary-button" id="draw-treasurer">${d.status==='error'?'Retomar el video del mismo resultado':single?'Asignar y grabar el anuncio':'Girar y grabar sorteo'}</button>`:'<p role="status">Luis iniciará el sorteo. Aquí podrás ver al tesorero y el video durante esta semana.</p>'}</div>${ready?`<p class="source-status">Sorteo del ${esc(new Date(d.drawnAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hour12:false}))} · CDMX</p>`:''}`}`;
  body.querySelector('#draw-treasurer')?.addEventListener('click',async e=>{
   if(busy)return;busy=true;e.currentTarget.disabled=true;
   try{const result=await api('/api/admin/treasurer/draw',{method:'POST',body:JSON.stringify({round:roundId})});if(!dialog.open)return;onUpdate(result);render(result);schedule();}
   catch(error){toast(error.message);if(dialog.open)e.target.disabled=false;}finally{busy=false;}
  });
  if(ready&&lastStatus==='rendering'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)body.querySelector('video')?.play().catch(()=>{});
  lastStatus=d.status;
 }
 function schedule(){clearTimeout(timer);if(dialog.open)timer=setTimeout(poll,2000);}
 async function poll(){
  try{const d=await api('/api/treasurer?round='+encodeURIComponent(roundId));if(!dialog.open)return;
   // No reconstruir el reproductor mientras alguien mira el video.
   if(d.status!==lastStatus||lastStatus===undefined){render(d);onUpdate(d);}
   if(d.status==='rendering'||d.status==='pending')schedule();
  }catch(error){if(!dialog.open)return;toast(error.message);schedule();}
 }
 await poll();
}
