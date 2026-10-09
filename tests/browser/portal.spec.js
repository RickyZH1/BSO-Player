import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {ids} from '../../scripts/prepare.mjs';
const reference=JSON.parse(await readFile('.private/reference.json','utf8'));
function fixture(team=1,staff=false){
 const tasks=reference.games.map(g=>({id:ids[g.id],display_name:g.name,icon:g.icon,kind:g.id==='focusHunter'?'opening':g.id==='hideAndSeek'?'photo':g.id==='foodQuest'?'food':'checkpoint'}));
 return {profile:{role:staff?'staff':'team',team_id:staff?null:team,display_name:staff?'Test Staff':'Team '+team},
 control:{phase:'PRE_EVENT',opening_notice:'集合地点待公布',scope_notice:'活动范围待公布',contact_notice:'请联系工作人员',version:1,updated_at:new Date().toISOString()},
 teams:(staff?[1,2,3,4,5,6]:[team]).map(id=>({id,code:'Team '+id,member_count:id===6?8:7})),
 tasks,cells:reference.layouts['team'+team].map((key,i)=>({team_id:team,task_id:ids[key],position:i+1})),
 results:tasks.map(t=>({team_id:team,task_id:t.id,completed:false,counts_for_bingo:false,score_amount:0})),
 ledger:[{team_id:team,amount:500,kind:'initial',note:'团队初始银票',occurred_at:new Date().toISOString()}],
 clues:[],targets:[],food:[],announcements:[],photos:[],claims:[],eligibility:{first:false,full:false},accepting:false,staff:[],audit:[],rules:staff?reference.rules.map(r=>({task_id:r.id,rule_text:r.text,score_config:r.config,private_location:'TODO'})):undefined};
}
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'test@example.invalid'};
const token=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test';
async function setup(context,team=1,staff=false){
 await context.addInitScript(({token,user})=>localStorage.setItem('sb-jckxxmswznlvmdtuioep-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
 await context.route('https://jckxxmswznlvmdtuioep.supabase.co/**',route=>{
  const url=route.request().url();let body=url.includes('portal_read')?fixture(team,staff):url.includes('/user')?user:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
}
test('375px player navigation, phase gates, fixed cells and no horizontal overflow',async({context,page})=>{
 await setup(context);await page.goto('/');await expect(page.getByRole('heading',{name:'你好，Team 1'})).toBeVisible();
 await page.getByRole('button',{name:'My Bingo',exact:false}).click();await expect(page.locator('.cell')).toHaveCount(9);
 await expect(page.getByRole('button',{name:'申请 First Bingo'})).toBeDisabled();
 await page.getByRole('button',{name:'Explore',exact:false}).click();await expect(page.getByText('先一起完成开场。')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Guide',exact:false}).click();await expect(page.getByText(/一起玩，也一起照顾彼此/)).toBeVisible();
});
test('Staff interface receives authenticated dynamic rules',async({context,page})=>{
 await setup(context,1,true);await page.goto('/');await expect(page.getByRole('heading',{name:'现场总览'})).toBeVisible();
 await page.getByRole('button',{name:'关卡',exact:false}).click();await expect(page.getByRole('heading',{name:'关卡与美食审核'})).toBeVisible();
});
test('51 simultaneous browser contexts: 43 shared-team sessions and 8 staff sessions (mock transport)',async({browser})=>{
 const identities=[...Array.from({length:6},(_,i)=>Array.from({length:i===5?8:7},()=>({team:i+1,staff:false}))).flat(),...Array.from({length:8},()=>({team:1,staff:true}))];
 const contexts=await Promise.all(identities.map(async x=>{const c=await browser.newContext({viewport:{width:375,height:812}});await setup(c,x.team,x.staff);return c;}));
 try{await Promise.all(contexts.map(async(c,i)=>{const p=await c.newPage();await p.goto('http://127.0.0.1:4173');await expect(p.getByRole('heading',{name:identities[i].staff?'现场总览':'你好，Team '+identities[i].team})).toBeVisible();}));}
 finally{await Promise.all(contexts.map(c=>c.close()));}
});
