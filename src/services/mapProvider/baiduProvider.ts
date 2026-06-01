import type { LngLat, TransportOption } from '../../types/trip';
import type { MapProvider, PlaceSearchRequest, PlaceSearchResult, PlannedRoute, RoutePlanRequest } from './types';
import { BAIDU_BROWSER_AK, createBaiduPoint, getSuccessStatus, loadBaiduApi } from './baiduSdk';
import type {
  BaiduApi,
  BaiduPoint,
  BaiduRouteConstructor,
  BaiduRoutePlan,
  BaiduRouteResult,
  BaiduSdkLoadOptions,
  BaiduSearchResults,
} from './baiduSdk';
import { MapProviderError } from './types';

export class BaiduProvider implements MapProvider {
  private ak: string;
  private scriptUrl: string;
  private timeoutMs: number;

  constructor(options: BaiduSdkLoadOptions = {}) {
    this.ak = options.ak ?? BAIDU_BROWSER_AK;
    this.scriptUrl = options.scriptUrl ?? 'https://api.map.baidu.com/api';
    this.timeoutMs = options.timeoutMs ?? 12000;
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult[]> {
    const keyword = request.keyword.trim();
    if (!keyword) {
      return [];
    }

    const api = await this.loadApi();
    return new Promise((resolve, reject) => {
      const localSearch = new api.LocalSearch(request.city, {
        onSearchComplete: (results) => {
          if (localSearch.getStatus() !== getSuccessStatus()) {
            reject(new MapProviderError('searchFailed', '百度地点搜索失败。'));
            return;
          }
          resolve(normalizePlaces(results, request.city));
        },
      });

      try {
        localSearch.search(keyword);
      } catch {
        reject(new MapProviderError('searchFailed', '百度地点搜索失败。'));
      }
    });
  }

  async planRoute(request: RoutePlanRequest): Promise<PlannedRoute> {
    const api = await this.loadApi();
    const origin = createBaiduPoint(api, request.origin);
    const destination = createBaiduPoint(api, request.destination);
    const [transit, driving, walking] = await Promise.all([
      searchRoute(api.TransitRoute, request.city, origin, destination),
      searchRoute(api.DrivingRoute, request.city, origin, destination),
      searchRoute(api.WalkingRoute, request.city, origin, destination),
    ]);

    const options = [
      ...normalizeTransitOptions(transit),
      ...normalizeDrivingOptions(driving),
      ...normalizeWalkingOptions(walking),
      manualOption,
    ];

    if (options.length === 1) {
      throw new MapProviderError('noTransitRoute', '未找到百度路线方案。');
    }

    return {
      status: 'ready',
      provider: 'baidu',
      cached: false,
      options,
      warning: options.some((option) => option.mode === 'taxi' || option.mode === 'walk') ? undefined : '仅返回公交方案',
    };
  }

  normalizeCoordinate(lngLat: LngLat): LngLat {
    return [Number(lngLat[0].toFixed(6)), Number(lngLat[1].toFixed(6))];
  }

  private async loadApi(): Promise<BaiduApi> {
    return loadBaiduApi({ ak: this.ak, scriptUrl: this.scriptUrl, timeoutMs: this.timeoutMs });
  }
}

const normalizePlaces = (results: BaiduSearchResults, fallbackCity: string): PlaceSearchResult[] => {
  const count = results.getCurrentNumPois?.() ?? 0;
  const places: PlaceSearchResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const poi = results.getPoi?.(index);
    const lng = Number(poi?.point?.lng);
    const lat = Number(poi?.point?.lat);
    if (!poi || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }
    const name = String(poi.title ?? poi.name ?? '');
    places.push({
      id: String(poi.uid ?? `${name}-${lng},${lat}`),
      name,
      address: String(poi.address ?? ''),
      city: normalizePlaceCity(poi.city, fallbackCity),
      lngLat: [lng, lat],
      source: 'baidu',
    });
  }
  return places;
};

const normalizePlaceCity = (city: unknown, fallbackCity: string): string => {
  const normalized = String(city ?? '').trim();
  return normalized || fallbackCity;
};

const searchRoute = (RouteConstructor: BaiduRouteConstructor, city: string, origin: BaiduPoint, destination: BaiduPoint): Promise<BaiduRouteResult | null> =>
  new Promise((resolve) => {
    try {
      const route = new RouteConstructor(city, {
        onSearchComplete: (results) => {
          resolve(route.getStatus() === getSuccessStatus() ? results : null);
        },
      });
      route.search(origin, destination);
    } catch {
      resolve(null);
    }
  });

