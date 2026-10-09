begin;
insert into public.portal_migrations(version) values(3);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,800000,array['image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=800000,allowed_mime_types=array['image/jpeg','image/webp'];
create function private.can_upload(key text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_open() and exists(select 1 from public.photo_submissions p
 where p.storage_key=key and p.team_id=private.team() and p.status='uploading'
 and p.reserved_at>clock_timestamp()-interval '10 minutes')
$$;
create function private.can_read_photo(key text) returns boolean language sql stable security definer set search_path='' as $$
 select private.member() and exists(select 1 from public.photo_submissions p where p.storage_key=key and (private.staff() or p.team_id=private.team()))
$$;
revoke all on function private.can_upload(text),private.can_read_photo(text) from public,anon;
grant execute on function private.can_upload(text),private.can_read_photo(text) to authenticated;
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidence' and private.can_upload(name));
create policy evidence_select on storage.objects for select to authenticated using(bucket_id='evidence' and private.can_read_photo(name));
-- No UPDATE/DELETE policy: users cannot replace approved evidence.
commit;
