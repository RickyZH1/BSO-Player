// PRIVATE ADMIN SCRIPT: Node 22, run on trusted computer, never in browser/Pages.
// Set SUPABASE_SECRET_KEY in this process only. Reads .private/accounts.json.
// Does not print passwords. Keeps resumable progress to avoid duplicate users.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
const url=process.env.SUPABASE_URL||'https://jckxxmswznlvmdtuioep.supabase.co';
const key=process.env.SUPABASE_SECRET_KEY;
if(!key)throw Error('缺少本地进程环境变量 SUPABASE_SECRET_KEY（绝不能填入公开配置）');
const list=JSON.parse(await readFile('.private/accounts.json','utf8'));
if(list.length!==14||list.filter(x=>x.role==='staff').length!==8||list.filter(x=>x.role==='team').length!==6)throw Error('必须6队+8工作人员');
if(new Set(list.map(x=>x.email)).size!==14||list.some(x=>!x.email.includes('@')||/TODO/i.test(x.email)))throw Error('请填写14个不同账号邮箱');
const teams=list.filter(x=>x.role==='team').map(x=>x.team_id).sort();
if(JSON.stringify(teams)!=='[1,2,3,4,5,6]')throw Error('队伍映射必须1到6各一个');
await mkdir('.private',{recursive:true});
let saved=[];try{saved=JSON.parse(await readFile('.private/credentials.json','utf8'));}catch{}
async function request(path,method,body){
 const r=await fetch(url+path,{method,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body?JSON.stringify(body):undefined});
 const text=await r.text();if(!r.ok)throw Error('初始化失败 '+r.status+'：'+text);return text?JSON.parse(text):null;
}
for(const entry of list){
 let item=saved.find(x=>x.email===entry.email);
 if(!item){const password=randomBytes(18).toString('base64url');
 const user=await request('/auth/v1/admin/users','POST',{email:entry.email,password,email_confirm:true});
 item={...entry,id:user.id,password,profile_initialized:false};saved.push(item);
 await writeFile('.private/credentials.json',JSON.stringify(saved,null,2),{mode:0o600});
 }
 if(!item.profile_initialized){
 await request('/rest/v1/profiles?on_conflict=auth_user_id','POST',{auth_user_id:item.id,role:entry.role,team_id:entry.role==='team'?entry.team_id:null,display_name:entry.display_name,active:true});
 item.profile_initialized=true;await writeFile('.private/credentials.json',JSON.stringify(saved,null,2),{mode:0o600});
 }
 console.log('已初始化：'+entry.display_name);
}
console.log('完成。密码只保存在 .private/credentials.json，请分别私发，勿提交GitHub。');
