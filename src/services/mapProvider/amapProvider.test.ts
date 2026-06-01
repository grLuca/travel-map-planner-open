import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmapProvider } from './amapProvider';

describe('AmapProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches through the local proxy and returns normalized place results', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: 'B001',
              name: '上海博物馆东馆',
              address: '世纪大道 1952 号',
              city: '上海',
              lngLat: [121.544, 31.227],
              source: 'amap',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const provider = new AmapProvider('/api/amap');
    const results = await provider.searchPlaces({ keyword: '上海博物馆', city: '上海' });

    expect(fetch).toHaveBeenCalledWith('/api/amap/search?keyword=%E4%B8%8A%E6%B5%B7%E5%8D%9A%E7%89%A9%E9%A6%86&city=%E4%B8%8A%E6%B5%B7');
    expect(results[0]).toEqual({
      id: 'B001',
      name: '上海博物馆东馆',
      address: '世纪大道 1952 号',
      city: '上海',
      lngLat: [121.544, 31.227],
      source: 'amap',
    });
    expect(results[0]).not.toHaveProperty('adcode');
  });

  it('normalizes proxy errors into typed map provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 'quotaExceeded', message: '高德配额超限' }), { status: 429 })),
    );

    const provider = new AmapProvider('/api/amap');

    await expect(
      provider.planRoute({
        origin: [121.4462, 31.2116],
        destination: [121.544, 31.227],
        mode: 'transit',
        city: '上海',
      }),
    ).rejects.toMatchObject({
      name: 'MapProviderError',
      code: 'quotaExceeded',
      recoverable: true,
    });
  });
});
