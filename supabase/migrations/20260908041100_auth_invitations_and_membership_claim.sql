create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text not null,
  traveler_id uuid references public.travelers(id) on delete cascade,
  role text not null default 'traveler' check (role in ('organizer','co_organizer','traveler')),
  invited_by uuid references auth.users(id) on delete set null default auth.uid(),
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create unique index trip_invitations_trip_email_uidx
  on public.trip_invitations(trip_id, lower(email))
  where archived_at is null;
create index trip_invitations_email_idx on public.trip_invitations(lower(email), claimed_at);
create index trip_invitations_traveler_idx on public.trip_invitations(traveler_id);
create index trip_invitations_invited_by_idx on public.trip_invitations(invited_by);
create index trip_invitations_claimed_by_idx on public.trip_invitations(claimed_by);
create index trip_invitations_created_by_idx on public.trip_invitations(created_by);

alter table public.trip_invitations enable row level security;
revoke all on table public.trip_invitations from anon;
grant select, insert, update, delete on table public.trip_invitations to authenticated, service_role;
create trigger touch_portal_record before update on public.trip_invitations
for each row execute function private.touch_portal_record();

create policy trip_invitations_organizer_select on public.trip_invitations for select to authenticated
using ((select private.is_trip_organizer(trip_id)));
create policy trip_invitations_organizer_insert on public.trip_invitations for insert to authenticated
with check ((select private.is_trip_organizer(trip_id)));
create policy trip_invitations_organizer_update on public.trip_invitations for update to authenticated
using ((select private.is_trip_organizer(trip_id)))
with check ((select private.is_trip_organizer(trip_id)));
create policy trip_invitations_organizer_delete on public.trip_invitations for delete to authenticated
using ((select private.is_trip_organizer(trip_id)));

create or replace function public.claim_trip_invitations()
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

revoke all on function public.claim_trip_invitations() from public, anon;
grant execute on function public.claim_trip_invitations() to authenticated, service_role;
