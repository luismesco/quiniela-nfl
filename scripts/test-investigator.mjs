import assert from 'node:assert/strict';
import {investigate} from '../portal/investigator.mjs';
import {selectionModel, jpegPdf} from '../portal/selection-export.mjs';

const game=(id,status='scheduled',awayScore=null,homeScore=null)=>({id,away:id+'A',home:id+'H',status,awayScore,homeScore});
const games=[game('1','final',10,10),game('2'),game('3')];
const p=(id,choices)=>({id,name:id,choices,paid:null});
const d={games,participants:[p('me',{'1':'TIE','2':'2A','3':'3H'}),p('rival',{'1':'TIE','2':'2A','3':'3A'}),p('incomplete',{'1':'TIE'}),{...p('test',{'1':'TIE','2':'2A','3':'3H'}),role:'test'}],roundId:'2026-REG-7',season:2026,week:7,teams:{},captureClosed:true};
const original=JSON.stringify(d);
let r=investigate(d,'me');
assert.equal(r.canLead,true);assert.equal(r.canWinSolo,true);assert.equal(r.current,1);
r=investigate(d,'me',{'3':'3A'});assert.equal(r.canLead,false);
r=investigate(d,'me',{'3':'TIE'});assert.equal(r.canWinSolo,false);assert.equal(r.canLead,true);
assert.deepEqual(r.witness.leaders,['me','rival']);
assert.equal(investigate(d,'incomplete').eligible,false);
assert.equal(investigate({...d,testMode:true},'me').eligible,false);
assert.throws(()=>investigate(d,'me',{'1':'1A'}),/final/);
assert.throws(()=>investigate(d,'me',{'2':'3A'}),/resultado/);
assert.equal(JSON.stringify(d),original);
// An independent exhaustive oracle checks mathematical feasibility and every condition.
for(let seed=1;seed<=70;seed++){
 let rand=seed;const next=n=>(rand=(rand*1664525+1013904223)>>>0)%n;
 const gs=Array.from({length:4},(_,i)=>game(String(i),i===0?'final':'scheduled',i===0?next(3):null,i===0?next(3):null));
 const ps=Array.from({length:5},(_,i)=>p(String(i),Object.fromEntries(gs.map(g=>[g.id,[g.away,g.home,'TIE'][next(3)]]))));
 const data={games:gs,participants:ps};
 const brute=fixed=>{let lead=false,solo=false;const visit=(i,results)=>{if(i===gs.length){const points=ps.map(p=>gs.reduce((n,g)=>n+(p.choices[g.id]===results[g.id]),0));lead||=points[0]>=Math.max(...points.slice(1));solo||=points[0]>Math.max(...points.slice(1));return;}const g=gs[i],opts=g.status==='final'?[g.awayScore===g.homeScore?'TIE':g.awayScore>g.homeScore?g.away:g.home]:fixed[g.id]?[fixed[g.id]]:[g.away,g.home,'TIE'];for(const v of opts)visit(i+1,{...results,[g.id]:v});};visit(0,{});return {lead,solo};};
 for(const fixed of [{},{'1':gs[1].home},{'1':'TIE','2':gs[2].away}]){
  const out=investigate(data,'0',fixed),oracle=brute(fixed);assert.equal(out.canLead,oracle.lead);assert.equal(out.canWinSolo,oracle.solo);
  for(const route of out.routes)for(const v of [gs.find(g=>g.id===route.gameId).away,gs.find(g=>g.id===route.gameId).home,'TIE']){const check=brute({...fixed,[route.gameId]:v});assert.equal(route.lead.includes(v),check.lead);assert.equal(route.solo.includes(v),check.solo);}
 }
}
const big=Array.from({length:16},(_,i)=>game(String(i))),choices=Object.fromEntries(big.map(g=>[g.id,g.away]));
const start=performance.now();assert.equal(investigate({games:big,participants:Array.from({length:100},(_,i)=>p(String(i),choices))},'0').canWinSolo,false);assert(performance.now()-start<1500);
const m=selectionModel(d,'me');assert.equal(m.name,'me');assert.equal(m.games.length,3);assert.equal(m.games[0].choice,'TIE');assert(!JSON.stringify(m).includes('password'));
assert.throws(()=>selectionModel(d,'absent'),/participante/);
const pdf=jpegPdf(new Uint8Array([255,216,255,217]),1980,1530);
const text=new TextDecoder().decode(pdf);assert(text.includes('/MediaBox [0 0 792 612]'));assert(text.includes('/DCTDecode'));assert(!text.includes('OpenAI'));assert(text.includes('/Author <FEFF'));
console.log('OK: exact scenarios vs 210 exhaustive cases, conditions, TIE, eligibility, no mutation, 16-game performance, own export and Letter PDF.');
