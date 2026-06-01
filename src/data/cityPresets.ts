import type { LngLat, RouteSegment, TransportOption, TripPlan, TripStop } from '../types/trip';

export interface CityPopularPlace {
  id: string;
  name: string;
  area: string;
  address: string;
  lngLat: LngLat;
  stayMinutes: number;
  note: string;
  tags: string[];
}

export interface CityProjectPreset {
  id: string;
  name: string;
  code: string;
  region: string;
  description: string;
  center: LngLat;
  popularPlaces: CityPopularPlace[];
}

const fallbackCityCenters: Record<string, LngLat> = {
  上海: [121.4737, 31.2304],
  北京: [116.4074, 39.9042],
  成都: [104.0668, 30.5728],
  广州: [113.2644, 23.1291],
  杭州: [120.1551, 30.2741],
  深圳: [114.0579, 22.5431],
  南京: [118.7969, 32.0603],
  苏州: [120.5853, 31.2989],
  西安: [108.9398, 34.3416],
  武汉: [114.3054, 30.5931],
  重庆: [106.5516, 29.563],
  天津: [117.2009, 39.0842],
};

export const getDefaultCityCenter = (cityName: string): LngLat => {
  const normalized = cityName.trim().replace(/市$/u, '');
  return fallbackCityCenters[normalized] ?? [121.4737, 31.2304];
};

