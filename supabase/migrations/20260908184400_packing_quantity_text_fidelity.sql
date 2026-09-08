alter table public.packing_items
  drop constraint if exists packing_items_quantity_check;

alter table public.packing_items
  alter column quantity drop default;

alter table public.packing_items
  alter column quantity type text using quantity::text;

alter table public.packing_items
  alter column quantity set default '';
