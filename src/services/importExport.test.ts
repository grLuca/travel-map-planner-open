import { describe, expect, it } from 'vitest';
import { shanghaiSampleTrip } from '../data/sampleTrip';
import { isAccommodationStop } from '../types/stopKinds';
import type { TripPlan } from '../types/trip';
import { TRIP_EXPORT_VERSION, exportTripToJson, exportTripToMarkdown, parseImportedTrip } from './importExport';

const omitPlanningNote = (segment: TripPlan['days'][number]['routeSegments'][number]) => {
  const { planningNote, ...legacySegment } = segment;
  void planningNote;
  return legacySegment;
};

describe('importExport', () => {
  it('round-trips a trip plan through JSON export and import', () => {
    const exported = exportTripToJson(shanghaiSampleTrip);
    const imported = parseImportedTrip(exported);

    expect(imported.title).toBe(shanghaiSampleTrip.title);
    expect(imported.days[0].stops.map((stop) => stop.name)).toEqual(
      shanghaiSampleTrip.days[0].stops.map((stop) => stop.name),
    );
    expect(imported.days[0].routeSegments[1].selectedMode).toBe('transit');
  });

  it('wraps JSON exports with a schema version while preserving legacy imports', () => {
    const exported = exportTripToJson(shanghaiSampleTrip);
    const parsed = JSON.parse(exported) as { version: number; trip: unknown };

    expect(parsed.version).toBe(TRIP_EXPORT_VERSION);
    expect(parsed.trip).toMatchObject({ id: shanghaiSampleTrip.id, title: shanghaiSampleTrip.title });
    expect(parseImportedTrip(JSON.stringify(shanghaiSampleTrip)).id).toBe(shanghaiSampleTrip.id);
  });

  it('preserves explicit accommodation stop kinds and still accepts legacy stops without a kind', () => {
    const tripWithAccommodation = {
      ...shanghaiSampleTrip,
      days: shanghaiSampleTrip.days.map((day, dayIndex) =>
        dayIndex === 0
          ? {
              ...day,
              stops: day.stops.map((stop, stopIndex) =>
                stopIndex === 0 ? { ...stop, name: '巨鹿路 80 弄', tags: [], kind: 'accommodation' as const } : stop,
              ),
            }
          : day,
      ),
    };

    const imported = parseImportedTrip(exportTripToJson(tripWithAccommodation));
    const legacyImported = parseImportedTrip(
      JSON.stringify({
        ...shanghaiSampleTrip,
        days: shanghaiSampleTrip.days.map((day, dayIndex) =>
          dayIndex === 0
            ? {
                ...day,
                stops: day.stops.map((stop, stopIndex) =>
                  stopIndex === 0 ? { ...stop, tags: ['hotel'] } : stop,
                ),
              }
            : day,
        ),
      }),
    );

    expect(imported.days[0].stops[0].kind).toBe('accommodation');
    expect(isAccommodationStop(imported.days[0].stops[0])).toBe(true);
    expect(legacyImported.days[0].stops[0].kind).toBeUndefined();
    expect(isAccommodationStop(legacyImported.days[0].stops[0])).toBe(true);
  });

  it('imports Baidu-sourced stops and route geometry from saved drafts', () => {
    const trip = {
      ...shanghaiSampleTrip,
      days: [
        {
          ...shanghaiSampleTrip.days[0],
          stops: [{ ...shanghaiSampleTrip.days[0].stops[0], source: 'baidu' as const }],
          routeSegments: [
            {
              ...shanghaiSampleTrip.days[0].routeSegments[0],
              options: [
                {
                  ...shanghaiSampleTrip.days[0].routeSegments[0].options[0],
                  routePath: [
                    [121.4396, 31.2132],
                    [121.4462, 31.2116],
                  ] as [number, number][],
                },
              ],
            },
          ],
        },
      ],
    };

    const imported = parseImportedTrip(exportTripToJson(trip));

    expect(imported.days[0].stops[0].source).toBe('baidu');
    expect(imported.days[0].routeSegments[0].options[0].routePath).toEqual([
      [121.4396, 31.2132],
      [121.4462, 31.2116],
    ]);
  });

  it('normalizes older project exports with missing dining stops and route notes', () => {
    const legacyExport = {
      version: 2,
      exportedAt: '2026-05-20T00:00:00.000Z',
      trip: {
        ...shanghaiSampleTrip,
        days: shanghaiSampleTrip.days.map((day) => ({
          ...day,
          diningStops:
            day.id === shanghaiSampleTrip.days[0].id
              ? [
                  {
                    id: 'legacy-dining',
                    placeId: 'legacy-dining',
                    name: '老版本餐饮',
                    address: '上海',
                    city: '上海',
                    lngLat: [121.47, 31.23],
                    diningType: 'lunch',
                    startTime: '12:00',
                    note: '',
                    tags: ['午餐'],
                    source: 'manual',
                  },
                ]
              : day.diningStops,
          routeSegments: day.routeSegments.map(omitPlanningNote),
        })),
      },
    };

    const imported = parseImportedTrip(JSON.stringify(legacyExport));

    expect(imported.days[0].diningStops[0].averagePriceCny).toBe(0);
    expect(imported.days[0].routeSegments[0].planningNote).toBe('');
  });

  it('exports a readable markdown itinerary with transport summaries', () => {
    const markdown = exportTripToMarkdown(shanghaiSampleTrip);

    expect(markdown).toContain('# 上海 4 日旅行规划');
    expect(markdown).toContain('## Day 1');
    expect(markdown).toContain('- 09:30 武康路历史风貌区');
    expect(markdown).toContain('安福路 → 上海博物馆东馆：地铁 10 号线 → 2 号线');
  });

  it('rejects invalid import payloads with a validation error', () => {
    expect(() => parseImportedTrip('{"title": "broken"}')).toThrow(/旅行方案格式无效/);
  });

  it('rejects malformed nested stop and route data before it reaches state', () => {
    const malformed = {
      version: TRIP_EXPORT_VERSION,
      trip: {
        ...shanghaiSampleTrip,
        days: [
          {
            ...shanghaiSampleTrip.days[0],
            stops: [{ ...shanghaiSampleTrip.days[0].stops[0], lngLat: ['121.4', 31.2] }],
          },
        ],
      },
    };

    expect(() => parseImportedTrip(JSON.stringify(malformed))).toThrow(/旅行方案格式无效/);
  });
});
