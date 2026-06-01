import http from 'node:http';
import { URL } from 'node:url';

try {
  process.loadEnvFile?.();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    console.warn(`Unable to load .env: ${error?.message ?? String(error)}`);
  }
}

const port = Number(process.env.AMAP_PROXY_PORT ?? 8787);
const amapKey = process.env.AMAP_WEB_SERVICE_KEY;
const amapBase = 'https://restapi.amap.com';

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://127.0.0.1:5173',
  });
  res.end(JSON.stringify(payload));
};

const requireKey = (res) => {
  if (amapKey) {
    return true;
  }
  sendJson(res, 503, {
    code: 'invalidKey',
    message: '缺少 AMAP_WEB_SERVICE_KEY 环境变量。',
    recoverable: false,
  });
  return false;
};

const proxyError = (code, message, recoverable = true) => ({ code, message, recoverable });

const mapAmapInfocode = (status, info, infocode) => {
  if (status === 429 || infocode === '10029') {
    return proxyError('quotaExceeded', info || '高德地图配额超限。');
  }
  if (infocode === '10001' || infocode === '10009') {
    return proxyError('invalidKey', info || '高德地图 Key 无效。', false);
  }
  if (infocode === '10021') {
    return proxyError('quotaExceeded', info || '高德地图并发或访问量受限。');
  }
  return proxyError('network', info || '高德地图服务请求失败。');
};

const requestAmap = async (path, params) => {
  const url = new URL(path, amapBase);
  url.searchParams.set('key', amapKey);
  url.searchParams.set('output', 'json');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.status === '0') {
    const mapped = mapAmapInfocode(response.status, payload.info, payload.infocode);
    const error = new Error(mapped.message);
    error.payload = mapped;
    throw error;
  }
  return payload;
};

const normalizePlace = (poi) => {
  const [lng, lat] = String(poi.location ?? '').split(',').map(Number);
  return {
    id: String(poi.id ?? `${poi.name}-${poi.location}`),
    name: String(poi.name ?? ''),
    address: Array.isArray(poi.address) ? poi.address.join('') : String(poi.address ?? ''),
    city: String(poi.cityname ?? poi.city ?? ''),
    lngLat: [lng, lat],
    source: 'amap',
  };
};

const routeOption = (id, mode, title, durationSeconds, costCny, walkingMeters, transfers, description, isRecommended = false, routePath) => ({
  id,
  mode,
  title,
  durationMinutes: Math.max(1, Math.round(Number(durationSeconds ?? 0) / 60)),
  costCny: Math.round(Number(costCny ?? 0)),
  walkingMeters: Math.round(Number(walkingMeters ?? 0)),
  transfers,
  description,
  isRecommended,
  ...(routePath?.length >= 2 ? { routePath } : {}),
});

const normalizeTransitOptions = (payload) => {
  const transits = payload.route?.transits ?? payload.transits ?? [];
  return transits.slice(0, 3).map((transit, index) => {
    const segments = transit.segments ?? [];
    const busNames = segments
      .map((segment) => segment.bus?.buslines?.[0]?.name)
      .filter(Boolean)
      .slice(0, 3);
    const title = busNames.length > 0 ? busNames.join(' → ') : '公交/地铁';
    const walkingMeters = segments.reduce((sum, segment) => sum + Number(segment.walking?.distance ?? 0), 0);
    const routePath = segments.flatMap((segment) => [
      ...parseAmapPolyline(segment.walking?.steps?.map((step) => step.polyline).filter(Boolean).join(';')),
      ...parseAmapPolyline(segment.bus?.buslines?.[0]?.polyline),
    ]);
    return routeOption(
      `amap-transit-${index + 1}`,
      'transit',
      title,
      transit.duration,
      transit.cost,
      walkingMeters,
      Math.max(0, busNames.length - 1),
      busNames.length > 0 ? busNames.join(' · ') : '高德公交路线',
      index === 0,
      routePath,
    );
  });
};

const normalizeDrivingOptions = (payload) => {
  const paths = payload.route?.paths ?? [];
  return paths.slice(0, 2).map((path, index) =>
    routeOption(
      `amap-taxi-${index + 1}`,
      'taxi',
      '打车',
      path.duration,
      estimateTaxiCost(Number(path.distance ?? 0)),
      120,
      0,
      `约 ${(Number(path.distance ?? 0) / 1000).toFixed(1)} km，费用为估算值。`,
      false,
      parseAmapPolyline(path.steps?.map((step) => step.polyline).filter(Boolean).join(';')),
    ),
  );
};

