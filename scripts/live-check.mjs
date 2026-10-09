// READ-ONLY real Supabase Auth/RLS smoke test. Uses local generated credentials.
// This does not replace the destructive concurrency test in a staging project.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const url=process.env.SUPABASE_URL||'https://jckxxmswznlvmdtuioep.supabase.co';
const key=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_6yB5jPOa4siMlgkcQYqcQg_0rRehxL3';
const users=JSON.parse(await readFile('.private/credentials.json','utf8'));
async function login(u){const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});const s=await r.json();if(!r.ok)throw Error('账号登录失败 '+u.display_name);return s.access_token;}
async function get(path,token){return fetch(url+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+token}});}
let n=0;
for(const u of users){
 const token=await login(u);const r=await fetch(url+'/rest/v1/rpc/portal_read',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
 assert.ok(r.ok);const s=await r.json();
 if(u.role==='team'){
  assert.equal(s.teams.length,1);assert.equal(s.cells.length,9);assert.equal(s.profile.team_id,u.team_id);assert.ok(!s.rules);
  for(const path of ['bingo_cells?team_id=neq.'+u.team_id,'score_ledger?team_id=neq.'+u.team_id,'food_assignments?team_id=neq.'+u.team_id,'staff_rules']){
   const x=await get(path,token);assert.ok(x.ok);assert.equal((await x.json()).length,0);
  }
 }else{assert.equal(s.teams.length,6);assert.equal(s.rules.length,9);}
 n++;console.log('通过只读检查：'+u.display_name);
}
console.log(n+'个真实账号Auth / 跨队只读隔离检查完成；不代表写入、Storage或并发验收通过。');
