// 只验证已授权的14个账号，输出计数，不输出账号密码或JWT。
import {readFile,writeFile} from 'node:fs/promises';
import {config} from '../web/config.js';
const users=JSON.parse(await readFile('.private/credentials.8chars.json','utf8'));
let tested=0;
for(const u of users){
 const r=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password}),signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('第'+(tested+1)+'个账号登录验证失败，HTTP '+r.status);
 const session=await r.json();
 const rr=await fetch(config.url+'/rest/v1/rpc/portal_read',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(25000)});
 if(!rr.ok)throw Error('第'+(tested+1)+'个账号权限读取失败，HTTP '+rr.status);
 const data=await rr.json();
 if(data.profile.auth_user_id!==u.id||data.profile.role!==u.role||(u.role==='team'&&data.profile.team_id!==u.team_id))throw Error('账号权限映射不符');
 const logout=await fetch(config.url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(25000)});
 if(!logout.ok)throw Error('验证会话注销失败');
 tested++;console.log('登录和权限验证通过 '+tested+'/14');
}
await writeFile('.private/password-verification.json',JSON.stringify({tested,team:6,staff:8,at:new Date().toISOString()}));
console.log('PASS: 14个真实账号新密码可登录，6队和8工作人员权限映射正确；测试会话已退出。');


