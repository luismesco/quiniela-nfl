// Autor: Luis Montañez Escobar.
import assert from 'node:assert/strict';
import {journeyTools,journeyToolButtons,portalNavigation,secondarySections} from '../portal/journey-tools.mjs';
import {previewEnabled,canPreview} from '../portal/compact-preview.mjs';
import {appPreviewEnabled,previewEntry,appNavigation,appLayout} from '../portal/app-preview.mjs';
const data={games:[],participants:[],treasurer:{winner:{name:'<unsafe>'}},contributionAccess:{canView:true}};
assert.equal(journeyTools(data).length,7);assert.equal(new Set(journeyTools(data).map(t=>t.id)).size,7);
assert.deepEqual(journeyTools({...data,testMode:true,contributionAccess:{canView:false}}).map(t=>t.id),['share','teams']);
assert.equal(journeyTools({...data,contributionAccess:{canView:false}}).some(t=>t.id==='contributions'),false);
assert.ok(journeyToolButtons(data,{details:true}).includes('&lt;unsafe&gt;'));assert.ok(!journeyToolButtons(data,{details:true}).includes('<unsafe>'));
assert.ok(journeyToolButtons(data).includes('ajolote-coincidencias-v2'));
const owner={id:'luis',role:'admin'};
for(const u of [null,{id:'luis',role:'participant'},{id:'other',role:'admin'},{id:'test',role:'test'}]){assert.ok(!canPreview(u));assert.ok(!previewEnabled(u,'?vista=app'));assert.ok(!appPreviewEnabled(u,'?vista=app'));assert.equal(previewEntry(u,false),'');}
assert.ok(appPreviewEnabled(owner,'?vista=app'));assert.ok(previewEnabled(owner,'?vista=compacta'));assert.ok(!appPreviewEnabled(owner,'?vista=compacta'));
assert.ok(previewEntry(owner,false).includes('target="_blank"'));assert.ok(previewEntry(owner,false).includes('noopener'));assert.ok(previewEntry(owner,true).includes('data-sandbox="exit"'));
assert.deepEqual(portalNavigation({role:'test'}).map(s=>s.id),['picks','calendar','standings','feedback']);assert.ok(!secondarySections({role:'participant'}).some(s=>s.id==='admin'));
assert.equal((appNavigation('ranking',()=>'<svg/>').match(/<button/g)||[]).length,4);assert.ok(appNavigation('ranking',()=>'<svg/>').includes('aria-current="page"'));assert.ok(appLayout('<form id="existing-form"></form>','picks').includes('<form id="existing-form"></form>'));
console.log('PASS: catálogo único, roles, acceso privado, navegación y formulario reutilizado');
