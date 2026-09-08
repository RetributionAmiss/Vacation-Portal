alter table public.itinerary_items alter column event_date drop not null;
alter table public.itinerary_items drop column cost_per_cents;
alter table public.itinerary_items add column cost_per text not null default 'Person';

alter table public.grocery_items drop constraint grocery_items_quantity_check;
alter table public.grocery_items alter column quantity drop default;
alter table public.grocery_items alter column quantity type text using quantity::text;
alter table public.grocery_items alter column quantity set default '1';
