const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const schema=`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,input TEXT NOT NULL,state TEXT NOT NULL,result TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(user_id,request_id));
CREATE TABLE IF NOT EXISTS user_state(user_id TEXT PRIMARY KEY,cart TEXT);
CREATE TABLE IF NOT EXISTS runtime(id TEXT PRIMARY KEY,json TEXT NOT NULL,at INTEGER NOT NULL);`;
async function readBody(request){const raw=await request.text();if(raw.length>16000)throw new Error('Viesti on liian pitkä.');return JSON.parse(raw);}
export default {async fetch(request,env){
 try{
 const url=new URL(request.url),p=url.pathname,method=request.method;
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Pyyntö hylätty.'},403);
 if(p.startsWith('/runner/')){
  if(!env.RUNNER_TOKEN||request.headers.get('authorization')!==`Bearer ${env.RUNNER_TOKEN}`)return json({error:'Not found'},404);
  if(p==='/runner/bootstrap'&&method==='POST'){await env.DB.exec(schema);return json({ok:true});}
  if(p==='/runner/heartbeat'&&method==='POST'){
   const b=await readBody(request);await env.DB.prepare('INSERT OR REPLACE INTO runtime VALUES(?,?,?)').bind('runner',JSON.stringify({model:b.model,ready:b.ready===true}),Date.now()).run();return json({ok:true});
  }
  if(p==='/runner/claim'&&method==='POST'){
   // Only one local model worker. Atomic queue claim prevents duplicate processing.
   await env.DB.prepare("UPDATE jobs SET state='queued',updated=? WHERE state='running' AND updated<?").bind(Date.now(),Date.now()-480000).run();
   const j=await env.DB.prepare("UPDATE jobs SET state='running',updated=? WHERE id=(SELECT id FROM jobs WHERE state='queued' ORDER BY created LIMIT 1) AND state='queued' RETURNING id,user_id,input").bind(Date.now()).first();return json({job:j||null});
  }
  if(p==='/runner/complete'&&method==='POST'){
   const b=await readBody(request);const j=await env.DB.prepare('SELECT user_id,state FROM jobs WHERE id=?').bind(b.id).first();
   if(!j)return json({error:'Not found'},404);
   if(j.state==='done')return json({ok:true});
   if(typeof b.result?.text!=='string'||!('cart' in b.result))return json({error:'Invalid result'},400);
   await env.DB.batch([
    env.DB.prepare("UPDATE jobs SET state='done',result=?,updated=? WHERE id=?").bind(JSON.stringify(b.result),Date.now(),b.id),
    env.DB.prepare('INSERT OR REPLACE INTO user_state VALUES(?,?)').bind(j.user_id,JSON.stringify(b.result.cart)),
   ]);return json({ok:true});
  }
  return json({error:'Not found'},404);
 }
 // Privileged service QA uses its own namespace; it cannot select a real visitor's identity.
 const qa=request.headers.get('x-aimo-test-user');
 const serviceQA=env.RUNNER_TOKEN&&request.headers.get('authorization')===`Bearer ${env.RUNNER_TOKEN}`&&/^qa-[a-f0-9-]{36}$/.test(qa||'');
 const user=request.headers.get('oai-authenticated-user-id')||(serviceQA?'service-test:'+qa:null);
 if(!user){if(p==='/')return new Response('<!doctype html><html lang="fi"><meta charset="utf-8"><title>Aimo live-demo</title><p><a target="_top" href="/signin-with-chatgpt?return_to=%2F">Kirjaudu ChatGPT:llä ja avaa oma live-demo</a></p></html>',{headers:{'content-type':'text/html; charset=utf-8'}});return json({error:'Kirjaudu ensin.'},401);}
 if(method==='GET'&&['/','/style.css','/app.js'].includes(p)){
  const file=p==='/'?'page.html':p.slice(1);return new Response(ASSETS[file],{headers:{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none';"}});
 }
 if(p==='/api/status'&&method==='GET'){
  const r=await env.DB.prepare("SELECT json,at FROM runtime WHERE id='runner'").first();const status=r?JSON.parse(r.json):{};
  const ready=!!r&&Date.now()-r.at<45000&&status.ready===true;
  return json({ready,model:status.model||'qwen3:8b',message:ready?'Live-malli on yhdistetty. Vastauksessa voi kestää 1–3 minuuttia.':'Mallipalvelin ei ole juuri nyt yhteydessä. Odota hetki ja päivitä sivu.',products:['Maito','Laktoositon maito','Kerma','Voi','Kananmunat','Peruna','Kaurajuoma']});
 }
 if(p==='/api/cart'&&method==='GET'){
  const r=await env.DB.prepare('SELECT cart FROM user_state WHERE user_id=?').bind(user).first();return json({cart:r?JSON.parse(r.cart):null});
 }
 if(p==='/api/history'&&method==='GET'){
  const r=await env.DB.prepare("SELECT input,result FROM jobs WHERE user_id=? AND state='done' ORDER BY created DESC LIMIT 10").bind(user).all();return json({messages:r.results.reverse().map(j=>({input:j.input,text:JSON.parse(j.result).text}))});
 }
 if(p==='/api/chat'&&method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Tarvitaan JSON.'},415);
  const b=await readBody(request);if(typeof b.text!=='string'||!b.text.trim()||b.text.length>2000||!/^[-a-f0-9]{36}$/.test(b.id||''))return json({error:'Kirjoita enintään 2000 merkkiä.'},400);
  const prior=await env.DB.prepare('SELECT id FROM jobs WHERE user_id=? AND request_id=?').bind(user,b.id).first();if(prior)return json({id:prior.id},202);
  const r=await env.DB.prepare("SELECT at,json FROM runtime WHERE id='runner'").first();if(!r||Date.now()-r.at>45000||!JSON.parse(r.json).ready)return json({error:'Mallipalvelin ei ole juuri nyt yhteydessä. Kokeile hetken kuluttua uudelleen.'},503);
  const active=await env.DB.prepare("SELECT id FROM jobs WHERE user_id=? AND state IN ('queued','running') LIMIT 1").bind(user).first();if(active)return json({error:'Edellinen viesti on vielä käsittelyssä. Odota sen valmistumista.'},409);
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO jobs VALUES(?,?,?,?,'queued',NULL,?,?)").bind(id,user,b.id,b.text.trim(),Date.now(),Date.now()).run();return json({id},202);
 }
 if(p.startsWith('/api/jobs/')&&method==='GET'){
  const r=await env.DB.prepare('SELECT state,result,created FROM jobs WHERE id=? AND user_id=?').bind(p.slice(10),user).first();
  if(!r)return json({error:'Viestiä ei löydy.'},404);
  if(r.state==='done')return json({done:true,result:JSON.parse(r.result)});
  if(Date.now()-r.created>600000)return json({error:'Vastaus viivästyi liikaa. Kokeile hetken kuluttua uudelleen.'},504);
  return json({done:false,state:r.state});
 }
 return json({error:'Not found'},404);
 }catch{return json({error:'Palvelu ei ole vielä valmis. Yritä hetken kuluttua uudelleen.'},503);}
}};
