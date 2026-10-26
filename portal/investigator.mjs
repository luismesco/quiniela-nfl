import {winner,score} from '../core.mjs';

// Choosing one's own pick weakly maximizes the point difference against EVERY rival.
// Thus a completion of the remaining games with those picks is an exact feasibility
// witness, including TIE, without enumerating 3^16 combinations or using probabilities.
export function investigate(data,userId,assumptions={}){
 const games=data.games,person=data.participants.find(p=>p.id===userId);
 const valid=(p,g)=>[g.away,g.home,'TIE'].includes(p.choices?.[g.id]);
 const complete=p=>games.length>0&&games.every(g=>valid(p,g));
 const eligible=p=>p.role!=='test'&&p.id!=='cuenta-prueba'&&complete(p);
 if(data.testMode||!person||!eligible(person))return {eligible:false,reason:data.testMode?'La cuenta de prueba no participa en la bolsa.':'Necesitas una quiniela completa guardada para participar por la bolsa.'};
 if(games.some(g=>g.status==='canceled'))return {eligible:false,reason:'Hay un partido cancelado. La ruta se podrá calcular cuando se publique cómo se resolverá la jornada.'};
 for(const [id,choice] of Object.entries(assumptions)){
  const g=games.find(g=>g.id===id);
  if(!g||![g.away,g.home,'TIE'].includes(choice))throw Error('El resultado simulado no corresponde al partido.');
  if(g.status==='final')throw Error('No se puede cambiar un resultado final.');
 }
 const people=data.participants.filter(eligible),pending=games.filter(g=>g.status!=='final');
 const calculate=results=>{
  const rows=people.map(p=>({id:p.id,name:p.name,correct:games.reduce((n,g)=>n+Number(p.choices[g.id]===results[g.id]),0)})).sort((a,b)=>b.correct-a.correct||a.name.localeCompare(b.name,'es'));
  const own=rows.find(p=>p.id===userId),leaders=rows.filter(p=>p.correct===rows[0].correct).map(p=>p.id);
  return {rows,correct:own.correct,leaders,lead:leaders.includes(userId),solo:leaders.length===1&&leaders[0]===userId};
 };
 const best=fixed=>Object.fromEntries(games.map(g=>[g.id,winner(g)||fixed[g.id]||person.choices[g.id]]));
 const results=best(assumptions),witness=calculate(results);
 const routes=pending.filter(g=>!Object.hasOwn(assumptions,g.id)).map(g=>{
  const lead=[],solo=[];
  for(const choice of [g.away,g.home,'TIE']){const c=calculate(best({...assumptions,[g.id]:choice}));if(c.lead)lead.push(choice);if(c.solo)solo.push(choice);}
  return {gameId:g.id,lead,solo};
 });
 const current=score(person,games).correct;
 const free=pending.filter(g=>!Object.hasOwn(assumptions,g.id));
 const basePoints=p=>games.reduce((n,g)=>n+Number(p.choices[g.id]===(winner(g)||assumptions[g.id])),0);
 const blockers=witness.rows.filter(p=>p.correct>witness.correct).map(row=>{
  const rival=people.find(p=>p.id===row.id);
  return {id:rival.id,name:rival.name,baseGap:basePoints(rival)-basePoints(person),minimumGap:row.correct-witness.correct,
   differentGames:free.filter(g=>rival.choices[g.id]!==person.choices[g.id]).map(g=>g.id)};
 });
 return {eligible:true,current,finished:games.length-pending.length,pending:pending.map(g=>g.id),
  remaining:pending.filter(g=>!Object.hasOwn(assumptions,g.id)).length,canLead:witness.lead,canWinSolo:witness.solo,
  routes,blockers,witness:{...witness,results},completeSimulation:pending.every(g=>Object.hasOwn(assumptions,g.id))};
}

