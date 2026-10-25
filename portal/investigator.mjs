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
 return {eligible:true,current,finished:games.length-pending.length,pending:pending.map(g=>g.id),
  remaining:pending.filter(g=>!Object.hasOwn(assumptions,g.id)).length,canLead:witness.lead,canWinSolo:witness.solo,
  routes,witness:{...witness,results},completeSimulation:pending.every(g=>Object.hasOwn(assumptions,g.id))};
}
