import { describe, expect, it, vi } from 'vitest';
import { shanghaiSampleTrip } from '../data/sampleTrip';
import {
  createTripProjectFromTemplate,
  deleteTripProject,
  duplicateTripProject,
  getTripProjectSummaries,
  PROJECT_LIBRARY_BACKUP_STORAGE_KEY,
  PROJECT_LIBRARY_STORAGE_KEY,
  readTripProjectLibrary,
  saveTripProject,
} from './projectLibrary';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  } as Storage;
};

describe('projectLibrary', () => {
  it('saves and reads trip projects from local storage', () => {
    const storage = createStorage();

    const records = saveTripProject(shanghaiSampleTrip, storage);

    expect(records).toHaveLength(1);
    expect(storage.setItem).toHaveBeenCalledWith(PROJECT_LIBRARY_STORAGE_KEY, expect.any(String));
    expect(readTripProjectLibrary(storage)[0].trip.title).toBe(shanghaiSampleTrip.title);
  });

  it('creates, duplicates, deletes, and summarizes local projects', () => {
    const storage = createStorage();
    const templateDate = new Date('2026-07-01T08:00:00.000Z');
    const copyDate = new Date('2026-07-01T09:00:00.000Z');

    const created = createTripProjectFromTemplate(shanghaiSampleTrip, templateDate);
    const copied = duplicateTripProject(created, copyDate);
    saveTripProject(created, storage);
    saveTripProject(copied, storage);

    expect(created.id).not.toBe(shanghaiSampleTrip.id);
    expect(created.title).toBe('新建旅行规划');
    expect(copied.id).not.toBe(created.id);
    expect(copied.title).toBe('新建旅行规划 副本');
    expect(getTripProjectSummaries(readTripProjectLibrary(storage))).toEqual([
      expect.objectContaining({ id: copied.id, stopCount: 6 }),
      expect.objectContaining({ id: created.id, dayCount: 4 }),
    ]);

    const nextRecords = deleteTripProject(copied.id, storage);
    expect(nextRecords.map((record) => record.id)).toEqual([created.id]);
  });

  it('keeps a rolling raw backup before overwriting the local project library', () => {
    const storage = createStorage();
    const created = createTripProjectFromTemplate(shanghaiSampleTrip, new Date('2026-07-01T08:00:00.000Z'));
    const copied = duplicateTripProject(created, new Date('2026-07-01T09:00:00.000Z'));

    saveTripProject(created, storage);
    const firstRaw = storage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
    saveTripProject(copied, storage);

    const backups = JSON.parse(storage.getItem(PROJECT_LIBRARY_BACKUP_STORAGE_KEY) ?? '[]') as Array<{ raw: string }>;
    expect(backups).toHaveLength(1);
    expect(backups[0].raw).toBe(firstRaw);
  });

  it('still saves the project library when writing the raw backup exceeds storage quota', () => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      clear: vi.fn(() => values.clear()),
      key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
      setItem: vi.fn((key: string, value: string) => {
        if (key === PROJECT_LIBRARY_BACKUP_STORAGE_KEY) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        values.set(key, value);
      }),
    } as Storage;
    const created = createTripProjectFromTemplate(shanghaiSampleTrip, new Date('2026-07-01T08:00:00.000Z'));
    const copied = duplicateTripProject(created, new Date('2026-07-01T09:00:00.000Z'));

    saveTripProject(created, storage);
    const records = saveTripProject(copied, storage);

    expect(records.map((record) => record.id)).toEqual([copied.id, created.id]);
    expect(readTripProjectLibrary(storage).map((record) => record.id)).toEqual([copied.id, created.id]);
  });

  it('drops old raw backups and retries when the primary project library write exceeds storage quota', () => {
    const values = new Map<string, string>([[PROJECT_LIBRARY_BACKUP_STORAGE_KEY, 'large-backup-payload']]);
    const storage = {
      get length() {
        return values.size;
      },
      clear: vi.fn(() => values.clear()),
      key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
      setItem: vi.fn((key: string, value: string) => {
        if (key === PROJECT_LIBRARY_STORAGE_KEY && values.has(PROJECT_LIBRARY_BACKUP_STORAGE_KEY)) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        values.set(key, value);
      }),
    } as Storage;
    const trip = createTripProjectFromTemplate(shanghaiSampleTrip, new Date('2026-07-01T08:00:00.000Z'));

    const records = saveTripProject(trip, storage);

    expect(records.map((record) => record.id)).toEqual([trip.id]);
    expect(storage.removeItem).toHaveBeenCalledWith(PROJECT_LIBRARY_BACKUP_STORAGE_KEY);
    expect(readTripProjectLibrary(storage).map((record) => record.id)).toEqual([trip.id]);
  });
});