const normalizeTransitOptions = (results: BaiduRouteResult | null): TransportOption[] =>
  getPlans(results, 3).map((plan, index) => {
    const titles = getRouteTitles(plan).slice(0, 3);
    const distanceMeters = readMeters(plan.getDistance?.(false));
    return routeOption(
      `baidu-transit-${index + 1}`,
      'transit',
      titles.length > 0 ? titles.join(' → ') : '公交/地铁',
      readSeconds(plan.getDuration?.(false)),
      0,
      distanceMeters,
      Math.max(0, titles.length - 1),
      titles.length > 0 ? titles.join(' · ') : '百度公交路线',
      index === 0,
      getPlanRoutePath(plan),
    );
  });

const normalizeDrivingOptions = (results: BaiduRouteResult | null): TransportOption[] =>
  getPlans(results, 2).map((plan, index) => {
    const distanceMeters = readMeters(plan.getDistance?.(false));
    return routeOption(
      `baidu-taxi-${index + 1}`,
      'taxi',
      '打车',
      readSeconds(plan.getDuration?.(false)),
      estimateTaxiCost(distanceMeters),
      120,
      0,
      `约 ${(distanceMeters / 1000).toFixed(1)} km，费用为估算值。`,
      false,
      getPlanRoutePath(plan),
    );
  });

const normalizeWalkingOptions = (results: BaiduRouteResult | null): TransportOption[] =>
  getPlans(results, 1).map((plan, index) => {
    const distanceMeters = readMeters(plan.getDistance?.(false));
    return routeOption(
      `baidu-walk-${index + 1}`,
      'walk',
      '步行',
      readSeconds(plan.getDuration?.(false)),
      0,
      distanceMeters,
      0,
      `约 ${(distanceMeters / 1000).toFixed(1)} km。`,
      false,
      getPlanRoutePath(plan),
    );
  });

const getPlans = (results: BaiduRouteResult | null, max: number): BaiduRoutePlan[] => {
  const count = Math.min(results?.getNumPlans?.() ?? 0, max);
  const plans: BaiduRoutePlan[] = [];
  for (let index = 0; index < count; index += 1) {
    const plan = results?.getPlan?.(index);
    if (plan) {
      plans.push(plan);
    }
  }
  return plans;
};

const getRouteTitles = (plan: BaiduRoutePlan): string[] => {
  const count = plan.getNumRoutes?.() ?? 0;
  const titles: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const title = plan.getRoute?.(index)?.getTitle?.();
    if (title) {
      titles.push(title);
    }
  }
  return titles;
};

const getPlanRoutePath = (plan: BaiduRoutePlan): LngLat[] | undefined => {
  const count = plan.getNumRoutes?.() ?? 0;
  const path: LngLat[] = [];
  for (let index = 0; index < count; index += 1) {
    const routePath = plan.getRoute?.(index)?.getPath?.();
    if (!Array.isArray(routePath)) {
      continue;
    }
    routePath.forEach((point) => {
      if (!point || typeof point !== 'object') {
        return;
      }
      const lng = Number(point.lng);
      const lat = Number(point.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        path.push([lng, lat]);
      }
    });
  }
  return path.length >= 2 ? path : undefined;
};

const readSeconds = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text = String(value ?? '');
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*小时/)?.[1] ?? 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*分钟/)?.[1] ?? text.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return Math.round((hours * 60 + minutes) * 60);
};

const readMeters = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  const text = String(value ?? '');
  const number = Number(text.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return text.includes('公里') || text.toLowerCase().includes('km') ? Math.round(number * 1000) : Math.round(number);
};

const routeOption = (
  id: string,
  mode: TransportOption['mode'],
  title: string,
  durationSeconds: number,
  costCny: number,
  walkingMeters: number,
  transfers: number,
  description: string,
  isRecommended = false,
  routePath?: LngLat[],
): TransportOption => ({
  id,
  mode,
  title,
  durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
  costCny: Math.round(costCny),
  walkingMeters: Math.round(walkingMeters),
  transfers,
  description,
  isRecommended,
  routePath,
});

const manualOption: TransportOption = {
  id: 'baidu-manual',
  mode: 'manual',
  title: '手动填写',
  durationMinutes: 0,
  costCny: 0,
  walkingMeters: 0,
  transfers: 0,
  description: '地图路线不可用时手动记录交通方式。',
};

const estimateTaxiCost = (meters: number): number => Math.max(16, Math.round(meters * 0.004 + 14));
