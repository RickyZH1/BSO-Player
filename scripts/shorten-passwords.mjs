// 本地管理员工具：只读取私密文件，绝不把密钥或密码打印到终端。
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const input=process.argv[2];
if(!input)throw Error('请传入原credentials.json的完整路径');
const privateDir=path.resolve('.private');
await mkdir(privateDir,{recursive:true});
const url='https://jckxxmswznlvmdtuioep.supabase.co';
const key=(await readFile(path.join(privateDir,'admin-key.txt'),'utf8')).trim().replace(/^\uFEFF/,'');
if(!key.startsWith('sb_secret_')&&!key.startsWith('eyJ'))throw Error('admin-key.txt只能保存Secret或service_role密钥本身');
const original=JSON.parse(await readFile(input,'utf8'));
if(original.length!==14||original.filter(x=>x.role==='team').length!==6||original.filter(x=>x.role==='staff').length!==8)throw Error('账号数量或角色不符');
const targets=original.map(x=>({...x,password:x.password.slice(0,8)}));
if(targets.some(x=>x.password.length!==8)||new Set(targets.map(x=>x.password)).size!==14)throw Error('前8位不足或重复，停止更新');
const backup=path.join(privateDir,'credentials.before-shortening.json');
try{await readFile(backup);}catch{await writeFile(backup,JSON.stringify(original,null,2),{mode:0o600});}
const progressFile=path.join(privateDir,'password-update-progress.json');
let progress=[];try{progress=JSON.parse(await readFile(progressFile,'utf8'));}catch{}
async function call(route,method='GET',body){
 const response=await fetch(url+'/auth/v1'+route,{method,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const result=await response.json();
 if(!response.ok)throw Error('Auth更新失败，HTTP '+response.status+'；请核对密钥、密码要求与网络');
 return result;
}
for(const item of targets){
 const actual=await call('/admin/users/'+item.id);
 if(actual.email?.toLowerCase()!==item.email.toLowerCase())throw Error('账号ID与邮箱不符，停止');
 if(!progress.includes(item.id)){
  await call('/admin/users/'+item.id,'PUT',{password:item.password});
  progress.push(item.id);
  await writeFile(progressFile,JSON.stringify(progress),{mode:0o600});
 }
 await writeFile(path.join(privateDir,'credentials.8chars.json'),JSON.stringify(targets.map(x=>({...x,password_updated:progress.includes(x.id)})),null,2),{mode:0o600});
 console.log('已更新：'+item.display_name);
}
console.log('完成：14个账号密码均为原密码前8位；新清单只保存在.private/credentials.8chars.json。');


