export const ESPN_URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
export function feedUrl(d){return `${ESPN_URL}?dates=${d.season}&seasontype=2&week=${d.week}&limit=100`;}
const canonical=t=>({LAR:'LA',WSH:'WAS',JAC:'JAX',OAK:'LV',SD:'LAC'}[t]||t);
const stamp=()=>new Date().toISOString();
function phase(type){
  const n=type.name||'';
  if(n.includes('CANCELED')||n.includes('CANCELLED'))return 'canceled';
  if(n.includes('POSTPONED'))return 'postponed';
  if(n.includes('SUSPENDED'))return 'suspended';
  if(type.state==='post'&&type.completed===true&&n.startsWith('STATUS_FINAL'))return 'final';
  if(type.state==='in')return 'live';
  if(type.state==='pre')return 'scheduled';
  return null;
}
export function normalizeFeed(payload,d,fetchedAt=stamp()){
  const year=Number(payload.season?.year),week=Number(payload.week?.number);
  if(year!==d.season)throw Error('La temporada de la fuente no coincide');
  if(week!==d.week)throw Error('La semana de la fuente no coincide');
  if(payload.season?.type&&Number(payload.season.type)!==2)throw Error('Tipo de temporada distinto');
  if(!Array.isArray(payload.events))throw Error('Fuente sin encuentros');
  const updates=new Map();
  for(const e of payload.events){
    if(e.season?.year&&Number(e.season.year)!==d.season)continue;
    if(e.week?.number&&Number(e.week.number)!==d.week)continue;
    const c=e.competitions?.[0];if(!c)continue;
    const away=c.competitors?.find(x=>x.homeAway==='away'),home=c.competitors?.find(x=>x.homeAway==='home');
    if(!away||!home)continue;
    const g=d.games.find(g=>g.away===canonical(away.team?.abbreviation)&&g.home===canonical(home.team?.abbreviation));
    if(!g||Math.abs(Date.parse(e.date)-Date.parse(g.start))>36*3600000||!Number.isFinite(Date.parse(e.date)))continue;
    const s=c.status||e.status||{},type=s.type||{},status=phase(type);if(!status)continue;
    if(updates.has(g.id))throw Error('Coincidencia duplicada de encuentro');
    const hasScore=['live','final','suspended'].includes(status);
    const a=hasScore?Number(away.score):null,h=hasScore?Number(home.score):null;
    if(hasScore&&(![a,h].every(n=>Number.isInteger(n)&&n>=0&&n<200)||away.score===''||home.score===''))throw Error('Marcador inválido');
    updates.set(g.id,{id:g.id,status,awayScore:a,homeScore:h,eventId:String(e.id),clock:hasScore?String(s.displayClock||''):null,period:hasScore?Number(s.period||0):null,phaseName:String(type.name||''),sourceUrl:`https://www.espn.com/nfl/game/_/gameId/${encodeURIComponent(e.id)}`,start:e.date,checkedAt:fetchedAt});
  }
  if(!updates.size)throw Error('No hubo coincidencias de equipos y fechas');
  return {schema:1,season:d.season,week:d.week,source:'ESPN',fetchedAt,matched:updates.size,games:[...updates.values()]};
}
export function mergeScores(d,snapshot){
  if(snapshot.season!==d.season||snapshot.week!==d.week||!Number.isFinite(Date.parse(snapshot.fetchedAt)))throw Error('Copia de otra jornada o sin fecha');
  const next={...d,games:d.games.map(g=>({...g}))};
  for(const u of snapshot.games||[]){
    const g=next.games.find(g=>g.id===u.id);if(!g)continue;
    if(g.checkedAt&&Date.parse(g.checkedAt)>Date.parse(snapshot.fetchedAt))continue;
    if(g.status==='final'&&u.status!=='final')continue;
    if(g.status==='live'&&u.status==='scheduled')continue;
    const allowed=['status','awayScore','homeScore','eventId','clock','period','phaseName','sourceUrl','checkedAt','start'];
    for(const k of allowed)if(Object.hasOwn(u,k))g[k]=u[k];
  }
  next.scoresUpdatedAt=snapshot.fetchedAt;
  return next;
}
export function nextDelay(d,visible,now=Date.now()){
  if(!visible)return null;
  if(d.games.some(g=>g.status==='live'||g.status==='suspended'))return 30000;
  if(d.games.every(g=>g.status==='final'||g.status==='canceled'))return 300000;
  const near=d.games.some(g=>g.status==='scheduled'&&Math.abs(Date.parse(g.start)-now)<90*60000);
  return near?60000:300000;
}
export function inMonitoringWindow(d,now=Date.now()){
  return d.games.some(g=>Math.abs(now-Date.parse(g.start))<8*3600000)&&!d.games.every(g=>['final','canceled'].includes(g.status));
}
