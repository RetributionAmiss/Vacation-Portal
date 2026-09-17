-- Transitional Budget mirror. Sheets remains write authority; no payment writes change.
create table public.budget_shadow_sync_state (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  source_time timestamptz not null,
  source_rows jsonb not null check (jsonb_typeof(source_rows) = 'array'),
  synced_at timestamptz not null default now()
);
alter table public.budget_shadow_sync_state enable row level security;
revoke all on public.budget_shadow_sync_state from anon;
grant select, insert, update on public.budget_shadow_sync_state to authenticated;
create policy budget_shadow_member_select on public.budget_shadow_sync_state for select to authenticated
  using ((select private.is_trip_member(trip_id)));
create policy budget_shadow_organizer_insert on public.budget_shadow_sync_state for insert to authenticated
  with check ((select private.is_trip_organizer(trip_id)));
create policy budget_shadow_organizer_update on public.budget_shadow_sync_state for update to authenticated
  using ((select private.is_trip_organizer(trip_id))) with check ((select private.is_trip_organizer(trip_id)));

-- Array order matches PaymentsBudgetContract.fields.budget; amounts are integer cents.
create function public.budget_shadow_snapshot(p_trip_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
    b.legacy_id,coalesce(b.category,''),b.description,b.amount_cents::text,
    coalesce(b.paid_by_text,''),coalesce(b.split_method,''),coalesce(b.legacy_date_text,''),
    coalesce(b.split_between_text,''),coalesce(b.due_date::text,''),coalesce(b.status,''),
    coalesce(b.notes,''),case when b.include_in_rental_split then 'Yes' else 'No' end
  ) order by b.legacy_id collate "C"),'[]'::jsonb)
  from public.budget_items b where b.trip_id=p_trip_id and b.archived_at is null;
$$;
revoke all on function public.budget_shadow_snapshot(uuid) from public,anon;
grant execute on function public.budget_shadow_snapshot(uuid) to authenticated;

