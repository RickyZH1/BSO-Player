import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'demo@example.invalid'};
const token=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test';
const fixture={
 profile:{auth_user_id:user.id,role:'team',team_id:1,display_name:'Demo Team'},
 control:{phase:'PRE_EVENT',opening_notice:'演示集合通知',scope_notice:'演示范围',contact_notice:'联系工作人员',version:1,updated_at:new Date().toISOString()},
 teams:[{id:1,code:'Team 1',member_count:7}],tasks:[],cells:[],results:[],
 ledger:[{team_id:1,amount:500,kind:'initial',note:'团队初始银票',occurred_at:new Date().toISOString()}],
 clues:[],targets:[],food:[],announcements:[],photos:[],claims:[],eligibility:{first:false,full:false},accepting:false
};
async function setup(page,{baseline=false,invalid=false,stall=false}={}){
 await page.route('https://jckxxmswznlvmdtuioep.supabase.co/**',async route=>{
  const url=route.request().url();
  if(url.includes('/token')){
   if(stall)return;
   if(invalid)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'invalid_grant',error_description:'Invalid login credentials'})});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:token,refresh_token:'mock',expires_in:3600,token_type:'bearer',user})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.includes('portal_read')?fixture:url.includes('/user')?user:{})});
 });
 await page.goto('/');
 await expect(page.locator('#login')).toBeVisible();
 await page.locator('[name=email]').fill(user.email);
 await page.locator('[name=password]').fill('demo-password-not-real');
}
test('original code reproduces blank login transition while password input stays focused',async({page})=>{
 test.skip(!existsSync('dist/baseline.js'),'Baseline is built by the dedicated Safari workflow');
 const baseline=await readFile('dist/baseline.js','utf8');
 await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
 await setup(page);
 const ready=page.waitForResponse(r=>r.url().includes('portal_read'));
 await page.locator('[name=password]').press('Enter');await ready;
 await page.waitForTimeout(600);
 await expect(page.locator('#login')).toBeVisible();
 await expect(page.getByRole('heading',{name:'你好，Team 1'})).toHaveCount(0);
});
test('fixed login transitions even when mobile keyboard focus remains in password input',async({page})=>{
 await setup(page);
 await page.locator('[name=password]').press('Enter');
 await expect(page.getByRole('heading',{name:'你好，Team 1'})).toBeVisible();
 await expect(page.locator('#login')).toHaveCount(0);
});
test('touch/click login button also transitions',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'进入活动',exact:true}).click();
 await expect(page.getByRole('heading',{name:'你好，Team 1'})).toBeVisible();
});
test('invalid credentials appear inline and restore button',async({page})=>{
 await setup(page,{invalid:true});
 await page.locator('[name=password]').press('Enter');
 await expect(page.locator('#login-status')).toContainText('未完成');
 await expect(page.getByRole('button',{name:'进入活动',exact:true})).toBeEnabled();
});
test('stalled authentication shows progress then timeout, never stays disabled indefinitely',async({page})=>{
 await setup(page,{stall:true});
 await page.locator('[name=password]').press('Enter');
 await expect(page.locator('#login-status')).toContainText('正在验证');
 await expect(page.locator('#login-status')).toContainText('超时',{timeout:35000});
 await expect(page.getByRole('button',{name:'进入活动',exact:true})).toBeEnabled();
});
