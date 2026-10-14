-- V1修复：审核表单前端修复；Hide and Seek人工应急状态与原照片奖励分离。
-- 在已完成001-004的项目执行一次。所有修改同一事务，不删除现有材料。
begin;
insert into public.portal_migrations(version) values(5);

create table private.hide_seek_emergencies(
 team_id int primary key references public.teams(id),
 active boolean not null default false,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 performed_at timestamptz not null,
 approved_by uuid not null references public.profiles(auth_user_id),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(auth_user_id),
 version int not null default 1
);
alter table private.hide_seek_emergencies enable row level security;
revoke all on private.hide_seek_emergencies from public,anon,authenticated;

-- 完成来源可以是5张有效照片，或一条有效应急决定。银票始终来自真实照片流水。
create function private.refresh_hide_seek(t int) returns void
language plpgsql security definer set search_path='' as $$
declare
 n int;
 fifth_at timestamptz;
 effective_at timestamptz;
 cutoff timestamptz;
 was public.team_task_results;
 emergency private.hide_seek_emergencies;
 is_complete boolean;
 is_eligible boolean;
begin
 select close_at into cutoff from public.game_control where id;
 select * into was from public.team_task_results where team_id=t and task_id='hide_and_seek';
 if not found then raise exception '本队照片任务不存在，请核对初始化'; end if;
 select * into emergency from private.hide_seek_emergencies where team_id=t;
 select count(*) into n from public.photo_submissions where team_id=t and status='approved';
 select reviewed_at into fifth_at from public.photo_submissions
 where team_id=t and status='approved' order by reviewed_at,ordinal offset 4 limit 1;
 is_complete:=n>=5 or coalesce(emergency.active,false);
 effective_at:=case
  when n>=5 and coalesce(emergency.active,false) then least(fifth_at,emergency.performed_at)
  when n>=5 then fifth_at
  when coalesce(emergency.active,false) then emergency.performed_at
  else null end;
 is_eligible:=is_complete and (cutoff is null or effective_at<cutoff);
 update public.team_task_results
 set completed=is_complete,counts_for_bingo=is_eligible,
 performed_at=effective_at,verified_at=clock_timestamp(),
 approved_by=auth.uid(),version=version+1,
 score_amount=(select coalesce(sum(amount),0) from public.score_ledger
               where team_id=t and kind in ('photo','finder'))
 where team_id=t and task_id='hide_and_seek';
end $$;
revoke all on function private.refresh_hide_seek(int) from public,anon,authenticated;

create or replace function private.settle_photo(target int) returns void
language plpgsql security definer set search_path='' as $$
declare win public.photo_submissions; t int;
begin
 select * into win from public.photo_submissions where target_id=target and status='approved'
 order by submitted_at,ordinal limit 1;
 if win.id is not null and exists(
  select 1 from public.photo_submissions p where p.target_id=target and p.status='pending'
  and (p.submitted_at,p.ordinal)<(win.submitted_at,win.ordinal)
 ) then win.id:=null; end if;
 for t in select id from public.teams loop
  perform private.set_net(t,'photo',target::text,case when exists(
   select 1 from public.photo_submissions p
   where p.target_id=target and p.team_id=t and p.status='approved'
  ) then 10 else 0 end,'照片基础奖励/冲正');
  perform private.set_net(t,'finder',target::text,
   case when win.id is not null and win.team_id=t then 10 else 0 end,
   '首发额外奖励/冲正');
  perform private.refresh_hide_seek(t);
 end loop;
 perform private.settle_claims();
end $$;

