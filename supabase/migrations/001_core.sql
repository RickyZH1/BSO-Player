-- M1/M2 schema. Run once in order, in a NEW project. Transactional/versioned.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.portal_migrations(version int primary key, installed_at timestamptz default now());
insert into public.portal_migrations(version) values (1);
create table public.teams(
 id int primary key check(id between 1 and 6), code text unique not null,
 member_count int not null check(member_count between 7 and 8));
create table public.profiles(
 auth_user_id uuid primary key references auth.users(id), role text not null check(role in ('team','staff')),
 team_id int references public.teams, display_name text not null, active boolean not null default true,
 check((role='team' and team_id is not null) or (role='staff' and team_id is null)));
create unique index one_account_per_team on public.profiles(team_id) where role='team';
create table public.tasks(id text primary key, display_name text not null, kind text not null check(kind in ('opening','checkpoint','photo','food')), icon text not null);
create table public.bingo_cells(team_id int references public.teams, position int check(position between 1 and 9), task_id text references public.tasks,
 primary key(team_id,position), unique(team_id,task_id));
create table public.game_control(
 id boolean primary key default true check(id), phase text not null default 'PRE_EVENT' check(phase in ('PRE_EVENT','OPENING','EXPLORING','CLOSING','CLOSED','ARCHIVED')),
 event_date date not null default '2026-10-15', timezone text not null default 'Asia/Shanghai',
 started_at timestamptz, exploration_released_at timestamptz, announced_close_at timestamptz, close_at timestamptz, closed_at timestamptz,
 opening_notice text not null default 'TODO_PLACE_FOCUS_OPENING：集合地点待公布',
 scope_notice text not null default 'TODO_MAP_SCOPE：活动范围与禁入区域待公布',
 contact_notice text not null default 'TODO_ANNOUNCEMENT_CONTACT：请联系现场工作人员',
 updated_by uuid, updated_at timestamptz not null default now(), version int not null default 1);
insert into public.game_control(id) values(true);
create table public.clues(task_id text primary key references public.tasks,
 text text not null, image_asset text, learning_source text, check(task_id not in ('focus_hunter','hide_and_seek')));
create table public.staff_rules(task_id text primary key references public.tasks, rule_text text not null,
 score_config jsonb not null, private_location text not null default 'TODO_PRIVATE_LOCATION');
create table public.team_task_results(
 team_id int references public.teams, task_id text references public.tasks, completed boolean not null default false,
 counts_for_bingo boolean not null default false, started_at timestamptz, performed_at timestamptz, verified_at timestamptz,
 approved_by uuid, score_amount int not null default 0 check(score_amount%10=0), version int not null default 1,
 primary key(team_id,task_id), check(not counts_for_bingo or completed));
create table public.task_evidence(team_id int, task_id text, metrics jsonb not null, primary key(team_id,task_id),
 foreign key(team_id,task_id) references public.team_task_results);
create table public.food_assignments(team_id int primary key references public.teams, secret_details text not null,
 unlocked_at timestamptz, unlocked_by uuid, substitute_details text);
create table public.photo_targets(id int primary key check(id between 1 and 11), public_image text not null, thumbnail text not null, enabled boolean default true);
create table public.photo_submissions(
 id uuid primary key default gen_random_uuid(), ordinal bigint generated always as identity unique,
 team_id int not null references public.teams, target_id int not null references public.photo_targets,
 storage_key text unique not null, reserved_at timestamptz not null default clock_timestamp(), submitted_at timestamptz,
 status text not null default 'uploading' check(status in ('uploading','pending','approved','rejected')),
 reviewed_by uuid, reviewed_at timestamptz, reject_reason text);
create unique index one_valid_photo on public.photo_submissions(team_id,target_id) where status='approved';
create index photo_queue on public.photo_submissions(target_id,submitted_at,ordinal) where status in ('pending','approved');
create table public.bingo_claims(
 id uuid primary key default gen_random_uuid(), ordinal bigint generated always as identity unique,
 team_id int not null references public.teams, kind text check(kind in ('first','full')),
 submitted_at timestamptz not null default clock_timestamp(), status text default 'pending' check(status in ('pending','approved','rejected')),
 approved_by uuid, approved_at timestamptz, rank int, reward int not null default 0, rejection_reason text);
