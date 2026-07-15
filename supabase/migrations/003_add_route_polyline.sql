-- Stores the Google-encoded polyline of the actual driving route so the map can
-- draw the real street-following path instead of straight lines between stops.
alter table sourcing_trips add column if not exists route_polyline text;
