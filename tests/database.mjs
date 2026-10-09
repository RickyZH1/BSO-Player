import pg from 'pg';import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgres://postgres:postgres@localhost:5432/bso_test',max:60});
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};
const root=await pool.connect();
await root.query(await readFile('tests/bootstrap.sql','utf8'));
for(const file of (await readdir('supabase/migrations')).sort())await root.query(await readFile('supabase/migrations/'+file,'utf8'));
await root.query(await readFile('.private/seed.sql','utf8'));
const teamIDs=[],staffIDs=[];
for(let i=1;i<=14;i++){const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0');await root.query('insert into auth.users values($1)',[id]);await root.query('insert into public.profiles values($1,$2,$3,$4,true)',[id,i<=6?'team':'staff',i<=6?i:null,'Test '+i]);(i<=6?teamIDs:staffIDs).push(id);}
async function as(id,sql,values=[]){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);const out=await c.query(sql,values);await c.query('commit');return out;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
const act=(id,name,payload={},rid=crypto.randomUUID())=>as(id,'select public.portal_action($1,$2::jsonb,$3) as result',[name,JSON.stringify(payload),rid]).then(r=>r.rows[0].result);
const read=id=>as(id,'select public.portal_read() as data').then(r=>r.rows[0].data);
async function deny(promise){await assert.rejects(promise);checks++;}
const reference=JSON.parse(await readFile('.private/reference.json','utf8'));
let snapshot=await read(teamIDs[0]);ok(snapshot.teams.length===1&&snapshot.cells.length===9,'one team only');
ok(snapshot.ledger.reduce((s,l)=>s+l.amount,0)===500,'initial');
ok(snapshot.clues.length===0&&snapshot.targets.length===0,'not released');
ok(!snapshot.rules&&!snapshot.staff&&!snapshot.audit,'no private fields');
ok(snapshot.teams[0].member_count===7,'team1 seven');
ok((await read(teamIDs[5])).teams[0].member_count===8,'team6 eight');
for(const id of teamIDs){
 const out=await read(id);ok(out.cells.every(c=>c.team_id===out.profile.team_id),'fixed isolation');
 ok((await as(id,'select * from public.bingo_cells where team_id<>$1',[out.profile.team_id])).rowCount===0,'RLS cross team');
 ok((await as(id,'select * from public.staff_rules')).rowCount===0,'RLS staff rules');
 ok((await as(id,'select * from public.food_assignments')).rowCount===0,'locked food');
 await deny(act(id,'adjust',{team:2,amount:100,reason:'attack'}));
 await deny(as(id,"update public.profiles set role='staff'"));
 await deny(as(id,'insert into public.score_ledger(team_id,kind,source_id,idempotency_key,amount) values(2,\'fake\',\'fake\',\'fake\',100)'));
 await deny(as(id,"select private.score('{}','{}')"));
}
await deny(root.query('set role anon; select * from public.bingo_cells'));
await root.query('reset role');
await deny(as(teamIDs[0],'select ordinal from public.photo_submissions'));
for(const id of staffIDs){ok((await read(id)).teams.length===6,'staff full visibility');await act(id,'announcement',{message:'Test announcement'});}
const phase=async(name,extra={})=>{const g=(await read(staffIDs[0])).control;return act(staffIDs[0],'phase',{phase:name,version:g.version,...extra});};
await phase('OPENING');await deny(phase('EXPLORING'));
const cfg=Object.fromEntries(reference.rules.map(r=>[r.id,r.config]));
function metrics(task,n){const c=cfg[task];return c.mode==='grid'?{throws:[0,0,0]}:{count:n??0,...(c.seconds_limit?{seconds:0}:{})};}
async function approve(t,task,n=0,staff=staffIDs[0]){await act(staff,'start_task',{team:t,task});return act(staff,'approve_task',{team:t,task,metrics:metrics(task,n),participated:true});}
for(let t=1;t<=6;t++)await approve(t,'focus_hunter',0,staffIDs[(t-1)%8]);
await phase('EXPLORING');
snapshot=await read(teamIDs[0]);ok(snapshot.clues.length===7&&!snapshot.clues.some(c=>c.task_id==='focus_hunter'),'released correct clues');
for(const rule of reference.rules.filter(r=>!['hide_and_seek','food_quest'].includes(r.id))){
 const c=rule.config;
 if(c.mode==='count'){
  for(let n=0;n<=c.max_count;n++){
   const m={count:n,...(c.seconds_limit?{seconds:c.seconds_limit}:{})};
   const expected=n*c.per+(n===c.max_count?c.bonus:0);
   const value=(await root.query('select private.score($1,$2) amount',[c,m])).rows[0].amount;ok(value===expected,'count scoring');
  }
  if(c.seconds_limit)ok((await root.query('select private.score($1,$2) amount',[c,{count:c.max_count,seconds:c.seconds_limit+1}])).rows[0].amount===c.max_count*c.per,'speed boundary');
  await deny(root.query('select private.score($1,$2)',[c,{count:c.max_count+1,seconds:0}]));
 }else{
  let max=0;
  for(let a=0;a<=9;a++)for(let b=0;b<=9;b++)for(let z=0;z<=9;z++){
   const throws=[a,b,z],sets=new Set(throws),ln=[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
   const expected=throws.reduce((s,p)=>s+(p?c.grid[p-1]:0),0)+(ln.some(l=>l.every(p=>sets.has(p)))?c.bonus:0);
   const got=(await root.query('select private.score($1,$2) amount',[c,{throws}])).rows[0].amount;
   ok(got===expected,'grid combinations');max=Math.max(max,got);
  }ok(max===c.cap,'grid maximum preserved');
 }
}
await approve(1,'brick_bank',0);snapshot=await read(teamIDs[0]);ok(snapshot.results.find(r=>r.task_id==='brick_bank').completed,'zero completes');
ok(snapshot.ledger.reduce((s,l)=>s+l.amount,0)===500,'zero unchanged balance');
const request=crypto.randomUUID(),payload={team:1,amount:10,reason:'retry'};
await Promise.all([act(staffIDs[0],'adjust',payload,request),act(staffIDs[0],'adjust',payload,request)]);
ok((await root.query('select count(*)::int n from public.score_ledger where idempotency_key=$1',[request])).rows[0].n===1,'request idempotency');
await deny(act(staffIDs[1],'adjust',payload,request));
for(const [index,staff] of staffIDs.entries()){
 await act(staff,'preview_score',{team:1,task:'code_talker',metrics:metrics('code_talker',0)});
 await act(staff,'settings',{opening:'Test gathering',scope:'Test scope',contact:'Test contact'});
}
async function upload(team,target){const p=await act(teamIDs[team-1],'reserve_photo',{target});
 await as(teamIDs[team-1],"insert into storage.objects(bucket_id,name) values('evidence',$1)",[p.key]);
 await act(teamIDs[team-1],'submit_photo',{id:p.id});return p;}
const A=await upload(1,3),B=await upload(2,3);
await deny(as(teamIDs[1],"insert into storage.objects(bucket_id,name) values('evidence',$1)",['1/forged.jpg']));
ok((await as(teamIDs[1],'select * from storage.objects where name=$1',[A.key])).rowCount===0,'cross team image');
await deny(as(teamIDs[0],"update storage.objects set name='fake' where name=$1",[A.key]).then(r=>{if(r.rowCount===0)throw Error('denied');}));
await act(staffIDs[1],'review_photo',{id:B.id,status:'approved'});
ok((await read(teamIDs[1])).ledger.filter(l=>l.kind==='finder').reduce((s,l)=>s+l.amount,0)===0,'finder waits for earlier pending');
await act(staffIDs[0],'review_photo',{id:A.id,status:'approved'});
ok((await read(teamIDs[0])).ledger.filter(l=>l.kind==='finder').reduce((s,l)=>s+l.amount,0)===10,'earliest effective wins');
await act(staffIDs[2],'review_photo',{id:A.id,status:'rejected',reason:'correction'});
ok((await read(teamIDs[0])).ledger.filter(l=>l.kind==='finder').reduce((s,l)=>s+l.amount,0)===0,'finder reversal');
ok((await read(teamIDs[1])).ledger.filter(l=>l.kind==='finder').reduce((s,l)=>s+l.amount,0)===10,'finder reassigned');
for(let target of [1,2,4,5]){const p=await upload(2,target);await act(staffIDs[3],'review_photo',{id:p.id,status:'approved'});}
ok((await read(teamIDs[1])).results.find(r=>r.task_id==='hide_and_seek').completed,'five photos completes');
await deny(act(teamIDs[1],'reserve_photo',{target:3}));
await act(staffIDs[4],'unlock_food',{team:1});
ok((await read(teamIDs[0])).food.length===1,'own unlocked food');
ok((await read(teamIDs[1])).food.length===0,'other food not leaked');
await act(staffIDs[5],'start_task',{team:1,task:'food_quest'});
await deny(act(staffIDs[5],'approve_task',{team:1,task:'food_quest',metrics:{count:0},participated:true}));
await act(staffIDs[5],'approve_task',{team:1,task:'food_quest',metrics:{count:1},participated:true});
for(let t=1;t<=2;t++)for(const task of ['brick_bank','bso_code_breaker','mini_bingo','code_talker','blind_shape','luxun_quiz'])await approve(t,task,0);
await deny(act(teamIDs[2],'claim',{kind:'first'}));
const c1=await act(teamIDs[0],'claim',{kind:'first'}),c2=await act(teamIDs[1],'claim',{kind:'first'});
await act(staffIDs[6],'review_claim',{id:c2.id,status:'approved'});
ok((await read(teamIDs[1])).claims.find(c=>c.id===c2.id).reward===0,'later bingo waits');
await act(staffIDs[7],'review_claim',{id:c1.id,status:'approved'});
ok((await read(teamIDs[0])).claims.find(c=>c.id===c1.id).reward===100,'first rank');
ok((await read(teamIDs[1])).claims.find(c=>c.id===c2.id).reward===80,'second rank');
const duplicated=await Promise.all(Array.from({length:5},()=>act(teamIDs[0],'claim',{kind:'first'})));ok(duplicated.every(c=>c.id===c1.id),'duplicate claim same ID');
ok(!('rank' in (await read(teamIDs[0])).claims[0]),'rank not exposed');
for(const target of [1,2,3,4,5]){const p=await upload(1,target);await act(staffIDs[0],'review_photo',{id:p.id,status:'approved'});}
const full=await act(teamIDs[0],'claim',{kind:'full'});await act(staffIDs[0],'review_claim',{id:full.id,status:'approved'});
ok((await read(teamIDs[0])).claims.find(c=>c.id===full.id).reward===120,'full award');
await act(staffIDs[0],'revoke_task',{team:1,task:'brick_bank',reason:'fixture correction'});
ok((await read(teamIDs[0])).claims.find(c=>c.id===full.id).reward===0,'full invalidation and reversal');
// Four additional teams submit concurrently; review in reverse server order.
for(let t=3;t<=6;t++)for(const task of ['brick_bank','bso_code_breaker','mini_bingo','code_talker','blind_shape','luxun_quiz'])await approve(t,task,0);
const parallelClaims=await Promise.all([3,4,5,6].map(t=>act(teamIDs[t-1],'claim',{kind:'first'})));
const ordered=(await root.query("select id from public.bingo_claims where kind='first' and status='pending' order by submitted_at,ordinal")).rows;
for(const c of [...ordered].reverse())await act(staffIDs[1],'review_claim',{id:c.id,status:'approved'});
const rewards=(await root.query("select reward from public.bingo_claims where kind='first' and status='approved' order by submitted_at,ordinal")).rows.map(x=>x.reward);
ok(JSON.stringify(rewards)==='[100,80,60,40,40,40]','six teams, concurrent submit and reverse review');
await act(staffIDs[2],'review_claim',{id:c1.id,status:'rejected',reason:'test adjudication'});
ok((await read(teamIDs[1])).claims.find(c=>c.id===c2.id).reward===100,'rejected earliest frees rank and corrects ledger');
const lateSixth=await upload(1,6);
const latePhotos=[];for(let target=6;target<=10;target++)latePhotos.push(await upload(3,target));
await deny(phase('CLOSING',{close_at:new Date(Date.now()+60000).toISOString()}));
await phase('CLOSING',{close_at:new Date(Date.now()+3600000).toISOString()});
await deny(phase('CLOSED'));
await deny(phase('CLOSING',{close_at:new Date(Date.now()+1800000).toISOString()}));
await act(staffIDs[0],'revoke_task',{team:3,task:'brick_bank',reason:'prepare late finish test'});
await act(staffIDs[0],'start_task',{team:3,task:'brick_bank'});
await root.query("update public.game_control set close_at=clock_timestamp()-interval '1 second'");
await deny(act(teamIDs[2],'reserve_photo',{target:1}));
await deny(act(teamIDs[2],'claim',{kind:'first'}));
await deny(act(staffIDs[0],'start_task',{team:3,task:'code_talker'}));
await act(staffIDs[0],'approve_task',{team:3,task:'brick_bank',metrics:{count:1},participated:true});
ok(!(await read(teamIDs[2])).results.find(r=>r.task_id==='brick_bank').counts_for_bingo,'late finish earns but no bingo');
await phase('CLOSED');
for(const p of latePhotos)await act(staffIDs[0],'review_photo',{id:p.id,status:'approved'});
await act(staffIDs[0],'review_photo',{id:lateSixth.id,status:'approved'});
const earlyPhoto=(await read(teamIDs[0])).photos.find(p=>p.target_id===1&&p.status==='approved');
await act(staffIDs[0],'review_photo',{id:earlyPhoto.id,status:'rejected',reason:'late correction invalidates early fifth'});
ok(!(await read(teamIDs[0])).results.find(r=>r.task_id==='hide_and_seek').counts_for_bingo,'late replacement cannot preserve invalid predeadline photo qualification');
const lateResult=(await read(teamIDs[2])).results.find(r=>r.task_id==='hide_and_seek');
ok(lateResult.completed&&!lateResult.counts_for_bingo&&lateResult.score_amount>=50,'predeadline photos reviewed late earn silver but do not backdate bingo');
const identities=[...teamIDs.flatMap((x,i)=>Array(i===5?8:7).fill(x)),...staffIDs];
ok(identities.length===51,'51 sessions');
const simultaneous=await Promise.all(identities.map(read));ok(simultaneous.length===51,'51 concurrent database sessions');
const audits=await root.query("select count(distinct actor_auth_id)::int n from public.audit_events where actor_auth_id=any($1::uuid[])",[staffIDs]);
ok(audits.rows[0].n===8,'all eight staff audited');
console.log('PASS: '+checks+' assertions; PostgreSQL RLS/RPC/scoring/concurrency (Auth & Storage schemas mocked).');
root.release();await pool.end();
