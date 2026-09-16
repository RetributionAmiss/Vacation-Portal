-- Run inside a transaction after the migration, always ROLLBACK. No real saved edits.
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.trip_members where active and archived_at is null and role='organizer' and trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') limit 1),true);
set local role authenticated;
do $$
declare trip uuid; original jsonb; candidate jsonb; edited jsonb; reply jsonb; saved_version bigint;
begin
  select id into strict trip from public.trips where legacy_id='TRIP-2027-TN' and archived_at is null;
  original:=public.budget_shadow_snapshot(trip);
  select jsonb_agg(v order by (v->>0) collate "C") into candidate from jsonb_array_elements(original || jsonb_build_array(jsonb_build_array('BUDGET-SHADOWTEST','Test','Rollback-only fixture','12345','Everyone','Even','','Everyone','2027-06-01','Planned','No real expense','No'))) v;
  reply:=public.sync_budget_shadow(trip,now(),candidate,original);
  assert reply->>'status'='synced','Create failed';
  select version into saved_version from public.budget_items where trip_id=trip and legacy_id='BUDGET-SHADOWTEST' and archived_at is null;
  reply:=public.sync_budget_shadow(trip,now(),candidate,candidate);
  assert reply->>'status'='unchanged','Retry must be unchanged';
  assert (select version from public.budget_items where trip_id=trip and legacy_id='BUDGET-SHADOWTEST' and archived_at is null)=saved_version,'Retry bumped version';
  select jsonb_agg(case when v->>0='BUDGET-SHADOWTEST' then jsonb_set(v,'{3}','"12346"') else v end order by (v->>0) collate "C") into edited from jsonb_array_elements(candidate) v;
  reply:=public.sync_budget_shadow(trip,now()+interval '1 second',edited,candidate);
  assert (select amount_cents from public.budget_items where trip_id=trip and legacy_id='BUDGET-SHADOWTEST' and archived_at is null)=12346,'Edit cents changed';
  begin
    perform public.sync_budget_shadow(trip,now(),candidate,edited);
    raise exception 'TEST_FAILED stale source accepted';
  exception when others then if sqlerrm<>'BUDGET_STALE_SOURCE' then raise; end if; end;
  begin
    perform public.sync_budget_shadow(trip,now()+interval '1 second',candidate,edited);
    raise exception 'TEST_FAILED reused source time accepted';
  exception when others then if sqlerrm<>'BUDGET_SOURCE_TIME_REUSED' then raise; end if; end;
  begin
    perform public.sync_budget_shadow(trip,now()+interval '2 seconds',candidate,candidate);
    raise exception 'TEST_FAILED stale destination accepted';
  exception when others then if sqlerrm<>'BUDGET_DESTINATION_CHANGED' then raise; end if; end;
  begin
    perform public.sync_budget_shadow(trip,now()+interval '2 seconds',edited || jsonb_build_array(jsonb_build_array('BUDGET-INVALID','Test','Bad amount','1.5','','','','','','','','No')),edited);
    raise exception 'TEST_FAILED invalid amount accepted';
  exception when others then if sqlerrm<>'BUDGET_INVALID_CENTS' then raise; end if; end;
  assert public.budget_shadow_snapshot(trip)=edited,'Invalid transaction changed rows';
  reply:=public.sync_budget_shadow(trip,now()+interval '3 seconds',original,edited);
  assert public.budget_shadow_snapshot(trip)=original,'Delete did not restore snapshot';
  assert exists(select 1 from public.budget_items where trip_id=trip and legacy_id='BUDGET-SHADOWTEST' and archived_at is not null),'Delete must retain history';
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  begin
    perform public.sync_budget_shadow(trip,now()+interval '4 seconds',original,original);
    raise exception 'TEST_FAILED nonmember write accepted';
  exception when insufficient_privilege then null; end;
  assert public.budget_shadow_snapshot(trip)='[]'::jsonb,'Nonmember read leaked data';
end;
$$;
reset role;
-- Temporarily demote the existing organizer within this rollback-only transaction.
update public.trip_members set role='traveler' where trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') and role='organizer' and active and archived_at is null;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.trip_members where active and archived_at is null and trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') limit 1),true);
set local role authenticated;
do $$
declare trip uuid; rows jsonb;
begin
  select id into strict trip from public.trips where legacy_id='TRIP-2027-TN';
  rows:=public.budget_shadow_snapshot(trip);
  assert jsonb_array_length(rows)>0,'Member read unavailable';
  begin
    perform public.sync_budget_shadow(trip,now()+interval '5 seconds',rows,rows);
    raise exception 'TEST_FAILED traveler write accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.sync_budget_shadow(uuid,timestamptz,jsonb,jsonb)','execute');
end $$;
select 'PASS Budget shadow SQL: create/edit/delete, cents, retries, stale source/destination, atomic rollback, organizer/member/nonmember/anon' as result;
