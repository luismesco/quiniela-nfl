import {roundVerdict,investigate,explainElimination} from './investigator.mjs';
import {score} from '../core.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=people=>people.map(p=>p.name).join(', ');
const option=(data,t)=>t==='TIE'?'Empate · TIE':data.teams?.[t]?.nick||t;
function transparentBreakdown(data,r){
 const capturing=r.status==='capture-open',final=r.status==='final';
 const people=data.participants.filter(p=>p.role!=='test'&&p.id!=='cuenta-prueba').map(p=>({...p,...score(p,data.games)})).sort((a,b)=>b.correct-a.correct||a.name.localeCompare(b.name,'es'));
 const rows=people.map(p=>{
  const report=investigate(data,p.id),guaranteed=r.guaranteedFirst.some(x=>x.id===p.id),solo=r.guaranteedSolo.some(x=>x.id===p.id);
  let status,reason;
  if(!report.eligible){status='Quiniela incompleta';reason=`${p.submitted}/${data.games.length} elecciones guardadas. Sólo compiten las quinielas completas.`;}
  else if(final){status=guaranteed?'Ganador final':'Jornada finalizada';reason=guaranteed?'Terminó en el primer lugar.':explainElimination(report,p.name);}
  else if(capturing){status=report.canLead?'Con posibilidades actuales':'Sin ruta con las elecciones actuales';reason='La captura sigue abierta; las elecciones todavía pueden cambiar.';}
  else if(solo){status='Ganador único asegurado';reason='Ningún resultado pendiente puede quitarle la victoria en solitario.';}
  else if(guaranteed){status='Primer lugar asegurado';reason=r.allWinnersFixed?'El grupo de ganadores ya está definido.':report.canWinSolo?'Puede ganar solo o compartir la bolsa; ya no puede quedar fuera del primer lugar.':'Ya aseguró compartir la bolsa. Todavía pueden sumarse más ganadores.';}
  else if(report.canLead){status=report.canWinSolo?'Puede ganar solo o compartir':'Puede compartir el primer lugar';reason='Todavía hay al menos una combinación de resultados que le permite alcanzar el primer lugar.';}
  else{status='Ya no alcanza el primer lugar';reason=explainElimination(report,p.name);}
  return `<tr data-round-person="${esc(p.id)}"><th scope="row">${esc(p.name)}</th><td>${p.correct}</td><td>${p.max}</td><td>${r.pending.length?r.pending.map(g=>`<span class="outlook-pending-pick"><b>${esc(g.away)} vs ${esc(g.home)}:</b> ${p.choices[g.id]?esc(option(data,p.choices[g.id])):'Sin elección'}</span>`).join(''):'Todos finalizaron'}</td><td><strong>${esc(status)}</strong><p>${esc(reason)}</p></td></tr>`;
 });
 const finals=data.games.filter(g=>g.status==='final');
 const checked=data.games.map(g=>g.checkedAt).filter(s=>s&&Number.isFinite(Date.parse(s))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
 const date=checked?new Date(checked).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' CDMX':'';
 return `<section class="outlook-transparency"><h3>La cuenta de cada participante</h3><p>Estas son las elecciones guardadas del grupo. El máximo de aciertos es individual: para ganar también cuenta lo que pueden sumar los demás.</p><details open><summary>Ver a los ${people.length} participantes y por qué pueden o no ganar</summary><div class="outlook-table-wrap" tabindex="0" role="region" aria-label="Comparar aciertos, elecciones pendientes y explicación de cada participante"><table id="outlook-participants"><caption>Desliza la tabla para comparar todas las columnas.</caption><thead><tr><th scope="col">Participante</th><th scope="col">Aciertos</th><th scope="col">Máximo</th><th scope="col">Elecciones pendientes</th><th scope="col">Situación y explicación</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details><details class="outlook-finals"><summary>Resultados finales utilizados (${finals.length})</summary><ul>${finals.map(g=>`<li><strong>${esc(g.away)} ${g.awayScore} – ${esc(g.home)} ${g.homeScore}</strong><span>${g.awayScore===g.homeScore?'Empate final · Sólo acierta TIE':'Final · Gana '+esc(option(data,g.awayScore>g.homeScore?g.away:g.home))}</span></li>`).join('')}</ul></details>${date?`<p class="source-status">Última consulta de marcadores de la jornada: ${esc(date)}.</p>`:''}</section>`;
}
export function roundOutlookView(data,{detail=false}={}){
 const r=roundVerdict(data),id=detail?'outlook-title':'round-verdict-title';
 let title,description;
 if(r.status==='unavailable'){title='Definición pendiente';description=r.reason;}
 else if(r.status==='capture-open'){title='La captura sigue abierta';description='Todavía pueden cambiar las elecciones. El panorama se confirmará cuando cierre la captura.';}
 else if(r.status==='final'){title=(r.currentLeaders.length===1?'Ganador final: ':'Ganadores finales: ')+names(r.currentLeaders);description=r.currentLeaders.length===1?'Todos los partidos terminaron. La jornada tiene un ganador.':'Todos los partidos terminaron. El primer lugar y la bolsa se comparten.';}
 else if(r.status==='solo-secured'){title='Ganador virtual: '+names(r.guaranteedSolo);description='Ya aseguró ganar solo. Ningún resultado pendiente puede cambiar quién gana la bolsa.';}
 else if(r.status==='group-secured'){title='Ganadores virtuales: '+names(r.guaranteedFirst);description='Ya aseguraron compartir la bolsa entre ellos. Los partidos pendientes no cambian este grupo de ganadores.';}
 else if(r.status==='shared-secured'){
  title=names(r.guaranteedFirst)+(r.guaranteedFirst.length===1?' ya aseguró el primer lugar':' ya aseguraron el primer lugar');
  description=r.possibleSolo.length?'Todavía puede ganar solo o compartir la bolsa. Falta definir si la comparte y con quién.':'La bolsa ya será compartida. Todavía pueden sumarse más participantes al primer lugar.';
 }else if(r.status==='last-game'){title='El último partido define al ganador';description='Aún nadie tiene asegurado el primer lugar. El resultado del partido pendiente decidirá quién gana o comparte la bolsa.';}
 else{title='La bolsa sigue en juego';description='Aún nadie tiene asegurado el primer lugar. Faltan '+r.pending.length+' partidos para completar los resultados.';}
 const body=`<div class="outlook-copy"><span class="section-kicker">ASÍ VA LA BOLSA</span><h3 id="${id}">${esc(title)}</h3><p>${esc(description)}</p>${r.status==='unavailable'?'':`<small>${r.finished}/${r.total} partidos finalizados${r.pending.length?' · '+r.pending.length+' pendiente'+(r.pending.length===1?'':'s'):''}</small>`}${detail?'':'<button type="button" class="small-button" data-companion="outlook" aria-haspopup="dialog">¿Ya hay ganador?</button>'}</div>`;
 const summary=`<section class="round-verdict ${esc(r.status)}" aria-labelledby="${id}"><img src="/assets/mascotas/ajolote-adivino.png" width="120" height="120" alt="Ajolote adivino con esfera de cristal">${body}</section>`;
 if(!detail||r.status==='unavailable')return summary;
 const last=r.pending.at(-1),capturing=r.status==='capture-open';
 let lastText='';
 if(last&&r.lastGameCanChangeLeaders!==null){
  if(r.lastGameCanChangeLeaders)lastText=r.guaranteedFirst.length?'Puede cambiar si se comparte la bolsa y quiénes la comparten. El primer lugar ya asegurado se conserva.':'Puede cambiar quién gana o comparte la bolsa.';
  else lastText=r.allWinnersFixed?'No cambia quién gana o comparte la bolsa; sólo puede cambiar los aciertos finales.':'No cambia quién gana la bolsa. La definición depende de los otros partidos pendientes.';
 }
 return summary+`${capturing?'<p class="notice">El panorama de abajo usa las elecciones completas guardadas en este momento; todavía puede cambiar.</p>':''}<div class="outlook-facts" id="outlook-leaders" data-guaranteed="${esc(r.guaranteedFirst.map(p=>p.id).join(' '))}">${!capturing&&r.guaranteedFirst.length?`<p><strong>Primer lugar asegurado:</strong> ${esc(names(r.guaranteedFirst))}.</p>`:''}<p><strong>${r.status==='final'?'Ganadores':'Aún pueden terminar en primer lugar'}:</strong> ${esc(names(r.possibleFirst))}.</p>${!capturing&&r.pending.length&&r.possibleSolo.length?`<p><strong>Aún ${r.possibleSolo.length===1?'puede ganar solo':'pueden ganar solos'}:</strong> ${esc(names(r.possibleSolo))}.</p>`:''}</div>${lastText?`<p id="outlook-last-game" class="outlook-last"><strong>Último partido: ${esc(last.away)} vs ${esc(last.home)}.</strong> ${esc(lastText)}</p>`:''}${r.combinations.length?`<section class="outlook-outcomes"><h3>${r.pending.length===1?'Los 3 desenlaces del último partido':'Los 9 desenlaces que quedan'}</h3><p>Incluye el empate final (TIE). Un marcador empatado durante el juego todavía puede cambiar.</p><div class="outlook-table-wrap"><table id="outlook-combinations"><caption>Quién gana en cada combinación de resultados finales</caption><thead><tr>${r.pending.map(g=>`<th scope="col">${esc(g.away)} vs ${esc(g.home)}</th>`).join('')}<th scope="col">Ganadores de la bolsa</th></tr></thead><tbody>${r.combinations.map(row=>`<tr data-results="${esc(r.pending.map(g=>row.results[g.id]).join('|'))}">${r.pending.map(g=>`<td>${esc(option(data,row.results[g.id]))}</td>`).join('')}<td><strong>${esc(names(row.leaders))}</strong><small>${row.points} aciertos · ${row.leaders.length===1?'Gana solo':'Comparten entre '+row.leaders.length}</small></td></tr>`).join('')}</tbody></table></div></section>`:''}${transparentBreakdown(data,r)}<p class="scenario-note">“Virtual” significa que los resultados pendientes ya no pueden quitar ese lugar. “Final” significa que todos los partidos terminaron. Sólo compiten las quinielas completas guardadas.</p>`;
}
