import assert from 'node:assert/strict';
import {roundVerdict} from '../portal/investigator.mjs';
import {roundOutlookView} from '../portal/round-outlook.mjs';
const g=(id,status='scheduled',a=null,h=null)=>({id,away:id+'A',home:id+'H',status,awayScore:a,homeScore:h});
const p=(id,choices)=>({id,name:id,choices});
const ids=xs=>xs.map(p=>p.id).sort();
const games=[g('0','final',10,0),g('1','final',10,0),g('2'),g('3')];
const data={captureClosed:true,games,participants:[p('Leo',{'0':'0A','1':'1A','2':'2A','3':'3H'}),p('Yvon',{'0':'0H','1':'1A','2':'2A','3':'3A'}),p('Peña',{'0':'0H','1':'1A','2':'2H','3':'3H'}),p('Luis',{'0':'0H','1':'1H','2':'2H','3':'3A'})]};
let v=roundVerdict(data);assert.equal(v.status,'shared-secured');assert.deepEqual(ids(v.guaranteedFirst),['Leo']);assert.deepEqual(ids(v.possibleFirst),['Leo','Luis','Peña','Yvon']);assert.equal(v.lastGameCanChangeLeaders,true);assert.equal(v.combinations.length,9);
assert.deepEqual(ids(v.combinations.find(c=>c.results['2']==='2H'&&c.results['3']==='3A').leaders),['Leo','Luis','Peña','Yvon']);
assert.deepEqual(ids(v.combinations.find(c=>c.results['2']==='2A'&&c.results['3']==='3H').leaders),['Leo']);
const end=structuredClone(data);end.games[2]={...end.games[2],status:'final',awayScore:10,homeScore:0};v=roundVerdict(end);assert.equal(v.pending.length,1);assert.equal(v.combinations.length,3);assert.deepEqual(ids(v.guaranteedFirst),['Leo']);
end.games[3]={...end.games[3],status:'final',awayScore:0,homeScore:10};v=roundVerdict(end);assert.equal(v.status,'final');assert.deepEqual(ids(v.guaranteedSolo),['Leo']);
const identical={captureClosed:true,games:[g('0')],participants:[p('a',{'0':'0A'}),p('b',{'0':'0A'})]};v=roundVerdict(identical);assert.equal(v.status,'group-secured');assert.equal(v.lastGameCanChangeLeaders,false);
const undecided={captureClosed:true,games:[g('0')],participants:[p('a',{'0':'0A'}),p('b',{'0':'0H'})]};v=roundVerdict(undecided);assert.equal(v.status,'last-game');assert.equal(v.guaranteedFirst.length,0);assert.deepEqual(ids(v.combinations.find(c=>c.results['0']==='TIE').leaders),['a','b']);
assert.equal(roundVerdict({...data,captureClosed:false}).status,'capture-open');
assert.equal(roundVerdict({...data,testMode:true}).status,'unavailable');
assert.equal(roundVerdict({...data,games:[g('0','canceled')]}).status,'unavailable');
assert.equal(roundVerdict({...data,games:[g('0','final')]}).status,'unavailable');
const irrelevant={captureClosed:true,games:[g('0'),g('1')],participants:[p('a',{'0':'0A','1':'1A'}),p('b',{'0':'0H','1':'1A'})]};
assert.equal(roundVerdict(irrelevant).lastGameCanChangeLeaders,false);assert.equal(roundVerdict(irrelevant).allWinnersFixed,false);
assert(roundOutlookView(undecided,{detail:true}).includes('El último partido define al ganador'));
assert(roundOutlookView(irrelevant,{detail:true}).includes('La definición depende de los otros partidos pendientes.'));
const unsafe=structuredClone(data);unsafe.participants[0].name='<img src=x onerror=alert(1)>';assert(!roundOutlookView(unsafe,{detail:true}).includes('<img src=x'));assert(roundOutlookView(unsafe,{detail:true}).includes('&lt;img'));
// Independent enumeration validates universal guarantees against every possible result.
for(let seed=1;seed<=150;seed++){
 let state=seed;const rand=n=>(state=(1664525*state+1013904223)>>>0)%n;
 const gs=Array.from({length:5},(_,i)=>g(String(i),i<2?'final':'scheduled',i<2?rand(3):null,i<2?rand(3):null));
 const ps=Array.from({length:6},(_,i)=>p(String(i),Object.fromEntries(gs.map(x=>[x.id,[x.away,x.home,'TIE'][rand(3)]]))));
 const d={captureClosed:true,games:gs,participants:[...ps,p('incomplete',{})]},copy=JSON.stringify(d),all=[];
 const visit=(i,results)=>{if(i===gs.length){const rows=ps.map(person=>({id:person.id,points:gs.reduce((n,x)=>n+(person.choices[x.id]===results[x.id]),0)}));const top=Math.max(...rows.map(x=>x.points));all.push(rows.filter(x=>x.points===top).map(x=>x.id));return;}const x=gs[i];for(const value of x.status==='final'?[x.awayScore===x.homeScore?'TIE':x.awayScore>x.homeScore?x.away:x.home]:[x.away,x.home,'TIE'])visit(i+1,{...results,[x.id]:value});};visit(0,{});
 const r=roundVerdict(d);assert.deepEqual(ids(r.guaranteedFirst),ps.filter(x=>all.every(w=>w.includes(x.id))).map(x=>x.id).sort());assert.deepEqual(ids(r.guaranteedSolo),ps.filter(x=>all.every(w=>w.length===1&&w[0]===x.id)).map(x=>x.id).sort());assert.deepEqual(ids(r.possibleFirst),ps.filter(x=>all.some(w=>w.includes(x.id))).map(x=>x.id).sort());assert.deepEqual(ids(r.possibleSolo),ps.filter(x=>all.some(w=>w.length===1&&w[0]===x.id)).map(x=>x.id).sort());assert.equal(JSON.stringify(d),copy);
}
console.log('OK: virtual solo/shared, last-game effects, 9 outcomes including TIE, open capture and 150 exhaustive universal checks.');
