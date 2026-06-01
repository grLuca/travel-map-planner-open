import type { TripPlan } from '../types/trip';
import { exportTripToJson, parseImportedTrip } from './importExport';

export const PROJECT_LIBRARY_STORAGE_KEY = 'travel-map-planner:projects:v1';
export const PROJECT_LIBRARY_BACKUP_STORAGE_KEY = 'travel-map-planner:projects:v1:backups';
const MAX_PROJECT_LIBRARY_BACKUPS = 5;

export interface TripProjectRecord {
  id: string;
  trip: TripPlan;
  createdAt: string;
  updatedAt: string;
}

export interface TripProjectSummary {
  id: string;
  title: string;
  city: string;
  dateRange: string;
  updatedAt: string;
  dayCount: number;
  stopCount: number;
  alternativeCount: number;
}

export const readTripProjectLibrary = (storage = getLocalStorage()): TripProjectRecord[] => {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => parseProjectRecord(item))
      .filter((item): item is TripProjectRecord => Boolean(item))
      .sort(sortByUpdatedAtDesc);
  } catch {
    return [];
  }
};

export const saveTripProject = (trip: TripPlan, storage = getLocalStorage()): TripProjectRecord[] => {
  const updatedTrip = cloneTrip(trip);
  const existingRecords = readTripProjectLibrary(storage);
  const existing = existingRecords.find((record) => record.id === updatedTrip.id);
  const record: TripProjectRecord = {
    id: updatedTrip.id,
    trip: updatedTrip,
    createdAt: existing?.createdAt ?? updatedTrip.updatedAt,
    updatedAt: updatedTrip.updatedAt,
  };
  const nextRecords = [record, ...existingRecords.filter((item) => item.id !== updatedTrip.id)].sort(sortByUpdatedAtDesc);
  writeTripProjectLibrary(nextRecords, storage);
  return nextRecords;
};

export const deleteTripProject = (projectId: string, storage = getLocalStorage()): TripProjectRecord[] => {
  const nextRecords = readTripProjectLibrary(storage).filter((record) => record.id !== projectId);
  writeTripProjectLibrary(nextRecords, storage);
  return nextRecords;
};

export const createTripProjectFromTemplate = (template: TripPlan, now = new Date()): TripPlan => ({
  ...cloneTrip(template),
  id: createProjectId(now),
  title: '新建旅行规划',
  updatedAt: now.toISOString(),
});

export const duplicateTripProject = (trip: TripPlan, now = new Date()): TripPlan => ({
  ...cloneTrip(trip),
  id: createProjectId(now),
  title: `${trip.title} 副本`,
  updatedAt: now.toISOString(),
});

export const getTripProjectSummaries = (records: TripProjectRecord[]): TripProjectSummary[] =>
  records.map((record) => ({
    id: record.id,
    title: record.trip.title,
    city: record.trip.city,
    dateRange: record.trip.dateRange,
    updatedAt: record.updatedAt,
    dayCount: record.trip.days.length,
    stopCount: record.trip.days.reduce((total, day) => total + day.stops.length, 0),
    alternativeCount: record.trip.alternatives.length,
  }));

const writeTripProjectLibrary = (records: TripProjectRecord[], storage = getLocalStorage()): void => {
  if (!storage) {
    return;
  }
  const nextRaw = JSON.stringify(records);
  const previousRaw = storage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
  if (previousRaw && previousRaw !== nextRaw) {
    tryWriteProjectLibraryBackup(previousRaw, storage);
  }
  writePrimaryProjectLibrary(nextRaw, storage);
};

const tryWriteProjectLibraryBackup = (raw: string, storage: Storage): void => {
  try {
    writeProjectLibraryBackup(raw, storage);
  } catch {
    // Backups are a safety net; they must not prevent the primary project library from being saved.
  }
};

const writePrimaryProjectLibrary = (raw: string, storage: Storage): void => {
  try {
    storage.setItem(PROJECT_LIBRARY_STORAGE_KEY, raw);
  } catch (error) {
    if (!isStorageQuotaExceeded(error) || !storage.getItem(PROJECT_LIBRARY_BACKUP_STORAGE_KEY)) {
      throw error;
    }
    storage.removeItem(PROJECT_LIBRARY_BACKUP_STORAGE_KEY);
    storage.setItem(PROJECT_LIBRARY_STORAGE_KEY, raw);
  }
};

const isStorageQuotaExceeded = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

const writeProjectLibraryBackup = (raw: string, storage: Storage): void => {
  const backups = readProjectLibraryBackups(storage);
  const nextBackups = [{ savedAt: new Date().toISOString(), raw }, ...backups.filter((backup) => backup.raw !== raw)].slice(
    0,
    MAX_PROJECT_LIBRARY_BACKUPS,
  );
  storage.setItem(PROJECT_LIBRARY_BACKUP_STORAGE_KEY, JSON.stringify(nextBackups));
};

const readProjectLibraryBackups = (storage: Storage): Array<{ savedAt: string; raw: string }> => {
  const raw = storage.getItem(PROJECT_LIBRARY_BACKUP_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is { savedAt: string; raw: string } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { savedAt?: unknown }).savedAt === 'string' &&
        typeof (item as { raw?: unknown }).raw === 'string',
    );
  } catch {
    return [];
  }
};

const parseProjectRecord = (item: unknown): TripProjectRecord | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const candidate = item as Partial<TripProjectRecord>;
  if (!candidate.trip) {
    return null;
  }

  try {
    const trip = parseImportedTrip(exportTripToJson(candidate.trip));
    const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : trip.updatedAt;
    const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : updatedAt;
    return { id: trip.id, trip, createdAt, updatedAt };
  } catch {
    return null;
  }
};

const cloneTrip = (trip: TripPlan): TripPlan => parseImportedTrip(exportTripToJson(trip));

const createProjectId = (now: Date): string => `trip-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`;

const sortByUpdatedAtDesc = (first: TripProjectRecord, second: TripProjectRecord): number =>
  Date.parse(second.updatedAt) - Date.parse(first.updatedAt);

const getLocalStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.localStorage;
};
