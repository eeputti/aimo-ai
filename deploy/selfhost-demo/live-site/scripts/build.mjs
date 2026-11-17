import fs from 'node:fs';
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
const assets=Object.fromEntries(['page.html','style.css','app.js'].map(n=>[n,fs.readFileSync('assets/'+n,'utf8')]));
fs.writeFileSync('dist/server/index.js','const ASSETS='+JSON.stringify(assets)+';\n'+fs.readFileSync('worker/index.js','utf8'));
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
