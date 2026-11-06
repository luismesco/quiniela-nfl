// Autor: Luis Montañez Escobar.
import {roundVerdict} from './investigator.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const portalSections=[
 {id:'picks',icon:'ball',title:'Mi quiniela',short:'Mi quiniela',main:true,test:true},
 {id:'board',icon:'people',title:'El grupo',short:'El grupo',main:true},
 {id:'ranking',icon:'trophy',title:'Clasificación',short:'Ranking',main:true},
 {id:'calendar',icon:'calendar',title:'Calendario NFL',short:'Calendario',main:true,test:true},
 {id:'standings',icon:'chart',title:'Posiciones NFL',short:'Posiciones',main:true,test:true},
 {id:'feedback',icon:'info',title:'Ayuda y comentarios',short:'Comentarios',main:true,test:true},
 {id:'admin',icon:'grid',title:'Administración',short:'Administración',main:true,admin:true},
 {id:'rules',icon:'info',title:'Cómo se juega',short:'Reglas',test:true},
 {id:'account',icon:'grid',title:'Mi cuenta',short:'Mi cuenta',test:true}
];
export const portalNavigation=user=>portalSections.filter(s=>s.main&&(!s.admin||user?.role==='admin')&&(user?.role!=='test'||s.test));
export const secondarySections=user=>portalSections.filter(s=>['standings','feedback','admin','rules','account'].includes(s.id)&&(!s.admin||user?.role==='admin'));
export function journeyTools(data){
 const verdict=data.testMode?null:roundVerdict(data);
 return [
  {id:'treasurer',title:'Tesorero',detail:data.treasurer?.winner?.name||'Tómbola y responsable de la jornada',attribute:'data-treasurer',mascot:'ajolote-tesorero',show:!data.testMode&&!!data.treasurer},
  {id:'outlook',title:'La bolsa',detail:verdict?.status==='final'?'Consultar ganadores':`${verdict?.finished||0}/${verdict?.total||0} partidos finalizados`,attribute:'data-companion="outlook"',mascot:'ajolote-adivino',show:!data.testMode},
  {id:'investigate',title:'Mis posibilidades',detail:'Simular los resultados que necesitas',attribute:'data-companion="investigate"',mascot:'ajolote-investigador',show:!data.testMode},
  {id:'coincidences',title:'Coincidencias',detail:'Comparar elecciones y triunfos compartidos',attribute:'data-companion="coincidences"',mascot:'ajolote-coincidencias-v2',show:!data.testMode},
  {id:'share',title:'Compartir',detail:'Descargar tu selección en imagen o PDF',attribute:'data-companion="share"',mascot:'ajolote-fotografo',show:true},
  {id:'contributions',title:'Aportaciones',detail:'Consultar el control y descargar Excel',attribute:'data-contributions',mascot:'ajolote-tesorero',show:!!data.contributionAccess?.canView},
  {id:'teams',title:'Los equipos',detail:'Estadísticas y comparación NFL',attribute:'data-team-stats',mascot:'ajolote-estadisticas',show:true}
 ].filter(t=>t.show);
}
export function journeyToolButtons(data,{className='compact-tool',details=false}={}){
 return journeyTools(data).map(t=>`<button type="button" class="${esc(className)}" ${t.attribute} data-journey-tool="${t.id}" aria-haspopup="dialog" aria-label="${esc(t.title+': '+t.detail)}"><img src="/assets/mascotas/${t.mascot}.png" width="40" height="44" alt=""><strong>${esc(t.title)}</strong>${details?`<small>${esc(t.detail)}</small><span aria-hidden="true">↗</span>`:''}</button>`).join('');
}
