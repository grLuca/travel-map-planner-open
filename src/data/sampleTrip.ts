import type { RouteSegment, TransportOption, TripPlan, TripStop } from '../types/trip';

const stop = (
  id: string,
  name: string,
  startTime: string,
  stayMinutes: number,
  lngLat: [number, number],
  note: string,
  tags: string[],
): TripStop => ({
  id,
  placeId: id,
  name,
  address: `上海市 ${name}`,
  city: '上海',
  lngLat,
  startTime,
  stayMinutes,
  note,
  tags,
  priority: 'must',
  source: 'mock',
});

const option = (
  id: string,
  mode: TransportOption['mode'],
  title: string,
  durationMinutes: number,
  costCny: number,
  walkingMeters: number,
  transfers: number,
  description: string,
  isRecommended = false,
): TransportOption => ({
  id,
  mode,
  title,
  durationMinutes,
  costCny,
  walkingMeters,
  transfers,
  description,
  isRecommended,
});

const segment = (
  id: string,
  fromStopId: string,
  toStopId: string,
  selectedOptionId: string,
  options: TransportOption[],
  warning?: string,
): RouteSegment => {
  const selected = options.find((item) => item.id === selectedOptionId) ?? options[0];
  return {
    id,
    fromStopId,
    toStopId,
    status: 'ready',
    selectedMode: selected.mode,
    selectedOptionId: selected.id,
    options,
    warning,
    planningNote: warning ?? '',
  };
};

const dayOneStops: TripStop[] = [
  stop('stop-wukang-road', '武康路历史风貌区', '09:30', 80, [121.4396, 31.2132], '适合上午拍照，顺路看武康大楼。', [
    '拍照',
    '风貌区',
  ]),
  stop('stop-anfu-road', '安福路', '11:00', 90, [121.4462, 31.2116], '咖啡和买手店，不要排太赶。', ['咖啡', '街区']),
  stop('stop-shanghai-museum-east', '上海博物馆东馆', '14:00', 150, [121.544, 31.227], '需要提前预约，建议确认入馆时间。', [
    '需预约',
    '博物馆',
  ]),
  stop('stop-bund', '外滩观景步道', '18:30', 90, [121.4908, 31.2416], '夜景人流较多，预留步行缓冲。', ['夜景', '人流高']),
];

const walkToAnfu = option('option-wukang-anfu-walk', 'walk', '步行', 12, 0, 850, 0, '沿武康路步行到安福路', true);
const transitToMuseum = option(
  'option-anfu-museum-transit',
  'transit',
  '地铁 10 号线 → 2 号线',
  38,
  4,
  720,
  1,
  '交通大学站上车 · 南京东路换乘 · 上海科技馆站下车',
  true,
);
const taxiToMuseum = option('option-anfu-museum-taxi', 'taxi', '打车', 32, 58, 120, 0, '受高架拥堵影响，午后略慢');
const busToMuseum = option('option-anfu-museum-bus', 'transit', '公交 + 步行', 61, 3, 1280, 1, '步行较多，适合作为备选');
const manualToMuseum = option('option-anfu-museum-manual', 'manual', '手动填写', 0, 0, 0, 0, '公交不可用时手动记录');
const museumToBund = option('option-museum-bund-transit', 'transit', '地铁 2 号线', 31, 4, 660, 0, '上海科技馆站上车 · 南京东路站下车', true);

export const shanghaiSampleTrip: TripPlan = {
  id: 'trip-shanghai-2026',
  title: '上海 4 日旅行规划',
  dateRange: '2026.06.12 - 06.15',
  city: '上海',
  center: [121.4737, 31.2304],
  updatedAt: '2026-05-18T00:00:00.000Z',
  days: [
    {
      id: 'day-1',
      label: 'Day 1',
      date: '2026-06-12',
      stops: dayOneStops,
      diningStops: [],
      routeSegments: [
        segment('segment-wukang-anfu', dayOneStops[0].id, dayOneStops[1].id, walkToAnfu.id, [
          walkToAnfu,
          option('option-wukang-anfu-taxi', 'taxi', '打车', 8, 18, 80, 0, '短距离打车，可能等车'),
          option('option-wukang-anfu-manual', 'manual', '手动填写', 0, 0, 0, 0, '自定义交通说明'),
        ]),
        segment(
          'segment-anfu-museum',
          dayOneStops[1].id,
          dayOneStops[2].id,
          transitToMuseum.id,
          [transitToMuseum, taxiToMuseum, busToMuseum, manualToMuseum],
          '博物馆需预约',
        ),
        segment('segment-museum-bund', dayOneStops[2].id, dayOneStops[3].id, museumToBund.id, [
          museumToBund,
          option('option-museum-bund-taxi', 'taxi', '打车', 29, 46, 140, 0, '晚高峰费用可能上浮'),
          option('option-museum-bund-walk', 'walk', '步行', 86, 0, 6100, 0, '距离较长，不推荐'),
          option('option-museum-bund-manual', 'manual', '手动填写', 0, 0, 0, 0, '自定义交通说明'),
        ]),
      ],
    },
    {
      id: 'day-2',
      label: 'Day 2',
      date: '2026-06-13',
      stops: [
        stop('stop-yuyuan', '豫园', '10:00', 120, [121.492, 31.227], '避开正午拥挤。', ['园林']),
        stop('stop-xintiandi', '新天地', '15:30', 100, [121.4751, 31.2193], '下午茶和街区散步。', ['街区']),
      ],
      diningStops: [],
      routeSegments: [
        segment('segment-yuyuan-xintiandi', 'stop-yuyuan', 'stop-xintiandi', 'option-yuyuan-xintiandi-transit', [
          option('option-yuyuan-xintiandi-transit', 'transit', '地铁 10 号线', 24, 3, 520, 0, '豫园站到新天地站', true),
          option('option-yuyuan-xintiandi-taxi', 'taxi', '打车', 18, 28, 80, 0, '市中心短途'),
          option('option-yuyuan-xintiandi-manual', 'manual', '手动填写', 0, 0, 0, 0, '自定义交通说明'),
        ]),
      ],
    },
    { id: 'day-3', label: 'Day 3', date: '2026-06-14', stops: [], diningStops: [], routeSegments: [] },
    { id: 'day-4', label: 'Day 4', date: '2026-06-15', stops: [], diningStops: [], routeSegments: [] },
  ],
  alternatives: [
    stop('alt-sinan-mansions', '思南公馆', '备选', 80, [121.4671, 31.2148], '可替换安福路，距离近。', ['备选']),
    stop('alt-disneytown', '迪士尼小镇', '备选', 150, [121.6679, 31.1487], '距离市区较远，建议单独安排。', ['跨城风险']),
    stop('alt-power-station', '上海当代艺术博物馆', '备选', 120, [121.4786, 31.2034], '适合阴雨天。', ['美术馆']),
  ],
};
