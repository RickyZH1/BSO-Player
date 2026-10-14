-- 仅正式活动前：全部六队记录都是测试才允许执行。
-- 先暂停所有测试用户，备份需要的资料。
-- 上传过照片：先在Storage界面删除evidence实际文件。
begin;
select pg_advisory_xact_lock(710151);
do $$
declare
 reset_confirmation text := '未确认';
 old_state jsonb;
 event_day date;
begin
 if reset_confirmation <> '全部是测试，可以清空' then
  raise exception '请先确认全部为测试，仅修改确认变量后再执行';
 end if;
 select event_date into event_day
 from public.game_control where id=true;
 if event_day is null then
  raise exception '未找到活动配置，停止重置';
 end if;
 if (now() at time zone 'Asia/Shanghai')::date >= event_day then
  raise exception '已到活动日期，禁止演练重置';
 end if;
 if (select count(*) from public.teams) <> 6
 or (select count(*) from public.bingo_cells) <> 54
 or (select count(*) from public.team_task_results) <> 54 then
  raise exception '基础数据数量不符合预期，停止重置';
 end if;
 if exists (
  select 1 from storage.objects where bucket_id='evidence'
 ) then
  raise exception '先在Storage界面删除全部测试证据文件，再重置数据库';
 end if;
 select jsonb_build_object(
  'control',(select to_jsonb(g) from public.game_control g where id=true),
  'photo_count',(select count(*) from public.photo_submissions),
  'claim_count',(select count(*) from public.bingo_claims),
  'ledger_count',(select count(*) from public.score_ledger),
  'completed_count',(select count(*) from public.team_task_results where completed)
 ) into old_state;
 if to_regclass('private.hide_seek_emergencies') is not null then
  execute 'delete from private.hide_seek_emergencies';
 end if;
 delete from public.task_evidence;
 delete from public.photo_submissions;
 delete from public.bingo_claims;
 delete from public.score_ledger;
 delete from public.announcements;
 delete from private.requests;
 update public.team_task_results
 set completed=false, counts_for_bingo=false,
 started_at=null, performed_at=null, verified_at=null,
 approved_by=null, score_amount=0, version=version+1;
 update public.food_assignments
 set unlocked_at=null, unlocked_by=null;
 update public.game_control
 set phase='PRE_EVENT', started_at=null,
 exploration_released_at=null, announced_close_at=null,
 close_at=null, closed_at=null, updated_by=null,
 updated_at=now(), version=version+1
 where id=true;
 insert into public.score_ledger(
  team_id,kind,source_id,idempotency_key,amount,note
 )
 select id,'initial',id::text,'initial:'||id::text,
 500,'演练重置后的团队初始银票'
 from public.teams;
 insert into public.audit_events(
  actor_auth_id,action,object_id,
  before_json,after_json,reason
 )
 values(
  null,'rehearsal_reset_by_sql_editor','all_teams',
  old_state,
  jsonb_build_object('phase','PRE_EVENT','initial_balance',500),
  '主办方确认全为测试，通过SQL Editor重置；原审计保留'
 );
end
$$;
commit;
