import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';import path from 'node:path';
async function walk(dir){const out=[];for(const x of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,x.name);if(x.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const files=await walk('dist');
assert.ok(files.every(p=>!/(?:\.private|seed\.sql|credentials|source\.html|reference\.json|\.env|\.map$)/.test(p)));
const bundle=await readFile('dist/app.js','utf8'),config=await readFile('dist/config.js','utf8');
assert.ok(!/sb_secret_[A-Za-z0-9_-]{10,}/.test(bundle+config));
const reference=JSON.parse(await readFile('.private/reference.json','utf8'));
for(const game of reference.games){
 if(game.judgement.length>25)assert.ok(!bundle.includes(game.judgement),'Staff judgement shipped: '+game.id);
 for(const step of game.steps.filter(x=>x.length>35))assert.ok(!bundle.includes(step),'Staff instruction shipped: '+game.id);
}
assert.ok(!bundle.includes('bingoLayouts')&&!bundle.includes('foodAssignments'));
for(let i=1;i<=11;i++)assert.ok(files.some(p=>p.endsWith(String(i).padStart(2,'0')+'.webp')));
console.log('PASS: public artifact excludes private seed, credentials, source rules and all-team layouts; 11 target images present.');
