alter table public.travelers
  drop column email,
  drop column price_cap_cents,
  drop column cost_percent,
  drop column pay_more,
  drop column home_location,
  drop column notes;

create table public.traveler_private (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text,
  home_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index traveler_private_trip_idx on public.traveler_private(trip_id);

create table public.traveler_admin (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  price_cap_cents bigint not null default 0 check (price_cap_cents >= 0),
  cost_percent numeric(5,2) not null default 100 check (cost_percent >= 0 and cost_percent <= 100),
  pay_more boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index traveler_admin_trip_idx on public.traveler_admin(trip_id);

alter table public.traveler_private enable row level security;
alter table public.traveler_admin enable row level security;
revoke all on table public.traveler_private from anon;
revoke all on table public.traveler_admin from anon;
grant select, insert, update, delete on table public.traveler_private to authenticated, service_role;
grant select, insert, update, delete on table public.traveler_admin to authenticated, service_role;

create trigger touch_portal_record before update on public.traveler_private
for each row execute function private.touch_portal_record();
create trigger touch_portal_record before update on public.traveler_admin
for each row execute function private.touch_portal_record();

create or replace function private.is_trip_member(target_trip_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null and exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.auth_user_id = target_user_id
      and tm.active
      and tm.archived_at is null
  );
$$;

create or replace function private.is_trip_organizer(target_trip_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null and exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.auth_user_id = target_user_id
      and tm.role in ('organizer','co_organizer')
      and tm.active
      and tm.archived_at is null
  );
$$;

create or replace function private.current_traveler_id(target_trip_id uuid, target_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.traveler_id
  from public.trip_members tm
  where tm.trip_id = target_trip_id
    and tm.auth_user_id = target_user_id
    and tm.active
    and tm.archived_at is null
  limit 1;
$$;

revoke all on function private.is_trip_member(uuid, uuid) from public;
revoke all on function private.is_trip_organizer(uuid, uuid) from public;
revoke all on function private.current_traveler_id(uuid, uuid) from public;
grant execute on function private.is_trip_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_trip_organizer(uuid, uuid) to authenticated, service_role;
grant execute on function private.current_traveler_id(uuid, uuid) to authenticated, service_role;

create policy trips_member_select on public.trips for select to authenticated
using ((select private.is_trip_member(id)));
create policy trips_organizer_update on public.trips for update to authenticated
using ((select private.is_trip_organizer(id)))
with check ((select private.is_trip_organizer(id)));

create policy trip_members_self_or_organizer_select on public.trip_members for select to authenticated
using (auth_user_id = (select auth.uid()) or (select private.is_trip_organizer(trip_id)));
create policy trip_members_organizer_write on public.trip_members for all to authenticated
using ((select private.is_trip_organizer(trip_id)))
with check ((select private.is_trip_organizer(trip_id)));

create policy travelers_member_select on public.travelers for select to authenticated
using ((select private.is_trip_member(trip_id)));
create policy travelers_self_update on public.travelers for update to authenticated
using (id = (select private.current_traveler_id(trip_id)))
with check (id = (select private.current_traveler_id(trip_id)));
create policy travelers_organizer_write on public.travelers for all to authenticated
using ((select private.is_trip_organizer(trip_id)))
with check ((select private.is_trip_organizer(trip_id)));

create policy traveler_private_self_select on public.traveler_private for select to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy traveler_private_self_update on public.traveler_private for update to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)));
create policy traveler_private_organizer_write on public.traveler_private for all to authenticated
using ((select private.is_trip_organizer(trip_id)))
with check ((select private.is_trip_organizer(trip_id)));

create policy traveler_admin_organizer_all on public.traveler_admin for all to authenticated
using ((select private.is_trip_organizer(trip_id)))
with check ((select private.is_trip_organizer(trip_id)));

-- Shared trip domains: all trip members can read; organizers own structural/admin writes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rentals','votes','favorites','rental_comments','room_assignments','booking_plans',
    'payment_shares','payment_schedules','payments','budget_items','meals','grocery_items',
    'itinerary_items','itinerary_signups','planner_comments','packing_items','travel_plans',
    'rental_imports','notifications','activity_log'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_trip_member(trip_id)))',
      table_name || '_member_select', table_name
    );
  end loop;
end $$;

-- Child tables inherit membership through their parent rental/booking/budget record.
create policy rental_photos_member_select on public.rental_photos for select to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_member(r.trip_id))));
create policy rental_amenities_member_select on public.rental_amenities for select to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_member(r.trip_id))));
create policy rental_bedrooms_member_select on public.rental_bedrooms for select to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_member(r.trip_id))));
create policy booking_plan_travelers_member_select on public.booking_plan_travelers for select to authenticated
using (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_member(b.trip_id))));
create policy budget_item_travelers_member_select on public.budget_item_travelers for select to authenticated
using (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_member(b.trip_id))));

-- Organizer write policies for shared structural/admin domains.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rentals','room_assignments','booking_plans','payment_shares','payment_schedules','payments',
    'budget_items','meals','grocery_items','itinerary_items','rental_imports','notifications'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_trip_organizer(trip_id))) with check ((select private.is_trip_organizer(trip_id)))',
      table_name || '_organizer_write', table_name
    );
  end loop;
end $$;

-- Traveler-owned interaction domains.
create policy votes_self_write on public.votes for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy favorites_self_write on public.favorites for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy rental_comments_self_write on public.rental_comments for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy itinerary_signups_self_write on public.itinerary_signups for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy planner_comments_self_write on public.planner_comments for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy packing_items_owner_write on public.packing_items for all to authenticated
using (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy travel_plans_self_write on public.travel_plans for all to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

-- Child structural tables can only be modified by organizers.
create policy rental_photos_organizer_write on public.rental_photos for all to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))))
with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_amenities_organizer_write on public.rental_amenities for all to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))))
with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_bedrooms_organizer_write on public.rental_bedrooms for all to authenticated
using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))))
with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy booking_plan_travelers_organizer_write on public.booking_plan_travelers for all to authenticated
using (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id))))
with check (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id))));
create policy budget_item_travelers_organizer_write on public.budget_item_travelers for all to authenticated
using (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id))))
with check (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id))));