create unique index one_active_claim on public.bingo_claims(team_id,kind) where status<>'rejected';
create table public.score_ledger(
 id uuid primary key default gen_random_uuid(), team_id int not null references public.teams, kind text not null,
 source_id text not null, idempotency_key text unique not null, amount int not null check(amount%10=0),
 approved_by uuid, occurred_at timestamptz not null default clock_timestamp(), note text not null default '',
 reversed_entry_id uuid references public.score_ledger);
create index ledger_team on public.score_ledger(team_id,occurred_at);
create table public.announcements(id uuid primary key default gen_random_uuid(), message text not null check(length(message) between 1 and 2000),
 published_at timestamptz not null default clock_timestamp(), publisher uuid);
create table public.audit_events(id bigint generated always as identity primary key, actor_auth_id uuid,
 action text not null, object_id text, before_json jsonb, after_json jsonb, reason text, at timestamptz default clock_timestamp());
create table private.requests(id uuid primary key, actor uuid not null, action text not null, payload jsonb not null, result jsonb not null);
alter table private.requests enable row level security;

create function private.me() returns public.profiles language sql stable security definer set search_path='' as $$
 select p from public.profiles p where p.auth_user_id=auth.uid() and p.active
$$;
create function private.staff() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((private.me()).role='staff',false)
$$;
create function private.team() returns int language sql stable security definer set search_path='' as $$ select (private.me()).team_id $$;
create function private.member() returns boolean language sql stable security definer set search_path='' as $$ select (private.me()).auth_user_id is not null $$;
create function private.released() returns boolean language sql stable security definer set search_path='' as $$
 select exploration_released_at is not null from public.game_control where id
$$;
-- RLS is also applied to direct REST reads; no client gets table write rights.
do $$
declare t text;
begin
 foreach t in array array['portal_migrations','teams','profiles','tasks','bingo_cells','game_control','clues','staff_rules','team_task_results','task_evidence','food_assignments','photo_targets','photo_submissions','bingo_claims','score_ledger','announcements','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
 foreach t in array array['bingo_cells','team_task_results','photo_submissions','score_ledger'] loop
  execute format('create policy team_read on public.%I for select to authenticated using (private.staff() or team_id=private.team())',t);
 end loop;
end $$;
create policy team_read on public.teams for select to authenticated using(private.staff() or id=private.team());
create policy self_read on public.profiles for select to authenticated using(auth_user_id=auth.uid() and active);
create policy member_read on public.tasks for select to authenticated using(private.member());
create policy member_read on public.game_control for select to authenticated using(private.member());
create policy member_read on public.announcements for select to authenticated using(private.member());
create policy released_read on public.clues for select to authenticated using(private.staff() or (private.member() and private.released()));
create policy released_read on public.photo_targets for select to authenticated using(private.staff() or (private.member() and private.released()));
create policy food_read on public.food_assignments for select to authenticated using(private.staff() or (team_id=private.team() and unlocked_at is not null));
create policy staff_read on public.staff_rules for select to authenticated using(private.staff());
create policy staff_read on public.task_evidence for select to authenticated using(private.staff());
create policy staff_read on public.bingo_claims for select to authenticated using(private.staff());
create policy staff_read on public.audit_events for select to authenticated using(private.staff());
grant usage on schema private to authenticated;
grant execute on function private.me(),private.staff(),private.team(),private.member(),private.released() to authenticated;
grant select on public.teams,public.profiles,public.tasks,public.bingo_cells,public.game_control,public.clues,public.staff_rules,
 public.team_task_results,public.task_evidence,public.food_assignments,public.photo_targets,public.score_ledger,public.announcements,public.audit_events,public.bingo_claims to authenticated;
-- Never expose the global sequence/tie-break to players, even on direct REST.
grant select(id,team_id,target_id,storage_key,reserved_at,submitted_at,status,reviewed_by,reviewed_at,reject_reason) on public.photo_submissions to authenticated;
commit;
