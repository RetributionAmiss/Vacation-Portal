-- Preserve Sheet concurrency tokens independently of database update/version triggers.
alter table public.payments add column source_created_at timestamptz, add column source_updated_at timestamptz;
create table public.payment_shadow_sync_state (
 trip_id uuid not null references public.trips(id) on delete cascade,
 rental_id uuid not null references public.rentals(id) on delete cascade,
 source_time timestamptz not null, source_rows jsonb not null check(jsonb_typeof(source_rows)='array'),
 synced_at timestamptz not null default now(), primary key(trip_id,rental_id)
);
create index payment_shadow_sync_rental_idx on public.payment_shadow_sync_state(rental_id);
alter table public.payment_shadow_sync_state enable row level security;
revoke all on public.payment_shadow_sync_state from anon;
grant select,insert,update on public.payment_shadow_sync_state to authenticated;
create policy payment_shadow_member_select on public.payment_shadow_sync_state for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy payment_shadow_organizer_insert on public.payment_shadow_sync_state for insert to authenticated with check ((select private.is_trip_organizer(trip_id)));
create policy payment_shadow_organizer_update on public.payment_shadow_sync_state for update to authenticated using ((select private.is_trip_organizer(trip_id))) with check ((select private.is_trip_organizer(trip_id)));

