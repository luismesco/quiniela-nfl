import {compactEnabled,previewEnabled,compactTools,previewBar,openPreviewMenu,closePreviewMenu,openRegistrationConfirmation,closeRegistrationConfirmation} from './compact-preview.mjs';
import {contributionsAction,openContributions,closeContributions} from './contributions.mjs';
import {teamStatsAction,openTeamStats,closeTeamStats} from './team-stats.mjs';
import {treasurerCard,openTreasurer,closeTreasurer} from './treasurer.mjs';
import {summary,standings,score,outcome,winner} from '/core.mjs';
import {raceView} from '/race.mjs';
import {calendarView,standingsView} from '/league.mjs';
import {icon,hydrateIcons} from '/icons.mjs';
import {companionActions,openCompanion,closeCompanion} from './companion.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(n);
const initials=n=>n.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const fmt=(s,opt={})=>s?new Date(s).toLocaleString('es-MX',{timeZone:'America/Mexico_City',...opt}):'Por confirmar';
const day=s=>fmt(s,{weekday:'long',day:'numeric',month:'long'});
const hour=s=>fmt(s,{hour:'2-digit',minute:'2-digit',hour12:false});
let auth=null,csrf='',bundle=null,data=null,view='picks',round=null,draft={},dirty=false,timer=null,requesting=false,conference='all',calendar={phase:'REG',week:'all',team:'all'},toastTimer=null,deadlineTimer=null,serverClock=null;
let activeGame=null;
let modeChanging=false,loadEpoch=0,loadPromise=null;
let adminSandbox=sessionStorage.getItem('qf-admin-sandbox')==='prueba';
const modeUrl=path=>adminSandbox?path+(path.includes('?')?'&':'?')+'mode=prueba':path;
function closeTools(){closeRegistrationConfirmation();closePreviewMenu();closeCompanion();closeTreasurer();closeContributions();closeTeamStats();if($('#detail').open)$('#detail').close();}

