import {test,expect} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000007',aud:'authenticated',role:'authenticated',email:'demo@example.invalid'};
const token=Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test';
function fixture(){
 return {profile:{role:'staff',team_id:null,display_name:'Demo Staff'},server_time:new Date().toISOString(),
 control:{phase:'EXPLORING',version:1,updated_at:new Date().toISOString(),opening_notice:'待公布',scope_notice:'待公布',contact_notice:'待公布'},
 teams:[1,2,3,4,5,6].map(id=>({id,code:'Team '+id,member_count:id===6?8:7})),
 tasks:[{id:'hide_and_seek',display_name:'Hide and Seek',kind:'photo',icon:'🔎'}],cells:[],
 results:[1,2,3,4,5,6].map(team_id=>({team_id,task_id:'hide_and_seek',completed:false,counts_for_bingo:false,score_amount:0})),
 ledger:[{team_id:1,amount:500,kind:'initial',note:'初始',occurred_at:new Date().toISOString()}],
 clues:[],targets:[],food:[],announcements:[],rules:[],staff:[{id:user.id,name:'Demo Staff'}],audit:[],
 hide_seek_emergencies:[],eligibility:{first:false,full:false},accepting:true,
 photos:[{id:'photo-demo',team_id:1,target_id:5,status:'pending',submitted_at:new Date().toISOString()}],
 claims:[{id:'claim-demo',team_id:1,kind:'first',status:'pending',submitted_at:new Date().toISOString(),reward:0}]
 };
}
async function setup(context){
 const state=fixture(),calls=[];
 await context.addInitScript(({token,user})=>localStorage.setItem('sb-jckxxmswznlvmdtuioep-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
 await context.route('https://jckxxmswznlvmdtuioep.supabase.co/**',async route=>{
  const url=route.request().url();let body={};
  if(url.includes('portal_read'))body=state;
  else if(url.includes('portal_action')){
   const req=route.request().postDataJSON();calls.push(req);
   if(req.action==='review_photo')state.photos[0].status=req.payload.status;
   else if(req.action==='review_claim')state.claims[0].status=req.payload.status;
   else if(req.action==='emergency_hide_seek'){
    state.results.find(x=>x.team_id===req.payload.team).completed=true;
    state.hide_seek_emergencies.push({team_id:req.payload.team,active:true,reason:req.payload.reason,performed_at:new Date().toISOString(),approved_by:user.id,version:1});
   }else if(req.action==='revoke_emergency_hide_seek'){
    state.results.find(x=>x.team_id===req.payload.team).completed=false;
    state.hide_seek_emergencies.find(x=>x.team_id===req.payload.team).active=false;
   }else return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'不支持的操作',code:'P0001'})});
  }else if(url.includes('/user'))body=user;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 return {state,calls};
}
test('原name=id确实遮蔽form.id；读取属性不受影响',async({page})=>{
 await page.setContent('<form id="review"><input name="id" value="photo-demo"></form>');
 const actual=await page.evaluate(()=>{const f=document.querySelector('form');return {propertyType:typeof f.id,attribute:f.getAttribute('id'),value:f.id.value};});
 expect(actual).toEqual({propertyType:'object',attribute:'review',value:'photo-demo'});
});
for(const [kind,tab,action,label]of [['photo','照片','review_photo','审核此照片'],['claim','Bingo','review_claim','审核 / 更正']]){
 for(const status of ['approved','rejected']){
  test(kind+' '+status+' 发送正确审核并刷新状态',async({context,page})=>{
   const {state,calls}=await setup(context);page.on('dialog',d=>d.accept());
   await page.goto('/');await page.getByRole('heading',{name:'现场总览'}).waitFor();
   await page.locator('#nav').getByRole('button',{name:tab,exact:false}).click();
   await page.getByRole('button',{name:label,exact:false}).first().click();
   await page.locator('#review [name=status]').selectOption(status);
   if(status==='rejected')await page.locator('#review [name=reason]').fill('证明不符，按原因重拍');
   await page.locator('#review button[type=submit]').click();
   await expect(page.locator('dialog')).not.toBeVisible();
   expect(calls.at(-1).action).toBe(action);
   expect(calls.at(-1).payload.id).toBe(kind+'-demo');
   expect(kind==='photo'?state.photos[0].status:state.claims[0].status).toBe(status);
   await expect(page.getByText(status==='approved'?'审核通过':'已驳回',{exact:false}).first()).toBeVisible();
  });
 }
}
test('人工应急选队、理由、确认；点亮不发银票，支持撤销',async({context,page})=>{
 const {state,calls}=await setup(context);page.on('dialog',d=>d.accept());
 await page.goto('/');await page.getByRole('heading',{name:'现场总览'}).waitFor();
 await page.locator('#nav [data-tab=photos]').click();
 await page.getByRole('button',{name:'选择队伍并处理人工应急'}).click();
 await page.locator('#hide-seek-emergency [name=team]').selectOption('2');
 await page.locator('#hide-seek-emergency [name=reason]').fill('现场证明已人工核验');
 await page.locator('#hide-seek-emergency [name=verified]').check();
 await page.locator('#hide-seek-emergency button[type=submit]').click();
 await expect(page.locator('dialog')).not.toBeVisible();
 expect(calls.at(-1).action).toBe('emergency_hide_seek');
 expect(calls.at(-1).payload).toEqual({team:2,version:0,reason:'现场证明已人工核验',verified:true});
 expect(state.results.find(x=>x.team_id===2).completed).toBe(true);
 expect(state.ledger.reduce((s,x)=>s+x.amount,0)).toBe(500);
 await page.getByRole('button',{name:'选择队伍并处理人工应急'}).click();
 await page.locator('#hide-seek-emergency [name=team]').selectOption('2');
 await page.locator('#hide-seek-emergency [name=operation]').selectOption('revoke');
 await page.locator('#hide-seek-emergency [name=reason]').fill('撤销测试应急');
 await page.locator('#hide-seek-emergency [name=verified]').check();
 await page.locator('#hide-seek-emergency button[type=submit]').click();
 await expect(page.locator('dialog')).not.toBeVisible();
 expect(calls.at(-1).action).toBe('revoke_emergency_hide_seek');
 expect(calls.at(-1).payload.version).toBe(1);
 expect(state.results.find(x=>x.team_id===2).completed).toBe(false);
});
test('服务端拒绝时保留审核弹窗，不能假显示成功',async({context,page})=>{
 const {state}=await setup(context);page.on('dialog',d=>d.accept());
 await context.route('**/rest/v1/rpc/portal_action',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'必须填写原因',code:'P0001'})}));
 await page.goto('/');await page.getByRole('heading',{name:'现场总览'}).waitFor();
 await page.locator('#nav [data-tab=photos]').click();
 await page.getByRole('button',{name:'审核此照片'}).click();await page.locator('#review button[type=submit]').click();
 await expect(page.locator('#review')).toBeVisible();expect(state.photos[0].status).toBe('pending');
});


