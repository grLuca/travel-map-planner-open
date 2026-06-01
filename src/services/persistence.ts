import type { TripPlan } from '../types/trip';
import { parseImportedTrip, exportTripToJson } from './importExport';

const STORAGE_KEY = 'travel-map-planner:draft';

export const saveTripDraft = (trip: TripPlan): void => {
  window.localStorage.setItem(STORAGE_KEY, exportTripToJson(trip));
};

export const loadTripDraft = (): TripPlan | null => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return parseImportedTrip(raw);
};

export const clearTripDraft = (): void => {
  window.localStorage.removeItem(STORAGE_KEY);
};
