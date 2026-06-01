import type { TripStop } from './trip';

export type StopMarkerKind = 'default' | 'accommodation';

const accommodationHints = ['住宿', '酒店', '宾馆', '民宿', '客栈', '旅馆', 'hotel', 'hostel', 'inn'];

export const getStopMarkerKind = (stop: TripStop): StopMarkerKind => {
  if (stop.kind) {
    return stop.kind === 'accommodation' ? 'accommodation' : 'default';
  }

  const haystack = [stop.name, stop.address, ...stop.tags].join(' ').toLocaleLowerCase('zh-CN');
  return accommodationHints.some((hint) => haystack.includes(hint.toLocaleLowerCase('zh-CN'))) ? 'accommodation' : 'default';
};

export const isAccommodationStop = (stop: TripStop): boolean => getStopMarkerKind(stop) === 'accommodation';

export const getVisibleStopMarkerOrder = (stops: TripStop[], stopIndex: number): number | null => {
  const stop = stops[stopIndex];
  if (!stop || getStopMarkerKind(stop) === 'accommodation') {
    return null;
  }

  let order = 0;
  for (let index = 0; index <= stopIndex; index += 1) {
    if (getStopMarkerKind(stops[index]) === 'accommodation') {
      order = 0;
      continue;
    }
    order += 1;
  }
  return order;
};
