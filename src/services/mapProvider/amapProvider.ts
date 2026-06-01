import type { LngLat } from '../../types/trip';
import type { MapProvider, MapProviderErrorCode, PlaceSearchRequest, PlaceSearchResult, PlannedRoute, RoutePlanRequest } from './types';
import { MapProviderError } from './types';

interface ProxyErrorPayload {
  code?: MapProviderErrorCode;
  message?: string;
  recoverable?: boolean;
}

export class AmapProvider implements MapProvider {
  private baseUrl: string;

  constructor(baseUrl = '/api/amap') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult[]> {
    const params = new URLSearchParams({
      keyword: request.keyword,
      city: request.city,
    });
    const payload = await fetchJson<{ places: PlaceSearchResult[] }>(`${this.baseUrl}/search?${params.toString()}`);
    return payload.places.map(normalizePlace);
  }

  async planRoute(request: RoutePlanRequest): Promise<PlannedRoute> {
    const params = new URLSearchParams({
      origin: request.origin.join(','),
      destination: request.destination.join(','),
      mode: request.mode,
      city: request.city,
    });
    const route = await fetchJson<PlannedRoute>(`${this.baseUrl}/route?${params.toString()}`);
    return {
      ...route,
      provider: 'amap',
      cached: false,
      options: route.options.map((option) => ({ ...option })),
    };
  }

  normalizeCoordinate(lngLat: LngLat): LngLat {
    return [Number(lngLat[0].toFixed(6)), Number(lngLat[1].toFixed(6))];
  }
}

const fetchJson = async <T>(url: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new MapProviderError('network', '地图代理服务不可用，请确认代理已启动。');
  }

  if (!response.ok) {
    const payload = await readProxyError(response);
    throw new MapProviderError(payload.code ?? 'network', payload.message ?? '地图服务请求失败', payload.recoverable ?? true);
  }

  return (await response.json()) as T;
};

const readProxyError = async (response: Response): Promise<ProxyErrorPayload> => {
  try {
    return (await response.json()) as ProxyErrorPayload;
  } catch {
    return {
      code: response.status === 429 ? 'quotaExceeded' : 'network',
      message: '地图服务请求失败',
      recoverable: true,
    };
  }
};

const normalizePlace = (place: PlaceSearchResult): PlaceSearchResult => ({
  id: String(place.id),
  name: String(place.name),
  address: String(place.address),
  city: String(place.city),
  lngLat: [Number(place.lngLat[0]), Number(place.lngLat[1])],
  source: 'amap',
});
