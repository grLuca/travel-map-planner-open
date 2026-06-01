import { getDefaultCityCenter } from '../data/cityPresets';
import type { DiningStop, DiningType, RouteSegment, TripDay, TripPlan } from '../types/trip';

export const TRIP_EXPORT_VERSION = 3;
const SUPPORTED_EXPORT_VERSIONS = [2, 3];

interface TripPlanExport {
  version: typeof TRIP_EXPORT_VERSION;
  exportedAt: string;
  trip: TripPlan;
}

export const exportTripToJson = (trip: TripPlan): string =>
  JSON.stringify(
    {
      version: TRIP_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      trip,
    } satisfies TripPlanExport,
    null,
    2,
  );

export const parseImportedTrip = (payload: string): TripPlan => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('旅行方案格式无效：JSON 无法解析');
  }

  const candidate = unwrapTripExport(parsed);
  if (!isTripPlan(candidate)) {
    throw new Error('旅行方案格式无效：缺少必要字段');
  }

  return normalizeImportedTrip(candidate);
};

export const exportTripToMarkdown = (trip: TripPlan): string => {
  const lines = [`# ${trip.title}`, '', `日期：${trip.dateRange}`, `城市：${trip.city}`, ''];

  for (const day of trip.days) {
    lines.push(`## ${day.label}`, '');
    if (day.stops.length === 0) {
      lines.push('- 暂无点位', '');
      continue;
    }

    day.stops.forEach((stop, index) => {
      lines.push(`- ${stop.startTime} ${stop.name}（停留 ${stop.stayMinutes} 分钟）`);
      if (stop.note) {
        lines.push(`  - 备注：${stop.note}`);
      }

      const nextStop = day.stops[index + 1];
      const segment = nextStop
        ? day.routeSegments.find((item) => item.fromStopId === stop.id && item.toStopId === nextStop.id)
        : undefined;
      const option = segment?.options.find((item) => item.id === segment.selectedOptionId);
      if (segment && option) {
        lines.push(`  - ${stop.name} → ${nextStop.name}：${option.title}，${option.durationMinutes} 分钟，${option.costCny} 元`);
      }
    });

    lines.push('');
  }

  return lines.join('\n').trimEnd();
};

const isTripPlan = (value: unknown): value is TripPlan => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TripPlan>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.city === 'string' &&
    (candidate.center === undefined || isLngLat(candidate.center)) &&
    typeof candidate.dateRange === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.alternatives) &&
    candidate.days.every(isTripDay) &&
    candidate.alternatives.every(isTripStop)
  );
};

const unwrapTripExport = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const candidate = value as Partial<TripPlanExport>;
  if ('version' in candidate || 'trip' in candidate) {
    return typeof candidate.version === 'number' && SUPPORTED_EXPORT_VERSIONS.includes(candidate.version) ? candidate.trip : null;
  }

  return value;
};

const normalizeImportedTrip = (trip: TripPlan): TripPlan => ({
  ...trip,
  center: trip.center ?? getDefaultCityCenter(trip.city),
  days: trip.days.map((day) => {
    const legacyDay = day as TripDay & { diningStops?: DiningStop[] };
    return {
      ...day,
      diningStops: (legacyDay.diningStops ?? []).map((stop) => ({
        ...stop,
        averagePriceCny: stop.averagePriceCny ?? 0,
      })),
      routeSegments: day.routeSegments.map((segment) => {
        const legacySegment = segment as RouteSegment & { planningNote?: string };
        return {
          ...segment,
          planningNote: legacySegment.planningNote ?? '',
        };
      }),
    };
  }),
});

const isTripDay = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const day = value as Record<string, unknown>;
  return (
    typeof day.id === 'string' &&
    typeof day.label === 'string' &&
    typeof day.date === 'string' &&
    Array.isArray(day.stops) &&
    (day.diningStops === undefined || (Array.isArray(day.diningStops) && day.diningStops.every(isDiningStop))) &&
    Array.isArray(day.routeSegments) &&
    day.stops.every(isTripStop) &&
    day.routeSegments.every(isRouteSegment)
  );
};

const isDiningStop = (value: unknown): value is DiningStop => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const stop = value as Record<string, unknown>;
  return (
    typeof stop.id === 'string' &&
    typeof stop.placeId === 'string' &&
    typeof stop.name === 'string' &&
    typeof stop.address === 'string' &&
    typeof stop.city === 'string' &&
    isLngLat(stop.lngLat) &&
    isDiningType(stop.diningType) &&
    typeof stop.startTime === 'string' &&
    (stop.averagePriceCny === undefined || typeof stop.averagePriceCny === 'number') &&
    typeof stop.note === 'string' &&
    Array.isArray(stop.tags) &&
    stop.tags.every((tag) => typeof tag === 'string') &&
    (stop.source === 'mock' || stop.source === 'amap' || stop.source === 'baidu' || stop.source === 'manual')
  );
};

const isTripStop = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const stop = value as Record<string, unknown>;
  return (
    typeof stop.id === 'string' &&
    typeof stop.placeId === 'string' &&
    typeof stop.name === 'string' &&
    typeof stop.address === 'string' &&
    typeof stop.city === 'string' &&
    isLngLat(stop.lngLat) &&
    typeof stop.startTime === 'string' &&
    typeof stop.stayMinutes === 'number' &&
    typeof stop.note === 'string' &&
    Array.isArray(stop.tags) &&
    stop.tags.every((tag) => typeof tag === 'string') &&
    (stop.kind === undefined || stop.kind === 'default' || stop.kind === 'accommodation') &&
    (stop.priority === 'must' || stop.priority === 'nice') &&
    (stop.source === 'mock' || stop.source === 'amap' || stop.source === 'baidu' || stop.source === 'manual')
  );
};

const isRouteSegment = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const segment = value as Record<string, unknown>;
  return (
    typeof segment.id === 'string' &&
    typeof segment.fromStopId === 'string' &&
    typeof segment.toStopId === 'string' &&
    (segment.status === 'ready' || segment.status === 'loading' || segment.status === 'stale' || segment.status === 'failed') &&
    isTransportMode(segment.selectedMode) &&
    typeof segment.selectedOptionId === 'string' &&
    Array.isArray(segment.options) &&
    segment.options.every(isTransportOption) &&
    (segment.warning === undefined || typeof segment.warning === 'string') &&
    (segment.planningNote === undefined || typeof segment.planningNote === 'string')
  );
};

const isTransportOption = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const option = value as Record<string, unknown>;
  return (
    typeof option.id === 'string' &&
    isTransportMode(option.mode) &&
    typeof option.title === 'string' &&
    typeof option.durationMinutes === 'number' &&
    typeof option.costCny === 'number' &&
    typeof option.walkingMeters === 'number' &&
    typeof option.transfers === 'number' &&
    typeof option.description === 'string' &&
    (option.isRecommended === undefined || typeof option.isRecommended === 'boolean') &&
    (option.unavailableReason === undefined || typeof option.unavailableReason === 'string') &&
    (option.routePath === undefined || (Array.isArray(option.routePath) && option.routePath.every(isLngLat)))
  );
};

const isTransportMode = (value: unknown): boolean => value === 'transit' || value === 'taxi' || value === 'walk' || value === 'manual';

const isDiningType = (value: unknown): value is DiningType =>
  value === 'breakfast' ||
  value === 'lunch' ||
  value === 'dinner' ||
  value === 'dessert' ||
  value === 'snack' ||
  value === 'coffee' ||
  value === 'lateNight' ||
  value === 'other';

const isLngLat = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]) &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[1]);
