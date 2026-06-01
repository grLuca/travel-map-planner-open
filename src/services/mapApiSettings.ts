export interface MapApiSettings {
  baiduBrowserAk: string;
}

export const MAP_API_SETTINGS_STORAGE_KEY = 'travel-map-planner:map-api-settings:v1';

const emptyMapApiSettings: MapApiSettings = {
  baiduBrowserAk: '',
};

export const readMapApiSettings = (storage = getBrowserStorage()): MapApiSettings => {
  if (!storage) {
    return { ...emptyMapApiSettings };
  }

  try {
    const raw = storage.getItem(MAP_API_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...emptyMapApiSettings };
    }
    return sanitizeMapApiSettings(JSON.parse(raw));
  } catch {
    return { ...emptyMapApiSettings };
  }
};

export const saveMapApiSettings = (settings: MapApiSettings, storage = getBrowserStorage()): MapApiSettings => {
  const sanitized = sanitizeMapApiSettings(settings);
  storage?.setItem(MAP_API_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
};

export const getConfiguredBaiduBrowserAk = (settings = readMapApiSettings()): string =>
  settings.baiduBrowserAk || getEnvBaiduBrowserAk();

export const hasConfiguredBaiduBrowserAk = (settings = readMapApiSettings()): boolean =>
  getConfiguredBaiduBrowserAk(settings).length > 0;

const sanitizeMapApiSettings = (value: unknown): MapApiSettings => {
  const settings = value && typeof value === 'object' ? (value as Partial<MapApiSettings>) : {};
  return {
    baiduBrowserAk: String(settings.baiduBrowserAk ?? '').trim(),
  };
};

const getEnvBaiduBrowserAk = (): string => String(import.meta.env.VITE_BAIDU_BROWSER_AK ?? '').trim();

const getBrowserStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
