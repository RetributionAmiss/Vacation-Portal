create or replace function public.set_packing_item_packed(
  p_trip_id uuid,
  p_legacy_id text,
  p_packed boolean,
  p_expected_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  target_scope text;
  target_owner uuid;
  target_bringer uuid;
  target_version bigint;
  current_traveler uuid;
  affected_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_trip_id is null or nullif(pg_catalog.btrim(p_legacy_id), '') is null then
    raise exception 'A Packing item is required.' using errcode = '22023';
  end if;

  if not private.is_trip_member(p_trip_id) then
    raise exception 'Trip membership is required.' using errcode = '42501';
  end if;

  select p.id, p.scope, p.owner_traveler_id, p.bringing_traveler_id, p.version
    into target_id, target_scope, target_owner, target_bringer, target_version
  from public.packing_items p
  where p.trip_id = p_trip_id
    and p.legacy_id = pg_catalog.btrim(p_legacy_id)
    and p.archived_at is null
  limit 1;

  if target_id is null then
    raise exception 'That packing item could not be found.' using errcode = 'P0002';
  end if;

  current_traveler := private.current_traveler_id(p_trip_id);

  if not (
    private.is_trip_organizer(p_trip_id)
    or target_owner = current_traveler
    or (
      pg_catalog.lower(coalesce(target_scope, '')) = 'shared'
      and (target_bringer is null or target_bringer = current_traveler)
    )
  ) then
    raise exception 'You cannot update that packing item.' using errcode = '42501';
  end if;

  if p_expected_version is not null and target_version <> p_expected_version then
    raise exception 'Packing item changed on another device. Refresh and try again.' using errcode = '40001';
  end if;

  update public.packing_items
  set packed = coalesce(p_packed, false)
  where id = target_id
    and (p_expected_version is null or version = p_expected_version);

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Packing item changed on another device. Refresh and try again.' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.set_packing_item_packed(uuid, text, boolean, bigint) from public;
grant execute on function public.set_packing_item_packed(uuid, text, boolean, bigint) to authenticated, service_role;
