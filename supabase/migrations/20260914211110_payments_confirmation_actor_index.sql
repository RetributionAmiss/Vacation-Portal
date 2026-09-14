-- Index the confirmation actor FK added by the Payments/Budget shadow migration.
create index if not exists payments_confirmed_by_traveler_idx on public.payments(confirmed_by_traveler_id);
