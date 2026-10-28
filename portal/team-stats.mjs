const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canonical=code=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[code]||code);
const count=value=>Number.isInteger(value)&&value>=0?value:null;
let opened;

export function seasonTeamRecords(league,teams={},season){
 const validSeason=Number.isInteger(Number(season))&&Number(league?.season)===Number(season),records=new Map();
 if(validSeason&&Array.isArray(league.standings))for(const division of league.standings){
  for(const row of Array.isArray(division?.teams)?division.teams:[]){
   if(typeof row?.team!=='string')continue;
   const code=canonical(row.team);
   if(records.has(code)){records.set(code,null);continue;}
   const wins=count(row.wins),losses=count(row.losses),ties=count(row.ties);
   records.set(code,{wins,losses,ties,played:[wins,losses,ties].every(n=>n!==null)?wins+losses+ties:null,
    conference:division.conference||'',division:division.division||''});
  }
 }
 return Object.entries(teams).map(([code,team])=>({code,name:team?.name||code,nick:team?.nick||code,
  record:records.get(canonical(code))||null})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}

export function teamStatsAction(data){
 return `<button type="button" class="team-stats-action" data-team-stats aria-haspopup="dialog"><img src="/assets/mascotas/ajolote-estadisticas.png" width="88" height="88" alt="Ajolote con una gráfica de estadísticas"><span><strong>Conoce a los equipos</strong><span>Ganados, perdidos y empatados de ${esc(data.season)}.</span><b>Ver estadísticas <span aria-hidden="true">↗</span></b></span></button>`;
}

export function closeTeamStats(){opened?.close();}

export function openTeamStats({league,teams={},season,away,home,toast,sandbox=false}){
 closeTeamStats();
 const entries=seasonTeamRecords(league,teams,season);
 if(!entries.length){toast?.('Los equipos de esta temporada todavía no están disponibles.');return;}
 const previous=document.activeElement,dialog=document.createElement('dialog');opened=dialog;
 const valid=code=>entries.some(row=>row.code===canonical(code));
 let left=valid(away)?canonical(away):entries[0].code;
 let right=valid(home)&&canonical(home)!==left?canonical(home):(entries.find(row=>row.code!==left)?.code||left);
 const time=new Date(league?.standingsUpdatedAt||'');
 const updated=Number.isFinite(time.getTime())?time.toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})+' · CDMX':'Fecha de consulta no disponible';
 const validSeason=Number(league?.season)===Number(season);
 dialog.className='team-stats-dialog';dialog.setAttribute('aria-labelledby','team-stats-title');
 dialog.innerHTML=`<div class="companion-top"><span class="tiny">${sandbox?'MODO DE PRUEBA':'LA QUINIELA FISCALIZADA'}</span><button type="button" class="icon-button" aria-label="Cerrar estadísticas">×</button></div><div class="team-stats-body"><div class="team-stats-heading"><img src="/assets/mascotas/ajolote-estadisticas.png" width="115" height="115" alt=""><div><span class="section-kicker">TEMPORADA REGULAR ${esc(season)}</span><h2 id="team-stats-title">Conoce a los equipos</h2><p>Compara sus partidos ganados, perdidos y empatados.</p></div></div><div class="team-stats-selectors">${['left','right'].map((side,i)=>`<label>Equipo ${i+1}<select data-stats-side="${side}">${entries.map(row=>`<option value="${esc(row.code)}">${esc(row.name)}</option>`).join('')}</select></label>`).join('')}</div>${!validSeason?'<p class="notice" role="status">Las estadísticas de esta temporada todavía no están disponibles.</p>':''}<div class="team-stats-comparison" aria-live="polite" aria-atomic="true"></div><p class="team-stats-source">${validSeason&&league?.standingsSource?'Fuente: '+esc(league.standingsSource)+'. ':''}${validSeason?esc(updated):'Se mostrarán cuando estén disponibles las posiciones de '+esc(season)+'.'}</p></div>`;
 const selects=dialog.querySelectorAll('select');selects[0].value=left;selects[1].value=right;
 function card(code){
  const row=entries.find(row=>row.code===code),r=row.record;
  return `<section class="team-stats-team"><img class="team-stats-logo" src="/assets/teams/${encodeURIComponent(row.code)}.svg" alt=""><h3>${esc(row.name)}</h3><p class="team-stats-division">${r?esc([r.conference,r.division].filter(Boolean).join(' · ')):'Registro por actualizar'}</p><dl class="team-stats-numbers">${[['wins','Ganados'],['losses','Perdidos'],['ties','Empatados']].map(([key,label])=>`<div class="team-stats-${key}"><dt>${label}</dt><dd>${r?.[key]??'—'}</dd></div>`).join('')}</dl><p class="team-stats-played">${r?.played!==null&&r?.played!==undefined?`${r.played} partido${r.played===1?'':'s'} terminado${r.played===1?'':'s'}`:'Total de partidos por actualizar'}</p></section>`;
 }
 function render(){dialog.querySelector('.team-stats-comparison').innerHTML=card(left)+card(right);}
 selects[0].addEventListener('change',e=>{left=e.target.value;render();});
 selects[1].addEventListener('change',e=>{right=e.target.value;render();});
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{dialog.remove();if(opened===dialog)opened=null;if(previous?.isConnected)previous.focus();},{once:true});
 document.body.append(dialog);render();dialog.showModal();
}
