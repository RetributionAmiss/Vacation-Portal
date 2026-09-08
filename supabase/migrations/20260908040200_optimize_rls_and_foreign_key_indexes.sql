-- Keep SELECT policies singular; split organizer/self mutation policies by action.

drop policy if exists trip_members_organizer_write on public.trip_members;
create policy trip_members_organizer_insert on public.trip_members for insert to authenticated
with check ((select private.is_trip_organizer(trip_id)));
create policy trip_members_organizer_update on public.trip_members for update to authenticated
using ((select private.is_trip_organizer(trip_id))) with check ((select private.is_trip_organizer(trip_id)));
create policy trip_members_organizer_delete on public.trip_members for delete to authenticated
using ((select private.is_trip_organizer(trip_id)));

drop policy if exists travelers_self_update on public.travelers;
drop policy if exists travelers_organizer_write on public.travelers;
create policy travelers_member_update on public.travelers for update to authenticated
using (id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy travelers_organizer_insert on public.travelers for insert to authenticated
with check ((select private.is_trip_organizer(trip_id)));
create policy travelers_organizer_delete on public.travelers for delete to authenticated
using ((select private.is_trip_organizer(trip_id)));

drop policy if exists traveler_private_self_update on public.traveler_private;
drop policy if exists traveler_private_organizer_write on public.traveler_private;
create policy traveler_private_member_update on public.traveler_private for update to authenticated
using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)))
with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy traveler_private_organizer_insert on public.traveler_private for insert to authenticated
with check ((select private.is_trip_organizer(trip_id)));
create policy traveler_private_organizer_delete on public.traveler_private for delete to authenticated
using ((select private.is_trip_organizer(trip_id)));

-- Structural/admin trip-domain writes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rentals','room_assignments','booking_plans','payment_shares','payment_schedules','payments',
    'budget_items','meals','grocery_items','itinerary_items','rental_imports','notifications'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_organizer_write', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_trip_organizer(trip_id)))', table_name || '_organizer_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_trip_organizer(trip_id))) with check ((select private.is_trip_organizer(trip_id)))', table_name || '_organizer_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_trip_organizer(trip_id)))', table_name || '_organizer_delete', table_name);
  end loop;
end $$;

-- Traveler-owned interaction writes.
drop policy if exists votes_self_write on public.votes;
create policy votes_self_insert on public.votes for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy votes_self_update on public.votes for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy votes_self_delete on public.votes for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists favorites_self_write on public.favorites;
create policy favorites_self_insert on public.favorites for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy favorites_self_update on public.favorites for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy favorites_self_delete on public.favorites for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists rental_comments_self_write on public.rental_comments;
create policy rental_comments_self_insert on public.rental_comments for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy rental_comments_self_update on public.rental_comments for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy rental_comments_self_delete on public.rental_comments for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists itinerary_signups_self_write on public.itinerary_signups;
create policy itinerary_signups_self_insert on public.itinerary_signups for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy itinerary_signups_self_update on public.itinerary_signups for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy itinerary_signups_self_delete on public.itinerary_signups for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists planner_comments_self_write on public.planner_comments;
create policy planner_comments_self_insert on public.planner_comments for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy planner_comments_self_update on public.planner_comments for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy planner_comments_self_delete on public.planner_comments for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists packing_items_owner_write on public.packing_items;
create policy packing_items_owner_insert on public.packing_items for insert to authenticated with check (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy packing_items_owner_update on public.packing_items for update to authenticated using (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy packing_items_owner_delete on public.packing_items for delete to authenticated using (owner_traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

drop policy if exists travel_plans_self_write on public.travel_plans;
create policy travel_plans_self_insert on public.travel_plans for insert to authenticated with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy travel_plans_self_update on public.travel_plans for update to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id))) with check (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));
create policy travel_plans_self_delete on public.travel_plans for delete to authenticated using (traveler_id = (select private.current_traveler_id(trip_id)) or (select private.is_trip_organizer(trip_id)));

-- Child structural tables: organizer-only mutations, member SELECT remains separate.
drop policy if exists rental_photos_organizer_write on public.rental_photos;
create policy rental_photos_organizer_insert on public.rental_photos for insert to authenticated with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_photos_organizer_update on public.rental_photos for update to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id)))) with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_photos_organizer_delete on public.rental_photos for delete to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));

drop policy if exists rental_amenities_organizer_write on public.rental_amenities;
create policy rental_amenities_organizer_insert on public.rental_amenities for insert to authenticated with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_amenities_organizer_update on public.rental_amenities for update to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id)))) with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_amenities_organizer_delete on public.rental_amenities for delete to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));

drop policy if exists rental_bedrooms_organizer_write on public.rental_bedrooms;
create policy rental_bedrooms_organizer_insert on public.rental_bedrooms for insert to authenticated with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_bedrooms_organizer_update on public.rental_bedrooms for update to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id)))) with check (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));
create policy rental_bedrooms_organizer_delete on public.rental_bedrooms for delete to authenticated using (exists (select 1 from public.rentals r where r.id = rental_id and (select private.is_trip_organizer(r.trip_id))));

