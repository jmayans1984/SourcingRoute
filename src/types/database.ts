export type TripStatus = 'planning' | 'active' | 'completed' | 'cancelled';
export type StopStatus = 'pending' | 'on_the_way' | 'arrived' | 'completed' | 'skipped';
export type StoreRating = 1 | 2 | 3; // 1=bad, 2=regular, 3=good
export type RoutePriority = 'less_driving' | 'more_stores' | 'best_stores';
export type WifiSignal = 'bad' | 'regular' | 'good';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  default_radius_miles: number;
  default_store_duration_minutes: number;
  preferred_chains: string[];
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  google_place_id: string;
  name: string;
  chain: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  phone: string | null;
  opening_hours: Record<string, string> | null;
  is_active: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourcingTrip {
  id: string;
  user_id: string;
  name: string | null;
  trip_date: string;
  start_address: string;
  start_lat: number;
  start_lng: number;
  end_address: string;
  end_lat: number;
  end_lng: number;
  selected_chains: string[];
  radius_miles: number;
  available_minutes: number;
  max_stores: number;
  default_store_duration_minutes: number;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  route_priority: RoutePriority;
  total_distance_miles: number | null;
  total_drive_minutes: number | null;
  total_store_minutes: number | null;
  traffic_delay_minutes: number | null;
  route_polyline: string | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface TripStop {
  id: string;
  trip_id: string;
  user_id: string;
  store_id: string;
  stop_order: number;
  eta: string | null;
  drive_minutes_from_previous: number | null;
  drive_miles_from_previous: number | null;
  planned_duration_minutes: number;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: StopStatus;
  score: number;
  user_rating: StoreRating | null;
  wifi_signal: WifiSignal | null;
  notes: string | null;
  found_products_count: number;
  estimated_profit: number;
  total_spent: number;
  total_items_bought: number;
  receipt_photo_urls: string[] | null;
  created_at: string;
  updated_at: string;
  store?: Store;
}

export interface StoreVisit {
  id: string;
  user_id: string;
  store_id: string;
  trip_id: string | null;
  visited_at: string;
  rating: StoreRating;
  wifi_signal: WifiSignal | null;
  products_found: number;
  estimated_profit: number;
  total_spent: number;
  total_items_bought: number;
  receipt_photo_urls: string[] | null;
  clearance_found: boolean;
  competition_level: 'low' | 'medium' | 'high' | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoundProduct {
  id: string;
  user_id: string;
  store_id: string;
  trip_id: string | null;
  trip_stop_id: string | null;
  product_name: string;
  upc: string | null;
  buy_cost: number;
  estimated_sale_price: number;
  estimated_profit: number;
  roi_percent: number;
  quantity_found: number;
  quantity_bought: number;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserStorePreference {
  id: string;
  user_id: string;
  store_id: string;
  is_favorite: boolean;
  is_blocked: boolean;
  custom_score_adjustment: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreWithScore extends Store {
  score: number;
  last_visit: string | null;
  visit_count: number;
  avg_rating: number | null;
  avg_profit: number | null;
  total_products_found: number;
  distance_miles: number;
  is_favorite: boolean;
  is_blocked: boolean;
}

export const STORE_CHAINS = [
  'Ross',
  'Burlington',
  'TJ Maxx',
  'Marshalls',
  'Walmart',
  'Target',
  'HomeGoods',
  'Five Below',
  'Dollar Tree',
  'Ollie\'s',
  'Big Lots',
  'Nordstrom Rack',
  'Sierra',
  'Tuesday Morning',
  'Bealls Outlet',
] as const;

export type StoreChain = typeof STORE_CHAINS[number];
