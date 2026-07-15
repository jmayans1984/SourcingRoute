-- Adds a custom name field to sourcing trips so users can label routes
-- (e.g. "Orlando Saturday Run") instead of only seeing the date.
alter table sourcing_trips add column if not exists name text;
