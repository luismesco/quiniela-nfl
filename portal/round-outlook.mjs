import {roundVerdict} from './investigator.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=people=>people.map(p=>p.name).join(', ');
const option=(data,t)=>t==='TIE'?'Empate · TIE':data.teams?.[t]?.nick||t;
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
 return summary+`${capturing?'<p class="notice">El panorama de abajo usa las elecciones completas guardadas en este momento; todavía puede cambiar.</p>':''}<div class="outlook-facts" id="outlook-leaders" data-guaranteed="${esc(r.guaranteedFirst.map(p=>p.id).join(' '))}">${!capturing&&r.guaranteedFirst.length?`<p><strong>Primer lugar asegurado:</strong> ${esc(names(r.guaranteedFirst))}.</p>`:''}<p><strong>${r.status==='final'?'Ganadores':'Aún pueden terminar en primer lugar'}:</strong> ${esc(names(r.possibleFirst))}.</p>${!capturing&&r.pending.length&&r.possibleSolo.length?`<p><strong>Aún ${r.possibleSolo.length===1?'puede ganar solo':'pueden ganar solos'}:</strong> ${esc(names(r.possibleSolo))}.</p>`:''}</div>${lastText?`<p id="outlook-last-game" class="outlook-last"><strong>Último partido: ${esc(last.away)} vs ${esc(last.home)}.</strong> ${esc(lastText)}</p>`:''}${r.combinations.length?`<section class="outlook-outcomes"><h3>${r.pending.length===1?'Los 3 desenlaces del último partido':'Los 9 desenlaces que quedan'}</h3><p>Incluye el empate final (TIE). Un marcador empatado durante el juego todavía puede cambiar.</p><div class="outlook-table-wrap"><table id="outlook-combinations"><caption>Quién gana en cada combinación de resultados finales</caption><thead><tr>${r.pending.map(g=>`<th scope="col">${esc(g.away)} vs ${esc(g.home)}</th>`).join('')}<th scope="col">Ganadores de la bolsa</th></tr></thead><tbody>${r.combinations.map(row=>`<tr data-results="${esc(r.pending.map(g=>row.results[g.id]).join('|'))}">${r.pending.map(g=>`<td>${esc(option(data,row.results[g.id]))}</td>`).join('')}<td><strong>${esc(names(row.leaders))}</strong><small>${row.points} aciertos · ${row.leaders.length===1?'Gana solo':'Comparten entre '+row.leaders.length}</small></td></tr>`).join('')}</tbody></table></div></section>`:''}<p class="scenario-note">“Virtual” significa que los resultados pendientes ya no pueden quitar ese lugar. “Final” significa que todos los partidos terminaron. Sólo compiten las quinielas completas guardadas.</p>`;
}
