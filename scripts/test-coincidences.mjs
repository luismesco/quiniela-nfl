// Autor: Luis Montañez Escobar.
import assert from 'node:assert/strict';
import {coincidences,coincidencesView} from '../portal/coincidences.mjs';
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const games=[{id:'g1',away:'A',home:'B',status:'final',awayScore:7,homeScore:0},{id:'g2',away:'C',home:'D',status:'live',awayScore:0,homeScore:0},{id:'g3',away:'E',home:'F',status:'scheduled',awayScore:null,homeScore:null}];
const person=(id,choices,role='participant')=>({id,name:id,role,choices});
const base=()=>({games:structuredClone(games),teams:{},captureClosed:true,participants:[person('me',{g1:'A',g2:'C',g3:'TIE'}),person('clone',{g1:'A',g2:'C',g3:'TIE'}),person('past-miss',{g1:'B',g2:'C',g3:'TIE'}),person('rival',{g1:'A',g2:'D',g3:'E'}),person('partial',{g1:'A',g2:'C'}),person('empty',{}),person('cuenta-prueba',{g1:'A',g2:'C',g3:'TIE'}),person('test',{g1:'A',g2:'C',g3:'TIE'},'test')]});
let d=base(),r=coincidences(d,'me');
eq(r.identical.map(p=>p.id),['clone']);eq(r.samePending.map(p=>p.id),['clone','past-miss']);eq(r.scenario.leaders.map(p=>p.id),['clone','me']);eq(r.scenario.points,3);eq(r.scenario.shared,true);eq(r.incompleteRivals,2);eq(r.rivals.find(p=>p.id==='partial').matches,2);eq(r.own.correct,1);eq(r.scenario.results.g2,'C');eq(r.scenario.results.g3,'TIE');
const before=JSON.stringify(d);coincidencesView(d,'me',{dirty:true});eq(JSON.stringify(d),before);eq(coincidencesView(d,'me',{dirty:true}).includes('cambios sin guardar'),true);
d=base();d.games[0].awayScore=0;d.games[0].homeScore=7;r=coincidences(d,'me');eq(r.scenario.leads,false);eq(r.scenario.leaders.map(p=>p.id),['past-miss']);eq(r.scenario.points,2);
d=base();d.games[0].awayScore=d.games[0].homeScore=0;d.participants[0].choices.g1='TIE';r=coincidences(d,'me');eq(r.own.correct,1);eq(r.scenario.results.g1,'TIE');eq(r.identical.length,0);
d=base();d.games[0].awayScore=null;r=coincidences(d,'me');eq(r.scenario,null);eq(r.reason.includes('marcador final válido'),true);d.participants[0].choices.g1='TIE';d.games[0].homeScore=null;eq(coincidences(d,'me').own.correct,0);
d=base();d.games[1].status='canceled';eq(coincidences(d,'me').scenario,null);
d=base();delete d.participants[0].choices.g3;r=coincidences(d,'me');eq(r.identical.length,0);eq(r.scenario,null);eq(r.own.complete,false);
d=base();d.participants[0].choices.g3='INVALID';eq(coincidences(d,'me').scenario,null);
eq(coincidences({...base(),testMode:true},'me').available,false);eq(coincidences(base(),'missing').available,false);eq(coincidences({...base(),games:[]},'me').available,false);
d=base();d.games[1]={...d.games[1],status:'final',awayScore:0,homeScore:0};d.games[2]={...d.games[2],status:'final',awayScore:0,homeScore:0};r=coincidences(d,'me');eq(r.pending,0);eq(r.samePending.length,0);eq(r.scenario.points,2);eq(coincidencesView(d,'me').includes('Clasificación final'),true);
d=base();d.participants[1].name='<img src=x onerror=alert(1)>';let html=coincidencesView(d,'me');eq(html.includes('<img src=x'),false);eq(html.includes('&lt;img src=x'),true);
d=base();html=coincidencesView(d,'me');eq(html.includes('porcentaje de probabilidad'),true);eq(coincidencesView({...d,captureClosed:false},'me').includes('captura sigue abierta'),true);
// Exhaustive independent oracle: each person can pick any of three outcomes
// for three games. Vary all final outcomes; the other games remain pending.
let cases=0;
const choices=[['A','B','TIE'],['C','D','TIE'],['E','F','TIE']];
for(const final of choices[0])for(const x of choices[0])for(const y of choices[1])for(const z of choices[2])for(const q of choices[1])for(const v of choices[2]){
 const own={g1:x,g2:y,g3:z},other={g1:final,g2:q,g3:v},g=structuredClone(games);g[0].awayScore=final==='A'?7:0;g[0].homeScore=final==='B'?7:0;
 const data={games:g,participants:[person('me',own),person('rival',other)],teams:{}};const report=coincidences(data,'me');
 const results=[final,y,z],points=p=>['g1','g2','g3'].reduce((n,k,i)=>n+Number(p[k]===results[i]),0),a=points(own),b=points(other);
 assert.equal(report.scenario.points,a);assert.equal(report.scenario.leads,a>=b);assert.equal(report.scenario.shared,a===b);assert.equal(report.identical.length,Number(x===final&&y===q&&z===v));cases++;
}
console.log(JSON.stringify({checks,oracleCases:cases,passed:true}));
