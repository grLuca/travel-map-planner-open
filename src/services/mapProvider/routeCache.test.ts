import { describe, expect, it, vi } from 'vitest';
import type { MapProvider, PlannedRoute, RoutePlanRequest } from './types';
import { CachedMapProvider, createRouteCacheKey } from './routeCache';

const request: RoutePlanRequest = {
  origin: [121.4462, 31.2116],
  destination: [121.544, 31.227],
  mode: 'transit',
  city: '上海',
};

const route: PlannedRoute = {
  status: 'ready',
  provider: 'mock',
  cached: false,
  options: [
    {
      id: 'route-transit',
      mode: 'transit',
      title: '地铁',
      durationMinutes: 38,
      costCny: 4,
      walkingMeters: 720,
      transfers: 1,
      description: '地铁换乘',
      isRecommended: true,
    },
  ],
};

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
};

const createDelegate = (planRoute = vi.fn(async () => route)): MapProvider => ({
  searchPlaces: vi.fn(async () => []),
  planRoute,
  normalizeCoordinate: (lngLat) => lngLat,
});

describe('CachedMapProvider', () => {
  it('keys route cache by city, mode, origin, and destination', () => {
    expect(createRouteCacheKey(request)).toBe('上海|transit|121.4462,31.2116|121.544,31.227');
  });

  it('returns cached route plans without calling the delegate again', async () => {
    const storage = createStorage();
    const planRoute = vi.fn(async () => route);
    const provider = new CachedMapProvider(createDelegate(planRoute), { storage });

    const first = await provider.planRoute(request);
    const second = await provider.planRoute(request);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.options[0].title).toBe('地铁');
    expect(planRoute).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed route plans', async () => {
    const storage = createStorage();
    const planRoute = vi.fn(async () => ({ ...route, status: 'failed' as const }));
    const provider = new CachedMapProvider(createDelegate(planRoute), { storage });

    await provider.planRoute(request);
    await provider.planRoute(request);

    expect(planRoute).toHaveBeenCalledTimes(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
