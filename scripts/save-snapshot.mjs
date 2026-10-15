import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

for(const file of ['scores.json','league.json']){
  const local=await fs.readFile(file,'utf8');
  const remote=JSON.parse(execFileSync('gh',['api',`repos/${process.env.GITHUB_REPOSITORY}/contents/${file}`],{encoding:'utf8',maxBuffer:3000000}));
  const old=Buffer.from(remote.content.replaceAll('\n',''),'base64').toString('utf8');
  if(local===old)continue;
  const payload={message:'Actualiza resultados y posiciones de la NFL',content:Buffer.from(local).toString('base64'),sha:remote.sha,branch:'main',author:{name:'Luis Montañez Escobar',email:'308913577+luismesco@users.noreply.github.com'},committer:{name:'Luis Montañez Escobar',email:'308913577+luismesco@users.noreply.github.com'}};
  execFileSync('gh',['api','--method','PUT',`repos/${process.env.GITHUB_REPOSITORY}/contents/${file}`,'--input','-'],{input:JSON.stringify(payload),stdio:['pipe','ignore','inherit']});
  console.log(`Consulta conservada: ${file}`);
}
