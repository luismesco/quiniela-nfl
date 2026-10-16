import {setTimeout as sleep} from 'node:timers/promises';
import {normalizeFeed,feedUrl,inMonitoringWindow} from '../live.mjs';
import {persist,api} from './persist.mjs';
import fs from 'node:fs/promises';
const d=JSON.parse(await fs.readFile('quiniela.json','utf8'));
const league=JSON.parse(await fs.readFile('league.json','utf8'));
const until=Date.now()+5.5*3600000;
const once=process.argv.includes('--once');
if(!once&&!inMonitoringWindow({games:league.games})){console.log('No hay partidos en ventana; termina el monitor.');process.exit(0);}
let failures=0,lastKey=null,lastSaved=0;
while(once||Date.now()<until&&inMonitoringWindow({games:league.games})){
 const cycleStart=Date.now();
 try{
  const response=await fetch(feedUrl(d),{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`ESPN HTTP ${response.status}`);
  const snapshot=normalizeFeed(await response.json(),d,new Date().toISOString());
  const key=JSON.stringify(snapshot.games.map(g=>[g.id,g.status,g.awayScore,g.homeScore,g.start]));
  if(key!==lastKey||Date.now()-lastSaved>=300000){const result=await persist(snapshot,null,{heartbeat:true});if(result.wrote){api('actions/workflows/publicar.yml/dispatches','POST',{ref:'main'});console.log(JSON.stringify({at:snapshot.fetchedAt,...result}));}lastKey=key;lastSaved=Date.now();}
  failures=0;
  for(const g of league.games){const u=snapshot.games.find(x=>x.id===g.id);if(u)Object.assign(g,u);}
 }catch(e){failures++;console.error(String(e));if(once||failures>=5)throw e;}
 if(once)break;
 await sleep(Math.max(1000,30000-(Date.now()-cycleStart)));
}
