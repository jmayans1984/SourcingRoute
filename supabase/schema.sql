-- SourcingRoute Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Profile
create table users_profile (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text,
  home_address text,
  home_lat double precision,
  home_lng double precision,
  default_radius_miles integer default 30,
  default_store_duration_minutes integer default 40,
  preferred_chains text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table users_profile enable row level security;
create policy "Users can view own profile" on users_profile for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on users_profile for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on users_profile for update using (auth.uid() = user_id);

-- Stores
create table stores (
  id uuid primary key default uuid_generate_v4(),
  google_place_id text unique not null,
  name text not null,
  chain text not null,
  address text not null,
  city text default '',
  state text default '',
  zip text default '',
  lat double precision not null,
  lng double precision not null,
  phone text,
  opening_hours jsonb,
  is_active boolean default true,
  last_verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table stores enable row level security;
create policy "Stores are readable by authenticated users" on stores for select to authenticated using (true);
create policy "Stores can be inserted by authenticated users" on stores for insert to authenticated with check (true);
create policy "Stores can be updated by authenticated users" on stores for update to authenticated using (true);

create index idx_stores_chain on stores(chain);
create index idx_stores_location on stores(lat, lng);
create index idx_stores_place_id on stores(google_place_id);

-- Sourcing Trips
create table sourcing_trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text,
  trip_date date not null default current_date,
  start_address text not null,
  start_lat double precision not null,
  start_lng double precision not null,
  end_address text not null,
  end_lat double precision not null,
  end_lng double precision not null,
  selected_chains text[] default '{}',
  radius_miles integer default 30,
  available_minutes integer default 360,
  max_stores integer default 6,
  default_store_duration_minutes integer default 40,
  avoid_tolls boolean default false,
  avoid_highways boolean default false,
  route_priority text default 'best_stores' check (route_priority in ('less_driving', 'more_stores', 'best_stores')),
  total_distance_miles double precision,
  total_drive_minutes integer,
  total_store_minutes integer,
  traffic_delay_minutes integer,
  route_polyline text,
  status text default 'planning' check (status in ('planning', 'active', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sourcing_trips enable row level security;
create policy "Users can view own trips" on sourcing_trips for select using (auth.uid() = user_id);
create policy "Users can insert own trips" on sourcing_trips for insert with check (auth.uid() = user_id);
create policy "Users can update own trips" on sourcing_trips for update using (auth.uid() = user_id);
create policy "Users can delete own trips" on sourcing_trips for delete using (auth.uid() = user_id);

create index idx_trips_user on sourcing_trips(user_id);
create index idx_trips_date on sourcing_trips(trip_date);

-- Trip Stops
create table trip_stops (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid references sourcing_trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  store_id uuid references stores(id) not null,
  stop_order integer not null,
  eta timestamptz,
  drive_minutes_from_previous integer,
  drive_miles_from_previous double precision,
  planned_duration_minutes integer default 40,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  status text default 'pending' check (status in ('pending', 'on_the_way', 'arrived', 'completed', 'skipped')),
  score integer default 0,
  user_rating integer check (user_rating in (1, 2, 3)),
  wifi_signal text check (wifi_signal in ('bad', 'regular', 'good')),
  notes text,
  found_products_count integer default 0,
  estimated_profit double precision default 0,
  total_spent double precision default 0,
  total_items_bought integer default 0,
  receipt_photo_urls text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table trip_stops enable row level security;
create policy "Users can view own stops" on trip_stops for select using (auth.uid() = user_id);
create policy "Users can insert own stops" on trip_stops for insert with check (auth.uid() = user_id);
create policy "Users can update own stops" on trip_stops for update using (auth.uid() = user_id);
create policy "Users can delete own stops" on trip_stops for delete using (auth.uid() = user_id);

create index idx_stops_trip on trip_stops(trip_id);
create index idx_stops_store on trip_stops(store_id);

-- Store Visits
create table store_visits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  store_id uuid references stores(id) not null,
  trip_id uuid references sourcing_trips(id) on delete set null,
  visited_at timestamptz default now(),
  rating integer not null check (rating in (1, 2, 3)),
  wifi_signal text check (wifi_signal in ('bad', 'regular', 'good')),
  products_found integer default 0,
  estimated_profit double precision default 0,
  total_spent double precision default 0,
  total_items_bought integer default 0,
  receipt_photo_urls text[] default '{}',
  clearance_found boolean default false,
  competition_level text check (competition_level in ('low', 'medium', 'high')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table store_visits enable row level security;
create policy "Users can view own visits" on store_visits for select using (auth.uid() = user_id);
create policy "Users can insert own visits" on store_visits for insert with check (auth.uid() = user_id);

create index idx_visits_user on store_visits(user_id);
create index idx_visits_store on store_visits(store_id);
create index idx_visits_date on store_visits(visited_at);

-- Found Products
create table found_products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  store_id uuid references stores(id) not null,
  trip_id uuid references sourcing_trips(id) on delete set null,
  trip_stop_id uuid references trip_stops(id) on delete set null,
  product_name text not null,
  upc text,
  buy_cost double precision default 0,
  estimated_sale_price double precision default 0,
  estimated_profit double precision default 0,
  roi_percent integer default 0,
  quantity_found integer default 1,
  quantity_bought integer default 0,
  notes text,
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table found_products enable row level security;
create policy "Users can view own products" on found_products for select using (auth.uid() = user_id);
create policy "Users can insert own products" on found_products for insert with check (auth.uid() = user_id);

create index idx_products_user on found_products(user_id);
create index idx_products_store on found_products(store_id);

-- User Store Preferences
create table user_store_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  store_id uuid references stores(id) not null,
  is_favorite boolean default false,
  is_blocked boolean default false,
  custom_score_adjustment integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, store_id)
);

alter table user_store_preferences enable row level security;
create policy "Users can view own preferences" on user_store_preferences for select using (auth.uid() = user_id);
create policy "Users can insert own preferences" on user_store_preferences for insert with check (auth.uid() = user_id);
create policy "Users can update own preferences" on user_store_preferences for update using (auth.uid() = user_id);

-- Updated at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_users_profile_updated_at before update on users_profile for each row execute function update_updated_at();
create trigger update_stores_updated_at before update on stores for each row execute function update_updated_at();
create trigger update_sourcing_trips_updated_at before update on sourcing_trips for each row execute function update_updated_at();
create trigger update_trip_stops_updated_at before update on trip_stops for each row execute function update_updated_at();
create trigger update_store_visits_updated_at before update on store_visits for each row execute function update_updated_at();
create trigger update_found_products_updated_at before update on found_products for each row execute function update_updated_at();
create trigger update_user_store_preferences_updated_at before update on user_store_preferences for each row execute function update_updated_at();

-- Receipt photo storage bucket
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Files are stored under {user_id}/{store_id}/{filename} so the folder name doubles as the RLS check
create policy "Users can upload own receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
