-- Additive shadow fidelity only. Existing financial authority and RLS remain unchanged.
alter table public.booking_plans add column if not exists split_basis text;
alter table public.payment_shares add column if not exists calculated_share_source numeric;
alter table public.payments
  add column if not exists confirmation_status text,
  add column if not exists confirmation_source text,
  add column if not exists confirmed_by_traveler_id uuid references public.travelers(id),
  add column if not exists confirmed_at timestamptz;
alter table public.budget_items
  add column if not exists paid_by_text text,
  add column if not exists split_between_text text,
  add column if not exists split_method text,
  add column if not exists legacy_date_text text;
-- Only allowlisted Sheet columns enter these migration-provenance snapshots.
alter table public.booking_plans add column if not exists source_record jsonb not null default '{}'::jsonb;
alter table public.payment_shares add column if not exists source_record jsonb not null default '{}'::jsonb;
alter table public.payment_schedules add column if not exists source_record jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists source_record jsonb not null default '{}'::jsonb;
alter table public.budget_items add column if not exists source_record jsonb not null default '{}'::jsonb;
create unique index if not exists booking_plans_trip_legacy_shadow_uidx on public.booking_plans(trip_id,legacy_id) where legacy_id is not null and archived_at is null;
create unique index if not exists payment_shares_trip_legacy_shadow_uidx on public.payment_shares(trip_id,legacy_id) where legacy_id is not null and archived_at is null;
create unique index if not exists payment_schedules_trip_legacy_shadow_uidx on public.payment_schedules(trip_id,legacy_id) where legacy_id is not null and archived_at is null;
create unique index if not exists payments_trip_legacy_shadow_uidx on public.payments(trip_id,legacy_id) where legacy_id is not null and archived_at is null;
create unique index if not exists budget_items_trip_legacy_shadow_uidx on public.budget_items(trip_id,legacy_id) where legacy_id is not null and archived_at is null;
