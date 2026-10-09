import {mkdir,writeFile,access} from 'node:fs/promises';
await mkdir('.private',{recursive:true});
try{await access('.private/accounts.json');throw Error('文件已存在，为避免覆盖请手动编辑');}catch(e){if(e.code!=='ENOENT')throw e;}
const a=[...Array.from({length:6},(_,i)=>({email:'TODO_TEAM_'+(i+1)+'_EMAIL',role:'team',team_id:i+1,display_name:'Team '+(i+1)})),...Array.from({length:8},(_,i)=>({email:'TODO_STAFF_'+(i+1)+'_EMAIL',role:'staff',display_name:'工作人员'+(i+1)}))];
await writeFile('.private/accounts.json',JSON.stringify(a,null,2));console.log('请编辑 .private/accounts.json 中邮箱及显示名，不要上传此文件。');