let boardLayout=matchMedia('(min-width:1100px)').matches?'matrix':'cards';
const user=()=>auth?.user||bundle?.user;
const compact=()=>compactEnabled(user());
const isLayoutPreview=()=>previewEnabled(user(),location.search);
const me=()=>data.participants.find(p=>p.id===user().id);
const logo=t=>t==='TIE'?'/assets/empate.svg':`/assets/teams/${encodeURIComponent(t)}.svg`;
const name=t=>t==='TIE'?'Empate':data.teams[t]?.name||t;
const img=t=>`<img src="${logo(t)}" alt="${esc(name(t))}">`;
const paid=p=>p.paid===true?'<img class="paid-axolotl" src="/assets/mascotas/ajolote.png" alt="Aportación confirmada" title="Aportación confirmada" width="18" height="20">':'';
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
async function api(path,options={}){
 const responseEpoch=loadEpoch;
 const writes=options.method&& !['GET','HEAD'].includes(options.method.toUpperCase());
 const controller=path==='/api/admin/sandbox';
 if(writes&&!controller&&(modeChanging||(data&&!!data.adminSandbox!==adminSandbox)))throw Error('Espera a que se cargue el modo seleccionado antes de guardar cambios.');
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...(adminSandbox?{'X-QF-Mode':'prueba'}:{}),...options.headers}});
 const result=await response.json();
 if(responseEpoch!==loadEpoch)throw Error('La vista cambió; se descartó la respuesta anterior.');
 if(response.status===401){auth=null;showLogin();throw Error('Inicia sesión para continuar.');}
 if(!response.ok)throw Error(result.error||'No pudimos completar la solicitud.');return result;
}
function showLogin(message=''){
 closeTools();$('#portal').classList.remove('compact-preview');adminSandbox=false;data=null;bundle=null;sessionStorage.removeItem('qf-admin-sandbox');
 clearTimeout(timer);$('#portal').hidden=true;$('#entry').hidden=false;
 $('#entry-body').innerHTML=`<span class="section-kicker">TU ACCESO AL GRUPO</span><h2>Vamos a la jornada.</h2><p>Usa los datos de tu tarjeta para entrar.</p><form id="login-form"><label for="username">Usuario<input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="80"></label><label for="password">Contraseña<input type="password" id="password" name="password" autocomplete="current-password" required maxlength="72"></label><button class="primary-button full" type="submit">Entrar a mi quiniela <span aria-hidden="true">↗</span></button><p class="form-error" id="login-error" role="alert" ${message?'':'hidden'}>${esc(message)}</p></form><small>Si necesitas recuperar tu acceso, pide a Luis una contraseña temporal nueva.</small>`;
 $('#username').value=new URL(location.href).searchParams.get('usuario')||'';
 $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const response=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#username').value,password:$('#password').value})});const result=await response.json();if(!response.ok)throw Error(result.error);auth=result;csrf=result.csrf;if(result.user.mustChange)showChange(true);else await enter();}catch(error){$('#login-error').hidden=false;$('#login-error').textContent=error.message;}finally{button.disabled=false;}});
}
function passwordFields(){return `<label class="form-field">Contraseña actual<input type="password" name="current" autocomplete="current-password" required maxlength="72"></label><label class="form-field">Tu nueva contraseña<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="72" required></label><label class="form-field">Repite tu nueva contraseña<input type="password" name="repeat" autocomplete="new-password" minlength="10" maxlength="72" required></label>`;}
function showChange(first){
 $('#portal').hidden=true;$('#entry').hidden=false;$('#entry-body').innerHTML=`<span class="section-kicker">HOLA, ${esc(user().name.toUpperCase())}</span><h2>Haz tuyo el acceso.</h2><p>La contraseña de tu tarjeta es temporal. Elige una personal de al menos 10 caracteres.</p><form id="first-password">${passwordFields()}<button class="primary-button full">Guardar y entrar</button><p class="form-error" id="password-error" hidden role="alert"></p></form><button class="text-button" id="entry-logout">Cerrar sesión</button>`;
 $('#first-password').addEventListener('submit',e=>changePassword(e,true));$('#entry-logout').onclick=logout;
}
async function changePassword(e,first=false){
 e.preventDefault();const f=e.target,values=Object.fromEntries(new FormData(f));const error=f.querySelector('[role=alert]');
 try{if(values.password!==values.repeat)throw Error('Las contraseñas nuevas no coinciden.');f.querySelector('button').disabled=true;const result=await api('/api/password',{method:'POST',body:JSON.stringify(values)});csrf=result.csrf;auth=await api('/api/me');auth.user.mustChange=false;toast(adminSandbox?'Contraseña cambiada sólo en la prueba.':'Tu contraseña personal está lista.');if(first)await enter();else f.reset();}
 catch(exc){error.hidden=false;error.textContent=exc.message;}finally{f.querySelector('button').disabled=false;}
}
async function logout(){if(dirty&&!confirm('Tienes elecciones sin guardar. ¿Quieres cerrar sesión?'))return;if(adminSandbox){await switchSandbox('exit');return;}try{await api('/api/logout',{method:'POST',body:'{}'});}catch{}auth=null;csrf='';dirty=false;bundle=null;serverClock=null;clearTimeout(deadlineTimer);showLogin();}
async function enter(){
 $('#entry').hidden=true;$('#portal').hidden=false;if(isLayoutPreview()&&!adminSandbox)await switchSandbox('start');else await load(true);
}
function nav(){
 const links=[['picks','ball','Mi quiniela'],['board','grid','El grupo'],['ranking','trophy','Clasificación'],['calendar','calendar','Calendario NFL'],['standings','chart','Posiciones NFL'],['feedback','info','Ayuda y comentarios']].filter(x=>user().role!=='test'||['picks','calendar','standings','feedback'].includes(x[0]));
 if(user().role==='admin')links.push(['admin','grid','Administración']);
 $('#desktop-nav').innerHTML=links.map(([v,i,text])=>`<button class="nav ${view===v?'active':''}" data-view="${v}">${icon(i)}<span>${text}</span>${v==='admin'&&bundle.unread?`<b class="count">${bundle.unread}</b>`:''}</button>`).join('');
 $('#mobile-nav').innerHTML=links.filter(x=>['picks','board','ranking','calendar','feedback'].includes(x[0])).map(([v,i,text])=>`<button class="${view===v?'active':''}" data-view="${v}" aria-current="${view===v?'page':'false'}">${icon(i)}<span>${{picks:'Mi quiniela',board:'El grupo',ranking:'Ranking',calendar:'Calendario',feedback:'Comentarios'}[v]}</span></button>`).join('');
 $('#account-link').innerHTML=esc(user().name)+(user().role==='admin'&&bundle.unread?` · ${bundle.unread} ✉`:'');$('#my-avatar').textContent=initials(user().name);$('#my-name').innerHTML=`${esc(user().name)}<small>${user().role==='admin'?'Administración y participante':user().role==='test'?'Cuenta de prueba':'Participante'}</small>`;
 if(compact())$('#mobile-nav').innerHTML=$('#mobile-nav').innerHTML.replace(/<button[^>]*data-view="feedback"[\s\S]*?<\/button>/,'<button type="button" data-preview-more>'+icon('grid')+'<span>Más</span></button>');
 $('#view-label').textContent=links.find(x=>x[0]===view)?.[2]||'Mi cuenta';
}
function roundTitle(r){return `${r.phase==='POST'?'Playoffs · ronda':'Semana'} ${r.week} · ${r.season}`;}
function header(){
 const s=summary(data),own=score(me(),data.games),dates=data.games.map(g=>g.start).filter(Boolean).sort();
 $('#round-select').innerHTML=bundle.rounds.map(r=>`<option value="${esc(r.id)}" ${data.roundId===r.id?'selected':''}>${esc(roundTitle(r))}</option>`).join('');
 $('#greeting').textContent=`HOLA, ${user().name.toUpperCase()}. ESTA ES TU JORNADA.`;
 $('#page-title').innerHTML=`${data.phase==='POST'?'Playoffs':'Semana'} <span>${String(data.week).padStart(2,'0')}.</span>`;
 $('#hero-text').textContent=s.settled?'Así terminó la carrera por la bolsa.':own.complete?(data.captureClosed?'Tu quiniela está completa. El plazo de cambios ya cerró.':'Tu quiniela está completa. Puedes ajustarla antes del cierre de la jornada.'):'Una semana de fútbol. Tus elecciones, en un solo lugar.';
 $('#round-dates').textContent=dates.length?`${fmt(dates[0],{day:'numeric',month:'short'})} — ${fmt(dates.at(-1),{day:'numeric',month:'short'})} · CDMX`:'';
 $('#round-status').textContent=s.settled?'JORNADA FINALIZADA':s.live?'EN JUEGO':`${own.submitted}/${data.games.length} ELECCIONES GUARDADAS`;
 $('#pot-amount').innerHTML=`${money(s.expectedPot)}<small>MXN</small>`;$('#pot-detail').textContent=`${s.complete} quiniela${s.complete===1?' completa':'s completas'} × $${data.fee}`;
 $('.pot-bottom strong').textContent=money(data.fee);
 const monitor=bundle.league?.fetchedAt;$('#source-time').textContent=monitor?`Liga · ${hour(monitor)} CDMX`:'Últimos datos disponibles';
 $('#live-dot').className='sync-dot '+(s.live?'ok':'');
 if(data.testMode){$('#hero-text').textContent='Cuenta de prueba. Tus elecciones se guardan por separado y no participan en la bolsa.';$('#pot-detail').textContent='Sin aportación · fuera de competencia';$('#my-name').innerHTML=`${esc(user().name)}<small>Cuenta de prueba</small>`;}
}
async function load(force=false){
 if(requesting)return force?loadPromise:false;
 if(dirty&&!force)return false;
 requesting=true;const epoch=loadEpoch;
 loadPromise=(async()=>{
  try{const next=await api('/api/state'+(round?'?round='+encodeURIComponent(round):''));if(epoch!==loadEpoch)return false;
   if(!!next.data.adminSandbox!==adminSandbox)throw Error('El modo solicitado no coincide con la jornada. Vuelve a cargar.');
   bundle=next;data=bundle.data;serverClock={epoch:Date.parse(bundle.serverTime),tick:performance.now()};scheduleCaptureClose();auth.user=bundle.user;csrf=bundle.csrf;round=data.roundId;calendar.week=calendar.week==='all'?String(data.week):calendar.week;if(!dirty)draft={...me().choices};nav();header();await render();if($('#detail').open&&activeGame){if(data.games.some(g=>g.id===activeGame))gameDetail(activeGame);else $('#detail').close();}return true;
  }catch(e){toast(e.message);return false;}finally{requesting=false;clearTimeout(timer);if(auth?.user&&!auth.user.mustChange&&!modeChanging)timer=setTimeout(()=>load(),data?.games.some(g=>g.status==='live')?30000:300000);}
 })();return loadPromise;
}

