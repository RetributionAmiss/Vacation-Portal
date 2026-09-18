-- Only execute inside BEGIN / ROLLBACK. All fixtures and temporary role edits must roll back.
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.trip_members where active and archived_at is null and role='organizer' and trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') limit 1),true);
set local role authenticated;
do $$
declare trip uuid; rental uuid; rental_legacy text; payer_legacy text; original jsonb; candidate jsonb; edited jsonb; bad jsonb; reply jsonb; ver bigint;
begin
 select id into strict trip from public.trips where legacy_id='TRIP-2027-TN' and archived_at is null;
 select id,legacy_id into strict rental,rental_legacy from public.rentals where trip_id=trip and legacy_id='CABIN-CAA970CF74';
 select legacy_id into payer_legacy from public.travelers where trip_id=trip and archived_at is null order by legacy_id limit 1;
 original:=public.payment_shadow_snapshot(trip,rental);
 select jsonb_agg(v order by (v->>0) collate "C") into candidate from jsonb_array_elements(original || jsonb_build_array(jsonb_build_array('PAY-SHADOWTEST',rental_legacy,'',payer_legacy,'Agency','','Test agency','12345','2027-06-01','Rollback fixture','2026-08-30T21:25:04.861Z','2026-08-30T21:25:04.861Z','','','',''))) v;
 reply:=public.sync_payment_shadow(trip,rental_legacy,now(),candidate,original);
 assert reply->>'status'='synced','Create failed';
 select version into ver from public.payments where trip_id=trip and legacy_id='PAY-SHADOWTEST' and archived_at is null;
 reply:=public.sync_payment_shadow(trip,rental_legacy,now(),candidate,candidate);
 assert reply->>'status'='unchanged','Retry changed rows';
 assert (select version from public.payments where trip_id=trip and legacy_id='PAY-SHADOWTEST' and archived_at is null)=ver,'Retry bumped version';
 select jsonb_agg(case when v->>0='PAY-SHADOWTEST' then jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v,'{7}','"12346"'),'{11}','"2026-08-30T21:25:05.861Z"'),'{12}','"Confirmed"'),'{14}',to_jsonb(payer_legacy)),'{15}','"2026-08-30T21:25:05.861Z"') else v end order by (v->>0) collate "C") into edited from jsonb_array_elements(candidate) v;
 reply:=public.sync_payment_shadow(trip,rental_legacy,now()+interval '1 second',edited,candidate);
 assert public.payment_shadow_snapshot(trip,rental)=edited,'Confirmation or source timestamps drifted';
 assert (select amount_cents from public.payments where trip_id=trip and legacy_id='PAY-SHADOWTEST' and archived_at is null)=12346,'Cents changed';
 assert (select updated_at<>source_updated_at from public.payments where trip_id=trip and legacy_id='PAY-SHADOWTEST' and archived_at is null),'Database timestamp should be independent';
 begin perform public.sync_payment_shadow(trip,rental_legacy,now(),candidate,edited);raise exception 'TEST_FAILED stale source accepted';exception when others then if sqlerrm<>'PAYMENT_STALE_SOURCE' then raise;end if;end;
 begin perform public.sync_payment_shadow(trip,rental_legacy,now()+interval '1 second',candidate,edited);raise exception 'TEST_FAILED reused time';exception when others then if sqlerrm<>'PAYMENT_SOURCE_TIME_REUSED' then raise;end if;end;
 begin perform public.sync_payment_shadow(trip,rental_legacy,now()+interval '2 seconds',candidate,candidate);raise exception 'TEST_FAILED stale destination';exception when others then if sqlerrm<>'PAYMENT_DESTINATION_CHANGED' then raise;end if;end;
 -- A valid first new row followed by an unresolved installment must roll back together.
 select jsonb_agg(v order by (v->>0) collate "C") into bad from jsonb_array_elements(edited || jsonb_build_array(jsonb_build_array('PAY-ATOMICFIRST',rental_legacy,'',payer_legacy,'Agency','','Test','1','','','2026-08-30T21:25:04.861Z','2026-08-30T21:25:04.861Z','','','',''),jsonb_build_array('PAY-ZINVALID',rental_legacy,'DUE-MISSING',payer_legacy,'Agency','','Test','1','','','2026-08-30T21:25:04.861Z','2026-08-30T21:25:04.861Z','','','',''))) v;
 begin perform public.sync_payment_shadow(trip,rental_legacy,now()+interval '2 seconds',bad,edited);raise exception 'TEST_FAILED missing installment accepted';exception when others then if sqlerrm<>'PAYMENT_INSTALLMENT_MISSING' then raise;end if;end;
 assert not exists(select 1 from public.payments where legacy_id='PAY-ATOMICFIRST'),'Partial write escaped rollback';
 assert public.payment_shadow_snapshot(trip,rental)=edited,'Failed batch changed rows';
 select jsonb_agg(case when v->>0='PAY-SHADOWTEST' then jsonb_set(v,'{7}','"1.5"') else v end order by (v->>0) collate "C") into bad from jsonb_array_elements(edited) v;
 begin perform public.sync_payment_shadow(trip,rental_legacy,now()+interval '2 seconds',bad,edited);raise exception 'TEST_FAILED fractional cents';exception when others then if sqlerrm<>'PAYMENT_INVALID_CENTS' then raise;end if;end;
 reply:=public.sync_payment_shadow(trip,rental_legacy,now()+interval '3 seconds',original,edited);
 assert public.payment_shadow_snapshot(trip,rental)=original,'Delete changed original records';
 assert exists(select 1 from public.payments where legacy_id='PAY-SHADOWTEST' and archived_at is not null),'Delete should preserve history';
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 begin perform public.sync_payment_shadow(trip,rental_legacy,now()+interval '4 seconds',original,original);raise exception 'TEST_FAILED nonmember write';exception when insufficient_privilege then null;end;
 assert public.payment_shadow_snapshot(trip,rental)='[]'::jsonb,'Nonmember read';
end $$;
reset role;
update public.trip_members set role='traveler' where trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') and role='organizer' and active and archived_at is null;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.trip_members where active and archived_at is null and trip_id=(select id from public.trips where legacy_id='TRIP-2027-TN') limit 1),true);
set local role authenticated;
do $$ declare trip uuid; rental uuid; rows jsonb;begin
 select id into strict trip from public.trips where legacy_id='TRIP-2027-TN';select id into strict rental from public.rentals where trip_id=trip and legacy_id='CABIN-CAA970CF74';rows:=public.payment_shadow_snapshot(trip,rental);
 assert jsonb_array_length(rows)>0,'Member read unavailable';
 begin perform public.sync_payment_shadow(trip,'CABIN-CAA970CF74',now()+interval '5 seconds',rows,rows);raise exception 'TEST_FAILED traveler write';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin assert not has_function_privilege('anon','public.sync_payment_shadow(uuid,text,timestamptz,jsonb,jsonb)','execute'); end $$;
select 'PASS payment SQL: create/edit/confirmation/archive, source timestamps, retries, conflicts, missing links, atomic rollback and organizer/member/nonmember/anon' as result;
