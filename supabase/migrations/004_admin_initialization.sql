begin;
insert into public.portal_migrations(version) values(4);
-- Only the offline administrative initializer uses this key. Players/staff
-- remain SELECT-only on tables and use audited RPC for all business writes.
grant select,insert,update on public.profiles to service_role;
commit;
