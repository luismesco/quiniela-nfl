import {createHash} from 'node:crypto';
import {raceState,observationKey} from '../race.mjs';
import {mergeScores} from '../live.mjs';
import {validate} from '../core.mjs';
export function appendObservation(history,d,snapshot){
  const current=mergeScores(d,snapshot);validate(current);const state=raceState(current);
  const key=createHash('sha256').update(observationKey(current)).digest('hex');
  const events=[...(history?.events||[])];
  if(events.at(-1)?.stateKey===key)return {...history,events};
  if(events.at(-1)&&Date.parse(events.at(-1).observedAt)>Date.parse(snapshot.fetchedAt))return {...history,events};
  events.push({id:current.season+'-'+current.week+'-'+snapshot.fetchedAt,stateKey:key,observedAt:snapshot.fetchedAt,source:'ESPN',...state,games:current.games.map(g=>({id:g.id,start:g.start,status:g.status,away:g.away,home:g.home,awayScore:g.awayScore,homeScore:g.homeScore}))});
  return {schema:1,author:'Luis Montañez Escobar',startedAt:events[0].observedAt,updatedAt:snapshot.fetchedAt,events};
}