create function public.sync_budget_shadow(
  p_trip_id uuid, p_source_time timestamptz, p_rows jsonb, p_expected_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_rows jsonb; previous public.budget_shadow_sync_state%rowtype;
  item jsonb; value jsonb; old_id uuid; source_ids text[] := '{}';
  sorted_rows jsonb; row_count integer; field_date text;
begin
  if auth.uid() is null or not exists(select 1 from public.trip_members m where m.trip_id=p_trip_id and m.auth_user_id=auth.uid() and m.active and m.archived_at is null and m.role='organizer') then
    raise exception 'BUDGET_ORGANIZER_REQUIRED' using errcode='42501';
  end if;
  -- This migration is bound to the accepted source trip, not an arbitrary member trip.
  if not exists(select 1 from public.trips where id=p_trip_id and legacy_id='TRIP-2027-TN' and archived_at is null) then
    raise exception 'BUDGET_SOURCE_TRIP_MISMATCH';
  end if;
  if p_source_time is null or p_source_time < now()-interval '5 minutes' or p_source_time > now()+interval '30 seconds' then
    raise exception 'BUDGET_SOURCE_EXPIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)>2000
     or p_expected_rows is null or jsonb_typeof(p_expected_rows)<>'array' then
    raise exception 'BUDGET_INVALID_SNAPSHOT';
  end if;
  -- Small financial table: also serialize direct REST edits/inserts, not just this RPC.
  -- No lock on payment or pricing tables. Timeout aborts the entire RPC safely.
  perform set_config('lock_timeout','3s',true);
  lock table public.budget_items,public.budget_item_travelers,public.budget_shadow_sync_state in share row exclusive mode;
  current_rows := public.budget_shadow_snapshot(p_trip_id);
  select * into previous from public.budget_shadow_sync_state where trip_id=p_trip_id;
  if previous.trip_id is not null and p_source_time < previous.source_time then
    raise exception 'BUDGET_STALE_SOURCE';
  end if;
  if previous.trip_id is not null and p_source_time=previous.source_time and p_rows<>previous.source_rows then
    raise exception 'BUDGET_SOURCE_TIME_REUSED';
  end if;
  if current_rows <> p_expected_rows then raise exception 'BUDGET_DESTINATION_CHANGED'; end if;
  -- Typed relationships were never seeded from display names. Fail rather than erase them.
  if exists(select 1 from public.budget_items b where b.trip_id=p_trip_id and b.archived_at is null and b.paid_by_traveler_id is not null)
    or exists(select 1 from public.budget_item_travelers j join public.budget_items b on b.id=j.budget_item_id where b.trip_id=p_trip_id and b.archived_at is null) then
    raise exception 'BUDGET_TYPED_RELATIONSHIPS_PRESENT';
  end if;
  for item in select jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item)<>'array' or jsonb_array_length(item)<>12 then raise exception 'BUDGET_INVALID_ROW'; end if;
    for value in select jsonb_array_elements(item) loop
      if jsonb_typeof(value)<>'string' or length(value#>>'{}')>10000 then raise exception 'BUDGET_INVALID_FIELD'; end if;
    end loop;
    if item->>0 !~ '^BUDGET-[A-Z0-9]+$' or item->>0=any(source_ids) or btrim(item->>2)='' then raise exception 'BUDGET_INVALID_ID_OR_DESCRIPTION'; end if;
    source_ids:=array_append(source_ids,item->>0);
    if item->>3 !~ '^(0|[1-9][0-9]*)$' or (item->>3)::numeric>9007199254740991 then raise exception 'BUDGET_INVALID_CENTS'; end if;
    if item->>11 not in ('Yes','No') then raise exception 'BUDGET_INVALID_INCLUDE_FLAG'; end if;
    foreach field_date in array array[item->>6,item->>8] loop
      if field_date<>'' and (field_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (field_date::date)::text<>field_date) then raise exception 'BUDGET_INVALID_DATE'; end if;
    end loop;
  end loop;
  select coalesce(jsonb_agg(v order by (v->>0) collate "C"),'[]'::jsonb) into sorted_rows from jsonb_array_elements(p_rows) v;
  if p_rows<>sorted_rows then raise exception 'BUDGET_UNSORTED_SNAPSHOT'; end if;
  if current_rows<>p_rows then
    for item in select jsonb_array_elements(p_rows) loop
      select id into old_id from public.budget_items where trip_id=p_trip_id and legacy_id=item->>0 and archived_at is null;
      if old_id is null then
        insert into public.budget_items(trip_id,legacy_id,category,description,amount_cents,paid_by_text,split_method,legacy_date_text,split_between_text,due_date,status,notes,include_in_rental_split)
          values(p_trip_id,item->>0,item->>1,item->>2,(item->>3)::bigint,item->>4,item->>5,item->>6,item->>7,nullif(item->>8,'')::date,item->>9,item->>10,item->>11='Yes');
      elsif not exists(select 1 from jsonb_array_elements(current_rows) v where v=item) then
        update public.budget_items set category=item->>1,description=item->>2,amount_cents=(item->>3)::bigint,
          paid_by_text=item->>4,split_method=item->>5,legacy_date_text=item->>6,split_between_text=item->>7,
          due_date=nullif(item->>8,'')::date,status=item->>9,notes=item->>10,include_in_rental_split=item->>11='Yes'
          where id=old_id and trip_id=p_trip_id;
      end if;
    end loop;
    -- Soft-delete only absent active rows from this exact trip; retain history and IDs.
    update public.budget_items set archived_at=now() where trip_id=p_trip_id and archived_at is null and not (legacy_id=any(source_ids));
  end if;
  if public.budget_shadow_snapshot(p_trip_id)<>p_rows then raise exception 'BUDGET_READBACK_MISMATCH'; end if;
  insert into public.budget_shadow_sync_state(trip_id,source_time,source_rows) values(p_trip_id,p_source_time,p_rows)
    on conflict(trip_id) do update set source_time=excluded.source_time,source_rows=excluded.source_rows,synced_at=now();
  row_count:=jsonb_array_length(p_rows);
  return jsonb_build_object('status',case when current_rows=p_rows then 'unchanged' else 'synced' end,'count',row_count,'sourceTime',p_source_time);
end;
$$;
revoke all on function public.sync_budget_shadow(uuid,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.sync_budget_shadow(uuid,timestamptz,jsonb,jsonb) to authenticated;
