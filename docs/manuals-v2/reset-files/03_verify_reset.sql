-- 只读检查：在Supabase SQL Editor粘贴全文并Run。
select
 (select phase from public.game_control where id=true) as phase,
 (select count(*) from public.team_task_results where completed) as completed_tasks,
 (select count(*) from public.photo_submissions) as photo_records,
 (select count(*) from public.bingo_claims) as bingo_claims,
 (select count(*) from public.score_ledger) as ledger_records,
 (select count(*) from public.profiles) as accounts,
 (select count(*) from storage.objects where bucket_id='evidence') as evidence_files,
 (select count(*) from public.food_assignments where unlocked_at is not null) as unlocked_food;

select team_id,sum(amount) as balance
from public.score_ledger group by team_id order by team_id;

select
 (select count(*) from public.teams) as teams,
 (select count(*) from public.tasks) as tasks,
 (select count(*) from public.bingo_cells) as bingo_cells,
 (select count(*) from public.team_task_results) as team_task_results,
 (select count(*) from public.clues) as clues,
 (select count(*) from public.photo_targets) as photo_targets,
 (select count(*) from public.food_assignments) as food_assignments;