function heading(kicker,title,text,action=''){return `<div class="section-heading"><div><span class="section-kicker">${kicker}</span><h2>${title}</h2><p>${text}</p></div>${action}</div>`;}
function progress(){const total=Object.keys(draft).length;return `<div class="picks-progress"><strong id="pick-count">${total}/${data.games.length} elecciones</strong><div class="progress" aria-hidden="true"><i id="pick-progress" style="width:${total/Math.max(1,data.games.length)*100}%"></i></div><span>Visitante, local o empate.</span></div>`;}
function captureIsClosed(){
 const deadline=Date.parse(data?.deadline||'');
 const now=serverClock?serverClock.epoch+performance.now()-serverClock.tick:NaN;
 return !!data?.captureClosed||!Number.isFinite(deadline)||!Number.isFinite(now)||now>=deadline;
}
function captureNotice(){
 if(data.testMode)return '';
 if(!data.deadline)return '<p class="capture-deadline">La captura de esta jornada aún no está habilitada.</p>';
 const closes=`<time datetime="${esc(data.deadline)}">${esc(fmt(data.deadline,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hour12:false}))} · CDMX</time>`;
 if(captureIsClosed())return `<p class="capture-deadline" role="status">El plazo de esta jornada ya cerró: ${closes}. Tus elecciones guardadas se conservan.</p>`;
 const saved=data.games.filter(g=>Object.hasOwn(me().choices,g.id)).length,missing=Math.max(0,data.games.length-saved);
 if(!missing)return `<p class="capture-deadline">Quiniela registrada. Cierre: ${closes}.</p>`;
 const art=hour(data.deadline)==='18:00'?'/assets/mascotas/ajolote-reloj-1800.png':'/assets/mascotas/ajolote.png';
 const title=saved===0?'Aún no has registrado tu quiniela':`Te ${missing===1?'falta 1 elección':'faltan '+missing+' elecciones'}`;
 return `<section class="capture-reminder" aria-labelledby="capture-reminder-title"><img src="${art}" width="160" height="180" alt="" aria-hidden="true"><div><span class="section-kicker">TU QUINIELA, A TIEMPO</span><h3 id="capture-reminder-title">${title}</h3><p>Guarda tus elecciones antes del cierre: ${closes}.</p><a class="capture-reminder-link" href="#picks-form">${saved?'Completar mi quiniela':'Elegir y guardar mi quiniela'}</a></div></section>`;
}
function scheduleCaptureClose(){
 clearTimeout(deadlineTimer);
 if(data.testMode||data.captureClosed||!data.deadline||!serverClock)return;
 const delay=Date.parse(data.deadline)-(serverClock.epoch+performance.now()-serverClock.tick);
 if(!Number.isFinite(delay))return;
 deadlineTimer=setTimeout(()=>{if(captureIsClosed()){data.captureClosed=true;data.games.forEach(g=>g.locked=true);header();if(view==='picks')render();}else scheduleCaptureClose();},Math.min(2147483647,Math.max(0,delay)));
}
function picksView(){
 const closed=!data.testMode&&captureIsClosed();if(closed)data.games.forEach(g=>g.locked=true);
 let previous='';const cards=data.games.map(g=>{const date=day(g.start),dateHeading=date!==previous?`<h3 class="day-heading">${esc(date)}</h3>`:'';previous=date;return `${dateHeading}<article class="choose-game ${g.locked?'locked':''}"><div class="choose-meta"><span>${esc(hour(g.start))} CDMX · ${esc(g.venue||'Sede por confirmar')}</span><span>${g.status==='final'?'FINAL':g.locked?'CERRADO':'POR JUGAR'}</span></div><fieldset ${g.locked?'disabled':''}><legend>${esc(g.away)} <span aria-label="contra">vs</span> ${esc(g.home)}</legend><div class="choose-options">${[g.away,'TIE',g.home].map(t=>`<label class="choose-option ${t==='TIE'?'tie-option':''}"><input type="radio" name="${esc(g.id)}" value="${t}" ${draft[g.id]===t?'checked':''} ${g.locked?'disabled':''}>${t==='TIE'?'<span class="tie-glyph" aria-hidden="true">=</span>':img(t)}<strong>${t==='TIE'?'Empate':esc(data.teams[t]?.nick||t)}</strong>${t==='TIE'?'':`<small>${t===g.away?'VISITANTE':'LOCAL'}</small>`}</label>`).join('')}</div></fieldset><button type="button" class="text-button team-matchup-stats" data-team-stats-away="${esc(g.away)}" data-team-stats-home="${esc(g.home)}" aria-haspopup="dialog">Ver estadísticas de estos equipos ↗</button><div class="choose-foot"><span>${g.status==='final'?`Marcador ${g.awayScore} – ${g.homeScore}`:g.locked?'Elección cerrada':`Cierra ${hour(g.closesAt)} · CDMX`}</span><span>${draft[g.id]?'Elegiste '+esc(name(draft[g.id])):'Por elegir'}</span></div>${data.testMode?'':`<button type="button" class="text-button game-choices-link" data-game="${esc(g.id)}" aria-haspopup="dialog">Ver elecciones del grupo</button>`}</article>`;}).join('');
 return heading('TU LUGAR EN EL JUEGO','Mi quiniela',compact()?'Elige visitante, local o empate. Luego guarda.':`Selecciona una opción en cada partido y guarda. ${data.testMode?'Prueba aislada: cierre por inicio de cada partido; no participa en competencia.':data.deadline?'El cierre es '+fmt(data.deadline,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hour12:false})+' · CDMX.':'La captura de esta jornada aún no está habilitada.'} Si un partido comienza antes, su elección cierra al iniciar.`)+(compact()?'':teamStatsAction(data))+captureNotice()+progress()+`<form id="picks-form"><div class="choose-grid">${cards}</div><div class="save-bar"><div><p id="save-label">${dirty?'Tienes cambios sin guardar':'Tus elecciones guardadas están al día'}</p><small id="save-detail">${data.games.some(g=>!g.locked)?'Puedes guardar aunque todavía te falten partidos.':'Las elecciones de esta jornada están cerradas.'}</small></div><button id="save-picks" type="submit" ${dirty&&!closed?'':'disabled'}>${closed?'Captura cerrada':'Guardar elecciones'}</button></div><p class="source-status">Los partidos sin elección quedan fuera del registro completo. El reloj de cierre se valida al guardar.</p></form>`;
}
function pickTag(p,g){const selected=p.choices[g.id],status=outcome(p,g),label={hit:'Acierto',miss:'Fallo',pending:'Por jugar',empty:'Sin elección'}[status];return `<span class="portal-pick ${status}" title="${esc(g.away+' vs '+g.home+': '+(selected?name(selected):'Sin elección')+' · '+label)}">${selected?img(selected):'—'}${status==='hit'?'<b aria-hidden="true">✓</b>':status==='miss'?'<b aria-hidden="true">×</b>':''}<span class="sr-only">${label}</span></span>`;}
function gameChoices(){
 if(data.testMode)return '';
 return `<section class="group-games" aria-labelledby="group-games-title"><h3 id="group-games-title">Elecciones por partido</h3><div class="group-games-grid">${data.games.map(g=>{const count=data.participants.filter(p=>p.choices[g.id]).length;return `<button type="button" class="group-game-button" data-game="${esc(g.id)}" aria-haspopup="dialog" aria-label="Ver elecciones de ${esc(name(g.away)+' contra '+name(g.home))}"><span class="group-game-teams">${img(g.away)}<strong>${esc(data.teams[g.away]?.nick||g.away)} <small>vs</small> ${esc(data.teams[g.home]?.nick||g.home)}</strong>${img(g.home)}</span><small>${count} ${count===1?'elección guardada':'elecciones guardadas'} · Ver nombres</small></button>`;}).join('')}</div></section>`;
}
function gameDetail(id){
 if(data.testMode)return;
 const game=data.games.find(g=>g.id===id);if(!game)return;
 activeGame=id;
 const groups=[{key:game.away,label:name(game.away),kind:'Visitante'},{key:game.home,label:name(game.home),kind:'Local'},{key:'TIE',label:'Empate',kind:'TIE'},{key:null,label:'Sin elección',kind:'Por registrar'}];
 $('#detail-body').innerHTML=`<h2 id="detail-title" class="detail-title">${esc(data.teams[game.away]?.nick||game.away)} vs ${esc(data.teams[game.home]?.nick||game.home)}</h2><p class="detail-meta">${esc(roundTitle(data))} · ${esc(day(game.start))} · ${esc(hour(game.start))} CDMX</p><p class="game-choices-note">Elecciones guardadas del grupo. Los borradores sin guardar no aparecen.</p><div class="game-choice-groups">${groups.map(group=>{const people=data.participants.filter(p=>(p.choices[game.id]||null)===group.key).sort((a,b)=>a.name.localeCompare(b.name,'es'));return `<section class="game-choice-group" data-choice="${esc(group.key||'none')}" aria-label="${esc(group.label)}"><div class="game-choice-heading">${group.key?img(group.key):'<span class="no-choice-symbol" aria-hidden="true">—</span>'}<div><small>${esc(group.kind)}</small><h3>${esc(group.label)}</h3></div><strong class="game-choice-count">${people.length}</strong></div>${people.length?`<ul class="game-voters">${people.map(p=>`<li>${esc(p.name)}</li>`).join('')}</ul>`:'<p class="game-voters-empty">'+(group.key?'Nadie eligió esta opción.':'Todos tienen una elección guardada.')+'</p>'}</section>`;}).join('')}</div>`;
 if(!$('#detail').open)$('#detail').showModal();
}
function comparisonTable(rows){
 const result=g=>g.status==='final'?`${g.awayScore} – ${g.homeScore} · ${winner(g)==='TIE'?'Empate final':'Final'}`:g.status==='live'?`${g.awayScore} – ${g.homeScore} · En juego`:{postponed:'Aplazado',suspended:'Suspendido',canceled:'Cancelado'}[g.status]||hour(g.start)+' CDMX';
 return `<div id="group-comparison" class="portal-comparison" ${boardLayout==='matrix'?'':'hidden'} role="region" aria-label="Comparar elecciones; desliza horizontalmente para ver todos los partidos" tabindex="0"><table class="portal-matrix"><caption>${esc(roundTitle(data))} · Elecciones guardadas del grupo</caption><thead><tr><th scope="col" class="comparison-person">Participante</th><th scope="col">Aciertos</th><th scope="col"><abbr title="Aciertos actuales más elecciones que aún pueden acertar">Máximo</abbr></th>${data.games.map(g=>`<th scope="col" class="comparison-game"><button type="button" data-game="${esc(g.id)}" aria-haspopup="dialog" aria-label="Ver elecciones de ${esc(name(g.away)+' contra '+name(g.home))}"><time datetime="${esc(g.start)}">${esc(day(g.start))}</time><span class="comparison-teams">${img(g.away)}<small aria-hidden="true">vs</small>${img(g.home)}</span><span class="comparison-result">${esc(result(g))}</span></button></th>`).join('')}</tr></thead><tbody>${rows.map(p=>`<tr data-person-id="${esc(p.id)}"><th scope="row" class="comparison-person"><button type="button" data-person="${esc(p.id)}" aria-haspopup="dialog"><strong>${esc(p.name)} ${paid(p)}</strong><small>${p.submitted}/${data.games.length} elecciones</small></button></th><td data-stat="correct">${p.correct}</td><td data-stat="max">${p.max}</td>${data.games.map(g=>`<td data-game-id="${esc(g.id)}" data-choice="${esc(p.choices[g.id]||'')}">${pickTag(p,g)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${data.games.length+3}">Todavía no hay participantes en esta jornada.</td></tr>`}</tbody></table></div>`;
}
function boardView(){
 const rows=standings(data);
 return heading('LA JORNADA, ENTRE TODOS','El grupo','Compara las elecciones en filas, o abre un partido o un nombre para ver su detalle.')+`<div class="comparison-controls"><span>${rows.length} participantes · ${data.games.length} partidos</span><div class="comparison-switch" role="group" aria-label="Forma de visualizar las elecciones">${[['cards','Personas','group-people'],['matrix','Comparar','group-comparison']].map(([key,label,id])=>`<button type="button" data-board-layout="${key}" aria-controls="${id}" aria-pressed="${boardLayout===key}">${label}</button>`).join('')}</div></div><div id="group-people" class="portal-board" ${boardLayout==='cards'?'':'hidden'}>${rows.map(p=>`<button class="portal-person" data-person="${esc(p.id)}"><span class="portal-person-top"><span class="avatar">${esc(initials(p.name))}</span><span class="person-names"><strong>${esc(p.name)} ${paid(p)}</strong><small>${p.submitted}/${data.games.length} elecciones · ${p.complete?'Completa':'Por completar'}</small></span><span class="score-number">${p.correct}<small> aciertos</small></span></span><span class="portal-picks">${data.games.map(g=>pickTag(p,g)).join('')}</span></button>`).join('')}</div>`+comparisonTable(rows)+`<p class="comparison-legend" ${boardLayout==='matrix'?'':'hidden'}>✓ Acierto · × Fallo · Sin marca: por jugar · — Sin elección. Los aciertos se confirman al finalizar. Desliza la tabla para ver todos los partidos.</p>`+gameChoices();
}
function rankingView(){const s=summary(data);return heading('LA CARRERA POR LA BOLSA','La clasificación','Los aciertos se confirman al terminar cada partido. Los empates en aciertos comparten puesto.')+raceView(data,bundle.history)+`<div class="portal-rank">${standings(data).map(p=>`<div class="portal-rank-row ${p.rank===1?'top':''}"><span class="rank-num">${p.rank??'—'}</span><span class="avatar">${esc(initials(p.name))}</span><div class="portal-rank-name"><strong>${esc(p.name)} ${paid(p)}</strong><small>${p.complete?'Quiniela completa':p.submitted+'/'+data.games.length+' elecciones · por completar'} · máximo ${p.max}</small></div><span class="score-number">${p.correct}</span></div>`).join('')}</div>${s.settled&&s.leader?`<div class="notice" style="margin-top:1rem">La bolsa prevista se reparte entre ${esc(s.leader.names.join(', '))}: <strong>${money(s.expectedPot/s.leader.names.length)} por persona</strong>, sujeta a liquidación de aportaciones.</div>`:''}`;}
function gamesView(){return calendarView(bundle.league,calendar,data.teams,data.games);}
async function feedbackView(){const {items}=await api('/api/feedback');return heading('TE ESCUCHAMOS','Errores, comentarios y sugerencias','Reporta un problema o comparte una idea. Tu mensaje llega al buzón privado de Luis, administrador. Aquí podrás consultar su respuesta.')+`<div class="feedback-grid"><form id="feedback-form" class="form-panel"><h3>Escribe a Luis</h3><label class="form-field">Asunto<input name="title" required minlength="3" maxlength="100" placeholder="¿Qué podemos mejorar?"></label><label class="form-field">Tu comentario<textarea name="body" required minlength="5" maxlength="3000" placeholder="Describe el error, tu comentario o sugerencia. Si es un problema, indica qué estabas haciendo."></textarea></label><button class="primary-button">Enviar a Luis</button><p role="alert" class="form-error" hidden></p></form><section><h3 class="day-heading">Tus mensajes</h3>${items.length?items.map(f=>feedbackCard(f,false)).join(''):'<div class="empty-box">Tus mensajes y respuestas aparecerán aquí.</div>'}</section></div>`;}
function feedbackCard(f,isAdmin){return `<article class="feedback-item"><small>${esc(isAdmin?f.name+' · ':'')}${esc(fmt(f.created_at,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))} · ${{new:'Recibido',read:'Leído',resolved:'Atendido'}[f.status]||esc(f.status)}</small><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p>${f.reply?`<div class="feedback-reply"><strong>LUIS RESPONDIÓ</strong><p>${esc(f.reply)}</p></div>`:''}${isAdmin?`<form class="reply-form" data-id="${f.id}"><label class="form-field">Respuesta<textarea name="reply" maxlength="3000">${esc(f.reply||'')}</textarea></label><button class="small-button" name="status" value="read">Marcar leído y responder</button><button class="small-button" name="status" value="resolved">Marcar atendido</button></form>`:''}</article>`;}
async function adminView(){
 const a=await api('/api/admin');const s=summary(data);
 return heading('TU MESA DE ORGANIZACIÓN','Administración','Aportaciones de la jornada, accesos individuales y mensajes privados del grupo.')+`<div class="notice"><strong>${money(s.received)} confirmados</strong> de ${money(s.expectedPot)} previstos en esta jornada. Los pagos no confirmados se mantienen sin suponer recepción.</div><div class="admin-actions"><a class="primary-button" href="${modeUrl('/api/admin/backup')}">Descargar respaldo de la base</a><button class="small-button" data-view="account">Mi contraseña</button></div><section class="admin-section"><h3>Participantes · ${roundTitle(data)}</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>NOMBRE</th><th>USUARIO</th><th>ELECCIONES</th><th>APORTACIÓN</th><th>ACCESO</th></tr></thead><tbody>${a.users.map(u=>{const p=data.participants.find(p=>p.id===u.id);return `<tr><td>${esc(u.name)} ${paid(p)}</td><td>${esc(u.username)}</td><td>${Object.keys(p.choices).length}/${data.games.length}</td><td><select data-payment="${esc(u.id)}" aria-label="Aportación de ${esc(u.name)}">${[['unknown','Sin confirmar'],['true','Confirmada'],['false','Pendiente']].map(([v,n])=>`<option value="${v}" ${String(p.paid??'unknown')===v?'selected':''}>${n}</option>`).join('')}</select></td><td>${u.id!==user().id?`<button class="small-button" data-reset="${esc(u.id)}">Nuevo acceso</button>`:'Administrador'}<small> ${u.mustChange?'Clave temporal':'Clave personal'}</small></td></tr>`;}).join('')}</tbody></table></div><div id="reset-output" hidden></div></section><section class="admin-section"><h3>Buzón privado <small>· ${a.feedback.filter(f=>f.status==='new').length} nuevos</small></h3>${a.feedback.length?a.feedback.map(f=>feedbackCard(f,true)).join(''):'<div class="empty-box">Los comentarios del grupo llegarán aquí.</div>'}</section><p class="source-status">Última consulta de la liga: ${a.monitor.checkedAt?esc(fmt(a.monitor.checkedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):'Por consultar'} · ${a.monitor.active?'Seguimiento en juego':'Fuera de ventana de partidos'}</p>`;
}
function accountView(){return heading('TU ACCESO PERSONAL','Mi cuenta','Tu contraseña personal sustituye a la temporal de la tarjeta.')+`<div class="account-grid"><form id="account-password" class="form-panel"><h3>Cambiar contraseña</h3>${passwordFields()}<button class="primary-button">Guardar contraseña</button><p role="alert" class="form-error" hidden></p></form><div class="form-panel"><span class="section-kicker">${user().role==='admin'?'ADMINISTRACIÓN':'PARTICIPANTE'}</span><h3>${esc(user().name)}</h3><p>Usuario: <strong>${esc(user().username)}</strong></p><div class="admin-actions">${user().role==='admin'?'<button class="primary-button" data-view="admin">Abrir administración</button>':''}<button class="small-button" data-view="standings">Posiciones de la NFL</button><button class="small-button" data-view="rules">Reglas del grupo</button><button class="small-button" id="account-logout">Cerrar sesión</button></div></div></div>`;}
function rulesView(){return heading('LA DINÁMICA DEL GRUPO','Así jugamos','Una quiniela semanal para acompañar la NFL.')+`<div class="rules-grid">${[['01','Tu elección, tu cuenta','Cada partido admite visitante, local o empate. Guarda las elecciones desde tu cuenta.'],['02','El cierre de la jornada','Puedes cambiar tus elecciones hasta la fecha y hora de cierre mostradas en Mi quiniela, hora de la Ciudad de México. Si un encuentro comienza antes, su elección cierra al iniciar. A la hora límite ya no se admiten cambios.'],['03','La aportación es de $50','El tesorero de la semana y Luis registran las aportaciones confirmadas. El ajolote pequeño indica confirmación del pago de esa semana.'],['04','Los finales dan aciertos','Un acierto por resultado correcto. Si el partido termina empatado, sólo acierta quien eligió empate.'],['05','La bolsa se comparte si hay empate','Ganan las quinielas completas con más aciertos. Quienes empatan en el primer lugar se reparten la bolsa.'],['06','Un lugar para tus comentarios','Envía sugerencias desde el botón de comentarios. El mensaje llega al buzón privado de Luis.']].map(([n,t,p])=>`<article class="rule-card"><span>${n}</span><h3>${t}</h3><p>${p}</p></article>`).join('')}</div>`;}
async function render(){
 nav();let content;
 if(view==='picks')content=picksView();else if(view==='board')content=boardView();else if(view==='ranking')content=rankingView();else if(view==='calendar')content=gamesView();else if(view==='standings')content=standingsView(bundle.league,conference,data.teams);else if(view==='feedback')content=await feedbackView();else if(view==='admin'&&user().role==='admin')content=await adminView();else if(view==='rules')content=rulesView();else content=accountView();
 $('#portal').classList.toggle('compact-preview',compact());
 const regular=()=>adminTestBar()+(data.testMode?'<div class="notice" role="status"><strong>Modo de prueba</strong> · Prueba aislada: cierre por inicio de cada partido; no participa en competencia. Tus elecciones se guardan por separado y no afectan al grupo, la clasificación ni la bolsa.</div>':'')+(['picks','board','ranking'].includes(view)?(data.treasurer?treasurerCard(data,contributionsAction(data)):contributionsAction(data))+companionActions(data):'')+content;
 $('#workspace').innerHTML=compact()?(isLayoutPreview()?previewBar(data):'')+(data.adminSandbox?'<details class="compact-sandbox-controls"><summary>Controles de prueba · datos separados</summary>'+adminTestBar()+'</details>':adminTestBar())+(data.testMode?'<div class="notice" role="status"><strong>Cuenta de prueba</strong> · Tus elecciones no participan en el grupo ni en la bolsa.</div>':'')+`<div class="compact-layout ${['picks','board','ranking'].includes(view)?'has-tools':''}"><section class="compact-primary" aria-label="${esc($('#view-label').textContent)}">${content}</section>${['picks','board','ranking'].includes(view)?compactTools(data):''}</div>`:regular();hydrateIcons();
 $('#picks-form')?.addEventListener('submit',savePicks);
 $('#account-password')?.addEventListener('submit',e=>changePassword(e));
 $('#account-logout')?.addEventListener('click',logout);
 $('#feedback-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{await api('/api/feedback',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});toast('Luis recibió tu mensaje en su buzón.');await render();}catch(exc){f.querySelector('[role=alert]').hidden=false;f.querySelector('[role=alert]').textContent=exc.message;}finally{b.disabled=false;}});
 document.querySelectorAll('.reply-form').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/feedback/'+f.dataset.id,{method:'PATCH',body:JSON.stringify({reply:f.elements.reply.value,status:e.submitter.value})});toast('Respuesta guardada.');await load(true);}catch(exc){toast(exc.message);}}));
}
async function savePicks(e){
 e.preventDefault();const b=$('#save-picks');b.disabled=true;
 try{const changes=Object.fromEntries(Object.entries(draft).filter(([id,t])=>me().choices[id]!==t));if(!Object.keys(changes).length)return;await api('/api/picks',{method:'PUT',body:JSON.stringify({round:data.roundId,choices:changes})});dirty=false;toast('Tus elecciones quedaron guardadas.');const refreshed=await load(true);if(refreshed&&compact())openRegistrationConfirmation(data,user().id);}catch(exc){toast(exc.message);}finally{if($('#save-picks'))$('#save-picks').disabled=!dirty||(!data.testMode&&captureIsClosed());}
}
function detail(id){activeGame=null;const p=data.participants.find(p=>p.id===id);if(!p)return;$('#detail-body').innerHTML=`<h2 id="detail-title">${esc(p.name)} ${paid(p)}</h2><p>${score(p,data.games).correct} aciertos · ${Object.keys(p.choices).length}/${data.games.length} elecciones</p><div class="detail-games">${data.games.map(g=>`<div class="detail-game"><span>${esc(g.away)} vs ${esc(g.home)}</span><b>${p.choices[g.id]?img(p.choices[g.id])+esc(name(p.choices[g.id])):'Sin elección'}</b><span>${{hit:'✓ Acierto',miss:'× Fallo',pending:'Por jugar',empty:'—'}[outcome(p,g)]}</span></div>`).join('')}</div>`;if(!$('#detail').open)$('#detail').showModal();}
function adminTestBar(){
 if(user().role!=='admin')return '';
 return data.adminSandbox?`<section class="admin-test-banner" aria-label="Modo de prueba"><div><strong>MODO DE PRUEBA</strong><p>Puedes probar las funciones con datos separados. Las elecciones, aportaciones, accesos y sorteos reales se conservan.</p></div><div class="admin-test-actions"><button type="button" class="small-button" data-sandbox="scheduled">Partidos por jugar</button><button type="button" class="small-button" data-sandbox="live">Simular en juego</button><button type="button" class="small-button" data-sandbox="final">Simular finales</button><button type="button" class="small-button" data-sandbox="reset">Reiniciar prueba</button><button type="button" class="primary-button" data-sandbox="exit">Salir de prueba</button></div></section>`:`<div class="admin-test-entry">${user().id==='luis'?'<button type="button" class="small-button" data-layout-preview="on">Probar con datos separados</button>':''}<span>Prueba las funciones de la plataforma con datos separados.</span>${user().id!=='luis'?'<button type="button" class="small-button" data-sandbox="start">Probar funciones</button>':''}</div>`;
}
async function switchSandbox(action){
 if(modeChanging)return;
 if(dirty&&!confirm('Tienes elecciones sin guardar. ¿Descartarlas y cambiar el modo de prueba?'))return;
 if(action==='reset'&&!confirm('Se borrarán los cambios de la prueba y se preparará una copia nueva. ¿Reiniciar la prueba?'))return;
 const oldMode=adminSandbox,oldRound=round;modeChanging=true;loadEpoch++;clearTimeout(timer);closeTools();dirty=false;
 $('#workspace').inert=true;$('#portal').setAttribute('aria-busy','true');
 try{
  if(loadPromise)await loadPromise;
  if(action==='start'||action==='reset'){await api('/api/admin/sandbox',{method:'POST',body:JSON.stringify({reset:action==='reset'})});adminSandbox=true;round=null;}
  else if(action==='exit'){if(isLayoutPreview()){const url=new URL(location.href);url.searchParams.delete('vista');history.replaceState(null,'',url);}adminSandbox=false;round=null;}
  else {
   // Este endpoint sólo funciona en la copia y puede llamarse durante la transición.
   const result=await fetch('/api/admin/sandbox/scenario',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-QF-Mode':'prueba'},body:JSON.stringify({scenario:action})});
   if(!result.ok){const error=await result.json();throw Error(error.error||'No se pudo preparar la simulación.');}
  }
  if(!await load(true))throw Error('No se pudo cargar la jornada. Se conserva el modo anterior.');
  if(adminSandbox)sessionStorage.setItem('qf-admin-sandbox','prueba');else sessionStorage.removeItem('qf-admin-sandbox');
  toast(adminSandbox?'Modo de prueba · datos separados.':'Volviste a la plataforma real.');
 }catch(error){adminSandbox=auth?oldMode:false;round=oldRound;loadEpoch++;toast(error.message);}
 finally{modeChanging=false;$('#workspace').inert=false;$('#portal').removeAttribute('aria-busy');if(data&&!!data.adminSandbox!==adminSandbox){$('#workspace').innerHTML='<p class="notice" role="alert">No se pudo completar el cambio de modo. Recarga la página para continuar.</p>';$('#workspace').inert=true;}clearTimeout(timer);timer=setTimeout(()=>load(),300000);}
}

document.addEventListener('click',async e=>{
 const preview=e.target.closest('[data-layout-preview]');if(preview&&user()?.role==='admin'&&user()?.id==='luis'){if(modeChanging)return;const oldUrl=location.href,url=new URL(oldUrl),opening=preview.dataset.layoutPreview==='on';if(opening)url.searchParams.set('vista','compacta');else url.searchParams.delete('vista');history.replaceState(null,'',url);if(opening&&!adminSandbox)await switchSandbox('start');else if(!opening&&adminSandbox)await switchSandbox('exit');if(adminSandbox!==opening)history.replaceState(null,'',oldUrl);await render();return;}
 if(compact()&&e.target.closest('[data-preview-tools]')){const tools=e.target.closest('.compact-tools');const open=tools.classList.toggle('is-open');e.target.closest('[data-preview-tools]').setAttribute('aria-expanded',String(open));return;}
 if(compact()&&e.target.closest('[data-preview-more]')){closeTools();openPreviewMenu(user());return;}
 const mode=e.target.closest('[data-sandbox]');if(mode){mode.disabled=true;try{await switchSandbox(mode.dataset.sandbox);}finally{mode.disabled=false;}return;}
 const stats=e.target.closest('[data-team-stats],[data-team-stats-away]');if(stats){closeTools();openTeamStats({league:bundle.league,teams:data.teams,season:data.season,away:stats.dataset.teamStatsAway,home:stats.dataset.teamStatsHome,sandbox:data.adminSandbox,toast});return;}
 const contributions=e.target.closest('[data-contributions]');if(contributions){closeTools();await openContributions({api,roundId:data.roundId,toast,onUpdate:updated=>{for(const p of updated.participants){const target=data.participants.find(x=>x.id===p.id);if(target)target.paid=p.paid;}header();render();}});return;}

 const treasury=e.target.closest('[data-treasurer]');if(treasury){closeTools();await openTreasurer({api,roundId:data.roundId,isAdmin:user().role==='admin',toast,onUpdate:d=>{data.treasurer=d;render();}});return;}
 const companion=e.target.closest('[data-companion]');if(companion){closeTools();await openCompanion(companion.dataset.companion,{api,userId:user().id,roundId:data.roundId,dirty,toast});return;}
 const layout=e.target.closest('[data-board-layout]');if(layout&&view==='board'&&!data.testMode){boardLayout=layout.dataset.boardLayout==='matrix'?'matrix':'cards';await render();document.querySelector(`[data-board-layout="${boardLayout}"]`)?.focus();return;}
 const n=e.target.closest('[data-view]');if(n){if(dirty&&n.dataset.view!=='picks'&&!confirm('Tienes cambios sin guardar. ¿Quieres salir de Mi quiniela?'))return;if(dirty&&n.dataset.view!=='picks'){dirty=false;draft={...me().choices};}closeTools();view=n.dataset.view;await render();return;}
 const game=e.target.closest('[data-game]');if(game){gameDetail(game.dataset.game);return;}
 const p=e.target.closest('[data-person]');if(p){detail(p.dataset.person);return;}
 const c=e.target.closest('[data-conference]');if(c){conference=c.dataset.conference;await render();return;}
 const reset=e.target.closest('[data-reset]');if(reset){if(!confirm('Se creará una contraseña temporal nueva y se cerrarán sus sesiones. ¿Continuar?'))return;try{const r=await api('/api/admin/reset-password',{method:'POST',body:JSON.stringify({user:reset.dataset.reset})});const out=$('#reset-output');out.hidden=false;out.innerHTML=`<div class="notice">${adminSandbox?'PRUEBA · Este acceso sólo cambia en la copia. No lo entregues a otra persona.':'Entrega estos datos únicamente a esa persona.'}<div class="reset-result">Usuario: ${esc(r.username)}<br>Contraseña temporal: ${esc(r.temporaryPassword)}</div>Al entrar deberá elegir una contraseña personal.</div>`;out.scrollIntoView({behavior:'smooth',block:'center'});}catch(exc){toast(exc.message);}return;}
 if(e.target.closest('#celebrate')){const p=$('.race-panel');p.classList.remove('celebrating');void p.offsetWidth;p.classList.add('celebrating');setTimeout(()=>p.classList.remove('celebrating'),6500);}
});
document.addEventListener('change',async e=>{
 const t=e.target;
 if(t.type==='radio'&&t.closest('#picks-form')){draft[t.name]=t.value;dirty=true;$('#save-picks').disabled=false;$('#save-label').textContent='Tienes cambios sin guardar';$('#pick-count').textContent=`${Object.keys(draft).length}/${data.games.length} elecciones`;$('#pick-progress').style.width=Object.keys(draft).length/data.games.length*100+'%';return;}
 if(t.id==='round-select'){if(dirty&&!confirm('Tienes elecciones sin guardar. ¿Cambiar de jornada?')){t.value=data.roundId;return;}dirty=false;round=t.value;closeTools();await load(true);return;}
 if(t.id==='calendar-phase'){calendar.phase=t.value;calendar.week='all';await render();}if(t.id==='calendar-week'){calendar.week=t.value;await render();}if(t.id==='calendar-team'){calendar.team=t.value;await render();}
 if(t.dataset.payment){try{await api('/api/admin/payment',{method:'PATCH',body:JSON.stringify({round:data.roundId,user:t.dataset.payment,paid:t.value==='unknown'?null:t.value==='true'})});toast('Aportación actualizada.');await load(true);}catch(exc){toast(exc.message);}}
});
$('#logout').onclick=logout;$('#close-detail').onclick=()=>$('#detail').close();$('#refresh').onclick=()=>{if(dirty){toast('Guarda tus elecciones antes de actualizar.');return;}load(true);};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&auth&&!auth.user.mustChange)load();});
try{auth=await api('/api/me');csrf=auth.csrf;if(auth.user.mustChange)showChange(true);else await enter();}catch{showLogin();}