-- Same field order as PaymentsBudgetContract.fields.payments; amount is integer cents.
create function public.payment_shadow_snapshot(p_trip_id uuid,p_rental_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_array(
 p.legacy_id,r.legacy_id,coalesce(s.legacy_id,''),coalesce(payer.legacy_id,''),coalesce(p.paid_to_type,''),
 coalesce(recipient.legacy_id,''),coalesce(p.paid_to_name,''),p.amount_cents::text,coalesce(p.payment_date::text,''),coalesce(p.notes,''),
 to_char(coalesce(p.source_created_at,p.created_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 to_char(coalesce(p.source_updated_at,p.updated_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 coalesce(p.confirmation_status,''),coalesce(p.confirmation_source,''),coalesce(confirmer.legacy_id,''),
 coalesce(to_char(p.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'')
 ) order by p.legacy_id collate "C"),'[]'::jsonb)
 from public.payments p join public.rentals r on r.id=p.rental_id and r.trip_id=p.trip_id
 left join public.payment_schedules s on s.id=p.schedule_id and s.trip_id=p.trip_id and s.rental_id=p.rental_id
 left join public.travelers payer on payer.id=p.paid_by_traveler_id and payer.trip_id=p.trip_id
 left join public.travelers recipient on recipient.id=p.paid_to_traveler_id and recipient.trip_id=p.trip_id
 left join public.travelers confirmer on confirmer.id=p.confirmed_by_traveler_id and confirmer.trip_id=p.trip_id
 where p.trip_id=p_trip_id and p.rental_id=p_rental_id and p.archived_at is null;
$$;
revoke all on function public.payment_shadow_snapshot(uuid,uuid) from public,anon;
grant execute on function public.payment_shadow_snapshot(uuid,uuid) to authenticated;

create function public.sync_payment_shadow(p_trip_id uuid,p_rental_legacy_id text,p_source_time timestamptz,p_rows jsonb,p_expected_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 rental uuid; current_rows jsonb; previous public.payment_shadow_sync_state%rowtype;
 item jsonb; value jsonb; ids text[]:='{}'; sorted_rows jsonb; old_id uuid;
 schedule uuid; payer uuid; recipient uuid; confirmer uuid; timestamp_text text;
begin
 if auth.uid() is null or not exists(select 1 from public.trip_members m where m.trip_id=p_trip_id and m.auth_user_id=auth.uid() and m.role='organizer' and m.active and m.archived_at is null) then
  raise exception 'PAYMENT_ORGANIZER_REQUIRED' using errcode='42501';
 end if;
 if not exists(select 1 from public.trips where id=p_trip_id and legacy_id='TRIP-2027-TN' and archived_at is null) then raise exception 'PAYMENT_SOURCE_TRIP_MISMATCH'; end if;
 if p_source_time is null or p_source_time<now()-interval '5 minutes' or p_source_time>now()+interval '30 seconds' then raise exception 'PAYMENT_SOURCE_EXPIRED'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or p_expected_rows is null or jsonb_typeof(p_expected_rows)<>'array' then raise exception 'PAYMENT_INVALID_SNAPSHOT'; end if;
 perform set_config('lock_timeout','3s',true);
 -- Small financial tables; serialize direct REST edits as well as competing mirrors.
 lock table public.payments,public.payment_shadow_sync_state in share row exclusive mode;
 lock table public.rentals,public.travelers,public.payment_schedules in share mode;
 select id into strict rental from public.rentals where trip_id=p_trip_id and legacy_id=p_rental_legacy_id and archived_at is null;
 current_rows:=public.payment_shadow_snapshot(p_trip_id,rental);
 select * into previous from public.payment_shadow_sync_state where trip_id=p_trip_id and rental_id=rental;
 if previous.trip_id is not null and p_source_time<previous.source_time then raise exception 'PAYMENT_STALE_SOURCE'; end if;
 if previous.trip_id is not null and p_source_time=previous.source_time and p_rows<>previous.source_rows then raise exception 'PAYMENT_SOURCE_TIME_REUSED'; end if;
 if current_rows<>p_expected_rows then raise exception 'PAYMENT_DESTINATION_CHANGED'; end if;
 for item in select jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'array' or jsonb_array_length(item)<>16 then raise exception 'PAYMENT_INVALID_ROW'; end if;
  for value in select jsonb_array_elements(item) loop
   if jsonb_typeof(value)<>'string' or length(value#>>'{}')>10000 then raise exception 'PAYMENT_INVALID_FIELD'; end if;
  end loop;
  if item->>0 !~ '^PAY-[A-Z0-9]+$' or item->>0=any(ids) or item->>1<>p_rental_legacy_id then raise exception 'PAYMENT_INVALID_ID_OR_RENTAL'; end if;
  ids:=array_append(ids,item->>0);
  if item->>7 !~ '^(0|[1-9][0-9]*)$' or (item->>7)::numeric>9007199254740991 then raise exception 'PAYMENT_INVALID_CENTS'; end if;
  if item->>8<>'' and (item->>8 !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or ((item->>8)::date)::text<>item->>8) then raise exception 'PAYMENT_INVALID_DATE'; end if;
  foreach timestamp_text in array array[item->>10,item->>11] loop
   if timestamp_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or to_char(timestamp_text::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>timestamp_text then raise exception 'PAYMENT_INVALID_TIMESTAMP'; end if;
  end loop;
  if item->>15<>'' and (item->>15 !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or to_char((item->>15)::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>item->>15) then raise exception 'PAYMENT_INVALID_CONFIRMATION_TIME'; end if;
  if item->>4 not in ('Agency','Traveler') then raise exception 'PAYMENT_INVALID_RECIPIENT_TYPE'; end if;
  select id into payer from public.travelers where trip_id=p_trip_id and legacy_id=item->>3 and archived_at is null;
  if payer is null then raise exception 'PAYMENT_PAYER_MISSING'; end if;
  schedule:=null;recipient:=null;confirmer:=null;
  if item->>2<>'' then
   select id into schedule from public.payment_schedules where trip_id=p_trip_id and rental_id=rental and legacy_id=item->>2 and archived_at is null;
   if schedule is null then raise exception 'PAYMENT_INSTALLMENT_MISSING'; end if;
  end if;
  if item->>5<>'' then
   select id into recipient from public.travelers where trip_id=p_trip_id and legacy_id=item->>5 and archived_at is null;
   if recipient is null then raise exception 'PAYMENT_RECIPIENT_MISSING'; end if;
  end if;
  if item->>4='Traveler' and recipient is null then raise exception 'PAYMENT_RECIPIENT_MISSING'; end if;
  if item->>14<>'' then
   select id into confirmer from public.travelers where trip_id=p_trip_id and legacy_id=item->>14 and archived_at is null;
   if confirmer is null then raise exception 'PAYMENT_CONFIRMER_MISSING'; end if;
  end if;
  select id into old_id from public.payments where trip_id=p_trip_id and rental_id=rental and legacy_id=item->>0 and archived_at is null;
  if old_id is null then
   insert into public.payments(trip_id,rental_id,legacy_id,schedule_id,paid_by_traveler_id,paid_to_type,paid_to_traveler_id,paid_to_name,amount_cents,payment_date,notes,source_created_at,source_updated_at,created_at,confirmation_status,confirmation_source,confirmed_by_traveler_id,confirmed_at)
   values(p_trip_id,rental,item->>0,schedule,payer,item->>4,recipient,item->>6,(item->>7)::bigint,nullif(item->>8,'')::date,item->>9,(item->>10)::timestamptz,(item->>11)::timestamptz,(item->>10)::timestamptz,item->>12,item->>13,confirmer,nullif(item->>15,'')::timestamptz);
  elsif not exists(select 1 from jsonb_array_elements(current_rows) v where v=item) then
   update public.payments set schedule_id=schedule,paid_by_traveler_id=payer,paid_to_type=item->>4,paid_to_traveler_id=recipient,paid_to_name=item->>6,amount_cents=(item->>7)::bigint,payment_date=nullif(item->>8,'')::date,notes=item->>9,
    source_created_at=(item->>10)::timestamptz,source_updated_at=(item->>11)::timestamptz,confirmation_status=item->>12,confirmation_source=item->>13,confirmed_by_traveler_id=confirmer,confirmed_at=nullif(item->>15,'')::timestamptz where id=old_id and trip_id=p_trip_id and rental_id=rental;
  end if;
 end loop;
 select coalesce(jsonb_agg(v order by (v->>0) collate "C"),'[]'::jsonb) into sorted_rows from jsonb_array_elements(p_rows) v;
 if sorted_rows<>p_rows then raise exception 'PAYMENT_UNSORTED_SNAPSHOT'; end if;
 update public.payments set archived_at=now() where trip_id=p_trip_id and rental_id=rental and archived_at is null and not(legacy_id=any(ids));
 if public.payment_shadow_snapshot(p_trip_id,rental)<>p_rows then raise exception 'PAYMENT_READBACK_MISMATCH'; end if;
 insert into public.payment_shadow_sync_state(trip_id,rental_id,source_time,source_rows) values(p_trip_id,rental,p_source_time,p_rows)
 on conflict(trip_id,rental_id) do update set source_time=excluded.source_time,source_rows=excluded.source_rows,synced_at=now();
 return jsonb_build_object('status',case when current_rows=p_rows then 'unchanged' else 'synced' end,'count',jsonb_array_length(p_rows),'sourceTime',p_source_time);
end;
$$;
revoke all on function public.sync_payment_shadow(uuid,text,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.sync_payment_shadow(uuid,text,timestamptz,jsonb,jsonb) to authenticated;
