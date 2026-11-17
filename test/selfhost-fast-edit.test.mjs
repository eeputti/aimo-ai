import test from 'node:test';
import assert from 'node:assert/strict';
import { fastEdit } from '../deploy/selfhost-demo/fast-edit.mjs';
import { demoSettings,demoEnvironment } from '../deploy/selfhost-demo/settings.mjs';
const line=(ref,productTerm,value=20,unit='L',extra={})=>({ref,productTerm,quantity:{value,unit},claims:['FREE_FROM_LACTOSE'],excludeAllergens:[],...extra});
const draft=(lines=[line('L1','laktoositonta maito')])=>({lines,deliveryDate:'2026-11-20',diet:{known:true,claims:[],excludeAllergens:['AN']}});
test('explicit quantity edits preserve constraints and date without producing extra operations',()=>{
 const d=draft();const original=structuredClone(d);
 for(const text of ['Muuta maidon määrä 30 litraan.','maitoa 30 l','eikun 30 litraa']){
  assert.deepEqual(fastEdit({text,draft:d}),{intent:'order',deliveryDate:null,via:'fast-edit',ops:[{op:'update',ref:'L1',quantity:{value:30,unit:'L'}}]});
 }
 assert.deepEqual(d,original);
});
test('decimals and physical unit changes are exact; sales packages are not inferred',()=>{
 assert.equal(fastEdit({text:'kermaa 5 desiä',draft:draft([line('L2','kerma')])}).ops[0].quantity.value,0.5);
 assert.equal(fastEdit({text:'voita 250 grammaa',draft:draft([line('L3','voi',2,'KG')])}).ops[0].quantity.value,0.25);
 assert.equal(fastEdit({text:'maitoa 1,5 litraa',draft:draft()}).ops[0].quantity.value,1.5);
 assert.equal(fastEdit({text:'kananmunia 60 kpl',draft:draft([line('L4','kananmuna',30,'PCS')])}).ops[0].quantity.basis,'items');
 assert.equal(fastEdit({text:'kananmunia 60 kpl',draft:draft([line('L4','kananmuna',2,'PCS',{quantity:{value:2,unit:'PCS',basis:'sales'}})])}),null);
 assert.equal(fastEdit({text:'kananmunia 1,5 kpl',draft:draft([line('L4','kananmuna',2,'PCS')])}),null);
});
test('ambiguous targets, dietary changes, mixed requests and incompatible units fall back to the model',()=>{
 for(const text of ['maitoa 30 l laktoosittomana','maitoa 30 l ja kermaa 5 l','maitoa 30 l huomiseksi','älä poista maitoa','poista maitoallergia','muuta maitoa 0 l','maitoa -5 l','maitoa 999999 l','maitoa 30 kg','maitoa 1.000 l','poista maito ja lisää kaurajuoma']) assert.equal(fastEdit({text,draft:draft()}),null,text);
 assert.equal(fastEdit({text:'eikun 30 l',draft:draft([line('L1','maito'),line('L2','kerma')])}),null);
 assert.equal(fastEdit({text:'maitoa 30 l',draft:draft([line('L1','maito'),line('L2','laktoositon maito')])}),null);
 assert.equal(fastEdit({text:'maitoa 30 l',draft:draft([line('L1','kauramaito')])}),null);
 assert.equal(fastEdit({text:'maitoa 30 l',draft:draft([line('L1','suklaa maito')])}),null);
 assert.equal(fastEdit({text:'maitoa 30 l',draft:draft([line('L1','maito ja kerma')])}),null);
});
test('removal only targets one named existing line and settings retain a disable switch',()=>{
 assert.deepEqual(fastEdit({text:'Poista maito.',draft:draft()}).ops,[{op:'remove',ref:'L1'}]);
 assert.equal(fastEdit({text:'poista kerma',draft:draft()}),null);
 assert.equal(demoSettings({}).fastEdits,true);assert.equal(demoSettings({DEMO_FAST_EDITS:'false'}).fastEdits,false);
 assert.equal(demoEnvironment({DEMO_KEEP_ALIVE:'45m'}).DEMO_KEEP_ALIVE,'45m');
 assert.throws(()=>demoSettings({DEMO_KEEP_ALIVE:'100h'}),/DEMO_KEEP_ALIVE/);
});
