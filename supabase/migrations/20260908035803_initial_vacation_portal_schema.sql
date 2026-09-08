create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.touch_portal_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  name text not null,
  destination text,
  time_zone text not null default 'America/New_York',
  status text not null default 'planning' check (status in ('planning','booked','active','completed','archived')),
  stage text not null default 'gathering' check (stage in ('gathering','preliminary_voting','finalist_voting','finalized','closed')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index trips_legacy_id_uidx on public.trips(legacy_id) where legacy_id is not null;

create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  name text not null,
  email text,
  group_name text,
  traveler_type text not null default 'adult' check (traveler_type in ('adult','child')),
  parent_traveler_id uuid references public.travelers(id) on delete set null,
  price_cap_cents bigint not null default 0 check (price_cap_cents >= 0),
  cost_percent numeric(5,2) not null default 100 check (cost_percent >= 0 and cost_percent <= 100),
  pay_more boolean not null default false,
  willing_to_share_room boolean not null default false,
  home_location text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (trip_id, id)
);
create unique index travelers_trip_legacy_uidx on public.travelers(trip_id, legacy_id) where legacy_id is not null;
create index travelers_trip_idx on public.travelers(trip_id);
create index travelers_parent_idx on public.travelers(parent_traveler_id);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  traveler_id uuid references public.travelers(id) on delete set null,
  role text not null default 'traveler' check (role in ('organizer','co_organizer','traveler')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (trip_id, auth_user_id),
  unique (trip_id, traveler_id)
);
create index trip_members_user_idx on public.trip_members(auth_user_id, trip_id);
create index trip_members_traveler_idx on public.trip_members(traveler_id);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  provider text,
  provider_property_id text,
  name text not null,
  nickname text,
  rental_url text,
  original_rental_url text,
  location text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  sleeps integer check (sleeps is null or sleeps >= 0),
  bedroom_count integer check (bedroom_count is null or bedroom_count >= 0),
  bathroom_count numeric(4,1) check (bathroom_count is null or bathroom_count >= 0),
  total_rental_cost_cents bigint check (total_rental_cost_cents is null or total_rental_cost_cents >= 0),
  nightly_rate_cents bigint check (nightly_rate_cents is null or nightly_rate_cents >= 0),
  rating numeric(3,2),
  review_count integer check (review_count is null or review_count >= 0),
  image_url text,
  description text,
  cancellation_policy text,
  fees_and_taxes_cents bigint check (fees_and_taxes_cents is null or fees_and_taxes_cents >= 0),
  house_rules text,
  parking text,
  accessibility text,
  nearby_highlights text,
  import_stage text,
  import_confidence numeric(5,2) check (import_confidence is null or (import_confidence >= 0 and import_confidence <= 100)),
  status text not null default 'candidate',
  submitted_by_traveler_id uuid references public.travelers(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create unique index rentals_trip_legacy_uidx on public.rentals(trip_id, legacy_id) where legacy_id is not null;
create index rentals_trip_idx on public.rentals(trip_id, active, status);
create index rentals_provider_idx on public.rentals(provider, provider_property_id);

create table public.rental_photos (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  legacy_id text,
  photo_url text not null,
  sort_order integer not null default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index rental_photos_rental_idx on public.rental_photos(rental_id, sort_order);

create table public.rental_amenities (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  legacy_id text,
  amenity text not null,
  category text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id, amenity)
);
create index rental_amenities_rental_idx on public.rental_amenities(rental_id);

create table public.rental_bedrooms (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  legacy_id text,
  name text not null,
  floor text,
  bed_configuration text,
  sleeps integer check (sleeps is null or sleeps >= 0),
  private_bathroom boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create unique index rental_bedrooms_rental_legacy_uidx on public.rental_bedrooms(rental_id, legacy_id) where legacy_id is not null;
create index rental_bedrooms_rental_idx on public.rental_bedrooms(rental_id);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  score numeric(5,2),
  rank integer check (rank is null or rank > 0),
  notes text,
  reasons text,
  first_choice boolean not null default false,
  voting_round text not null default 'preliminary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id, traveler_id, voting_round)
);
create index votes_trip_idx on public.votes(trip_id, voting_round);
create index votes_traveler_idx on public.votes(traveler_id, voting_round);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id, traveler_id)
);
create index favorites_trip_traveler_idx on public.favorites(trip_id, traveler_id);

create table public.rental_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  traveler_id uuid references public.travelers(id) on delete set null,
  legacy_id text,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index rental_comments_rental_idx on public.rental_comments(rental_id, created_at);

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  bedroom_id uuid not null references public.rental_bedrooms(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id, traveler_id)
);
create index room_assignments_bedroom_idx on public.room_assignments(bedroom_id);

create table public.booking_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  legacy_id text,
  agency_name text,
  booking_total_cents bigint not null default 0 check (booking_total_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id)
);
create index booking_plans_trip_idx on public.booking_plans(trip_id);

