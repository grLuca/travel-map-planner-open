import type { LngLat, PlaceSource, RouteSegmentStatus, TransportMode, TransportOption } from '../../types/trip';

export type MapProviderErrorCode =
  | 'network'
  | 'invalidKey'
  | 'quotaExceeded'
  | 'noTransitRoute'
  | 'searchFailed'
  | 'coordinateFailed';

export interface PlaceSearchRequest {
  keyword: string;
  city: string;
  bounds?: [LngLat, LngLat];
}

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  city: string;
  lngLat: LngLat;
  source: PlaceSource;
}

export interface RoutePlanRequest {
  origin: LngLat;
  destination: LngLat;
  mode: TransportMode;
  city: string;
}

export interface PlannedRoute {
  status: RouteSegmentStatus;
  options: TransportOption[];
  provider: 'mock' | 'amap' | 'baidu';
  cached: boolean;
  warning?: string;
}

export interface MapProvider {
  searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult[]>;
  planRoute(request: RoutePlanRequest): Promise<PlannedRoute>;
  normalizeCoordinate(lngLat: LngLat): LngLat;
}

export class MapProviderError extends Error {
  code: MapProviderErrorCode;
  recoverable: boolean;

  constructor(code: MapProviderErrorCode, message: string, recoverable = true) {
    super(message);
    this.name = 'MapProviderError';
    this.code = code;
    this.recoverable = recoverable;
  }
}
