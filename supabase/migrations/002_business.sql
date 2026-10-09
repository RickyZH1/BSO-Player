begin;
insert into public.portal_migrations(version) values(2);
-- Helpers are private, not exposed by PostgREST. Every mutation is serialized
-- on one transaction lock: tiny event, simple and deterministic fairness.
create function private.assert_staff() returns void language plpgsql security definer set search_path='' as $$
begin if not private.staff() then raise exception '仅工作人员可操作'; end if; end $$;
create function private.is_open() returns boolean language sql stable security definer set search_path='' as $$
 select phase in ('EXPLORING','CLOSING') and (close_at is null or clock_timestamp()<close_at)
 from public.game_control where id
$$;
create function private.can_bingo() returns boolean language sql stable security definer set search_path='' as $$
 select phase not in ('CLOSED','ARCHIVED') and (close_at is null or clock_timestamp()<close_at)
 from public.game_control where id
$$;
create function private.eligible(t int,k text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare n int; pos int[]; ln int[];
begin
 select count(*),array_agg(b.position) into n,pos from public.bingo_cells b join public.team_task_results r using(team_id,task_id)
 where b.team_id=t and r.completed and r.counts_for_bingo;
 if k='full' then return n=9; end if;
 if k<>'first' or n<5 then return false; end if;
 foreach ln slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
  if ln <@ pos then return true; end if;
 end loop; return false;
end $$;
-- Scoring parameters live only in staff_rules; this generic evaluator contains
-- no event questions, answers or task-specific reward configuration.
create function private.score(c jsonb,m jsonb) returns int language plpgsql immutable set search_path='' as $$
declare n int; s int; amount int:=0; p int; v jsonb; pos int[]:='{}'; ln int[];
begin
 if c->>'mode'='grid' then
  if jsonb_typeof(m->'throws') is distinct from 'array' or jsonb_array_length(m->'throws')<>(c->>'attempts')::int then raise exception '投掷记录数量不符'; end if;
  for v in select value from jsonb_array_elements(m->'throws') loop
   if v::text !~ '^[0-9]+$' then raise exception '落点必须为整数'; end if;
   p:=v::text::int;
   if p<0 or p>jsonb_array_length(c->'grid') then raise exception '落点不合法'; end if;
   if p>0 then amount:=amount+(c->'grid'->>(p-1))::int; pos:=array_append(pos,p); end if;
  end loop;
  foreach ln slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
   if ln <@ pos then amount:=amount+(c->>'bonus')::int; exit; end if;
  end loop;
 else
  if coalesce(m->>'count','') !~ '^[0-9]+$' then raise exception '请填写正确整数成绩'; end if;
  n:=(m->>'count')::int;
  if n<0 or n>(c->>'max_count')::int then raise exception '成绩超出允许范围'; end if;
  amount:=n*(c->>'per')::int;
  if c ? 'seconds_limit' then
   if coalesce(m->>'seconds','') !~ '^[0-9]+$' then raise exception '需填写实际累计作答秒数'; end if;
   s:=(m->>'seconds')::int;
   if s<0 or s>(c->>'seconds_max')::int then raise exception '秒数超出范围'; end if;
  end if;
  if n=(c->>'max_count')::int and (not(c ? 'seconds_limit') or s<=(c->>'seconds_limit')::int) then amount:=amount+coalesce((c->>'bonus')::int,0); end if;
 end if;
 if amount<0 or amount%10<>0 or amount>(c->>'cap')::int then raise exception '计分配置错误'; end if;
 return amount;
end $$;
create function private.audit(a text,o text,b jsonb,v jsonb,r text default null) returns void language sql security definer set search_path='' as $$
 insert into public.audit_events(actor_auth_id,action,object_id,before_json,after_json,reason) values(auth.uid(),a,o,b,v,r)
$$;
create function private.ledger(t int,k text,src text,delta int,note text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if delta=0 then return; end if;
 insert into public.score_ledger(team_id,kind,source_id,idempotency_key,amount,approved_by,note)
 values(t,k,src,gen_random_uuid()::text,delta,auth.uid(),note);
end $$;
create function private.set_net(t int,k text,src text,wanted int,note text default '') returns void language plpgsql security definer set search_path='' as $$
declare actual int;
begin
 select coalesce(sum(amount),0) into actual from public.score_ledger where team_id=t and kind=k and source_id=src;
 perform private.ledger(t,k,src,wanted-actual,note);
end $$;
create function private.settle_claims() returns void language plpgsql security definer set search_path='' as $$
declare c public.bingo_claims; rk int:=0; blocked boolean:=false; value int;
begin
 for c in select * from public.bingo_claims order by submitted_at,ordinal loop
  if c.status<>'rejected' and not private.eligible(c.team_id,c.kind) then
   update public.bingo_claims set status='rejected',rejection_reason='资格因更正而失效，请核验后重新申报',approved_by=auth.uid(),approved_at=clock_timestamp() where id=c.id;
   perform private.audit('claim_invalidated',c.id::text,to_jsonb(c),null,'任务/照片更正');
   c.status:='rejected';
  end if;
  value:=0;
  if c.kind='first' then
   if c.status='pending' then blocked:=true; end if;
   if c.status='approved' and not blocked then
    rk:=rk+1; value:=case rk when 1 then 100 when 2 then 80 when 3 then 60 else 40 end;
   end if;
  elsif c.status='approved' then value:=120;
  end if;
  update public.bingo_claims set reward=value,rank=case when value>0 and kind='first' then rk else null end where id=c.id;
  perform private.set_net(c.team_id,'bingo',c.id::text,value,'系统按有效提交次序结算/冲正');
 end loop;
end $$;
create function private.settle_photo(target int) returns void language plpgsql security definer set search_path='' as $$
declare win public.photo_submissions; t int; n int; was public.team_task_results; now_at timestamptz:=clock_timestamp(); eligible boolean;
begin
 select * into win from public.photo_submissions where target_id=target and status='approved' order by submitted_at,ordinal limit 1;
 if win.id is not null and exists(select 1 from public.photo_submissions p where p.target_id=target and p.status='pending'
 and (p.submitted_at,p.ordinal)<(win.submitted_at,win.ordinal)) then win.id:=null; end if;
 for t in select id from public.teams loop
  perform private.set_net(t,'photo',target::text,case when exists(select 1 from public.photo_submissions p where p.target_id=target and p.team_id=t and p.status='approved') then 10 else 0 end,'照片基础奖励/冲正');
  perform private.set_net(t,'finder',target::text,case when win.id is not null and win.team_id=t then 10 else 0 end,'首发额外奖励/冲正');
  select count(*) into n from public.photo_submissions where team_id=t and status='approved';
  select * into was from public.team_task_results where team_id=t and task_id='hide_and_seek';
  eligible:=n>=5 and case when was.completed then was.counts_for_bingo else private.can_bingo() end;
  if n>=5 and not was.completed then
   update public.team_task_results set completed=true,counts_for_bingo=eligible,performed_at=now_at,verified_at=now_at,approved_by=auth.uid(),version=version+1 where team_id=t and task_id='hide_and_seek';
  elsif n<5 and was.completed then
   update public.team_task_results set completed=false,counts_for_bingo=false,verified_at=now_at,approved_by=auth.uid(),version=version+1 where team_id=t and task_id='hide_and_seek';
  end if;
  update public.team_task_results set score_amount=(select coalesce(sum(amount),0) from public.score_ledger where team_id=t and kind in ('photo','finder')) where team_id=t and task_id='hide_and_seek';
 end loop;
 perform private.settle_claims();
end $$;

create function public.portal_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles:=private.me(); out jsonb; is_staff boolean:=private.staff();
begin
 if me.auth_user_id is null then raise exception '账号未授权或已停用'; end if;
 out:=jsonb_build_object('profile',to_jsonb(me),'server_time',clock_timestamp(),
 'control',(select to_jsonb(g) from public.game_control g where id),
 'teams',(select coalesce(jsonb_agg(t),'[]') from public.teams t where is_staff or t.id=me.team_id),
 'tasks',(select jsonb_agg(t) from public.tasks t),
 'cells',(select coalesce(jsonb_agg(b order by b.team_id,b.position),'[]') from public.bingo_cells b where is_staff or b.team_id=me.team_id),
 'results',(select coalesce(jsonb_agg(r),'[]') from public.team_task_results r where is_staff or r.team_id=me.team_id),
 'ledger',(select coalesce(jsonb_agg(l order by l.occurred_at desc),'[]') from public.score_ledger l where is_staff or l.team_id=me.team_id),
 'announcements',(select coalesce(jsonb_agg(a order by a.published_at desc),'[]') from public.announcements a),
 'food',(select coalesce(jsonb_agg(f),'[]') from public.food_assignments f where is_staff or (f.team_id=me.team_id and f.unlocked_at is not null)),
 'clues',(select coalesce(jsonb_agg(c),'[]') from public.clues c where is_staff or private.released()),
 'targets',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.photo_targets t where is_staff or private.released()),
 'photos',(select coalesce(jsonb_agg(to_jsonb(p)-'ordinal' order by p.submitted_at nulls last),'[]') from public.photo_submissions p where is_staff or p.team_id=me.team_id),
 'claims',(select coalesce(jsonb_agg(case when is_staff then to_jsonb(c) else to_jsonb(c)-'rank'-'ordinal' end order by c.submitted_at),'[]') from public.bingo_claims c where is_staff or c.team_id=me.team_id),
 'eligibility',jsonb_build_object('first',private.eligible(me.team_id,'first'),'full',private.eligible(me.team_id,'full')),
 'accepting',private.is_open());
 if is_staff then
  out:=out||jsonb_build_object('rules',(select coalesce(jsonb_agg(r),'[]') from public.staff_rules r),
   'audit',(select coalesce(jsonb_agg(a order by a.id desc),'[]') from (select * from public.audit_events order by id desc limit 200) a),
   'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.auth_user_id,'name',p.display_name,'active',p.active)),'[]') from public.profiles p where role='staff'));
 end if;
 return out;
end $$;

create function public.portal_action(action text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 me public.profiles; g public.game_control; old jsonb; answer jsonb:='{}'; req private.requests;
 t int; task text; r public.team_task_results; cfg jsonb; amount int; now_at timestamptz;
 photo public.photo_submissions; claim public.bingo_claims; uid uuid; reason text; next_phase text; closing timestamptz;
 n int; target int; obj record; completed boolean;
begin
 if request_id is null or payload is null then raise exception '请求标识缺失'; end if;
 perform pg_advisory_xact_lock(710151);
 me:=private.me();
 if me.auth_user_id is null then raise exception '账号未授权或已停用'; end if;
 select * into req from private.requests where id=request_id;
 if found then
  if req.actor<>me.auth_user_id or req.action<>action or req.payload<>payload then raise exception '请求标识冲突'; end if;
  return req.result;
 end if;
 select * into g from public.game_control where id for update;
 if g.phase='ARCHIVED' then raise exception '活动已归档，只读'; end if;
 now_at:=clock_timestamp();
 reason:=nullif(btrim(payload->>'reason'),'');
 if action in ('claim','reserve_photo','submit_photo') then
  if me.role<>'team' then raise exception '请用队伍账号提交'; end if;
  t:=me.team_id;
  if not private.is_open() then raise exception '当前阶段不接受新提交'; end if;
 else
  perform private.assert_staff();
 end if;

 if action='claim' then
  if payload->>'kind' not in ('first','full') or payload->>'kind' is null then raise exception '申报类型错误'; end if;
  select * into claim from public.bingo_claims where team_id=t and kind=payload->>'kind' and status<>'rejected';
  if found then answer:=jsonb_build_object('id',claim.id);
  else
   if not private.eligible(t,payload->>'kind') then raise exception '尚未达到申报条件'; end if;
   insert into public.bingo_claims(team_id,kind,submitted_at) values(t,payload->>'kind',now_at) returning id into uid;
   answer:=jsonb_build_object('id',uid);
  end if;
 elsif action='reserve_photo' then
  target:=(payload->>'target')::int;
  if not exists(select 1 from public.photo_targets where id=target and enabled) then raise exception '目标不存在'; end if;
  if exists(select 1 from public.photo_submissions where team_id=t and target_id=target and status in ('pending','approved')) then raise exception '本图已提交，请等待审核；驳回后可重拍'; end if;
  if (select count(*) from public.photo_submissions where team_id=t and target_id=target and reserved_at>now_at-interval '1 minute')>=3 then raise exception '提交过于频繁，请稍后重试'; end if;
  if (select count(*) from public.photo_submissions where team_id=t)>=120 then raise exception '达到本队上传上限，请联系工作人员'; end if;
  uid:=gen_random_uuid();
  insert into public.photo_submissions(id,team_id,target_id,storage_key,reserved_at)
  values(uid,t,target,t::text||'/'||uid::text||'.jpg',now_at);
  answer:=jsonb_build_object('id',uid,'key',t::text||'/'||uid::text||'.jpg');
 elsif action='submit_photo' then
  select * into photo from public.photo_submissions where id=(payload->>'id')::uuid and team_id=t for update;
  if not found then raise exception '未找到本队上传记录'; end if;
  if photo.status<>'uploading' then answer:=jsonb_build_object('id',photo.id);
  else
   if photo.reserved_at<now_at-interval '10 minutes' then raise exception '上传已过期，请重新选择照片'; end if;
   if exists(select 1 from public.photo_submissions where team_id=t and target_id=photo.target_id and status in ('pending','approved')) then raise exception '该目标已有待审核或有效照片'; end if;
   if not exists(select 1 from storage.objects where bucket_id='evidence' and name=photo.storage_key) then raise exception '照片尚未上传成功'; end if;
   update public.photo_submissions set submitted_at=now_at,status='pending' where id=photo.id;
   answer:=jsonb_build_object('id',photo.id);
  end if;
 elsif action in ('start_task','preview_score','approve_task','correct_task','revoke_task') then
  t:=(payload->>'team')::int; task:=payload->>'task';
  select * into r from public.team_task_results where team_id=t and task_id=task for update;
  if not found then raise exception '队伍或关卡不存在'; end if;
  if task='hide_and_seek' then raise exception '照片关卡由照片审核自动完成'; end if;
  old:=to_jsonb(r);
  if action='start_task' then
   if task='focus_hunter' then
    if g.phase<>'OPENING' or (g.close_at is not null and now_at>=g.close_at) then raise exception '非统一开场阶段'; end if;
   elsif not private.is_open() then raise exception '现在不能开始新挑战'; end if;
   if r.started_at is null then
    update public.team_task_results set started_at=now_at,version=version+1 where team_id=t and task_id=task;
   end if;
  elsif action='revoke_task' then
   if reason is null then raise exception '必须填写撤销原因'; end if;
   update public.team_task_results set completed=false,counts_for_bingo=false,score_amount=0,verified_at=now_at,approved_by=auth.uid(),version=version+1 where team_id=t and task_id=task;
   perform private.set_net(t,'task',task,0,reason);
   perform private.settle_claims();
  else
   if task='food_quest' then
    if not exists(select 1 from public.food_assignments where team_id=t and unlocked_at is not null) then raise exception '先解锁本队美食任务'; end if;
   end if;
   select score_config into cfg from public.staff_rules where task_id=task;
   if cfg is null then raise exception '请先导入私密规则'; end if;
   amount:=private.score(cfg,payload->'metrics');
   if action='preview_score' then return jsonb_build_object('amount',amount); end if;
   if action='approve_task' and r.completed then return jsonb_build_object('amount',r.score_amount,'already',true); end if;
   if action='correct_task' and (reason is null or not r.completed) then raise exception '更正需要已有完成记录及原因'; end if;
   if r.started_at is null then raise exception '请先登记开始挑战，不允许回填过去时间'; end if;
   if coalesce((payload->>'participated')::boolean,false)=false then raise exception '必须确认已完整参与，不能弃权换章'; end if;
   if task='food_quest' and (payload->'metrics'->>'count')::int<>(cfg->>'max_count')::int then raise exception '美食需全部验收，未完成不能盖章'; end if;
   update public.team_task_results set completed=true,counts_for_bingo=case when action='correct_task' then r.counts_for_bingo else private.can_bingo() end,
    performed_at=case when action='correct_task' then r.performed_at else now_at end,verified_at=now_at,
    approved_by=auth.uid(),score_amount=amount,version=version+1 where team_id=t and task_id=task;
   insert into public.task_evidence values(t,task,payload->'metrics') on conflict(team_id,task_id) do update set metrics=excluded.metrics;
   perform private.set_net(t,'task',task,amount,coalesce(reason,'工作人员确认'));
   perform private.settle_claims();
   answer:=jsonb_build_object('amount',amount);
  end if;
 elsif action='review_photo' then
  select * into photo from public.photo_submissions where id=(payload->>'id')::uuid for update;
  if not found or photo.status='uploading' then raise exception '没有可审核照片'; end if;
  if payload->>'status' not in ('approved','rejected') or payload->>'status' is null then raise exception '审核状态错误'; end if;
  if photo.status=payload->>'status' then return jsonb_build_object('already',true); end if;
  if (payload->>'status'='rejected' or photo.status<>'pending') and reason is null then raise exception '驳回或更正必须填写原因'; end if;
  old:=to_jsonb(photo);
  if payload->>'status'='approved' and exists(select 1 from public.photo_submissions where team_id=photo.team_id and target_id=photo.target_id and status='approved' and id<>photo.id) then raise exception '本队本图已有有效照片，请先撤销错误记录'; end if;
  update public.photo_submissions set status=payload->>'status',reviewed_by=auth.uid(),reviewed_at=now_at,reject_reason=reason where id=photo.id;
  perform private.settle_photo(photo.target_id);
 elsif action='review_claim' then
  select * into claim from public.bingo_claims where id=(payload->>'id')::uuid for update;
  if not found then raise exception '申报不存在'; end if;
  if payload->>'status' not in ('approved','rejected') or payload->>'status' is null then raise exception '状态错误'; end if;
  if claim.status=payload->>'status' then return jsonb_build_object('already',true); end if;
  if (payload->>'status'='rejected' or claim.status<>'pending') and reason is null then raise exception '驳回或更正须填写原因'; end if;
  if payload->>'status'='approved' and not private.eligible(claim.team_id,claim.kind) then raise exception '资格不足'; end if;
  old:=to_jsonb(claim);
  update public.bingo_claims set status=payload->>'status',approved_at=now_at,approved_by=auth.uid(),rejection_reason=reason where id=claim.id;
  perform private.settle_claims();
 elsif action='unlock_food' then
  if not private.is_open() then raise exception '尚未开放探索或已截止'; end if;
  t:=(payload->>'team')::int;
  update public.food_assignments set unlocked_at=coalesce(unlocked_at,now_at),unlocked_by=coalesce(unlocked_by,auth.uid()) where team_id=t;
  if not found then raise exception '队伍不存在'; end if;
 elsif action='substitute_food' then
  if reason is null or length(coalesce(payload->>'details',''))<1 then raise exception '填写替代清单及原因'; end if;
  t:=(payload->>'team')::int;
  select to_jsonb(f) into old from public.food_assignments f where team_id=t;
  update public.food_assignments set substitute_details=payload->>'details' where team_id=t;
  if not found then raise exception '队伍不存在'; end if;
 elsif action='adjust' then
  t:=(payload->>'team')::int; amount:=(payload->>'amount')::int;
  if reason is null or amount is null or amount=0 or amount%10<>0 or abs(amount)>10000 then raise exception '更正需原因及非零10两整数倍金额（最多10000）'; end if;
  insert into public.score_ledger(team_id,kind,source_id,idempotency_key,amount,approved_by,note,reversed_entry_id)
  values(t,'adjust',request_id::text,request_id::text,amount,auth.uid(),reason,nullif(payload->>'reversed_entry_id','')::uuid);
 elsif action='announcement' then
  insert into public.announcements(message,publisher) values(payload->>'message',auth.uid());
 elsif action='edit_clue' then
  task:=payload->>'task';
  select to_jsonb(c) into old from public.clues c where task_id=task;
  update public.clues set text=payload->>'text',image_asset=nullif(payload->>'image',''),learning_source=nullif(payload->>'learning_source','') where task_id=task;
  if not found then raise exception '此任务没有地点线索（开场及照片寻宝不设线索）'; end if;
 elsif action='edit_rule' then
  task:=payload->>'task';
  select to_jsonb(rules) into old from public.staff_rules rules where task_id=task;
  update public.staff_rules set rule_text=payload->>'text',private_location=payload->>'location' where task_id=task;
  if not found then raise exception '规则不存在'; end if;
 elsif action='settings' then
  old:=to_jsonb(g);
  update public.game_control set opening_notice=payload->>'opening',scope_notice=payload->>'scope',contact_notice=payload->>'contact',
  updated_by=auth.uid(),updated_at=now_at,version=version+1 where id;
 elsif action='phase' then
  old:=to_jsonb(g);
  if (payload->>'version')::int is distinct from g.version then raise exception '阶段已被其他工作人员更新，请刷新'; end if;
  next_phase:=payload->>'phase';
  if next_phase='OPENING' and g.phase='PRE_EVENT' then
   update public.game_control set phase=next_phase,started_at=now_at where id;
  elsif next_phase='EXPLORING' and g.phase='OPENING' then
   if (select count(*) from public.team_task_results where task_id='focus_hunter' and completed)<>6 then raise exception '必须六队完成开场三场对阵后放行'; end if;
   update public.game_control set phase=next_phase,exploration_released_at=now_at where id;
  elsif next_phase='CLOSING' and g.phase in ('EXPLORING','CLOSING') then
   closing:=(payload->>'close_at')::timestamptz;
   if closing is null or closing<now_at+interval '15 minutes' or (g.close_at is not null and closing<g.close_at) then raise exception '至少提前15分钟公告，且不得提前已有截止'; end if;
   if g.close_at is not null and now_at>=g.close_at then raise exception '已到截止，不能重新开放'; end if;
   update public.game_control set phase=next_phase,close_at=closing,announced_close_at=now_at where id;
   insert into public.announcements(message,publisher) values('最终清盘时间：'||to_char(closing at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI')||'（上海时间），请及时提交。',auth.uid());
  elsif next_phase='CLOSED' and g.phase='CLOSING' and now_at>=g.close_at then
   update public.game_control set phase=next_phase,closed_at=now_at where id;
  elsif next_phase='ARCHIVED' and g.phase='CLOSED' then
   if exists(select 1 from public.photo_submissions where status='pending') or exists(select 1 from public.bingo_claims where status='pending') then raise exception '先处理全部待审核材料'; end if;
   update public.game_control set phase=next_phase where id;
  else raise exception '不允许此阶段转换（不得提前关闭）';
  end if;
  update public.game_control set updated_by=auth.uid(),updated_at=now_at,version=version+1 where id;
 else raise exception '不支持的操作';
 end if;
 perform private.audit(action,coalesce(payload->>'id',payload->>'task',payload->>'team','event'),old,payload||answer,reason);
 insert into private.requests values(request_id,auth.uid(),action,payload,answer);
 return answer;
end $$;
-- Default function EXECUTE for PUBLIC would expose helpers. Revoke explicitly.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.me(),private.staff(),private.team(),private.member(),private.released() to authenticated;
revoke all on function public.portal_read(),public.portal_action(text,jsonb,uuid) from public,anon;
grant execute on function public.portal_read(),public.portal_action(text,jsonb,uuid) to authenticated;
commit;
