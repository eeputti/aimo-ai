// Outbound-only bridge from a private Site queue to this isolated local demo.
// Feed runtime access through hidden stdin; never pass it in argv or write it to disk.
import { createRunnerCookie } from './runner-session.mjs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for private Site runner settings on stdin (hidden).\n');
let input='';process.stdin.on('data',async chunk=>{
 input+=chunk.toString();if(!input.includes('\n'))return;
 process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);
 const cfg=JSON.parse(input.trim());input='';
 const base=new URL(cfg.siteUrl);if(base.protocol!=='https:'||!base.hostname.endsWith('.chatgpt.site'))throw new Error('Invalid Site origin');
 const local=new URL(cfg.localUrl||'http://127.0.0.1:4765');if(local.protocol!=='http:'||local.hostname!=='127.0.0.1')throw new Error('Local demo required');
 const remote=async(path,body)=>{
  const r=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'content-type':'application/json','OAI-Sites-Authorization':`Bearer ${cfg.siteAccess}`,'authorization':`Bearer ${cfg.runnerToken}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok)throw new Error(`Site HTTP ${r.status}`);return r.json();
 };
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const cookie=createRunnerCookie(cfg);
 let ready=false,heartbeatBusy=false,stopping=false;
 const heartbeat=async()=>{
  if(heartbeatBusy)return;heartbeatBusy=true;
  try{const r=await fetch(new URL('/api/status',local),{signal:AbortSignal.timeout(7000)});const s=await r.json();
   if(!s.isolated||s.sendsOrders!==false)throw new Error('Not an isolated demo');
   ready=s.ready===true;await remote('/runner/heartbeat',{ready,model:s.model});
  }catch{ready=false;}finally{heartbeatBusy=false;}
 };
 try{
  await remote('/runner/bootstrap',{});await heartbeat();
  const timer=setInterval(heartbeat,5000);
  for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{stopping=true;clearInterval(timer);});
  console.log('Private Site runner connected. No message text is logged.');
  while(!stopping){
   try{
    if(!ready){await pause(1500);continue;}
    const {job}=await remote('/runner/claim',{});if(!job){await pause(1500);continue;}
    let result;
    try{
     const r=await fetch(new URL('/api/chat',local),{method:'POST',redirect:'error',headers:{'content-type':'application/json',cookie:cookie(job.user_id)},
      body:JSON.stringify({id:job.id,text:job.input}),signal:AbortSignal.timeout(330000)});
     if(!r.ok)throw new Error('Local service failed');result=await r.json();
    }catch{
     let cart=null;try{const r=await fetch(new URL('/api/cart',local),{headers:{cookie:cookie(job.user_id)},signal:AbortSignal.timeout(5000)});cart=(await r.json()).cart;}catch{}
     result={text:'Mallipalvelimen yhteys katkesi. Odota hetki ja yritä uudelleen.',status:'error',cart,model:'qwen3:8b',ms:0};
    }
    let delivered=false;
    for(let n=0;n<20&&!stopping;n++){try{await remote('/runner/complete',{id:job.id,result});delivered=true;break;}catch{await pause(3000);}}
    console.log(delivered?`Job completed (${result.ms||0} ms).`:'Delivery delayed; job can be recovered.');
   }catch{console.log('Site connection interrupted; retrying.');await pause(3000);}
  }
 }catch(err){console.error(String(err.message||err));process.exitCode=1;}
});
