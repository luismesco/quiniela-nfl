import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeFeed,feedUrl,inMonitoringWindow} from '../live.mjs';
import {buildLeague} from './update-league.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const d=JSON.parse(await fs.readFile(path.join(root,'quiniela.json'),'utf8'));
const forced=process.argv.includes('--force');
if(!forced&&!inMonitoringWindow(d)){console.log('Fuera de la ventana de partidos; no se consulta la fuente.');process.exit(0);}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`Fuente HTTP ${r.status}`);return r.json();}
const payload=await get(feedUrl(d));const at=new Date().toISOString();
const snapshot=normalizeFeed(payload,d,at);
await fs.writeFile(path.join(root,'scores.json'),JSON.stringify(snapshot,null,2)+'\n');
let previous=null;try{previous=JSON.parse(await fs.readFile(path.join(root,'league.json'),'utf8'));}catch{}
const league=await buildLeague(d,payload,previous,get,at);
await fs.writeFile(path.join(root,'league.json'),JSON.stringify(league,null,2)+'\n');
console.log(JSON.stringify({season:d.season,week:d.week,matched:snapshot.matched,statuses:snapshot.games.map(g=>g.status),calendarGames:league.games.length,standingsTeams:league.standings.reduce((n,g)=>n+g.teams.length,0),fetchedAt:at}));
