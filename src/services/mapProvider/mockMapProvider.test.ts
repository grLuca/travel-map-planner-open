import { describe, expect, it } from 'vitest';
import { MapProviderError } from './types';
import { MockMapProvider } from './mockMapProvider';

describe('MockMapProvider', () => {
  it('searches Shanghai places by keyword without leaking vendor response shapes', async () => {
    const provider = new MockMapProvider();

    const results = await provider.searchPlaces({ keyword: '武康路', city: '上海' });

    expect(results[0]).toMatchObject({
      name: '武康路历史风貌区',
      city: '上海',
      source: 'mock',
    });
    expect(results[0]).not.toHaveProperty('adcode');
  });

  it('returns an empty list for no-result searches', async () => {
    const provider = new MockMapProvider();

    const results = await provider.searchPlaces({ keyword: '不存在的小众美术馆zzzz', city: '上海' });

    expect(results).toEqual([]);
  });

  it('plans transit, taxi, walk, and manual route options', async () => {
    const provider = new MockMapProvider();

    const route = await provider.planRoute({
      origin: [121.4462, 31.2116],
      destination: [121.544, 31.227],
      mode: 'transit',
      city: '上海',
    });

    expect(route.status).toBe('ready');
    expect(route.options.map((option) => option.mode)).toEqual(['transit', 'taxi', 'walk', 'manual']);
    expect(route.options[0]).toMatchObject({ isRecommended: true, costCny: 4 });
  });

  it('normalizes failures into typed map provider errors', async () => {
    const provider = new MockMapProvider({ failRoutes: true, failureCode: 'quotaExceeded' });

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
    } satisfies Partial<MapProviderError>);
  });
});