const normalizeWalkingOptions = (payload) => {
  const paths = payload.route?.paths ?? [];
  return paths.slice(0, 1).map((path, index) =>
    routeOption(
      `amap-walk-${index + 1}`,
      'walk',
      '步行',
      path.duration,
      0,
      Number(path.distance ?? 0),
      0,
      `约 ${(Number(path.distance ?? 0) / 1000).toFixed(1)} km。`,
      false,
      parseAmapPolyline(path.steps?.map((step) => step.polyline).filter(Boolean).join(';')),
    ),
  );
};

const parseAmapPolyline = (polyline) =>
  String(polyline ?? '')
    .split(';')
    .map((item) => item.split(',').map(Number))
    .filter((point) => point.length === 2 && point.every(Number.isFinite));

const manualOption = {
  id: 'amap-manual',
  mode: 'manual',
  title: '手动填写',
  durationMinutes: 0,
  costCny: 0,
  walkingMeters: 0,
  transfers: 0,
  description: '地图路线不可用时手动记录交通方式。',
};

const estimateTaxiCost = (meters) => Math.max(16, Math.round(meters * 0.004 + 14));

const handleSearch = async (url, res) => {
  if (!requireKey(res)) {
    return;
  }

  const keyword = url.searchParams.get('keyword')?.trim() ?? '';
  if (!keyword) {
    sendJson(res, 200, { places: [] });
    return;
  }

  const payload = await requestAmap('/v3/place/text', {
    keywords: keyword,
    city: url.searchParams.get('city') ?? '',
    citylimit: true,
    offset: 10,
    page: 1,
    extensions: 'base',
  });
  sendJson(res, 200, {
    places: (payload.pois ?? []).map(normalizePlace).filter((place) => Number.isFinite(place.lngLat[0]) && Number.isFinite(place.lngLat[1])),
  });
};

const handleRoute = async (url, res) => {
  if (!requireKey(res)) {
    return;
  }

  const origin = url.searchParams.get('origin');
  const destination = url.searchParams.get('destination');
  const city = url.searchParams.get('city') ?? '上海';
  if (!origin || !destination) {
    sendJson(res, 400, proxyError('coordinateFailed', '缺少起点或终点坐标。'));
    return;
  }

  const cityCode = city === '上海' ? '021' : city;
  const [transit, driving, walking] = await Promise.allSettled([
    requestAmap('/v3/direction/transit/integrated', { origin, destination, city: cityCode, cityd: cityCode, strategy: 0 }),
    requestAmap('/v3/direction/driving', { origin, destination, strategy: 0, extensions: 'base' }),
    requestAmap('/v3/direction/walking', { origin, destination }),
  ]);

  const options = [];
  if (transit.status === 'fulfilled') {
    options.push(...normalizeTransitOptions(transit.value));
  }
  if (driving.status === 'fulfilled') {
    options.push(...normalizeDrivingOptions(driving.value));
  }
  if (walking.status === 'fulfilled') {
    options.push(...normalizeWalkingOptions(walking.value));
  }
  options.push(manualOption);

  if (options.every((option) => option.mode !== 'transit')) {
    const transitError = transit.status === 'rejected' ? transit.reason?.payload : null;
    sendJson(res, transitError?.code === 'quotaExceeded' ? 429 : 404, transitError ?? proxyError('noTransitRoute', '未找到公交路线。'));
    return;
  }

  sendJson(res, 200, {
    status: 'ready',
    provider: 'amap',
    cached: false,
    options,
    warning: options.some((option) => option.mode === 'taxi' || option.mode === 'walk') ? undefined : '仅返回公交方案',
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/amap/search') {
      await handleSearch(url, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/amap/route') {
      await handleRoute(url, res);
      return;
    }
    sendJson(res, 404, proxyError('network', '未知地图代理路径。'));
  } catch (error) {
    sendJson(res, error?.payload?.code === 'quotaExceeded' ? 429 : 502, error?.payload ?? proxyError('network', error?.message ?? '地图代理请求失败。'));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AMap proxy listening on http://127.0.0.1:${port}`);
});
