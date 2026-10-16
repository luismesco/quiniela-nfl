import fs from 'node:fs/promises';
import {persist} from './persist.mjs';
const scores=JSON.parse(await fs.readFile('scores.json','utf8'));
const league=JSON.parse(await fs.readFile('league.json','utf8'));
console.log(JSON.stringify(await persist(scores,league)));
