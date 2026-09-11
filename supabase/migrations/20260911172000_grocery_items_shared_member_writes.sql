-- Grocery List is a shared traveler planner in the existing portal.
-- Preserve that behavior when Supabase becomes primary: any active trip member
-- may create/update/delete grocery rows for their trip, while reads remain
-- limited to active members. Organizer-only policies would regress the current
-- shared-family workflow.

create unique index if not exists grocery_items_trip_legacy_active_unique
  on public.grocery_items (trip_id, legacy_id)
  where legacy_id is not null and archived_at is null;

drop policy if exists grocery_items_organizer_insert on public.grocery_items;
drop policy if exists grocery_items_organizer_update on public.grocery_items;
drop policy if exists grocery_items_organizer_delete on public.grocery_items;

drop policy if exists grocery_items_member_insert on public.grocery_items;
drop policy if exists grocery_items_member_update on public.grocery_items;
drop policy if exists grocery_items_member_delete on public.grocery_items;

create policy grocery_items_member_insert
  on public.grocery_items
  for insert
  to authenticated
  with check ((select private.is_trip_member(grocery_items.trip_id)));

create policy grocery_items_member_update
  on public.grocery_items
  for update
  to authenticated
  using ((select private.is_trip_member(grocery_items.trip_id)))
  with check ((select private.is_trip_member(grocery_items.trip_id)));

create policy grocery_items_member_delete
  on public.grocery_items
  for delete
  to authenticated
  using ((select private.is_trip_member(grocery_items.trip_id)));