export const cityProjectPresets: CityProjectPreset[] = [
  {
    id: 'shanghai',
    name: '上海',
    code: 'SHA',
    region: '江南城市漫游',
    description: '街区、展馆、滨江夜景和近郊一日行程。',
    center: [121.4737, 31.2304],
    popularPlaces: [
      {
        id: 'the-bund',
        name: '外滩',
        area: '滨江夜景',
        address: '上海市黄浦区中山东一路',
        lngLat: [121.4903, 31.2417],
        stayMinutes: 70,
        note: '适合傍晚到夜间散步，和南京东路可顺路安排。',
        tags: ['热门', '夜景'],
      },
      {
        id: 'wukang-road',
        name: '武康路',
        area: '街区漫游',
        address: '上海市徐汇区武康路',
        lngLat: [121.439, 31.2096],
        stayMinutes: 90,
        note: '街区密集，适合搭配咖啡店和安福路。',
        tags: ['热门', '步行'],
      },
      {
        id: 'shanghai-museum-east',
        name: '上海博物馆东馆',
        area: '展馆',
        address: '上海市浦东新区世纪大道1952号',
        lngLat: [121.5436, 31.2271],
        stayMinutes: 150,
        note: '建议提前确认开放时间和预约状态。',
        tags: ['需预约', '展馆'],
      },
      {
        id: 'yuyuan-garden',
        name: '豫园',
        area: '老城厢',
        address: '上海市黄浦区福佑路168号',
        lngLat: [121.492, 31.2272],
        stayMinutes: 100,
        note: '游客较多，适合和城隍庙、小吃动线合并。',
        tags: ['热门', '人流高'],
      },
    ],
  },
  {
    id: 'beijing',
    name: '北京',
    code: 'BJS',
    region: '历史文化轴线',
    description: '古建、博物馆、胡同和城市中轴线。',
    center: [116.4074, 39.9042],
    popularPlaces: [
      {
        id: 'palace-museum',
        name: '故宫博物院',
        area: '中轴线',
        address: '北京市东城区景山前街4号',
        lngLat: [116.397, 39.918],
        stayMinutes: 210,
        note: '建议提前预约，上午进入更适合控制节奏。',
        tags: ['需预约', '人流高'],
      },
      {
        id: 'jingshan-park',
        name: '景山公园',
        area: '城市眺望',
        address: '北京市西城区景山西街44号',
        lngLat: [116.395, 39.925],
        stayMinutes: 60,
        note: '可接在故宫之后，用于俯瞰中轴线。',
        tags: ['步行', '热门'],
      },
      {
        id: 'shichahai',
        name: '什刹海',
        area: '胡同水岸',
        address: '北京市西城区前海西街',
        lngLat: [116.384, 39.94],
        stayMinutes: 100,
        note: '适合傍晚散步，也可连接烟袋斜街。',
        tags: ['热门', '夜景'],
      },
      {
        id: 'ucca-798',
        name: '798艺术区',
        area: '展览街区',
        address: '北京市朝阳区酒仙桥路2号',
        lngLat: [116.501, 39.989],
        stayMinutes: 130,
        note: '展馆和店铺分散，适合半天慢逛。',
        tags: ['展馆', '步行'],
      },
    ],
  },
  {
    id: 'chengdu',
    name: '成都',
    code: 'CTU',
    region: '慢节奏美食线',
    description: '茶馆、公园、川菜和周边自然目的地。',
    center: [104.0668, 30.5728],
    popularPlaces: [
      {
        id: 'people-park',
        name: '人民公园',
        area: '茶馆',
        address: '成都市青羊区祠堂街9号',
        lngLat: [104.0583, 30.6598],
        stayMinutes: 90,
        note: '适合从盖碗茶开始，安排轻松半天。',
        tags: ['热门', '慢游'],
      },
      {
        id: 'kuanzhai-alley',
        name: '宽窄巷子',
        area: '老街区',
        address: '成都市青羊区金河路口宽窄巷子',
        lngLat: [104.059, 30.669],
        stayMinutes: 90,
        note: '游客较多，适合与人民公园、奎星楼街串联。',
        tags: ['热门', '人流高'],
      },
      {
        id: 'chengdu-museum',
        name: '成都博物馆',
        area: '展馆',
        address: '成都市青羊区小河街1号',
        lngLat: [104.0636, 30.6587],
        stayMinutes: 140,
        note: '适合雨天或午后安排，注意预约信息。',
        tags: ['需预约', '展馆'],
      },
      {
        id: 'dongjiao-memory',
        name: '东郊记忆',
        area: '创意街区',
        address: '成都市成华区建设南支路4号',
        lngLat: [104.125, 30.655],
        stayMinutes: 110,
        note: '展演、街区和餐饮较集中，适合傍晚。',
        tags: ['步行', '夜景'],
      },
    ],
  },
  {
    id: 'guangzhou',
    name: '广州',
    code: 'CAN',
    region: '岭南城市探索',
    description: '老城骑楼、早茶、珠江夜游和艺术街区。',
    center: [113.2644, 23.1291],
    popularPlaces: [
      {
        id: 'shamian',
        name: '沙面',
        area: '历史街区',
        address: '广州市荔湾区沙面北街',
        lngLat: [113.246, 23.109],
        stayMinutes: 90,
        note: '街区步行友好，可接上下九或沿江路线。',
        tags: ['热门', '步行'],
      },
      {
        id: 'yongqingfang',
        name: '永庆坊',
        area: '骑楼老城',
        address: '广州市荔湾区恩宁路99号',
        lngLat: [113.249, 23.117],
        stayMinutes: 100,
        note: '适合和粤剧艺术博物馆、荔湾湖串联。',
        tags: ['热门', '步行'],
      },
      {
        id: 'guangdong-museum',
        name: '广东省博物馆',
        area: '珠江新城',
        address: '广州市天河区珠江东路2号',
        lngLat: [113.326, 23.118],
        stayMinutes: 130,
        note: '建议确认预约和展览排期。',
        tags: ['需预约', '展馆'],
      },
      {
        id: 'pearl-river-night-cruise',
        name: '珠江夜游',
        area: '夜景',
        address: '广州市越秀区沿江中路天字码头',
        lngLat: [113.267, 23.117],
        stayMinutes: 90,
        note: '适合放在晚间，需按码头班次预留时间。',
        tags: ['夜景', '需预约'],
      },
    ],
  },
];

interface CreateTripPlanOptions {
  selectedPopularPlaceIds?: string[];
  now?: Date;
}

interface CreateBlankTripPlanOptions {
  cityName: string;
  title: string;
  startDate: string;
  endDate: string;
  now?: Date;
}

