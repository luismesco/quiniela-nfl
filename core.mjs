export function winner(g) {
  if (g.status !== 'final') return null;
  return g.awayScore === g.homeScore ? 'TIE' : g.awayScore > g.homeScore ? g.away : g.home;
}
export function outcome(p, g) {
  const pick=p.choices[g.id]; if (!pick) return 'empty';
  const w=winner(g); return !w?'pending':w===pick?'hit':'miss';
}
export function score(p, games) {
  const states=games.map(g=>outcome(p,g));
  const count=s=>states.filter(x=>x===s).length;
  const submitted=games.filter(g=>p.choices[g.id]).length;
  return {correct:count('hit'),wrong:count('miss'),pending:count('pending'),unresolved:count('tie'),submitted,complete:submitted===games.length,max:count('hit')+count('pending')+count('tie')};
}
export function standings(d) {
  const resolved=d.games.some(g=>winner(g));
  const rows=d.participants.map(p=>({...p,...score(p,d.games)})).sort((a,b)=>Number(b.complete)-Number(a.complete)||b.correct-a.correct||a.name.localeCompare(b.name,'es'));
  let previous=-1,rank=0,position=0;
  return rows.map(p=>{
    if(!p.complete||!resolved)return {...p,rank:null};
    position++;if(p.correct!==previous)rank=position;previous=p.correct;return {...p,rank};
  });
}
export function summary(d) {
  const rows=standings(d),eligible=rows.filter(p=>p.complete),leaders=eligible.filter(p=>p.rank===1);
  const finished=d.games.filter(g=>g.status==='final').length;
  const unresolved=false;
  return {rows,complete:eligible.length,finished,resolved:d.games.filter(g=>winner(g)).length,live:d.games.filter(g=>g.status==='live').length,expectedPot:eligible.length*d.fee,received:d.participants.filter(p=>p.paid===true).length*d.fee,unpaid:d.participants.filter(p=>p.paid===false).length,unknownPayments:d.participants.filter(p=>p.paid===null).length,leader:leaders.length?{names:leaders.map(p=>p.name),correct:leaders[0].correct}:null,settled:finished===d.games.length&&eligible.length>0,unresolved};
}
export function consensus(d,g) {
  const votes=d.participants.map(p=>p.choices[g.id]).filter(Boolean);
  return {total:votes.length,away:votes.filter(t=>t===g.away).length,home:votes.filter(t=>t===g.home).length,tie:votes.filter(t=>t==='TIE').length};
}
export function validate(d) {
  if(!Array.isArray(d.games)||!d.games.length||!Array.isArray(d.participants)||!Number.isFinite(d.fee)||d.fee<0)throw Error('Datos de quiniela inválidos');
  const gameIds=new Set(),participantIds=new Set();
  for(const g of d.games){
    if(gameIds.has(g.id)||!g.id||!g.away||!g.home||g.away===g.home||!['scheduled','live','final','suspended','postponed','canceled'].includes(g.status))throw Error('Partido inválido');
    gameIds.add(g.id);
    if(['live','final','suspended'].includes(g.status)&&![g.homeScore,g.awayScore].every(n=>Number.isInteger(n)&&n>=0))throw Error('Marcador inválido');
    if(['scheduled','postponed','canceled'].includes(g.status)&&[g.homeScore,g.awayScore].some(n=>n!==null))throw Error('Marcador de partido sin jugar');
  }
  for(const p of d.participants){
    if(participantIds.has(p.id)||!p.id||!p.name||!p.choices||![true,false,null].includes(p.paid))throw Error('Participante inválido');
    participantIds.add(p.id);
    for(const [id,t] of Object.entries(p.choices)){const g=d.games.find(g=>g.id===id);if(!g||![g.away,g.home,'TIE'].includes(t))throw Error('Elección ajena al cruce');}
  }
  return true;
}
