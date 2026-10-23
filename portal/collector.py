"""Calendario y marcadores de la temporada. Autor: Luis Montañez Escobar."""
import json
import time
import csv
import io
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import certifi
import requests

ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
ALIASES={'LAR':'LA','WSH':'WAS','JAC':'JAX','OAK':'LV','SD':'LAC'}


def at(value):
    try:return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
    except (AttributeError,ValueError,TypeError):return None


def fetch(url,params=None):
    response=requests.get(url,params=params,headers={'User-Agent':'LaQuinielaFiscalizada/2.0'},verify=certifi.where(),timeout=20)
    response.raise_for_status()
    return response.json()


def refresh_calendar(league,stamp):
    response=requests.get('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',verify=certifi.where(),timeout=25)
    response.raise_for_status();games=[];previous={g['id']:g for g in league['games']}
    for row in csv.DictReader(io.StringIO(response.text)):
        if row['season']!='2026' or row['game_type']!='REG':continue
        done=row['home_score']!='' and row['away_score']!='';start=None
        if row.get('gametime'):
            start=datetime.fromisoformat(row['gameday']+'T'+row['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc).isoformat()
        g={'id':row['game_id'],'phase':'REG','week':int(row['week']),'away':ALIASES.get(row['away_team'],row['away_team']),
           'home':ALIASES.get(row['home_team'],row['home_team']),'start':start,'date':row['gameday']+'T18:00:00Z','timeTbd':not bool(start),
           'venue':row.get('stadium'),'neutral':row.get('location')=='Neutral','status':'final' if done else 'scheduled',
           'awayScore':int(float(row['away_score'])) if done else None,'homeScore':int(float(row['home_score'])) if done else None}
        old=previous.get(g['id'])
        if old and old['status'] in ('final','live','suspended') and not done:
            for k in ('status','awayScore','homeScore','clock','period','checkedAt'):
                if k in old:g[k]=old[k]
        games.append(g)
    if len(games)!=272 or len({g['id'] for g in games})!=272:raise ValueError('Calendario regular incompleto')
    return {**league,'games':games+[g for g in league['games'] if g['phase']!='REG'],'calendarUpdatedAt':stamp,'calendarSource':'nflverse / ESPN'}


def refresh_standings(league,stamp):
    raw=fetch('https://site.api.espn.com/apis/v2/sports/football/nfl/standings',{'season':2026,'seasontype':2})
    groups=json.loads(json.dumps(league['standings']));all_teams={}
    for conf in raw.get('children',[]):
        table=conf.get('standings',{})
        if int(table.get('season',0))!=2026:raise ValueError('Posiciones de otra temporada')
        for rank,row in enumerate(table.get('entries',[])):
            code=row['team']['abbreviation'];code=ALIASES.get(code,code);stats={x['name']:x.get('value') for x in row['stats']}
            if any(not isinstance(stats.get(k),(int,float)) for k in ('wins','losses','winPercent')):raise ValueError('Posiciones incompletas')
            all_teams[code]={'team':code,'sourceOrder':rank,'wins':stats['wins'],'losses':stats['losses'],'ties':stats.get('ties',0),
                             'pct':stats['winPercent'],'differential':stats.get('pointDifferential',stats.get('differential',0)),
                             'pointsFor':stats.get('pointsFor'),'pointsAgainst':stats.get('pointsAgainst')}
    if len(all_teams)!=32:raise ValueError('Posiciones sin los 32 equipos')
    for group in groups:group['teams']=[all_teams[t['team']] for t in group['teams']]
    return {**league,'standings':groups,'standingsUpdatedAt':stamp,'standingsSource':'ESPN'}


def collect(db,cache_get,cache_set,import_games,state,record_state):
    now=time.time();stamp=datetime.now(timezone.utc).isoformat()
    with db() as conn:
        league=cache_get(conn,'league')
        monitor=cache_get(conn,'monitor_status',{})
    if not monitor.get('calendarCheckedAt') or now-(at(monitor['calendarCheckedAt']) or 0)>=86400:
        league=refresh_calendar(league,stamp)
        with db() as conn:import_games(conn,league);cache_set(conn,'league',league)
        monitor['calendarCheckedAt']=stamp
    with db() as conn:
        all_games=[dict(r) for r in conn.execute('SELECT * FROM games')]
    active=[g for g in all_games if g['status'] != 'canceled' and at(g['start']) and -3600<=now-at(g['start'])<=28800]
    # Outside games, refresh the next published week and standings periodically, without continuous polling.
    due=bool(active) or not monitor.get('lastSourceCheck') or now-(at(monitor['lastSourceCheck']) or 0)>6*3600
    updates=[]
    if due:
        if not monitor.get('standingsCheckedAt') or now-(at(monitor['standingsCheckedAt']) or 0)>=900:
            league=refresh_standings(league,stamp);monitor['standingsCheckedAt']=stamp
        feeds=[fetch(ESPN,{'limit':100})]
        keys={(2026,{'REG':2,'PRE':1,'POST':3}[g['phase']],g['week']) for g in league['games'] if g['id'] in {x['id'] for x in active}}
        current=feeds[0]
        keys.discard((int(current.get('season',{}).get('year',0)),int(current.get('season',{}).get('type',0)),int(current.get('week',{}).get('number',0))))
        for year,phase,week in keys:feeds.append(fetch(ESPN,{'dates':year,'seasontype':phase,'week':week,'limit':100}))
        for payload in feeds:
            if int(payload.get('season',{}).get('year',0))!=2026:raise ValueError('Marcadores de otra temporada')
            phase={1:'PRE',2:'REG',3:'POST'}.get(int(payload.get('season',{}).get('type',0)))
            if not phase:raise ValueError('Fase inválida')
            for event in payload.get('events',[]):
                c=event.get('competitions',[{}])[0];competitors=c.get('competitors',[])
                away=next((x for x in competitors if x.get('homeAway')=='away'),None)
                home=next((x for x in competitors if x.get('homeAway')=='home'),None)
                if not away or not home:continue
                a=ALIASES.get(away.get('team',{}).get('abbreviation'),away.get('team',{}).get('abbreviation'))
                h=ALIASES.get(home.get('team',{}).get('abbreviation'),home.get('team',{}).get('abbreviation'))
                week=int(event.get('week',{}).get('number',payload.get('week',{}).get('number',0)))
                rid=f'2026-{phase}-{week}'
                game=next((x for x in all_games if x['round_id']==rid and x['away']==a and x['home']==h),None)
                start=event.get('date');start_epoch=at(start)
                if not start_epoch:raise ValueError('Fecha de partido inválida')
                status=c.get('status',event.get('status',{}));typ=status.get('type',{});name=typ.get('name','')
                value='canceled' if 'CANCELED' in name or 'CANCELLED' in name else 'postponed' if 'POSTPONED' in name else 'suspended' if 'SUSPENDED' in name else 'final' if name.startswith('STATUS_FINAL') and typ.get('completed') and typ.get('state')=='post' else 'live' if typ.get('state')=='in' else 'scheduled' if typ.get('state')=='pre' else None
                if not value:continue
                score_needed=value in ('live','final','suspended')
                scores=[away.get('score'),home.get('score')]
                if score_needed and any(isinstance(v,bool) or not str(v).isdigit() or not 0<=int(v)<200 for v in scores):raise ValueError('Marcador inválido')
                update={'id':game['id'] if game else f'{phase}_{event["id"]}','phase':phase,'week':week,'away':a,'home':h,'start':start,'date':start,
                    'status':value,'awayScore':int(scores[0]) if score_needed else None,'homeScore':int(scores[1]) if score_needed else None,
                    'venue':c.get('venue',{}).get('fullName'), 'neutral':bool(c.get('neutralSite')),'timeTbd':c.get('timeValid') is False,
                    'eventId':str(event['id']),'sourceUrl':f'https://www.espn.com/nfl/game/_/gameId/{event["id"]}',
                    'period':status.get('period'),'clock':status.get('displayClock'),'checkedAt':stamp}
                if game and game['status']=='final' and value!='final':continue
                if game and game['status'] in ('live','suspended') and value=='scheduled':continue
                updates.append(update)
        if updates:
            by_id={g['id']:g for g in league['games']}
            for update in updates:by_id[update['id']]={**by_id.get(update['id'],{}),**update}
            league['games']=list(by_id.values());league['fetchedAt']=stamp
            with db() as conn:import_games(conn,league);cache_set(conn,'league',league)
        else:
            with db() as conn:cache_set(conn,'league',league)
        monitor['lastSourceCheck']=stamp
    with db() as conn:
        # Only observed states are added, and previous closed weeks remain unchanged.
        relevant={g['round_id'] for g in active}|{f"2026-{g['phase']}-{g['week']}" for g in updates}
        for rid in relevant:
            if conn.execute('SELECT 1 FROM picks p JOIN games g ON g.id=p.game_id WHERE g.round_id=? LIMIT 1',(rid,)).fetchone():
                record_state(conn,state(conn,rid))
        monitor.update(checkedAt=stamp,active=bool(active),source='ESPN / nflverse',error=None)
        cache_set(conn,'monitor_status',monitor)
    return monitor
