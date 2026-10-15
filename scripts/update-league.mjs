const abbr=t=>({LAR:'LA',WSH:'WAS',JAC:'JAX',OAK:'LV',SD:'LAC'}[t]||t);
const divisions={
  AFC:{Este:['BUF','MIA','NE','NYJ'],Norte:['BAL','CIN','CLE','PIT'],Sur:['HOU','IND','JAX','TEN'],Oeste:['DEN','KC','LAC','LV']},
  NFC:{Este:['DAL','NYG','PHI','WAS'],Norte:['CHI','DET','GB','MIN'],Sur:['ATL','CAR','NO','TB'],Oeste:['ARI','LA','SF','SEA']}
};
export function parseCsv(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));if(row.length>1)rows.push(row);row=[];field='';}else field+=c;}if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const keys=rows.shift();return rows.map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]??''])));}
function easternDate(date,time){if(!time)return null;const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00Z')).find(p=>p.type==='timeZoneName').value;const m=offset.match(/GMT([+-])(\d+)(?::(\d+))?/);const mins=m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0)):0;return new Date(Date.parse(date+'T'+time+':00Z')-mins*60000).toISOString();}
export function csvCalendar(text,season){return parseCsv(text).filter(g=>Number(g.season)===season&&g.game_type==='REG').map(g=>{const done=g.home_score!==''&&g.away_score!=='';return {id:g.game_id,phase:'REG',week:Number(g.week),away:abbr(g.away_team),home:abbr(g.home_team),start:easternDate(g.gameday,g.gametime),date:g.gameday+'T18:00:00Z',timeTbd:!g.gametime,venue:g.stadium||null,neutral:g.location==='Neutral',status:done?'final':'scheduled',awayScore:done?Number(g.away_score):null,homeScore:done?Number(g.home_score):null};});}
export function normalizeStandings(raw,season){
  const seasonValue=typeof raw.season==='object'?raw.season.year:raw.season;if(seasonValue&&Number(seasonValue)!==season)throw Error('Posiciones de otra temporada');
  const groups=[];
  for(const [conference,divs] of Object.entries(divisions)){
    const conf=raw.children?.find(c=>c.abbreviation===conference);if(!conf)throw Error('Conferencia no disponible');
    if(Number(conf.standings?.season)!==season)throw Error('Temporada de posiciones no coincide');
    const all=conf.standings.entries.map((r,index)=>{const stats=Object.fromEntries(r.stats.map(s=>[s.name,s.value]));return {team:abbr(r.team.abbreviation),sourceOrder:index,wins:stats.wins,losses:stats.losses,ties:stats.ties||0,pct:stats.winPercent,differential:stats.pointDifferential??stats.differential,pointsFor:stats.pointsFor,pointsAgainst:stats.pointsAgainst};});
    for(const [division,teams] of Object.entries(divs)){const rows=all.filter(t=>teams.includes(t.team));if(rows.length!==4||rows.some(t=>![t.wins,t.losses,t.ties,t.pct,t.differential].every(Number.isFinite)))throw Error('Registros de división incompletos');groups.push({conference,division,teams:rows});}
  }
  if(new Set(groups.flatMap(g=>g.teams.map(t=>t.team))).size!==32)throw Error('Posiciones sin los 32 equipos');return groups;
}
function eventGames(payload,phase,season){if(Number(payload.season?.year)!==season)return [];const result=[];for(const e of payload.events||[]){const c=e.competitions?.[0],a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');if(!a||!h)continue;const away=abbr(a.team?.abbreviation),home=abbr(h.team?.abbreviation);if(!Object.values(divisions).some(div=>Object.values(div).flat().includes(away))||!Object.values(divisions).some(div=>Object.values(div).flat().includes(home)))continue;const type=(c.status||e.status)?.type||{},done=type.state==='post'&&type.completed===true&&type.name?.startsWith('STATUS_FINAL');result.push({id:phase+'_'+e.id,phase,week:Number(e.week?.number||payload.week?.number),away,home,start:e.date,date:e.date,timeTbd:c.timeValid===false,venue:c.venue?.fullName||null,neutral:Boolean(c.neutralSite),status:done?'final':type.state==='in'?'live':'scheduled',awayScore:done||type.state==='in'?Number(a.score):null,homeScore:done||type.state==='in'?Number(h.score):null});}return result;}
export async function buildLeague(d,scoreboard,previous,get,at){
  const rawStandings=await get(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${d.season}&seasontype=2`);
  const standings=normalizeStandings(rawStandings,d.season);
  let games=previous?.season===d.season?previous.games:[],slots=previous?.slots||[],calendarUpdatedAt=previous?.calendarUpdatedAt;
  if(!games.length||!calendarUpdatedAt||Date.parse(at)-Date.parse(calendarUpdatedAt)>86400000){
    const response=await fetch('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Calendario no disponible');games=csvCalendar(await response.text(),d.season);if(games.length!==272)throw Error('Calendario regular sin los 272 encuentros');
    const calendar=scoreboard.leagues?.[0]?.calendar||[];slots=[];
    const stages=calendar.filter(s=>['1','3'].includes(String(s.value)));
    for(const stage of stages){const phase=String(stage.value)==='1'?'PRE':'POST';for(const entry of stage.entries||[]){const week=Number(entry.value);slots.push({phase,week,label:phase==='POST'?({1:'Comodines',2:'Ronda divisional',3:'Finales de conferencia',4:'Super Bowl LXI'}[week]||entry.label):week===1?'Salón de la Fama':`Pretemporada · Semana ${week-1}`,start:entry.startDate,end:entry.endDate,displayDate:phase==='POST'?'Fechas y cruces de la ronda por confirmar':entry.detail});}}
    const extra=await Promise.all(slots.map(async s=>{const type=s.phase==='PRE'?1:3;try{return eventGames(await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${d.season}&seasontype=${type}&week=${s.week}&limit=100`),s.phase,d.season);}catch{return [];}}));games.push(...extra.flat());calendarUpdatedAt=at;
  }
  for(const e of scoreboard.events||[]){const c=e.competitions?.[0],a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');const g=games.find(g=>g.phase==='REG'&&g.week===d.week&&g.away===abbr(a?.team?.abbreviation)&&g.home===abbr(h?.team?.abbreviation));if(!g)continue;const type=(c.status||e.status)?.type||{},done=type.state==='post'&&type.completed===true&&type.name?.startsWith('STATUS_FINAL');if(done||type.state==='in'){g.status=done?'final':'live';g.awayScore=Number(a.score);g.homeScore=Number(h.score);}g.start=e.date;}
  return {schema:1,season:d.season,fetchedAt:at,calendarUpdatedAt,standingsUpdatedAt:at,standingsSource:'ESPN',calendarSource:'nflverse / ESPN',games,slots,standings};
}