// Universal guarantees use the WORST possible difference against each rival.
// A different pending pick can cost at most one point of relative advantage;
// equal picks never change that difference. Live scores are not final results.
export function roundVerdict(data){
 const games=data.games||[];
 const unavailable=reason=>({status:'unavailable',reason});
 if(data.testMode)return unavailable('La cuenta de prueba no participa en la bolsa.');
 if(!games.length)return unavailable('Todavía no hay partidos publicados para esta jornada.');
 if(games.some(g=>g.status==='canceled'))return unavailable('Hay un partido cancelado. Falta publicar cómo se resolverá la jornada.');
 if(games.some(g=>g.status==='final'&&![g.awayScore,g.homeScore].every(n=>Number.isInteger(n)&&n>=0)))return unavailable('Falta un marcador final válido para calcular la definición.');
 const pending=games.filter(g=>g.status!=='final');
 const people=data.participants.filter(p=>p.role!=='test'&&p.id!=='cuenta-prueba'&&games.every(g=>[g.away,g.home,'TIE'].includes(p.choices?.[g.id])))
  .map(p=>({...p,correct:score(p,games).correct})).sort((a,b)=>b.correct-a.correct||a.name.localeCompare(b.name,'es'));
 if(!people.length)return unavailable('Aún no hay quinielas completas guardadas para participar por la bolsa.');
 const person=p=>({id:p.id,name:p.name,correct:p.correct});
 const margin=(p,q)=>p.correct-q.correct;
 const differences=(p,q)=>pending.filter(g=>p.choices[g.id]!==q.choices[g.id]).length;
 const guaranteedFirst=people.filter(p=>people.every(q=>p.id===q.id||margin(p,q)-differences(p,q)>=0)).map(person);
 const guaranteedSolo=people.filter(p=>people.every(q=>p.id===q.id||margin(p,q)-differences(p,q)>0)).map(person);
 const possibleFirst=people.filter(p=>people.every(q=>p.id===q.id||margin(p,q)+differences(p,q)>=0)).map(person);
 const possibleSolo=people.filter(p=>people.every(q=>p.id===q.id||margin(p,q)+differences(p,q)>0)).map(person);
 const allWinnersFixed=guaranteedFirst.length===possibleFirst.length;
 const combinations=[];
 if(pending.length<=2&&pending.length>0){
  const visit=(i,results)=>{
   if(i===pending.length){
    const rows=people.map(p=>({...person(p),correct:p.correct+pending.reduce((n,g)=>n+Number(p.choices[g.id]===results[g.id]),0)}));
    const points=Math.max(...rows.map(p=>p.correct));combinations.push({results:{...results},leaders:rows.filter(p=>p.correct===points),points});return;
   }
   const g=pending[i];for(const value of [g.away,g.home,'TIE'])visit(i+1,{...results,[g.id]:value});
  };visit(0,{});
 }
 let lastGameCanChangeLeaders=pending.length>2?null:false;
 if(combinations.length){
  const groups=new Map();
  for(const row of combinations){const key=pending.slice(0,-1).map(g=>row.results[g.id]).join('|'),winners=row.leaders.map(p=>p.id).sort().join('|');if(groups.has(key)&&groups.get(key)!==winners)lastGameCanChangeLeaders=true;groups.set(key,winners);}
 }
 const status=data.captureClosed===false?'capture-open':!pending.length?'final':guaranteedSolo.length?'solo-secured':allWinnersFixed?'group-secured':guaranteedFirst.length?'shared-secured':pending.length===1?'last-game':'undecided';
 return {status,finished:games.length-pending.length,total:games.length,pending,guaranteedFirst,guaranteedSolo,possibleFirst,possibleSolo,
  currentLeaders:people.filter(p=>p.correct===people[0].correct).map(person),allWinnersFixed,lastGameCanChangeLeaders,combinations};
}

export function explainElimination(report,subject=null){
 const blocker=report.blockers?.[0];if(report.canLead||!blocker)return '';
 const point=n=>n+' acierto'+(n===1?'':'s');
 if(!report.remaining)return `${blocker.name} termina ${point(blocker.minimumGap)} arriba de ${subject||'ti'}.`;
 if(!blocker.differentGames.length)return `${blocker.name} lleva ${point(blocker.baseGap)} más y eligió lo mismo que ${subject||'tú'} en todos los partidos aún libres. Sumarán los mismos aciertos; ${subject?'no puede':'no puedes'} alcanzarlo.`;
 return `${blocker.name} tiene ${point(blocker.baseGap)} de ventaja y sólo ${blocker.differentGames.length===1?'hay un partido pendiente':'hay '+blocker.differentGames.length+' partidos pendientes'} en que eligieron distinto. Aunque todos esos resultados ${subject?'favorezcan a '+subject:'te favorezcan'}, seguirá al menos ${point(blocker.minimumGap)} arriba de ${subject||'ti'}.`;
}
