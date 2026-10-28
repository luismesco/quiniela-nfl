const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=n=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(100/n)+'%';
let opened;
export function closeTreasurer(){opened?.close();}
function football(className=''){
 return `<svg class="${className}" viewBox="0 0 100 60" aria-hidden="true" focusable="false"><path d="M3 30Q23 1 50 4Q77 1 97 30Q77 59 50 56Q23 59 3 30Z" fill="#9d5838" stroke="#142b30" stroke-width="3"/><path d="M17 15Q24 30 17 45M83 15Q76 30 83 45" fill="none" stroke="#f7eedc" stroke-width="6"/><path d="M34 25H66M38 20V30M46 20V30M54 20V30M62 20V30" fill="none" stroke="#fff9e9" stroke-width="3" stroke-linecap="round"/><path d="M25 39Q49 51 73 39" fill="none" stroke="#653d30" stroke-width="2" opacity=".4"/></svg>`;
}
export function treasurerCard(data,action=''){
 if(data.testMode)return '';
 const draw=data.treasurer;if(!draw)return '';
 const chosen=draw.winner,ready=draw.status==='ready';
 return `<section class="treasurer-card" aria-label="Tesorero de la semana"><img src="/assets/mascotas/ajolote-tesorero.png" width="155" height="170" alt="Ajolote tesorero con lentes y calculadora"><div class="treasurer-card-copy"><span class="section-kicker">TESORERO DE LA SEMANA ${esc(data.week)}</span><h2>${chosen?esc(chosen.name):'¿A quién le toca esta semana?'}</h2><p>${chosen?'Elegido entre quienes ganaron la quiniela anterior.':'Un balón por cada ganador de la quiniela anterior en la tómbola.'} <strong>La misma probabilidad para todos.</strong></p><div class="treasurer-controls"><button type="button" class="small-button" data-treasurer aria-haspopup="dialog">${ready?'Ver video de la tómbola':'Conocer la tómbola'} <span aria-hidden="true">↗</span></button>${action}</div></div><div class="treasurer-ticket" aria-hidden="true">${football()}<span>SEMANA<strong>${esc(data.week)}</strong></span></div></section>`;
}
function tombola(candidates,mixing=false){
 const n=candidates.length;if(!n)return '';
 const columns=Math.min(5,Math.max(2,Math.ceil(Math.sqrt(n*1.7)))),rows=Math.ceil(n/columns),size=n>10?39:48;
 const balls=candidates.map((_,i)=>{
  const row=Math.floor(i/columns),column=i%columns,countInRow=Math.min(columns,n-row*columns),x=190+(column-(countInRow-1)/2)*(size+7)-size/2,y=169+(row-(rows-1)/2)*39-size*.3;
  return `<g transform="translate(${x} ${y}) rotate(${[-18,13,-8,22,-12][i%5]} ${size/2} ${size*.3})"><g class="tombola-ball" style="animation-delay:-${i*.23}s"><svg width="${size}" height="${size*.6}" viewBox="0 0 100 60">${football().replace(/^.*?<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg></g></g>`;
 }).join('');
 return `<div class="treasurer-tombola ${mixing?'is-mixing':''}" aria-hidden="true"><svg viewBox="0 40 380 300" focusable="false"><ellipse cx="190" cy="320" rx="142" ry="10" fill="#142b3010"/><path d="M83 210L66 303H100L120 217M260 217L280 303H314L295 210" fill="#234a4c" stroke="#142b30" stroke-width="4" stroke-linejoin="round"/><path d="M55 304H325" stroke="#142b30" stroke-width="9" stroke-linecap="round"/><path d="M321 158H347V190H360" fill="none" stroke="#b18b4c" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><rect x="345" y="181" width="24" height="18" rx="7" fill="#142b30"/><rect x="37" y="145" width="22" height="36" rx="7" fill="#142b30"/><rect x="321" y="145" width="15" height="36" rx="7" fill="#142b30"/><path d="M60 79Q190 47 320 79V230Q190 262 60 230Z" fill="#d9e6e366" stroke="#142b30" stroke-width="5"/><path d="M60 79Q190 111 320 79M60 230Q190 198 320 230" fill="none" stroke="#779d9980" stroke-width="3"/><path d="M95 79V237M285 79V237" stroke="#8eaba87d" stroke-width="3"/><path d="M76 108V196" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".7"/>${balls}<path d="M165 237H215V271H165Z" fill="#234a4c" stroke="#142b30" stroke-width="4"/><path d="M165 269L145 297H235L215 269" fill="#c7d6cc" stroke="#142b30" stroke-width="4" stroke-linejoin="round"/><path d="M176 251H204" stroke="#e5b961" stroke-width="4" stroke-linecap="round"/></svg><span>${mixing?'Mezclando los balones…':'Un balón por ganador'}</span></div>`;
}
export async function openTreasurer({api,roundId,isAdmin,onUpdate,toast}){
 opened?.close();const previous=document.activeElement,dialog=document.createElement('dialog');opened=dialog;
 dialog.className='treasurer-dialog';dialog.setAttribute('aria-labelledby','treasurer-title');
 dialog.innerHTML='<div class="companion-top"><span class="tiny">LA QUINIELA FISCALIZADA</span><button type="button" class="icon-button" aria-label="Cerrar tómbola">×</button></div><div class="treasurer-body"><h2 id="treasurer-title">La tómbola del tesorero</h2><p role="status">Consultando la jornada…</p></div>';
 document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();
 let timer,busy=false,lastStatus;
 dialog.addEventListener('close',()=>{clearTimeout(timer);dialog.remove();if(opened===dialog)opened=null;if(previous?.isConnected)previous.focus();},{once:true});
 function render(d){
  const people=d.candidates||[],single=people.length===1,ready=d.status==='ready',processing=d.status==='rendering';
  const body=dialog.querySelector('.treasurer-body');
  body.innerHTML=`<div class="treasurer-heading"><img src="/assets/mascotas/ajolote-tesorero.png" width="100" height="115" alt=""><div><span class="section-kicker">SEMANA ${esc(d.week)} · ${esc(d.season)}</span><h2 id="treasurer-title">${ready?'Ya tenemos tesorero':'La tómbola del tesorero'}</h2></div></div>${d.status==='unavailable'?`<p class="notice" role="status">${esc(d.reason)}</p>`:`<p class="treasurer-rule">Participa el ganador o cada uno de los ganadores de la <strong>semana ${esc(d.sourceRound?.week)}</strong>. ${single?'Hay un solo ganador: le corresponde el puesto con 100% de probabilidad.':`Un balón por persona y <strong>${percent(people.length)} de probabilidad para cada una</strong>.`}</p><div class="treasurer-stage">${ready?`<video id="treasurer-video" controls playsinline preload="metadata" poster="${esc(d.posterUrl)}" aria-label="Video del sorteo del tesorero de la semana ${esc(d.week)}"><source src="${esc(d.videoUrl)}" type="video/mp4"><p>Tu navegador no puede reproducir este video. <a href="${esc(d.videoUrl)}">Abrir video del sorteo</a>.</p></video>`:tombola(people,processing)}</div>${d.winner?`<div class="treasurer-result" role="status">${football('treasurer-result-ball')}<div><span>TESORERO DE LA SEMANA ${esc(d.week)}</span><strong>${esc(d.winner.name)}</strong><p>${single?'Ganador único de la quiniela anterior.':'El balón elegido lleva su nombre.'}</p></div></div>`:''}<ul class="treasurer-candidates" aria-label="Participantes y probabilidades">${people.map(p=>`<li>${football('candidate-ball')}<strong>${esc(p.name)}</strong><span>${percent(people.length)}</span></li>`).join('')}</ul><p class="treasurer-rule">${single?'Si hay un solo ganador, esa persona ocupa el puesto.':'Si hay empate en el primer lugar, entra un balón idéntico por cada ganador, con la misma probabilidad.'} Se elige un tesorero por semana. Recargar la página o volver a abrir el video conserva el resultado.</p><div class="treasurer-controls">${ready?`<a class="small-button" href="${esc(d.videoUrl)}" download="tesorero-semana-${esc(d.week)}.mp4">Descargar video</a>`:processing?'<p role="status">La tómbola está en curso. El video aparecerá aquí al terminar.</p>':isAdmin?`<button class="primary-button" id="draw-treasurer">${d.status==='error'?'Retomar el video del mismo resultado':single?'Asignar y grabar el anuncio':'Mezclar balones y grabar'}</button>`:'<p role="status">Luis iniciará el sorteo. Aquí podrás ver al tesorero y el video durante esta semana.</p>'}</div>${ready?`<p class="source-status">Sorteo del ${esc(new Date(d.drawnAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hour12:false}))} · CDMX</p>`:''}`}`;
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