drop policy if exists booking_plan_travelers_organizer_write on public.booking_plan_travelers;
create policy booking_plan_travelers_organizer_insert on public.booking_plan_travelers for insert to authenticated with check (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id))));
create policy booking_plan_travelers_organizer_update on public.booking_plan_travelers for update to authenticated using (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id)))) with check (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id))));
create policy booking_plan_travelers_organizer_delete on public.booking_plan_travelers for delete to authenticated using (exists (select 1 from public.booking_plans b where b.id = booking_plan_id and (select private.is_trip_organizer(b.trip_id))));

drop policy if exists budget_item_travelers_organizer_write on public.budget_item_travelers;
create policy budget_item_travelers_organizer_insert on public.budget_item_travelers for insert to authenticated with check (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id))));
create policy budget_item_travelers_organizer_update on public.budget_item_travelers for update to authenticated using (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id)))) with check (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id))));
create policy budget_item_travelers_organizer_delete on public.budget_item_travelers for delete to authenticated using (exists (select 1 from public.budget_items b where b.id = budget_item_id and (select private.is_trip_organizer(b.trip_id))));

-- Cover relationship foreign keys used by RLS and common queries.
create index if not exists activity_log_actor_user_idx on public.activity_log(actor_user_id);
create index if not exists activity_log_created_by_idx on public.activity_log(created_by);
create index if not exists activity_log_traveler_idx on public.activity_log(traveler_id);
create index if not exists booking_plan_travelers_traveler_idx on public.booking_plan_travelers(traveler_id);
create index if not exists booking_plans_created_by_idx on public.booking_plans(created_by);
create index if not exists budget_item_travelers_traveler_idx on public.budget_item_travelers(traveler_id);
create index if not exists budget_items_created_by_idx on public.budget_items(created_by);
create index if not exists budget_items_paid_by_idx on public.budget_items(paid_by_traveler_id);
create index if not exists favorites_created_by_idx on public.favorites(created_by);
create index if not exists favorites_traveler_idx on public.favorites(traveler_id);
create index if not exists grocery_items_created_by_idx on public.grocery_items(created_by);
create index if not exists itinerary_items_created_by_idx on public.itinerary_items(created_by);
create index if not exists itinerary_signups_created_by_idx on public.itinerary_signups(created_by);
create index if not exists itinerary_signups_traveler_idx on public.itinerary_signups(traveler_id);
create index if not exists meals_created_by_idx on public.meals(created_by);
create index if not exists notifications_created_by_idx on public.notifications(created_by);
create index if not exists notifications_traveler_idx on public.notifications(traveler_id);
create index if not exists packing_items_bringing_idx on public.packing_items(bringing_traveler_id);
create index if not exists packing_items_created_by_idx on public.packing_items(created_by);
create index if not exists packing_items_owner_idx on public.packing_items(owner_traveler_id);
create index if not exists payment_schedules_created_by_idx on public.payment_schedules(created_by);
create index if not exists payment_schedules_expected_payer_idx on public.payment_schedules(expected_payer_traveler_id);
create index if not exists payment_schedules_recipient_traveler_idx on public.payment_schedules(recipient_traveler_id);
create index if not exists payment_schedules_trip_idx on public.payment_schedules(trip_id);
create index if not exists payment_shares_booking_plan_idx on public.payment_shares(booking_plan_id);
create index if not exists payment_shares_created_by_idx on public.payment_shares(created_by);
create index if not exists payment_shares_traveler_idx on public.payment_shares(traveler_id);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists payments_paid_by_idx on public.payments(paid_by_traveler_id);
create index if not exists payments_paid_to_idx on public.payments(paid_to_traveler_id);
create index if not exists payments_rental_idx on public.payments(rental_id);
create index if not exists planner_comments_created_by_idx on public.planner_comments(created_by);
create index if not exists planner_comments_traveler_idx on public.planner_comments(traveler_id);
create index if not exists rental_amenities_created_by_idx on public.rental_amenities(created_by);
create index if not exists rental_bedrooms_created_by_idx on public.rental_bedrooms(created_by);
create index if not exists rental_comments_created_by_idx on public.rental_comments(created_by);
create index if not exists rental_comments_traveler_idx on public.rental_comments(traveler_id);
create index if not exists rental_comments_trip_idx on public.rental_comments(trip_id);
create index if not exists rental_imports_created_by_idx on public.rental_imports(created_by);
create index if not exists rental_imports_rental_idx on public.rental_imports(rental_id);
create index if not exists rental_imports_submitted_by_idx on public.rental_imports(submitted_by_traveler_id);
create index if not exists rental_photos_created_by_idx on public.rental_photos(created_by);
create index if not exists rentals_created_by_idx on public.rentals(created_by);
create index if not exists rentals_submitted_by_idx on public.rentals(submitted_by_traveler_id);
create index if not exists room_assignments_created_by_idx on public.room_assignments(created_by);
create index if not exists room_assignments_traveler_idx on public.room_assignments(traveler_id);
create index if not exists room_assignments_trip_idx on public.room_assignments(trip_id);
create index if not exists travel_plans_created_by_idx on public.travel_plans(created_by);
create index if not exists travel_plans_traveler_idx on public.travel_plans(traveler_id);
create index if not exists traveler_admin_created_by_idx on public.traveler_admin(created_by);
create index if not exists traveler_private_created_by_idx on public.traveler_private(created_by);
create index if not exists travelers_created_by_idx on public.travelers(created_by);
create index if not exists trip_members_created_by_idx on public.trip_members(created_by);
create index if not exists trips_created_by_idx on public.trips(created_by);
create index if not exists votes_created_by_idx on public.votes(created_by);
