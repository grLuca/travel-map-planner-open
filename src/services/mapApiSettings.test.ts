import { describe, expect, it, vi } from 'vitest';
import { MAP_API_SETTINGS_STORAGE_KEY, readMapApiSettings, saveMapApiSettings } from './mapApiSettings';

const createStorage = (initialValue?: string): Storage => {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(MAP_API_SETTINGS_STORAGE_KEY, initialValue);
  }

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
};

describe('mapApiSettings', () => {
  it('reads a trimmed Baidu browser AK from local storage', () => {
    const storage = createStorage(JSON.stringify({ baiduBrowserAk: '  test-baidu-ak  ' }));

    expect(readMapApiSettings(storage)).toEqual({ baiduBrowserAk: 'test-baidu-ak' });
  });

  it('falls back to empty settings when storage is missing or malformed', () => {
    expect(readMapApiSettings(createStorage())).toEqual({ baiduBrowserAk: '' });
    expect(readMapApiSettings(createStorage('{bad json'))).toEqual({ baiduBrowserAk: '' });
  });

  it('saves sanitized map API settings without exposing extra fields', () => {
    const storage = createStorage();

    const settings = saveMapApiSettings({ baiduBrowserAk: '  test-baidu-ak  ' }, storage);

    expect(settings).toEqual({ baiduBrowserAk: 'test-baidu-ak' });
    expect(storage.setItem).toHaveBeenCalledWith(
      MAP_API_SETTINGS_STORAGE_KEY,
      JSON.stringify({ baiduBrowserAk: 'test-baidu-ak' }),
    );
  });
});
