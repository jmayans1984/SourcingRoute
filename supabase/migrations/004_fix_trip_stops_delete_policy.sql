-- CRITICAL FIX: trip_stops was missing a DELETE policy. Row Level Security
-- denies operations with no matching policy by default and does so *silently*
-- for deletes (0 rows affected, no error) — so every "delete all stops, then
-- reinsert" save in the route editor was failing to delete anything, leaving
-- old stops in place while new ones got inserted on top. That's why removed
-- stops kept reappearing after a second edit.
create policy "Users can delete own stops" on trip_stops for delete using (auth.uid() = user_id);
