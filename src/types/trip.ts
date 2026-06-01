export type LngLat = [number, number];

export type TransportMode = 'transit' | 'taxi' | 'walk' | 'manual';

export type RouteSegmentStatus = 'ready' | 'loading' | 'stale' | 'failed';

export type PlaceSource = 'mock' | 'amap' | 'baidu' | 'manual';

export type DiningType = 'breakfast' | 'lunch' | 'dinner' | 'dessert' | 'snack' | 'coffee' | 'lateNight' | 'other';

export type StopKind = 'default' | 'accommodation';

export interface TripStop {
  id: string;
  placeId: string;
  name: string;
  address: string;
  city: string;
  lngLat: LngLat;
  startTime: string;
  stayMinutes: number;
  note: string;
  tags: string[];
  kind?: StopKind;
  priority: 'must' | 'nice';
  source: PlaceSource;
}

export interface TransportOption {
  id: string;
  mode: TransportMode;
  title: string;
  durationMinutes: number;
  costCny: number;
  walkingMeters: number;
  transfers: number;
  description: string;
  isRecommended?: boolean;
  unavailableReason?: string;
  routePath?: LngLat[];
}

export interface RouteSegment {
  id: string;
  fromStopId: string;
  toStopId: string;
  status: RouteSegmentStatus;
  selectedMode: TransportMode;
  selectedOptionId: string;
  options: TransportOption[];
  provider?: PlaceSource;
  cached?: boolean;
  errorCode?: string;
  warning?: string;
  planningNote: string;
}

export interface DiningStop {
  id: string;
  placeId: string;
  name: string;
  address: string;
  city: string;
  lngLat: LngLat;
  diningType: DiningType;
  startTime: string;
  averagePriceCny: number;
  note: string;
  tags: string[];
  source: PlaceSource;
}

export interface TripDay {
  id: string;
  label: string;
  date: string;
  stops: TripStop[];
  diningStops: DiningStop[];
  routeSegments: RouteSegment[];
}

export interface TripPlan {
  id: string;
  title: string;
  dateRange: string;
  city: string;
  center?: LngLat;
  days: TripDay[];
  alternatives: TripStop[];
  updatedAt: string;
}

export interface DaySummary {
  stopCount: number;
  alternativeCount: number;
  stayMinutes: number;
  transportMinutes: number;
  walkingMeters: number;
  transportCostCny: number;
  totalMinutes: number;
  risks: string[];
}
