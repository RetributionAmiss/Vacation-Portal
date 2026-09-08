create or replace function private.claim_trip_invitations_for_user()
returns table (
  trip_id uuid,
  role text,
  traveler_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation record;
begin
  if caller_id is null or caller_email = '' then
    raise exception 'A verified email session is required to claim a trip invitation.';
  end if;

  for invitation in
    select i.*
    from public.trip_invitations i
    where lower(i.email) = caller_email
      and i.claimed_at is null
      and i.archived_at is null
      and (i.expires_at is null or i.expires_at > now())
    order by i.created_at
    for update
  loop
    insert into public.trip_members (
      trip_id,
      auth_user_id,
      traveler_id,
      role,
      active
    ) values (
      invitation.trip_id,
      caller_id,
      invitation.traveler_id,
      invitation.role,
      true
    )
    on conflict (trip_id, auth_user_id)
    do update set
      traveler_id = coalesce(excluded.traveler_id, public.trip_members.traveler_id),
      role = case
        when public.trip_members.role = 'organizer' then 'organizer'
        when excluded.role = 'organizer' then 'organizer'
        when public.trip_members.role = 'co_organizer' then 'co_organizer'
        else excluded.role
      end,
      active = true,
      archived_at = null;

    update public.trip_invitations
    set claimed_at = now(), claimed_by = caller_id
    where id = invitation.id;

    trip_id := invitation.trip_id;
    role := invitation.role;
    traveler_id := invitation.traveler_id;
    return next;
  end loop;
end;
$$;

revoke all on function private.claim_trip_invitations_for_user() from public, anon;
grant execute on function private.claim_trip_invitations_for_user() to authenticated, service_role;

create or replace function public.claim_trip_invitations()
returns table (
  trip_id uuid,
  role text,
  traveler_id uuid
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_trip_invitations_for_user();
$$;

revoke all on function public.claim_trip_invitations() from public, anon;
grant execute on function public.claim_trip_invitations() to authenticated, service_role;
