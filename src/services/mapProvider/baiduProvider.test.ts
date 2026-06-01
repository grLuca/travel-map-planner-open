import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaiduProvider } from './baiduProvider';
import { createBaiduPoint, isBaiduApiReady, loadBaiduApi } from './baiduSdk';

type CallbackRegistry = Record<string, () => void>;

const installBaiduApiLoader = (api: object) => {
  const appendedScripts: HTMLScriptElement[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
    if (node instanceof HTMLScriptElement) {
      appendedScripts.push(node);
      const callbackName = new URL(node.src).searchParams.get('callback');
      if (callbackName) {
        window.setTimeout(() => {
          Object.assign(window, { BMap: api, BMAP_STATUS_SUCCESS: 0 });
          (window as unknown as CallbackRegistry)[callbackName]?.();
        }, 0);
      }
    }
    return node;
  });
  return appendedScripts;
};

describe('BaiduProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { BMap?: unknown }).BMap;
    delete (window as unknown as { BMAP_STATUS_SUCCESS?: number }).BMAP_STATUS_SUCCESS;
    document.querySelectorAll('script[src*="api.map.baidu.com/api"]').forEach((script) => script.remove());
  });

  it('loads the shared Baidu SDK and exposes browser readiness helpers', async () => {
    const api = {
      Point: class {
        constructor(
          public lng: number,
          public lat: number,
        ) {}
      },
    };
    const scripts = installBaiduApiLoader(api);

    expect(isBaiduApiReady()).toBe(false);

    const loadedApi = await loadBaiduApi({ ak: 'test-ak', scriptUrl: 'https://example.test/baidu', timeoutMs: 1000 });

    expect(loadedApi).toBe(api);
    expect(isBaiduApiReady()).toBe(true);
    expect(scripts[0].src).toContain('https://example.test/baidu?v=3.0');
    expect(scripts[0].src).toContain('ak=test-ak');
    expect(createBaiduPoint(loadedApi, [121.4752, 31.2297])).toEqual({ lng: 121.4752, lat: 31.2297 });
  });

  it('loads Baidu JavaScript API with the browser AK and normalizes place search results', async () => {
    const api = {
      LocalSearch: class {
        private onSearchComplete: (results: unknown) => void;

        constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
          this.onSearchComplete = options.onSearchComplete;
        }

        getStatus() {
          return 0;
        }

        search() {
          this.onSearchComplete({
            getCurrentNumPois: () => 1,
            getPoi: () => ({
              uid: 'poi-1',
              title: '上海博物馆(人民广场馆)',
              address: '人民大道 201 号',
              city: '上海市',
              point: { lng: 121.4752, lat: 31.2297 },
            }),
          });
        }
      },
    };
    const scripts = installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });
    const results = await provider.searchPlaces({ keyword: '上海博物馆', city: '上海' });

    expect(scripts[0].src).toContain('https://api.map.baidu.com/api?v=3.0');
    expect(scripts[0].src).toContain('ak=test-ak');
    expect(results).toEqual([
      {
        id: 'poi-1',
        name: '上海博物馆(人民广场馆)',
        address: '人民大道 201 号',
        city: '上海市',
        lngLat: [121.4752, 31.2297],
        source: 'baidu',
      },
    ]);
  });

  it('falls back to the requested city when Baidu place results omit the city', async () => {
    const api = {
      LocalSearch: class {
        private onSearchComplete: (results: unknown) => void;

        constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
          this.onSearchComplete = options.onSearchComplete;
        }

        getStatus() {
          return 0;
        }

        search() {
          this.onSearchComplete({
            getCurrentNumPois: () => 1,
            getPoi: () => ({
              uid: 'poi-empty-city',
              title: '北外滩滨江绿地',
              address: '上海市虹口区东大名路',
              city: '',
              point: { lng: 121.501, lat: 31.251 },
            }),
          });
        }
      },
    };
    installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });
    const results = await provider.searchPlaces({ keyword: '北外滩', city: '上海' });

    expect(results[0]).toMatchObject({
      id: 'poi-empty-city',
      name: '北外滩滨江绿地',
      city: '上海',
      source: 'baidu',
    });
  });

  it('plans transit, driving, walking, and manual options through Baidu JavaScript API', async () => {
    const createRoute = (durationSeconds: number, distanceMeters: number, title: string, status = 0) =>
      class {
        private onSearchComplete: (results: unknown) => void;

        constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
          this.onSearchComplete = options.onSearchComplete;
        }

        getStatus() {
          return status;
        }

        search() {
          this.onSearchComplete({
            getNumPlans: () => 1,
            getPlan: () => ({
              getDuration: () => durationSeconds,
              getDistance: () => distanceMeters,
              getNumRoutes: () => 1,
              getRoute: () => ({
                getTitle: () => title,
                getDistance: () => distanceMeters,
                getPath: () => [
                  { lng: 121.4462, lat: 31.2116 },
                  { lng: 121.458, lat: 31.219 },
                  { lng: 121.4752, lat: 31.2297 },
                ],
              }),
            }),
          });
        }
      };
    const api = {
      Point: class {
        constructor(
          public lng: number,
          public lat: number,
        ) {}
      },
      TransitRoute: createRoute(2160, 8200, '地铁 2 号线'),
      DrivingRoute: createRoute(1800, 8200, '驾车路线'),
      WalkingRoute: createRoute(5400, 6100, '步行路线'),
    };
    installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });
    const route = await provider.planRoute({
      origin: [121.4462, 31.2116],
      destination: [121.4752, 31.2297],
      mode: 'transit',
      city: '上海',
    });

    expect(route.provider).toBe('baidu');
    expect(route.cached).toBe(false);
    expect(route.options.map((option) => option.mode)).toEqual(['transit', 'taxi', 'walk', 'manual']);
    expect(route.options[0]).toMatchObject({
      id: 'baidu-transit-1',
      title: '地铁 2 号线',
      durationMinutes: 36,
      walkingMeters: 8200,
      isRecommended: true,
      routePath: [
        [121.4462, 31.2116],
        [121.458, 31.219],
        [121.4752, 31.2297],
      ],
    });
    expect(route.options[1]).toMatchObject({
      id: 'baidu-taxi-1',
      durationMinutes: 30,
      costCny: 47,
    });
  });

  it('continues planning when DrivingRoute constructor throws', async () => {
    const transitRoute = class {
      private onSearchComplete: (results: unknown) => void;

      constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
        this.onSearchComplete = options.onSearchComplete;
      }

      getStatus() {
        return 0;
      }

      search() {
        this.onSearchComplete({
          getNumPlans: () => 1,
          getPlan: () => ({
            getDuration: () => 2160,
            getDistance: () => 8200,
            getNumRoutes: () => 1,
            getRoute: () => ({
              getTitle: () => '鍦伴搧 2 鍙风嚎',
              getPath: () => [
                { lng: 121.4462, lat: 31.2116 },
                { lng: 121.4752, lat: 31.2297 },
              ],
            }),
          }),
        });
      }
    };
    const unavailableRoute = class {
      private onSearchComplete: (results: unknown) => void;

      constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
        this.onSearchComplete = options.onSearchComplete;
      }

      getStatus() {
        return 1;
      }

      search() {
        this.onSearchComplete({});
      }
    };
    const api = {
      Point: class {
        constructor(
          public lng: number,
          public lat: number,
        ) {}
      },
      TransitRoute: transitRoute,
      DrivingRoute: class {
        constructor() {
          throw new Error('DrivingRoute unavailable');
        }
      },
      WalkingRoute: unavailableRoute,
    };
    installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });
    const route = await provider.planRoute({
      origin: [121.4462, 31.2116],
      destination: [121.4752, 31.2297],
      mode: 'transit',
      city: '涓婃捣',
    });

    expect(route.provider).toBe('baidu');
    expect(route.options.map((option) => option.mode)).toEqual(['transit', 'manual']);
    expect(route.options[0]).toMatchObject({
      id: 'baidu-transit-1',
      durationMinutes: 36,
      walkingMeters: 8200,
      isRecommended: true,
    });
  });

  it('ignores malformed Baidu route geometry without failing the route plan', async () => {
    const createRoute = (path: unknown) =>
      class {
        private onSearchComplete: (results: unknown) => void;

        constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
          this.onSearchComplete = options.onSearchComplete;
        }

        getStatus() {
          return 0;
        }

        search() {
          this.onSearchComplete({
            getNumPlans: () => 1,
            getPlan: () => ({
              getDuration: () => 2160,
              getDistance: () => 8200,
              getNumRoutes: () => 1,
              getRoute: () => ({
                getTitle: () => '地铁 2 号线',
                getPath: () => path,
              }),
            }),
          });
        }
      };
    const api = {
      Point: class {
        constructor(
          public lng: number,
          public lat: number,
        ) {}
      },
      TransitRoute: createRoute([{ lng: 121.4462, lat: 31.2116 }, null, { lng: Number.NaN, lat: 31.22 }]),
      DrivingRoute: createRoute('not-an-array'),
      WalkingRoute: createRoute([{ lng: 121.4462, lat: 31.2116 }]),
    };
    installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });
    const route = await provider.planRoute({
      origin: [121.4462, 31.2116],
      destination: [121.4752, 31.2297],
      mode: 'transit',
      city: '上海',
    });

    expect(route.options.map((option) => option.mode)).toEqual(['transit', 'taxi', 'walk', 'manual']);
    expect(route.options[0].routePath).toBeUndefined();
    expect(route.options[1].routePath).toBeUndefined();
    expect(route.options[2].routePath).toBeUndefined();
  });

  it('normalizes Baidu JavaScript API search failures', async () => {
    const api = {
      LocalSearch: class {
        private onSearchComplete: (results: unknown) => void;

        constructor(_city: string, options: { onSearchComplete: (results: unknown) => void }) {
          this.onSearchComplete = options.onSearchComplete;
        }

        getStatus() {
          return 2;
        }

        search() {
          this.onSearchComplete({});
        }
      },
    };
    installBaiduApiLoader(api);

    const provider = new BaiduProvider({ ak: 'test-ak' });

    await expect(provider.searchPlaces({ keyword: '上海博物馆', city: '上海' })).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'searchFailed',
    });
  });

  it('rejects before loading the SDK when no browser AK is configured', async () => {
    const appendChild = vi.spyOn(document.head, 'appendChild');

    await expect(loadBaiduApi({ ak: '' })).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'invalidKey',
    });
    expect(appendChild).not.toHaveBeenCalled();
  });
});
