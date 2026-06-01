import type { TripDay } from '../types/trip';

export interface TripDateRange {
  start: Date;
  end: Date;
}

const dateRangePattern =
  /^\s*(?:(\d{4})\s*(?:[./-]|年)\s*)?(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})\s*日?\s*(?:-|~|至|到)\s*(?:(\d{4})\s*(?:[./-]|年)\s*)?(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})\s*日?\s*$/u;

export const parseTripDateRange = (value: string, fallbackYear = new Date().getFullYear()): TripDateRange | null => {
  const match = value.match(dateRangePattern);
  if (!match) {
    return null;
  }

  const [, startYear, startMonth, startDay, explicitEndYear, endMonth, endDay] = match;
  const inferredStartYear = Number(startYear ?? fallbackYear);
  const start = createLocalDate(inferredStartYear, Number(startMonth), Number(startDay));
  let endYear = Number(explicitEndYear ?? inferredStartYear);
  let end = createLocalDate(endYear, Number(endMonth), Number(endDay));

  if (start && end && !explicitEndYear && end < start) {
    endYear += 1;
    end = createLocalDate(endYear, Number(endMonth), Number(endDay));
  }

  if (!start || !end || end < start) {
    return null;
  }

  return { start, end };
};

export const normalizeTripDateRange = (value: string, fallbackYear?: number): string | null => {
  const range = parseTripDateRange(value, fallbackYear);
  return range ? formatTripDateRange(range.start, range.end) : null;
};

export const formatInputDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatTripDateRange = (start: Date, end: Date): string => {
  const startText = formatDisplayDate(start);
  const endText = start.getFullYear() === end.getFullYear() ? formatDisplayDate(end).slice(5) : formatDisplayDate(end);
  return `${startText} - ${endText}`;
};

export const addTripDays = (days: TripDay[], dateRange: string): TripDay[] => {
  const start = getStartDate(days, dateRange);
  const next = [
    ...days,
    {
      id: createDayId(days),
      label: '',
      date: '',
      stops: [],
      diningStops: [],
      routeSegments: [],
    },
  ];
  return relabelTripDays(next, start);
};

export const deleteTripDayById = (days: TripDay[], dayId: string, dateRange: string): TripDay[] => {
  if (days.length <= 1) {
    return days;
  }
  const next = days.filter((day) => day.id !== dayId);
  return next.length === days.length ? days : relabelTripDays(next, getStartDate(days, dateRange));
};

export const reorderTripDays = (days: TripDay[], dayId: string, targetIndex: number, dateRange: string): TripDay[] => {
  const currentIndex = days.findIndex((day) => day.id === dayId);
  const clampedTargetIndex = clamp(targetIndex, 0, days.length - 1);
  if (currentIndex < 0 || currentIndex === clampedTargetIndex) {
    return days;
  }
  const next = [...days];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(clampedTargetIndex, 0, moved);
  return relabelTripDays(next, getStartDate(days, dateRange));
};

export const syncTripDaysToDateRange = (days: TripDay[], dateRange: string): TripDay[] => {
  const range = parseTripDateRange(dateRange, getFallbackYear(days));
  if (!range) {
    return days;
  }

  const length = getInclusiveDayCount(range.start, range.end);
  const next = days.slice(0, length);
  while (next.length < length) {
    next.push({
      id: createDayId(next),
      label: '',
      date: '',
      stops: [],
      diningStops: [],
      routeSegments: [],
    });
  }
  return relabelTripDays(next, range.start);
};

export const getDateRangeForDays = (days: TripDay[], fallbackDateRange: string): string => {
  if (days.length === 0) {
    return fallbackDateRange;
  }
  const start = parseInputDate(days[0].date);
  const end = parseInputDate(days[days.length - 1].date);
  return start && end ? formatTripDateRange(start, end) : fallbackDateRange;
};

export const relabelTripDays = (days: TripDay[], startDate: Date): TripDay[] =>
  days.map((day, index) => ({
    ...day,
    label: `Day ${index + 1}`,
    date: formatInputDate(addDays(startDate, index)),
  }));

const getStartDate = (days: TripDay[], dateRange: string): Date => {
  const range = parseTripDateRange(dateRange, getFallbackYear(days));
  if (range) {
    return range.start;
  }
  return parseInputDate(days[0]?.date) ?? startOfToday();
};

const parseInputDate = (value: string | undefined): Date | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return null;
  }
  return createLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
};

const createLocalDate = (year: number, month: number, day: number): Date | null => {
  const value = new Date(year, month - 1, day);
  value.setHours(0, 0, 0, 0);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) {
    return null;
  }
  return value;
};

const addDays = (value: Date, days: number): Date => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const getInclusiveDayCount = (start: Date, end: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
};

const formatDisplayDate = (value: Date): string => formatInputDate(value).replaceAll('-', '.');

const getFallbackYear = (days: TripDay[]): number => parseInputDate(days[0]?.date)?.getFullYear() ?? new Date().getFullYear();

const createDayId = (days: TripDay[]): string => {
  const existing = new Set(days.map((day) => day.id));
  let index = days.length + 1;
  let candidate = `day-${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `day-${index}`;
  }
  return candidate;
};

const startOfToday = (): Date => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