create table public.booking_plan_travelers (
  booking_plan_id uuid not null references public.booking_plans(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (booking_plan_id, traveler_id)
);

create table public.payment_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  booking_plan_id uuid references public.booking_plans(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  split_basis text,
  source_total_cents bigint not null default 0 check (source_total_cents >= 0),
  calculated_share_cents bigint not null default 0 check (calculated_share_cents >= 0),
  adjusted_share_cents bigint not null default 0 check (adjusted_share_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (rental_id, traveler_id)
);
create index payment_shares_trip_idx on public.payment_shares(trip_id, traveler_id);

create table public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  legacy_id text,
  label text not null,
  due_date date,
  amount_due_cents bigint not null default 0 check (amount_due_cents >= 0),
  expected_payer_traveler_id uuid references public.travelers(id) on delete set null,
  recipient_type text,
  recipient_traveler_id uuid references public.travelers(id) on delete set null,
  recipient_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index payment_schedules_rental_due_idx on public.payment_schedules(rental_id, due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  schedule_id uuid references public.payment_schedules(id) on delete set null,
  legacy_id text,
  paid_by_traveler_id uuid references public.travelers(id) on delete set null,
  paid_to_type text,
  paid_to_traveler_id uuid references public.travelers(id) on delete set null,
  paid_to_name text,
  amount_cents bigint not null check (amount_cents >= 0),
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index payments_trip_payer_idx on public.payments(trip_id, paid_by_traveler_id, payment_date);
create index payments_schedule_idx on public.payments(schedule_id);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  category text,
  description text not null,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  include_in_rental_split boolean not null default false,
  paid_by_traveler_id uuid references public.travelers(id) on delete set null,
  due_date date,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index budget_items_trip_idx on public.budget_items(trip_id, due_date);

create table public.budget_item_travelers (
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_item_id, traveler_id)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  meal_date date not null,
  meal_type text,
  menu text,
  assigned_to text,
  clean_up text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index meals_trip_date_idx on public.meals(trip_id, meal_date);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  store_section text,
  category text,
  item text not null,
  quantity integer not null default 1 check (quantity >= 0),
  bringing text,
  brought_by text,
  assigned_to text,
  purchased boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index grocery_items_trip_idx on public.grocery_items(trip_id, purchased, category);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  event_date date not null,
  start_time time,
  end_time time,
  activity text not null,
  location text,
  event_url text,
  assigned_to text,
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  cost_per_cents bigint not null default 0 check (cost_per_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  check (end_time is null or start_time is null or end_time >= start_time)
);
create index itinerary_items_trip_date_idx on public.itinerary_items(trip_id, event_date, start_time);

create table public.itinerary_signups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  planned_date date,
  planned_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (itinerary_item_id, traveler_id)
);
create index itinerary_signups_trip_idx on public.itinerary_signups(trip_id, traveler_id);

create table public.planner_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  planner_type text not null,
  item_id uuid,
  item_legacy_id text,
  traveler_id uuid references public.travelers(id) on delete set null,
  traveler_name text,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index planner_comments_item_idx on public.planner_comments(trip_id, planner_type, item_id, created_at);

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  legacy_id text,
  scope text not null default 'trip',
  owner_traveler_id uuid references public.travelers(id) on delete cascade,
  bringing_traveler_id uuid references public.travelers(id) on delete set null,
  category text,
  item text not null,
  quantity integer not null default 1 check (quantity >= 0),
  packed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index packing_items_trip_owner_idx on public.packing_items(trip_id, owner_traveler_id, packed);

create table public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  legacy_id text,
  mode text,
  leaving_from text,
  departure_date date,
  departure_time time,
  arrival_date date,
  arrival_time time,
  travel_details text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz,
  unique (trip_id, traveler_id)
);
create index travel_plans_arrival_idx on public.travel_plans(trip_id, arrival_date, arrival_time);

create table public.rental_imports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rental_id uuid references public.rentals(id) on delete set null,
  legacy_id text,
  original_url text,
  canonical_url text,
  provider text,
  provider_property_id text,
  submitted_by_traveler_id uuid references public.travelers(id) on delete set null,
  status text not null default 'queued',
  property_name text,
  notes text,
  error_message text,
  provenance jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index rental_imports_trip_status_idx on public.rental_imports(trip_id, status, updated_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  traveler_id uuid references public.travelers(id) on delete cascade,
  category text not null,
  channel text not null default 'push',
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index notifications_delivery_idx on public.notifications(trip_id, status, scheduled_for);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  traveler_id uuid references public.travelers(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null,
  entity_type text,
  entity_id uuid,
  entity_legacy_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  archived_at timestamptz
);
create index activity_log_trip_time_idx on public.activity_log(trip_id, created_at desc);

-- Keep all exposed tables closed by default until the dedicated Auth/RLS migration.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trips','travelers','trip_members','rentals','rental_photos','rental_amenities',
    'rental_bedrooms','votes','favorites','rental_comments','room_assignments',
    'booking_plans','booking_plan_travelers','payment_shares','payment_schedules','payments',
    'budget_items','budget_item_travelers','meals','grocery_items','itinerary_items',
    'itinerary_signups','planner_comments','packing_items','travel_plans','rental_imports',
    'notifications','activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

-- Version every update for optimistic concurrency and keep timestamps server-owned.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trips','travelers','trip_members','rentals','rental_photos','rental_amenities',
    'rental_bedrooms','votes','favorites','rental_comments','room_assignments',
    'booking_plans','payment_shares','payment_schedules','payments','budget_items','meals',
    'grocery_items','itinerary_items','itinerary_signups','planner_comments','packing_items',
    'travel_plans','rental_imports','notifications','activity_log'
  ] loop
    execute format(
      'create trigger touch_portal_record before update on public.%I for each row execute function private.touch_portal_record()',
      table_name
    );
  end loop;
end $$;
