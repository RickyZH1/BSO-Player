// 临时Postgres专用：不能使用真实Supabase连接。
import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgres://postgres:postgres@localhost:5432/bso_review_test'});
const root=await pool.connect();
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
async function deny(p){await assert.rejects(p);checks++;}
await root.query(await readFile('tests/bootstrap.sql','utf8'));
for(const file of(await readdir('supabase/migrations')).sort())await root.query(await readFile('supabase/migrations/'+file,'utf8'));
await root.query(await readFile('.private/seed.sql','utf8'));
const teams=[],staff=[];
for(let i=1;i<=14;i++){
 const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0');
 await root.query('insert into auth.users values($1)',[id]);
 await root.query('insert into public.profiles values($1,$2,$3,$4,true)',[id,i<=6?'team':'staff',i<=6?i:null,'Demo '+i]);
 (i<=6?teams:staff).push(id);
}
async function as(id,sql,args=[]){
 const c=await pool.connect();
 try{await c.query('begin');await c.query('set local role authenticated');
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
 const r=await c.query(sql,args);await c.query('commit');return r;
 }catch(e){await c.query('rollback');throw e;}finally{c.release();}
}
const act=(id,action,payload={},rid=crypto.randomUUID())=>as(id,'select public.portal_action($1,$2::jsonb,$3) result',[action,JSON.stringify(payload),rid]).then(x=>x.rows[0].result);
const read=id=>as(id,'select public.portal_read() data').then(x=>x.rows[0].data);
const manual=(team,version=0,reason='现场人工核验，审核故障应急')=>({team,version,reason,verified:true});
const result=async team=>(await root.query("select * from public.team_task_results where team_id=$1 and task_id='hide_and_seek'",[team])).rows[0];
const balance=async team=>+(await root.query('select sum(amount) n from public.score_ledger where team_id=$1',[team])).rows[0].n;
await deny(act(teams[0],'emergency_hide_seek',manual(1)));
await deny(as(teams[0],'select * from private.hide_seek_emergencies'));
await deny(as(staff[0],'select public.portal_action_v1($1,$2::jsonb,$3)',['adjust',JSON.stringify({team:1,amount:10,reason:'bypass'}),crypto.randomUUID()]));
await deny(as(staff[0],'select public.portal_read_v1()'));
await deny(act(staff[0],'emergency_hide_seek',manual(1)));
await root.query("update public.game_control set phase='EXPLORING',exploration_released_at=now()");
await deny(act(staff[0],'emergency_hide_seek',manual(1,0,'')));
await deny(act(staff[0],'emergency_hide_seek',{...manual(1),verified:false}));
await deny(act(staff[0],'emergency_hide_seek',{...manual(1),task:'brick_bank'}));
await deny(act(staff[0],'emergency_hide_seek',manual(7)));
await deny(act(staff[0],'emergency_hide_seek',manual(1,9)));
const rid=crypto.randomUUID(),payload=manual(1);
await act(staff[0],'emergency_hide_seek',payload,rid);
let r=await result(1);
ok(r.completed&&r.counts_for_bingo,'manual completion valid before deadline');
ok(r.score_amount===0&&await balance(1)===500,'manual completion gives no photo or finder money');
ok(!((await read(teams[0])).hide_seek_emergencies),'players do not receive emergency reasons/actors for other teams');
ok((await read(staff[1])).hide_seek_emergencies[0].approved_by===staff[0],'another staff sees actual actor');
await act(staff[0],'emergency_hide_seek',payload,rid);
ok(+(await root.query("select count(*) n from public.audit_events where action='emergency_hide_seek' and object_id='1'")).rows[0].n===1,'same request id audit once');
await deny(act(staff[1],'emergency_hide_seek',manual(1)));
await act(staff[1],'revoke_emergency_hide_seek',manual(1,1,'撤销应急演练'));
ok(!(await result(1)).completed&&await balance(1)===500,'revoke emergency with zero photos');
await act(staff[2],'emergency_hide_seek',manual(1,2));
async function photo(team,target,second){
 const id=crypto.randomUUID();
 await root.query("insert into public.photo_submissions(id,team_id,target_id,storage_key,status,submitted_at) values($1,$2,$3,$4,'pending',clock_timestamp()+($5||' seconds')::interval)",[id,team,target,team+'/'+id+'.jpg',second]);
 return id;
}
const early=await photo(2,1,0),later=await photo(1,1,1);
await act(staff[3],'review_photo',{id:later,status:'approved',reason:''});
ok((await result(1)).completed,'later normal photo review does not erase emergency');
ok(await balance(1)===510,'later approved base10, first-finder pending');
await act(staff[4],'review_photo',{id:early,status:'approved',reason:''});
ok(await balance(2)===520&&await balance(1)===510,'reverse reviews still award earliest valid');
await act(staff[4],'review_photo',{id:early,status:'approved',reason:''});
ok(await balance(2)===520,'repeat review no duplicate');
for(let target=2;target<=5;target++){
 const id=await photo(1,target,0);
 await act(staff[target],'review_photo',{id,status:'approved',reason:''});
 if(target===4)ok((await result(1)).completed,'emergency supports fewer than five valid photos');
}
await act(staff[5],'revoke_emergency_hide_seek',manual(1,3,'恢复按真实五图完成'));
ok((await result(1)).completed,'five photos remain complete after emergency revoked');
await deny(act(staff[5],'emergency_hide_seek',manual(1,4)));
const fifth=(await root.query("select id from public.photo_submissions where team_id=1 and target_id=5")).rows[0].id;
await act(staff[6],'review_photo',{id:fifth,status:'rejected',reason:'撤销错误证明'});
ok(!(await result(1)).completed,'four valid photos and no emergency not complete');
await act(staff[7],'emergency_hide_seek',manual(1,4));
ok((await result(1)).completed,'8th independent staff can use emergency');
await deny(act(staff[1],'revoke_emergency_hide_seek',manual(2,0)));
for(let i=0;i<8;i++){
 const team=i%2+3;
 const snap=await read(staff[i]),v=snap.hide_seek_emergencies.find(x=>x.team_id===team)?.version||0;
 await act(staff[i],'emergency_hide_seek',manual(team,v));
 await act(staff[i],'revoke_emergency_hide_seek',manual(team,v+1,'轮流审核权限验收'));
 ok(!(await result(team)).completed,'all eight staff can complete and revoke');
}
const version=(await read(staff[0])).hide_seek_emergencies.find(x=>x.team_id===3).version;
const concurrent=await Promise.allSettled([act(staff[0],'emergency_hide_seek',manual(3,version)),act(staff[1],'emergency_hide_seek',manual(3,version))]);
ok(concurrent.filter(x=>x.status==='fulfilled').length===1,'concurrent staff only one completion succeeds');
await root.query("update public.game_control set close_at=clock_timestamp()-interval '1 minute',phase='CLOSING'");
await deny(act(staff[0],'emergency_hide_seek',manual(6)));
await act(staff[0],'revoke_emergency_hide_seek',manual(3,version+1,'截止后撤销错误应急'));
ok(!(await result(3)).completed,'can revoke before archive after deadline');
const late=await photo(6,2,0);
await act(staff[0],'review_photo',{id:late,status:'approved',reason:''});
ok(await balance(6)>=510,'old queued review can finish after deadline');
await root.query("update public.game_control set phase='ARCHIVED'");
await deny(act(staff[0],'emergency_hide_seek',manual(6)));
await deny(act(staff[0],'revoke_emergency_hide_seek',manual(1,5)));
ok((await read(teams[5])).cells.every(x=>x.team_id===6),'team isolation preserved');
ok(+(await root.query("select count(*) n from public.audit_events where action in('emergency_hide_seek','revoke_emergency_hide_seek') and actor_auth_id is null")).rows[0].n===0,'emergency audit always has personal actor');
console.log('PASS: '+checks+' review/emergency assertions; 8 staff, 2 teams, privacy, idempotency, concurrency, reason, cutoff, photo fairness and independent silver.');
root.release();await pool.end();


