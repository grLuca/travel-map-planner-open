import type { LngLat } from '../../types/trip';
import { MapProviderError } from './types';

const BAIDU_SCRIPT_URL = 'https://api.map.baidu.com/api';
const BAIDU_LOAD_TIMEOUT_MS = 12000;

export const BAIDU_BROWSER_AK = String(import.meta.env.VITE_BAIDU_BROWSER_AK ?? '').trim();

export interface BaiduSdkLoadOptions {
  ak?: string;
  scriptUrl?: string;
  timeoutMs?: number;
}

export interface BaiduPoint {
  lng: number;
  lat: number;
}

export interface BaiduPoi {
  uid?: string;
  title?: string;
  name?: string;
  address?: string;
  city?: string;
  point?: Partial<BaiduPoint>;
}

export interface BaiduSearchResults {
  getCurrentNumPois?: () => number;
  getPoi?: (index: number) => BaiduPoi | undefined;
}

export interface BaiduLocalSearch {
  getStatus: () => number;
  search: (keyword: string) => void;
}

export interface BaiduRoute {
  getStatus: () => number;
  search: (origin: BaiduPoint, destination: BaiduPoint) => void;
}

export interface BaiduRouteResult {
  getNumPlans?: () => number;
  getPlan?: (index: number) => BaiduRoutePlan | undefined;
}

export interface BaiduRoutePlan {
  getDuration?: (format?: boolean) => number | string;
  getDistance?: (format?: boolean) => number | string;
  getNumRoutes?: () => number;
  getRoute?: (index: number) => BaiduRouteStep | undefined;
}

export interface BaiduRouteStep {
  getTitle?: () => string;
  getDistance?: (format?: boolean) => number | string;
  getPath?: () => BaiduPoint[];
}

export interface BaiduApi {
  Point: new (lng: number, lat: number) => BaiduPoint;
  LocalSearch: new (city: string, options: { onSearchComplete: (results: BaiduSearchResults) => void }) => BaiduLocalSearch;
  TransitRoute: new (city: string, options: { onSearchComplete: (results: BaiduRouteResult) => void }) => BaiduRoute;
  DrivingRoute: new (city: string, options: { onSearchComplete: (results: BaiduRouteResult) => void }) => BaiduRoute;
  WalkingRoute: new (city: string, options: { onSearchComplete: (results: BaiduRouteResult) => void }) => BaiduRoute;
}

export type BaiduRouteConstructor = new (city: string, options: { onSearchComplete: (results: BaiduRouteResult) => void }) => BaiduRoute;

let baiduApiPromise: Promise<BaiduApi> | null = null;

export const loadBaiduApi = (options: BaiduSdkLoadOptions = {}): Promise<BaiduApi> => {
  const existing = getBaiduApi();
  if (existing) {
    return Promise.resolve(existing);
  }
  if (baiduApiPromise) {
    return baiduApiPromise;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new MapProviderError('network', '百度地图 JavaScript API 只能在浏览器中使用。'));
  }

  const ak = options.ak ?? BAIDU_BROWSER_AK;
  const scriptUrl = options.scriptUrl ?? BAIDU_SCRIPT_URL;
  const timeoutMs = options.timeoutMs ?? BAIDU_LOAD_TIMEOUT_MS;
  if (!ak.trim()) {
    return Promise.reject(new MapProviderError('invalidKey', '请先配置百度地图浏览器端 AK。', false));
  }

  baiduApiPromise = new Promise((resolve, reject) => {
    const callbackName = `__travelPlannerBaiduReady_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement('script');
    const callbacks = window as unknown as Record<string, () => void>;
    const timeout = window.setTimeout(() => {
      delete callbacks[callbackName];
      baiduApiPromise = null;
      script.remove();
      reject(new MapProviderError('network', '百度地图 JavaScript API 加载超时。'));
    }, timeoutMs);

    callbacks[callbackName] = () => {
      const api = getBaiduApi();
      window.clearTimeout(timeout);
      delete callbacks[callbackName];
      if (!api) {
        baiduApiPromise = null;
        reject(new MapProviderError('network', '百度地图 JavaScript API 加载失败。'));
        return;
      }
      baiduApiPromise = null;
      resolve(api);
    };

    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      delete callbacks[callbackName];
      baiduApiPromise = null;
      script.remove();
      reject(new MapProviderError('network', '百度地图 JavaScript API 加载失败。'));
    };
    script.src = `${scriptUrl}?v=3.0&ak=${encodeURIComponent(ak)}&callback=${callbackName}`;
    document.head.appendChild(script);
  });

  return baiduApiPromise;
};

export const resetBaiduApiLoader = () => {
  baiduApiPromise = null;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  document.querySelectorAll('script[src*="api.map.baidu.com/api"]').forEach((script) => script.remove());
  delete (window as unknown as { BMap?: BaiduApi }).BMap;
  delete (window as unknown as { BMAP_STATUS_SUCCESS?: number }).BMAP_STATUS_SUCCESS;
};

export const createBaiduPoint = (api: BaiduApi, lngLat: LngLat): BaiduPoint => new api.Point(lngLat[0], lngLat[1]);

export const isBaiduApiReady = (): boolean => Boolean(getBaiduApi());

export const getSuccessStatus = (): number => {
  if (typeof window === 'undefined') {
    return 0;
  }
  return (window as unknown as { BMAP_STATUS_SUCCESS?: number }).BMAP_STATUS_SUCCESS ?? 0;
};

const getBaiduApi = (): BaiduApi | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as unknown as { BMap?: BaiduApi }).BMap;
};
