import {execFileSync} from 'node:child_process';
import {appendObservation} from './history.mjs';
import {mergeScores} from '../live.mjs';
import {observationKey} from '../race.mjs';
import {mergeLeagueScoreboard} from './update-league.mjs';
import fs from 'node:fs/promises';
const repo=process.env.GITHUB_REPOSITORY||'luismesco/quiniela-nfl';
const author={name:'Luis Montañez Escobar',email:'308913577+luismesco@users.noreply.github.com'};
export function api(route,method='GET',body){const out=execFileSync('gh',['api',`repos/${repo}/${route}`,...(method==='GET'?[]:['--method',method]),...(body?['--input','-']:[])],{input:body?JSON.stringify(body):undefined,encoding:'utf8',maxBuffer:80000000});return out.trim()?JSON.parse(out):null;}
function content(file,ref){let x=api(`contents/${file}?ref=${ref}`);if(x.encoding!=='base64')x=api(`git/blobs/${x.sha}`);return JSON.parse(Buffer.from(x.content.replaceAll('\n',''),'base64'));}
export async function persist(incoming,incomingLeague,{heartbeat=false,leagueScoreboard=null}={}){
 for(let attempt=0;attempt<3;attempt++){
  const head=api('git/ref/heads/main').object.sha;
  const q=content('quiniela.json',head),old=content('scores.json',head),oldLeague=content('league.json',head),history=content('race-history.json',head);
  const fresh=Date.parse(incoming.fetchedAt)>=Date.parse(old.fetchedAt)?incoming:old;
  const merged=mergeScores(mergeScores(q,old),fresh);
  const changed=observationKey(mergeScores(q,old))!==observationKey(merged);
  const due=Date.parse(fresh.fetchedAt)-Date.parse(old.fetchedAt)>=300000;
  const scores=heartbeat&&!changed&&!due?old:{...fresh,games:merged.games.map(g=>Object.fromEntries(['id','status','awayScore','homeScore','eventId','clock','period','phaseName','sourceUrl','start','checkedAt'].filter(k=>Object.hasOwn(g,k)).map(k=>[k,g[k]])))};
  let league=structuredClone(incomingLeague&&Date.parse(incomingLeague.fetchedAt)>=Date.parse(oldLeague.fetchedAt)?incomingLeague:oldLeague);
  if(leagueScoreboard&&Date.parse(incoming.fetchedAt)>=Date.parse(league.fetchedAt))league=mergeLeagueScoreboard(league,leagueScoreboard,incoming.fetchedAt);
  for(const g of league.games){const update=scores.games.find(x=>x.id===g.id);if(update)for(const k of ['status','awayScore','homeScore','start'])if(Object.hasOwn(update,k))g[k]=update[k];}
  const nextHistory=appendObservation(history,q,scores);
  const bundle={'scores.json':scores,'league.json':league,'race-history.json':nextHistory};
  const oldBundle={'scores.json':old,'league.json':oldLeague,'race-history.json':history};
  const files=Object.keys(bundle).filter(f=>JSON.stringify(bundle[f])!==JSON.stringify(oldBundle[f]));
  if(!files.length){for(const [f,v] of Object.entries(bundle))await fs.writeFile(f,JSON.stringify(v,null,2)+'\n');return {changed:false,wrote:false};}
  const commit=api(`git/commits/${head}`);
  const tree=api('git/trees','POST',{base_tree:commit.tree.sha,tree:files.map(f=>({path:f,mode:'100644',type:'blob',content:JSON.stringify(bundle[f],null,2)+'\n'}))});
  const next=api('git/commits','POST',{message:changed?'Actualiza marcador y liderato de la quiniela':'Actualiza seguimiento de la NFL',tree:tree.sha,parents:[head],author,committer:author});
  try{api('git/refs/heads/main','PATCH',{sha:next.sha,force:false});}catch(e){if(attempt<2)continue;throw e;}
  for(const [f,v] of Object.entries(bundle))await fs.writeFile(f,JSON.stringify(v,null,2)+'\n');
  return {changed,wrote:true,commit:next.sha,events:nextHistory.events.length};
 }
}