export const createTripPlanForCity = (city: CityProjectPreset, options: CreateTripPlanOptions = {}): TripPlan => {
  const now = options.now ?? new Date();
  const startDate = addDays(now, 14);
  const selectedPopularPlaceIds = options.selectedPopularPlaceIds ?? [];
  const selectedPopularPlaces = selectedPopularPlaceIds
    .map((placeId) => city.popularPlaces.find((place) => place.id === placeId))
    .filter((place): place is CityPopularPlace => Boolean(place));
  const firstDayStops = selectedPopularPlaces.map((place, index) => popularPlaceToStop(city, place, index));
  const days = Array.from({ length: 3 }, (_, index) => {
    const date = addDays(startDate, index);
    const stops = index === 0 ? firstDayStops : [];
    return {
      id: `day-${index + 1}`,
      label: `Day ${index + 1}`,
      date: formatInputDate(date),
      stops,
      diningStops: [],
      routeSegments: createRouteSegments(stops),
    };
  });

  return {
    id: `trip-${city.id}-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    title: `${city.name}旅行规划`,
    dateRange: `${formatDisplayDate(startDate)} - ${formatDisplayDate(addDays(startDate, 2)).slice(5)}`,
    city: city.name,
    center: city.center,
    days,
    alternatives: [],
    updatedAt: now.toISOString(),
  };
};

export const createBlankTripPlanForCity = ({
  cityName,
  title,
  startDate,
  endDate,
  now = new Date(),
}: CreateBlankTripPlanOptions): TripPlan => {
  const start = parseInputDate(startDate) ?? addDays(now, 14);
  const end = parseInputDate(endDate) ?? addDays(start, 2);
  const dayCount = Math.max(1, getInclusiveDayCount(start, end));
  const days = Array.from({ length: dayCount }, (_, index) => ({
    id: `day-${index + 1}`,
    label: `Day ${index + 1}`,
    date: formatInputDate(addDays(start, index)),
    stops: [],
    diningStops: [],
    routeSegments: [],
  }));

  return {
    id: `trip-manual-${cityName}-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    title: title.trim() || `${cityName}旅行规划`,
    dateRange: formatDateRange(start, addDays(start, dayCount - 1)),
    city: cityName,
    center: getDefaultCityCenter(cityName),
    days,
    alternatives: [],
    updatedAt: now.toISOString(),
  };
};

const popularPlaceToStop = (city: CityProjectPreset, place: CityPopularPlace, index: number): TripStop => ({
  id: `stop-${city.id}-${place.id}`,
  placeId: `preset-${city.id}-${place.id}`,
  name: place.name,
  address: place.address,
  city: city.name,
  lngLat: place.lngLat,
  startTime: nextTimeByIndex(index),
  stayMinutes: place.stayMinutes,
  note: place.note,
  tags: place.tags,
  priority: 'must',
  source: 'manual',
});

const createRouteSegments = (stops: TripStop[]): RouteSegment[] =>
  stops.slice(0, -1).map((stop, index) => createManualRouteSegment(stop, stops[index + 1]));

const createManualRouteSegment = (fromStop: TripStop, toStop: TripStop): RouteSegment => {
  const manualOption: TransportOption = {
    id: `option-${fromStop.id}-${toStop.id}-manual`,
    mode: 'manual',
    title: '待重新计算',
    durationMinutes: 0,
    costCny: 0,
    walkingMeters: 0,
    transfers: 0,
    description: '从热门地点生成的初始连接，进入地图后可刷新真实交通方案。',
  };
  return {
    id: `segment-${fromStop.id}-${toStop.id}`,
    fromStopId: fromStop.id,
    toStopId: toStop.id,
    status: 'stale',
    selectedMode: 'manual',
    selectedOptionId: manualOption.id,
    options: [manualOption],
    provider: 'manual',
    cached: false,
    warning: '待重新计算',
    planningNote: '',
  };
};

const nextTimeByIndex = (index: number): string => {
  const minutes = 9 * 60 + 30 + index * 120;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const addDays = (value: Date, days: number): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const formatInputDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value: Date): string => formatInputDate(value).replaceAll('-', '.');

const formatDateRange = (start: Date, end: Date): string => {
  const endText = start.getFullYear() === end.getFullYear() ? formatDisplayDate(end).slice(5) : formatDisplayDate(end);
  return `${formatDisplayDate(start)} - ${endText}`;
};

const parseInputDate = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date
    : null;
};

const getInclusiveDayCount = (start: Date, end: Date): number => {
  if (end < start) {
    return 1;
  }
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
};
