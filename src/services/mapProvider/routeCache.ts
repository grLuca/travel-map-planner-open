import type { MapProvider, PlaceSearchRequest, PlaceSearchResult, PlannedRoute, RoutePlanRequest } from './types';

interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface CachedMapProviderOptions {
  storage?: CacheStorage | null;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = 'travel-map-planner:route-cache:v1';

export const createRouteCacheKey = (request: RoutePlanRequest): string => {
  const origin = request.origin.map((value) => Number(value.toFixed(6))).join(',');
  const destination = request.destination.map((value) => Number(value.toFixed(6))).join(',');
  return `${request.city}|${request.mode}|${origin}|${destination}`;
};

export class CachedMapProvider implements MapProvider {
  private memoryCache = new Map<string, PlannedRoute>();
  private delegate: MapProvider;
  private storage: CacheStorage | null;
  private storageKey: string;

  constructor(delegate: MapProvider, options: CachedMapProviderOptions = {}) {
    this.delegate = delegate;
    this.storage = options.storage ?? getDefaultStorage();
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.hydrate();
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult[]> {
    return this.delegate.searchPlaces(request);
  }

  async planRoute(request: RoutePlanRequest): Promise<PlannedRoute> {
    const key = createRouteCacheKey(request);
    const cached = this.memoryCache.get(key);
    if (cached) {
      return cloneRoute({ ...cached, cached: true });
    }

    const planned = await this.delegate.planRoute(request);
    if (planned.status === 'ready') {
      this.memoryCache.set(key, cloneRoute({ ...planned, cached: false }));
      this.persist();
    }

    return cloneRoute({ ...planned, cached: false });
  }

  normalizeCoordinate(lngLat: [number, number]): [number, number] {
    return this.delegate.normalizeCoordinate(lngLat);
  }

  private hydrate() {
    if (!this.storage) {
      return;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Array<[string, PlannedRoute]>;
      this.memoryCache = new Map(parsed);
    } catch {
      this.storage.removeItem?.(this.storageKey);
      this.memoryCache.clear();
    }
  }

  private persist() {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(Array.from(this.memoryCache.entries())));
    } catch {
      // Cache failures should never block editing a trip.
    }
  }
}

const getDefaultStorage = (): CacheStorage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const cloneRoute = (route: PlannedRoute): PlannedRoute => JSON.parse(JSON.stringify(route)) as PlannedRoute;
