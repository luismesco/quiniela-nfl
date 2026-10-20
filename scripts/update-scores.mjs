import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeFeed,feedUrl,inMonitoringWindow} from '../live.mjs';
import {buildLeague} from './update-league.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const d=JSON.parse(await fs.readFile(path.join(root,'quiniela.json'),'utf8'));
const forced=process.argv.includes('--force');
let previous=null;try{previous=JSON.parse(await fs.readFile(path.join(root,'league.json'),'utf8'));}catch{}
const daily=process.argv.includes('--daily');
if(!forced&&!daily&&!inMonitoringWindow({games:previous?.games?.length?previous.games:d.games})){console.log('Fuera de la ventana de partidos; no se consulta la fuente.');if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'updated=false\n');process.exit(0);}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`Fuente HTTP ${r.status}`);return r.json();}
const [payload,current]=await Promise.all([get(feedUrl(d)),get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100')]);const at=new Date().toISOString();
const snapshot=normalizeFeed(payload,d,at);
await fs.writeFile(path.join(root,'scores.json'),JSON.stringify(snapshot,null,2)+'\n');
const league=await buildLeague(d,Number(current.season?.year)===d.season?current:payload,previous,get,at,{refreshCalendar:daily||forced});
await fs.writeFile(path.join(root,'league.json'),JSON.stringify(league,null,2)+'\n');
console.log(JSON.stringify({season:d.season,week:d.week,matched:snapshot.matched,statuses:snapshot.games.map(g=>g.status),calendarGames:league.games.length,standingsTeams:league.standings.reduce((n,g)=>n+g.teams.length,0),fetchedAt:at}));

if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'updated=true\n');