-- 保存旧业务接口为只允许函数拥有者调用的内部实现。
alter function public.portal_action(text,jsonb,uuid) rename to portal_action_v1;
revoke all on function public.portal_action_v1(text,jsonb,uuid) from public,anon,authenticated;
create function public.portal_action(action text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me public.profiles;
 g public.game_control;
 emergency private.hide_seek_emergencies;
 req private.requests;
 t int;
 why text;
 now_at timestamptz;
 old jsonb;
 answer jsonb;
 next_version int;
begin
 if action is distinct from 'emergency_hide_seek'
 and action is distinct from 'revoke_emergency_hide_seek' then
  return public.portal_action_v1(action,payload,request_id);
 end if;
 if request_id is null or payload is null then raise exception '请求标识缺失'; end if;
 perform pg_advisory_xact_lock(710151);
 perform private.assert_staff();
 me:=private.me();
 select * into req from private.requests where id=request_id;
 if found then
  if req.actor<>me.auth_user_id or req.action<>action or req.payload<>payload then
   raise exception '请求标识冲突';
  end if;
  return req.result;
 end if;
 select * into g from public.game_control where id for update;
 if g.phase='ARCHIVED' then raise exception '活动已归档，只读'; end if;
 if payload ? 'task' and (payload->>'task') is distinct from 'hide_and_seek' then
  raise exception '人工应急只允许Hide and Seek';
 end if;
 t:=(payload->>'team')::int;
 if t is null or not exists(select 1 from public.teams where id=t) then
  raise exception '队伍不存在';
 end if;
 why:=nullif(btrim(payload->>'reason'),'');
 if why is null or length(why)>1000 then raise exception '必须填写1至1000字应急理由'; end if;
 if coalesce((payload->>'verified')::boolean,false)=false then
  raise exception '请确认已经现场核验，并理解应急不自动发银票';
 end if;
 select * into emergency from private.hide_seek_emergencies where team_id=t for update;
 if (payload->>'version')::int is distinct from coalesce(emergency.version,0) then
  raise exception '本队应急状态已更新，请刷新再操作';
 end if;
 now_at:=clock_timestamp();
 old:=jsonb_build_object(
  'emergency',to_jsonb(emergency),
  'result',(select to_jsonb(r) from public.team_task_results r
            where team_id=t and task_id='hide_and_seek')
 );
 if action='emergency_hide_seek' then
  if not private.is_open() then raise exception '应急点亮仅限探索开放且未截止，不允许倒填时间'; end if;
  if coalesce(emergency.active,false) then raise exception '本队已经应急点亮，无需重复操作'; end if;
  if (select count(*) from public.photo_submissions where team_id=t and status='approved')>=5 then
   raise exception '本队已有5张有效照片，无需应急点亮';
  end if;
  next_version:=coalesce(emergency.version,0)+1;
  insert into private.hide_seek_emergencies(team_id,active,reason,performed_at,approved_by,version)
 values(t,true,why,now_at,me.auth_user_id,next_version)
  on conflict(team_id) do update set active=true,reason=excluded.reason,
   performed_at=excluded.performed_at,approved_by=excluded.approved_by,
   revoked_at=null,revoked_by=null,version=excluded.version;
 else
  if not coalesce(emergency.active,false) then raise exception '本队没有有效应急完成记录'; end if;
  update private.hide_seek_emergencies set active=false,reason=why,
   revoked_at=now_at,revoked_by=me.auth_user_id,version=version+1 where team_id=t;
 end if;
 perform private.refresh_hide_seek(t);
 perform private.settle_claims();
 answer:=jsonb_build_object('team',t,'task','hide_and_seek','automatic_reward',0,
  'emergency',(select to_jsonb(e) from private.hide_seek_emergencies e where team_id=t),
  'result',(select to_jsonb(r) from public.team_task_results r
            where team_id=t and task_id='hide_and_seek'));
 perform private.audit(action,t::text,old,answer,why);
 insert into private.requests values(request_id,me.auth_user_id,action,payload,answer);
 return answer;
end $$;
revoke all on function public.portal_action(text,jsonb,uuid) from public,anon;
grant execute on function public.portal_action(text,jsonb,uuid) to authenticated;

alter function public.portal_read() rename to portal_read_v1;
revoke all on function public.portal_read_v1() from public,anon,authenticated;
create function public.portal_read() returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=public.portal_read_v1();
 if private.staff() then
  out:=out||jsonb_build_object('hide_seek_emergencies',(
   select coalesce(jsonb_agg(e order by e.team_id),'[]') from private.hide_seek_emergencies e
  ));
 end if;
 return out;
end $$;
revoke all on function public.portal_read() from public,anon;
grant execute on function public.portal_read() to authenticated;
commit;


