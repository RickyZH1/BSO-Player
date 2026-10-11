import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const content=JSON.parse(await readFile('docs/manuals/content.json','utf8'));
const css=await readFile('docs/manuals/style.css','utf8');
const out='docs/manuals/generated',scratch='work/manuals';
await mkdir(out,{recursive:true});await mkdir(scratch,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'ignore'});
for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const browser=await chromium.launch();
const catalog=[
 ['focus_hunter','Focus Hunter','opening','📸'],['brick_bank','Brick Bank','checkpoint','🧱'],
 ['bso_code_breaker','BSO Code Breaker','checkpoint','🔢'],['mini_bingo','MINI BINGO','checkpoint','🥘'],
 ['code_talker','Code Talker','checkpoint','💬'],['blind_shape','Blind Shape','checkpoint','🪢'],
 ['luxun_quiz','迅哥！！！','checkpoint','📚'],['hide_and_seek','Hide and Seek','photo','🔎'],
 ['food_quest','Team, the eater','food','🍜']
];
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'demonstration@example.invalid'};
const token=Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.demo';
const pic='00000000-0000-4000-8000-000000000003',later='00000000-0000-4000-8000-000000000004',at='2026-10-15T06:30:00Z';
function fixture(isStaff,key){
 const released=!['login','p-home','s-home','s-settings','s-clue','s-phase','s-select','s-approve'].includes(key);
 const tasks=catalog.map(([id,display_name,kind,icon])=>({id,display_name,kind,icon}));
 return {
 profile:{auth_user_id:user.id,role:isStaff?'staff':'team',team_id:isStaff?null:1,display_name:isStaff?'演示工作人员':'Team 1'},server_time:at,
 control:{phase:released?'EXPLORING':key==='s-release'?'OPENING':'PRE_EVENT',event_date:'2026-10-15',timezone:'Asia/Shanghai',version:1,updated_at:at,updated_by:user.id,
 opening_notice:'集合地点、三场对阵待公布（演示）',scope_notice:'活动范围及安全禁入区域待公布（演示）',contact_notice:'联系现场工作人员（演示）',exploration_released_at:released?at:null},
 teams:(isStaff?[1,2,3,4,5,6]:[1]).map(id=>({id,code:'Team '+id,member_count:id===6?8:7})),tasks,
 cells:tasks.map((t,i)=>({team_id:1,task_id:t.id,position:i+1})),
 results:tasks.map((t,i)=>({team_id:1,task_id:t.id,completed:key==='p-bingo'&&i<3,counts_for_bingo:key==='p-bingo'&&i<3,score_amount:0,started_at:at,version:1})),
 ledger:[{id:'demo-ledger',team_id:1,amount:500,kind:'initial',note:'团队初始银票（演示）',occurred_at:at}],
 clues:released||isStaff?tasks.filter(t=>['checkpoint','food'].includes(t.kind)).map(t=>({task_id:t.id,text:'地点线索待公布（演示，不是真实位置）',learning_source:t.id==='luxun_quiz'?'学习来源待公布（演示）':null})):[],
 targets:released?Array.from({length:11},(_,i)=>({id:i+1,public_image:'assets/hide-and-seek/'+String(i+1).padStart(2,'0')+'.webp',thumbnail:'assets/hide-and-seek/'+String(i+1).padStart(2,'0')+'-thumb.webp'})):[],
 food:isStaff?Array.from({length:6},(_,i)=>({team_id:i+1,secret_details:'本队门店和品尝要求（演示占位，不是正式清单）',unlocked_at:null})):key==='p-food'?[{team_id:1,secret_details:'本队门店和品尝要求（演示占位，不是正式清单）',unlocked_at:at}]:[],
 announcements:[],photos:isStaff?[{id:pic,team_id:2,target_id:3,submitted_at:at,status:'pending',storage_key:'demo/private-photo.jpg'},
 {id:later,team_id:1,target_id:3,submitted_at:'2026-10-15T06:31:00Z',status:'approved',storage_key:'demo/private-photo2.jpg'}]:[],
 claims:isStaff?[{id:pic,team_id:1,kind:'first',submitted_at:at,status:'pending',reward:0}]:[],
 eligibility:{first:key==='p-claim',full:false},accepting:released,staff:[{id:user.id,name:'演示工作人员'}],
 audit:[{id:1,actor_auth_id:user.id,action:'announcement',object_id:'event',at,reason:'演示记录'}],
 rules:isStaff?tasks.map(t=>({task_id:t.id,rule_text:'界面演示。真实工作人员规则只能由合法Staff读取。',private_location:'私密地点待填（演示）',score_config:{mode:'count',max_count:9,per:10,bonus:0,cap:90,label:'有效成绩（演示，以实际关卡为准）'}})):[]
 };
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function screenshot(item,staff){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
 const snapshot=fixture(staff,item.key);
 if(item.key!=='login')await context.addInitScript(({token,user})=>localStorage.setItem('sb-jckxxmswznlvmdtuioep-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),{token,user});
 await context.route('https://jckxxmswznlvmdtuioep.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.request().url().includes('portal_read')?snapshot:r.request().url().includes('/user')?user:{})}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:4173');await page.locator(item.key==='login'?'#login':'#nav button').first().waitFor();
 await page.addStyleTag({content:'body{font-family:"Noto Sans CJK SC",sans-serif!important}*{animation:none!important;transition:none!important}'});
 const k=item.key;let marks=[],scroll=null;const nav=async n=>page.click('[data-tab="'+n+'"]');
 if(k==='login')marks=['[name=email]','[name=password]','#login button'];
 else if(k==='p-home')marks=['.hero .stats','#nav'];
 else if(k==='p-bingo'||k==='p-claim'){
  await nav('bingo');await page.locator('.cell b').evaluateAll(nodes=>nodes.forEach((n,i)=>n.textContent='示意任务 '+String(i+1).padStart(2,'0')));
  if(k==='p-claim'){scroll='#app > .cols';marks=['[data-action=claim][data-value=first]','[data-action=claim][data-value=full]'];}else marks=['#nav [data-tab=bingo]','.cell:nth-child(4)'];
 }else if(k==='p-clue'||k==='p-food'){
  await nav('explore');await page.click('[data-action=task][data-value="'+(k==='p-food'?'food_quest':'brick_bank')+'"]');marks=['#dialog .notice'];
 }else if(k==='p-wall'){await nav('explore');scroll='.gallery';marks=['.photo:first-child h3','.photo:first-child button'];}
 else if(k==='p-upload'){await nav('explore');await page.click('[data-action=upload][data-value="1"]');marks=['[name=photo]','#upload button'];}
 else if(k==='p-guide'){await nav('guide');scroll='.card:last-of-type';marks=['.card:last-of-type','[data-action=refresh]'];}
 else if(k==='s-home')marks=['.table-wrap','#nav'];
 else if(['s-settings','s-clue','s-phase','s-release','s-close','s-adjust','s-emergency'].includes(k)){
  await nav('control');
  if(k==='s-settings'){scroll='#settings';marks=['[name=opening]','[name=scope]','[name=contact]','#settings button'];}
  if(k==='s-clue'){await page.click('[data-action=clue-edit][data-value=brick_bank]');marks=['#clue-edit [name=text]','#clue-edit button'];}
  if(['s-phase','s-release','s-close'].includes(k)){await page.selectOption('#phase [name=phase]',k==='s-phase'?'OPENING':k==='s-release'?'EXPLORING':'CLOSING');marks=k==='s-close'?['#phase [name=phase]','#phase [name=close_at]','#phase button']:['#phase [name=phase]','#phase button'];scroll='#phase';}
  if(k==='s-adjust'){scroll='#adjust';marks=['#adjust [name=team]','#adjust [name=amount]','#adjust [name=reason]','#adjust button'];}
  if(k==='s-emergency'){scroll='#phase';marks=['#phase'];}
 }else if(k==='s-select'||k==='s-approve'){
  await nav('tasks');await page.selectOption('#select-task [name=task]','brick_bank');
  if(k==='s-select')marks=['#select-task [name=team]','#select-task [name=task]','#select-task button'];
  else{await page.click('#select-task button');marks=['#approve-task [name=count]','#approve-task [name=participated]','#approve-task button'];}
 }else if(k==='s-photo'||k==='s-finder'){
  await nav('photos');marks=['#app .card:first-of-type h3','#app .card:first-of-type [data-action=evidence]','#app .card:first-of-type [data-action=photo-review]'];
  if(k==='s-finder'){scroll='#app .card:nth-of-type(2)';marks=['#app .card:nth-of-type(2) p'];}
 }else if(k==='s-food'){await nav('tasks');scroll='#app .card:nth-of-type(2)';marks=['[data-action=unlock][data-value="1"]','[data-action=food-edit][data-value="1"]'];}
 else if(k==='s-bingo'){await nav('bingo');marks=['#app .card h3','[data-action=claim-review]'];}
 else if(k==='s-export'){scroll='[data-action=export]';marks=['[data-action=export]','[data-action=export-ledger]'];}
 if(scroll)await page.locator(scroll).first().scrollIntoViewIfNeeded();
 await page.evaluate(selectors=>{selectors.forEach((s,i)=>{const el=document.querySelector(s);if(!el)return;const r=el.getBoundingClientRect();if(r.top>=innerHeight||r.bottom<=0)return;const tag=document.createElement('div');tag.style.cssText='position:fixed;z-index:99999;pointer-events:none;border:2px solid #c18b25;border-radius:7px;box-sizing:border-box;left:'+Math.max(0,r.left-2)+'px;top:'+Math.max(0,r.top-2)+'px;width:'+Math.min(r.width+4,innerWidth-r.left)+'px;height:'+r.height+'px;';const badge=document.createElement('b');badge.textContent=String(i+1);badge.style.cssText='position:absolute;left:0;top:0;border-radius:50%;background:#b07919;color:white;font:700 12px/22px sans-serif;text-align:center;width:22px;height:22px;';tag.appendChild(badge);(document.querySelector('dialog[open]')||document.body).appendChild(tag);});},marks);
 await page.screenshot({path:scratch+'/'+k+'.png',animations:'disabled'});await context.close();return (await readFile(scratch+'/'+k+'.png')).toString('base64');
}
const render=await browser.newPage({viewport:{width:1160,height:1640},deviceScaleFactor:1});
for(const type of ['player','staff']){
 const pages=content[type],label=type==='player'?'参赛者':'工作人员';
 const journey=type==='player'?[['01 LOGIN','登录本队账号'],['02 OPENING','集中参加开场'],['03 EXPLORE','全队找线索 / 拍照片'],['04 CLAIM','达标后申请Bingo']]:[['01 PREPARE','填通知、线索、联络'],['02 START','统一开场 → 登记双方'],['03 RELEASE','六队完成 → 放行探索'],['04 REVIEW','关卡 / 照片 / 美食审核'],['05 CLAIM','按序核对Bingo申报'],['06 CLOSE','提醒 → 清盘 → 对账归档']];
 const cover='<section class="page cover"><div class="brand"><span><b class="seal">10</b>　BSO ANNIVERSARY</span><span>2026.10.15 · 上海时间</span></div><div class="big10">10</div><p class="eyebrow">VISUAL FIELD GUIDE · V1</p><h1>'+label+'<br>图解使用手册</h1><p class="intro">'+(type==='player'?'用手机登录本队，跟着线索一起探索。<br>找到关卡后听裁判讲解，完成后由工作人员确认。':'用自己的Staff账号，协调现场流程。<br>每个关键按钮都有编号，按顺序核对、操作、确认。')+'</p><div class="journey">'+journey.map(([n,t])=>'<div><b>'+n+'</b>'+t+'</div>').join('')+'</div><div class="notice">正式网址：rickyzh1.github.io/BSO-Player/<br>43名参赛者 + 8位工作人员；T6为8人，其余队7人。<br>图中数据均为演示；卡面位置、线索和时间以实际账号为准。</div><p class="toc">后续每页：左边看界面与标注，右边按步骤操作。<br>不含真实账号密码、秘密地点或题库答案。</p><div class="footer"><span>BSO十周年公园团建 · 图解操作，不替代裁判规则</span><span>封面 / '+(pages.length+1)+'页</span></div></section>';
 const sheets=[cover];
 for(const [idx,item] of pages.entries()){
  const b64=await screenshot(item,type==='staff');
  sheets.push('<section class="page"><div class="brand"><span><b class="seal">10</b>　BSO ANNIVERSARY</span><span>'+label+'图解手册</span></div><p class="eyebrow">FOLLOW THE STEPS</p><h1>'+esc(item.title)+'</h1><p class="sub">'+esc(item.subtitle)+'</p><div class="body"><div><div class="phone"><img src="data:image/png;base64,'+b64+'"></div><p class="caption">界面来自当前网站代码，使用演示数据。金色编号提示需要查看或操作的位置。</p></div><div class="steps">'+item.steps.map(([h,p],n)=>'<article class="step"><h2><span>'+(n+1)+'</span>'+esc(h)+'</h2><p>'+esc(p)+'</p></article>').join('')+'</div></div><div class="note"><strong>请记住：</strong>'+esc(item.note)+'</div><div class="expected"><strong>做完后应该看到：</strong>'+esc(item.expected)+'</div><div class="footer"><span>2026-10-11版 · 演示图，不含真实账号/秘密规则</span><span>'+String(idx+2).padStart(2,'0')+' / '+(pages.length+1)+'</span></div></section>');
 }
 const imageNames=[];
 for(let i=0;i<sheets.length;i++){
  await render.setContent('<html lang="zh-CN"><meta charset="utf-8"><style>'+css+'</style>'+sheets[i]+'</html>');await render.evaluate(()=>document.fonts.ready);
  const q=await render.evaluate(()=>{const step=document.querySelector('.steps'),note=document.querySelector('.note'),footer=document.querySelector('.footer');return {step:step?.getBoundingClientRect().bottom||0,note:note?.getBoundingClientRect().bottom||0,expected:document.querySelector('.expected')?.getBoundingClientRect().bottom||0,footer:footer.getBoundingClientRect().top,height:document.querySelector('.page').scrollHeight};});
  if(q.height>1640||q.note>q.footer-50||q.expected>q.footer-24||q.step>1250)throw Error('Manual layout overflow '+type+' '+i+' '+JSON.stringify(q));
  const name=type+'-'+String(i).padStart(2,'0')+'.png';await render.screenshot({path:out+'/'+name,animations:'disabled'});imageNames.push(name);
 }
 await writeFile(scratch+'/'+type+'.html','<html lang="zh-CN"><meta charset="utf-8"><style>'+css+'</style>'+sheets.join('')+'</html>');
 const imgs=await Promise.all(imageNames.map(async n=>'data:image/png;base64,'+(await readFile(out+'/'+n)).toString('base64')));
 await render.setContent('<html><style>@page{size:A4;margin:0}body{margin:0}.sheet{width:210mm;height:297mm;page-break-after:always}.sheet:last-child{page-break-after:auto}.sheet img{width:210mm;height:297mm;display:block}</style>'+imgs.map(s=>'<div class="sheet"><img src="'+s+'"></div>').join('')+'</html>');await render.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await render.pdf({path:out+'/'+type+'-manual.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
 await writeFile(out+'/'+type+'-README.md','# '+label+'图解手册\n\n[下载PDF]('+type+'-manual.pdf) · 图片为演示界面，无真实账号或秘密规则。\n\n'+imageNames.map((n,i)=>'### '+(i===0?'封面':pages[i-1].title)+'\n\n!['+label+'第'+(i+1)+'页]('+n+')\n').join('\n'));
 await render.setViewportSize({width:1216,height:48+Math.ceil(imgs.length/4)*412});
 await render.setContent('<html><style>body{margin:0;background:#e4eade;padding:24px}.grid{display:grid;grid-template-columns:repeat(4,280px);gap:16px}img{display:block;width:280px;height:396px;box-shadow:0 2px 6px #0002}</style><div class="grid">'+imgs.map(s=>'<img src="'+s+'">').join('')+'</div></html>');await render.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await render.screenshot({path:out+'/'+type+'-overview.png',fullPage:true});await render.setViewportSize({width:1160,height:1640});
 console.log('PASS: '+label+' '+imageNames.length+' pages rendered; overflow checks passed; PDF generated.');
}
await writeFile(out+'/README.md','# BSO图解使用手册\n\n- [参赛者逐页看图](player-README.md) · [参赛者PDF](player-manual.pdf)\n- [工作人员逐页看图](staff-README.md) · [工作人员PDF](staff-manual.pdf)\n- [全部图片和PDF压缩包](BSO-manuals.zip)\n\n图中使用当前网站代码和演示数据。仅操作步骤，没有真实账号、密码、秘密地点、题目答案或各队真实卡面。\n\n![参赛者封面](player-00.png)\n\n![工作人员封面](staff-00.png)\n');
await browser.close();server.kill();console.log('26 illustrated pages and 2 PDF manuals generated.');
