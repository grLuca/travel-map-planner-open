import type { TransportOption } from '../../types/trip';
import type { MapProvider, MapProviderErrorCode, PlaceSearchRequest, PlaceSearchResult, PlannedRoute, RoutePlanRequest } from './types';
import { MapProviderError } from './types';

interface MockMapProviderOptions {
  failSearch?: boolean;
  failRoutes?: boolean;
  failureCode?: MapProviderErrorCode;
}

const places: PlaceSearchResult[] = [
  {
    id: 'mock-wukang-road',
    name: '武康路历史风貌区',
    address: '上海市徐汇区武康路',
    city: '上海',
    lngLat: [121.4396, 31.2132],
    source: 'mock',
  },
  {
    id: 'mock-anfu-road',
    name: '安福路',
    address: '上海市徐汇区安福路',
    city: '上海',
    lngLat: [121.4462, 31.2116],
    source: 'mock',
  },
  {
    id: 'mock-shanghai-museum-east',
    name: '上海博物馆东馆',
    address: '上海市浦东新区世纪大道1952号',
    city: '上海',
    lngLat: [121.544, 31.227],
    source: 'mock',
  },
  {
    id: 'mock-bund',
    name: '外滩观景步道',
    address: '上海市黄浦区中山东一路',
    city: '上海',
    lngLat: [121.4908, 31.2416],
    source: 'mock',
  },
  {
    id: 'mock-xintiandi',
    name: '新天地',
    address: '上海市黄浦区太仓路',
    city: '上海',
    lngLat: [121.4751, 31.2193],
    source: 'mock',
  },
  {
    id: 'mock-yuyuan',
    name: '豫园',
    address: '上海市黄浦区福佑路168号',
    city: '上海',
    lngLat: [121.492, 31.227],
    source: 'mock',
  },
  {
    id: 'mock-sinan-mansions',
    name: '思南公馆',
    address: '上海市黄浦区复兴中路523号',
    city: '上海',
    lngLat: [121.4671, 31.2148],
    source: 'mock',
  },
];

const option = (
  id: string,
  mode: TransportOption['mode'],
  title: string,
  durationMinutes: number,
  costCny: number,
  walkingMeters: number,
  transfers: number,
  description: string,
  isRecommended = false,
): TransportOption => ({
  id,
  mode,
  title,
  durationMinutes,
  costCny,
  walkingMeters,
  transfers,
  description,
  isRecommended,
});

export class MockMapProvider implements MapProvider {
  private options: MockMapProviderOptions;

  constructor(options: MockMapProviderOptions = {}) {
    this.options = options;
  }

  async searchPlaces(request: PlaceSearchRequest): Promise<PlaceSearchResult[]> {
    if (this.options.failSearch) {
      throw new MapProviderError(this.options.failureCode ?? 'searchFailed', '地点搜索暂不可用');
    }

    const keyword = request.keyword.trim().toLocaleLowerCase('zh-CN');
    if (!keyword) {
      return [];
    }

    return places.filter((place) => {
      const haystack = `${place.name} ${place.address} ${place.city}`.toLocaleLowerCase('zh-CN');
      return place.city === request.city && haystack.includes(keyword);
    });
  }

  async planRoute(request: RoutePlanRequest): Promise<PlannedRoute> {
    if (this.options.failRoutes) {
      throw new MapProviderError(this.options.failureCode ?? 'network', '路线规划暂不可用', true);
    }

    const walkingMeters = Math.max(600, Math.round(estimateDistanceMeters(request.origin, request.destination) * 0.18));

    return {
      status: 'ready',
      provider: 'mock',
      cached: false,
      options: [
        option(
          'mock-route-transit',
          'transit',
          '地铁 10 号线 → 2 号线',
          38,
          4,
          walkingMeters,
          1,
          '交通大学站上车 · 南京东路换乘 · 上海科技馆站下车',
          true,
        ),
        option('mock-route-taxi', 'taxi', '打车', 32, 58, 120, 0, '约 32 分钟，受高架拥堵影响'),
        option('mock-route-walk', 'walk', '步行', 96, 0, 6900, 0, '距离较长，仅作为备选'),
        option('mock-route-manual', 'manual', '手动填写', 0, 0, 0, 0, '公交不可用时记录自定义交通方式'),
      ],
    };
  }

  normalizeCoordinate(lngLat: [number, number]): [number, number] {
    return [Number(lngLat[0].toFixed(6)), Number(lngLat[1].toFixed(6))];
  }
}

const estimateDistanceMeters = (origin: [number, number], destination: [number, number]): number => {
  const lngDelta = (destination[0] - origin[0]) * 94000;
  const latDelta = (destination[1] - origin[1]) * 111000;
  return Math.hypot(lngDelta, latDelta);
};
