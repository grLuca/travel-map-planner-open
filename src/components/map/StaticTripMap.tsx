import { House, Layers, MapPin, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent, WheelEvent } from 'react';
import { getStopMarkerKind, getVisibleStopMarkerOrder } from '../../types/stopKinds';
import type { DiningStop, LngLat, RouteSegment, TransportOption, TripDay, TripStop } from '../../types/trip';

type DemoState = 'normal' | 'mapError' | 'transitError';

const mapBounds = {
  minLng: 121.42,
  maxLng: 121.56,
  minLat: 31.14,
  maxLat: 31.25,
};

interface StaticTripMapProps {
  day: TripDay;
  selectedStopId: string | null;
  selectedSegmentId: string | null;
  demoState: DemoState;
  showDiningStops?: boolean;
  tripCenter?: LngLat;
  onSelectStop: (stopId: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onClearSelection?: () => void;
  onSwapStops: (firstStopId: string, secondStopId: string) => void;
  onDemoState: (state: DemoState) => void;
}

type RouteDisplayMode = 'simple' | 'full';

interface MapViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const initialMapView: MapViewState = {
  zoom: 13,
  offsetX: 0,
  offsetY: 0,
};

const minMapZoom = 11;
const maxMapZoom = 18;

export function StaticTripMap({
  day,
  selectedStopId,
  selectedSegmentId,
  demoState,
  showDiningStops = false,
  onSelectStop,
  onSelectSegment,
  onClearSelection,
  onSwapStops,
  onDemoState,
}: StaticTripMapProps) {
  const [mapView, setMapView] = useState<MapViewState>(initialMapView);
  const [routeMode, setRouteMode] = useState<RouteDisplayMode>('simple');
  const [isDragging, setIsDragging] = useState(false);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [dropTargetStopId, setDropTargetStopId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingStopIdRef = useRef<string | null>(null);
  const mapScale = Math.pow(1.18, mapView.zoom - initialMapView.zoom);
  const worldTransform = `translate3d(${mapView.offsetX.toFixed(1)}px, ${mapView.offsetY.toFixed(1)}px, 0) scale(${mapScale.toFixed(3)})`;

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    const direction = event.deltaY < 0 ? 1 : -1;
    const rect = event.currentTarget.getBoundingClientRect();
    const focusX = event.clientX - rect.left - rect.width / 2;
    const focusY = event.clientY - rect.top - rect.height / 2;

    setMapView((current) => {
      const nextZoom = clamp(current.zoom + direction, minMapZoom, maxMapZoom);
      if (nextZoom === current.zoom) {
        return current;
      }
      const nextScale = Math.pow(1.18, nextZoom - current.zoom);
      return {
        zoom: nextZoom,
        offsetX: clamp(current.offsetX - focusX * (nextScale - 1), -520, 520),
        offsetY: clamp(current.offsetY - focusY * (nextScale - 1), -420, 420),
      };
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (isMapControlTarget(event.target)) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapView.offsetX,
      originY: mapView.offsetY,
    };
    setIsDragging(true);
    if ('setPointerCapture' in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setMapView((current) => ({
      ...current,
      offsetX: clamp(drag.originX + event.clientX - drag.startX, -520, 520),
      offsetY: clamp(drag.originY + event.clientY - drag.startY, -420, 420),
    }));
  };

  const stopDragging = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setIsDragging(false);
    if ('releasePointerCapture' in event.currentTarget) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const zoomBy = (amount: number) => {
    setMapView((current) => ({
      ...current,
      zoom: clamp(current.zoom + amount, minMapZoom, maxMapZoom),
    }));
  };

  const handleMapWorldClick = (event: MouseEvent<HTMLElement>) => {
    if (!onClearSelection || isMapInteractiveTarget(event.target)) {
      return;
    }
    onClearSelection();
  };

  const handleMarkerDragStart = (stopId: string) => {
    const stop = day.stops.find((item) => item.id === stopId);
    if (!stop || getStopMarkerKind(stop) === 'accommodation') {
      return;
    }
    draggingStopIdRef.current = stopId;
    setDraggingStopId(stopId);
    setDropTargetStopId(null);
    onSelectStop(stopId);
  };

  const handleMarkerDragEnter = (stopId: string) => {
    const stop = day.stops.find((item) => item.id === stopId);
    if (draggingStopIdRef.current && stop && getStopMarkerKind(stop) !== 'accommodation') {
      setDropTargetStopId(stopId);
    }
  };

  const handleMarkerDragOver = (event: DragEvent<HTMLElement>) => {
    if (draggingStopIdRef.current) {
      event.preventDefault();
      setDropTargetStopId(getNearestStopIdFromDragEvent(event, day.stops));
    }
  };

  const handleMarkerDrop = (event: DragEvent<HTMLElement>, stopId?: string) => {
    event.preventDefault();
    const sourceStopId = draggingStopIdRef.current ?? draggingStopId;
    const targetStopId = getNearestStopIdFromDragEvent(event, day.stops) ?? stopId;
    if (sourceStopId && targetStopId && sourceStopId !== targetStopId) {
      onSwapStops(sourceStopId, targetStopId);
    }
    draggingStopIdRef.current = null;
    setDraggingStopId(null);
    setDropTargetStopId(null);
  };

  const handleMarkerDragEnd = () => {
    draggingStopIdRef.current = null;
    setDraggingStopId(null);
    setDropTargetStopId(null);
  };

  return (
    <section
      className={`map-wrap static-map ${isDragging ? 'dragging' : ''}`}
      role="region"
      aria-label="地图画布"
      data-zoom={mapView.zoom}
      data-route-mode={routeMode}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <div className="map-toolbar" aria-label="地图工具栏">
        <button className="tool active" type="button" title="选择">
          <MapPin size={17} aria-hidden="true" />
        </button>
        <button className="tool" type="button" title="图层">
          <Layers size={17} aria-hidden="true" />
        </button>
        <button className="tool" type="button" aria-label="放大地图" title="放大地图" onClick={() => zoomBy(1)}>
          <ZoomIn size={17} aria-hidden="true" />
        </button>
        <button className="tool" type="button" aria-label="缩小地图" title="缩小地图" onClick={() => zoomBy(-1)}>
          <ZoomOut size={17} aria-hidden="true" />
        </button>
        <button
          className="tool text-tool"
          type="button"
          aria-pressed={routeMode === 'full'}
          onClick={() => setRouteMode((current) => (current === 'simple' ? 'full' : 'simple'))}
        >
          {routeMode === 'simple' ? '完整路线' : '简约路线'}
        </button>
        <button className="tool text-tool" type="button" onClick={() => onDemoState('mapError')}>
          地图服务失败
        </button>
        <button className="tool text-tool" type="button" onClick={() => onDemoState('transitError')}>
          公交路线不可用
        </button>
        <button className="tool" type="button" title="恢复" onClick={() => onDemoState('normal')}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>

      <div
        className="map-world"
        data-testid="map-world"
        style={{ transform: worldTransform }}
        onClick={handleMapWorldClick}
        onDragOver={handleMarkerDragOver}
        onDrop={handleMarkerDrop}
      >
        <div className="paper-map-texture" aria-hidden="true" />
        <div className="map-tile tile-a map-patch" aria-hidden="true" />
        <div className="map-tile tile-b map-patch" aria-hidden="true" />
        <div className="map-tile tile-c map-patch" aria-hidden="true" />
        <div className="river" aria-hidden="true" />
        <div className="road road-a" />
        <div className="road road-b" />
        <div className="road road-c" />
        <div className="road road-d" />
        <span className="map-label label-xuhui">徐汇</span>
        <span className="map-label label-square">人民广场</span>
        <span className="map-label label-pudong">浦东</span>

        {day.routeSegments.length > 0 ? (
          <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            {day.routeSegments.map((segment) => {
              const from = day.stops.find((stop) => stop.id === segment.fromStopId);
              const to = day.stops.find((stop) => stop.id === segment.toStopId);
              if (!from || !to) {
                return null;
              }
              const selected = getSelectedOption(segment);
              const points = getSegmentRoutePoints(from, to, segment, selected, routeMode);
              const path = buildPolylinePath(points);
              const routeClass = selectedSegmentId === segment.id ? 'route-active' : 'route-base';
              return (
                <g key={segment.id}>
                  <path d={path} fill="none" className="route-glow" aria-hidden="true" />
                  <path d={path} fill="none" className="route-casing" aria-hidden="true" />
                  <path
                    d={path}
                    fill="none"
                    className={routeClass}
                    data-testid={`route-overlay-${segment.id}`}
                    aria-hidden="true"
                  />
                  {routeMode === 'full'
                    ? points.slice(1, -1).map((point, index) => (
                        <circle
                          key={`${segment.id}-transfer-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="0.75"
                          className={`route-transfer ${segment.status}`}
                          aria-hidden="true"
                        />
                      ))
                    : null}
                  <path
                    d={path}
                    fill="none"
                    className="route-hit-path"
                    onClick={() => onSelectSegment(segment.id)}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}

        {day.routeSegments.map((segment) => {
          const from = day.stops.find((stop) => stop.id === segment.fromStopId);
          const to = day.stops.find((stop) => stop.id === segment.toStopId);
          if (!from || !to) {
            return null;
          }
          const point = midpoint(toMapPoint(from), toMapPoint(to));
          return (
            <button
              key={segment.id}
              type="button"
              className={`segment-hit ${selectedSegmentId === segment.id ? 'active' : ''}`}
              aria-label={`选择地图路线 ${from.name} 到 ${to.name}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => onSelectSegment(segment.id)}
            />
          );
        })}

        {day.stops.map((stop, index) => {
          const point = toMapPoint(stop);
          const markerKind = getStopMarkerKind(stop);
          const markerOrder = getVisibleStopMarkerOrder(day.stops, index);
          return (
            <button
              key={stop.id}
              type="button"
              draggable={markerKind !== 'accommodation'}
              className={[
                'marker',
                selectedStopId === stop.id ? 'active' : '',
                draggingStopId === stop.id ? 'dragging-marker' : '',
                draggingStopId === stop.id ? 'drag-origin' : '',
                dropTargetStopId === stop.id ? 'drop-target' : '',
                markerKind === 'accommodation' ? 'accommodation-marker' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-stop-kind={markerKind}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-label={`选择地图点位 ${stop.name}`}
              onClick={() => onSelectStop(stop.id)}
              onDragStart={() => handleMarkerDragStart(stop.id)}
              onDragEnter={() => handleMarkerDragEnter(stop.id)}
              onDragOver={(event) => {
                if (draggingStopIdRef.current) {
                  event.preventDefault();
                }
              }}
              onDragLeave={() => setDropTargetStopId((current) => (current === stop.id ? null : current))}
              onDrop={(event) => handleMarkerDrop(event, stop.id)}
              onDragEnd={handleMarkerDragEnd}
            >
              <span className="marker-inner" aria-hidden="true">
                {markerKind === 'accommodation' ? <House className="marker-house-icon" size={16} aria-hidden="true" /> : markerOrder}
              </span>
            </button>
          );
        })}

        {showDiningStops
          ? day.diningStops.map((stop) => {
              const point = toDiningMapPoint(stop);
              return (
                <button
                  key={stop.id}
                  type="button"
                  className="dining-marker"
                  data-dining-type={stop.diningType}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`选择地图餐饮点 ${stop.name}`}
                >
                  <span className="dining-marker-halo" aria-hidden="true" />
                  <span className="dining-marker-core" aria-hidden="true">
                    <svg className="dining-marker-utensils" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6.2 3.2v6.1" />
                      <path d="M9 3.2v6.1" />
                      <path d="M11.8 3.2v6.1" />
                      <path d="M6.2 9.6c0 2 1.2 3.2 2.8 3.2s2.8-1.2 2.8-3.2" />
                      <path d="M9 12.8v7" />
                      <path d="M16.6 3.4c-2.5 2.2 -2.8 6.8 -0.2 8.8" />
                      <path d="M16.6 3.4v16.4" />
                    </svg>
                  </span>
                </button>
              );
            })
          : null}

        <MapCallout day={day} selectedStopId={selectedStopId} selectedSegmentId={selectedSegmentId} />
      </div>

      <div className="layers">
        <label>
          <span>当天路线</span>
          <input type="checkbox" defaultChecked />
        </label>
        <label>
          <span>备选点位</span>
          <input type="checkbox" defaultChecked />
        </label>
        <label>
          <span>地铁线路</span>
          <input type="checkbox" defaultChecked />
        </label>
        <label>
          <span>拥挤/风险</span>
          <input type="checkbox" defaultChecked />
        </label>
      </div>

      {day.stops.length === 0 ? (
        <StateOverlay title="从地图上添加你的第一个点" body="搜索“武康路”“外滩”或点击地图添加自定义点位。" />
      ) : null}
      {demoState === 'mapError' ? (
        <StateOverlay title="地图暂时无法加载" body="可能是网络、地图 Key 或服务配额问题。已保留你的行程列表。" tone="error" />
      ) : null}
      {demoState === 'transitError' ? (
        <StateOverlay title="未找到合适公交路线" body="保留两点连线，建议切换打车、步行或手动记录交通方式。" tone="warn" />
      ) : null}
    </section>
  );
}

interface MapCalloutProps {
  day: TripDay;
  selectedStopId: string | null;
  selectedSegmentId: string | null;
}

function MapCallout({ day, selectedStopId, selectedSegmentId }: MapCalloutProps) {
  const stop = day.stops.find((item) => item.id === selectedStopId);
  if (stop) {
    const point = toMapPoint(stop);
    return (
      <div className="callout stop-callout" style={{ left: `${Math.min(point.x + 3, 66)}%`, top: `${Math.max(point.y - 8, 18)}%` }}>
        <strong>{stop.name}</strong>
        <p>
          {stop.startTime} · 停留 {stop.stayMinutes} 分钟
        </p>
        <small>{stop.note}</small>
      </div>
    );
  }

  const segment = day.routeSegments.find((item) => item.id === selectedSegmentId);
  if (!segment) {
    return null;
  }

  const from = day.stops.find((stop) => stop.id === segment.fromStopId);
  const to = day.stops.find((stop) => stop.id === segment.toStopId);
  const option = getSelectedOption(segment);
  const point = from && to ? midpoint(toMapPoint(from), toMapPoint(to)) : { x: 54, y: 40 };

  return (
    <div className="callout" style={{ left: `${Math.min(point.x + 3, 66)}%`, top: `${Math.max(point.y - 6, 18)}%` }}>
      <strong>
        {from?.name} → {to?.name}
      </strong>
      <p>
        {option?.title ?? '待规划'} · {option?.durationMinutes ?? 0} 分钟 · {option?.costCny ?? 0} 元
      </p>
    </div>
  );
}

function StateOverlay({ title, body, tone = 'info' }: { title: string; body: string; tone?: 'info' | 'warn' | 'error' }) {
  return (
    <div className={`state-overlay ${tone}`}>
      <div className="state-card">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

const getSelectedOption = (segment: RouteSegment): TransportOption | undefined =>
  segment.options.find((option) => option.id === segment.selectedOptionId) ??
  segment.options.find((option) => option.mode === segment.selectedMode);

interface MapPoint {
  x: number;
  y: number;
}

const toMapPoint = (stop: TripStop) => {
  return lngLatToMapPoint(stop.lngLat);
};

const toDiningMapPoint = (stop: DiningStop) => lngLatToMapPoint(stop.lngLat);

const lngLatToMapPoint = ([lng, lat]: [number, number]): MapPoint => {
  const x = ((lng - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 72 + 14;
  const y = (1 - (lat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 66 + 14;
  return {
    x: clamp(x, 10, 90),
    y: clamp(y, 10, 88),
  };
};

const midpoint = (a: MapPoint, b: MapPoint): MapPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const getNearestStopIdFromDragEvent = (event: DragEvent<HTMLElement>, stops: TripStop[]): string | null => {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return getNearestStopIdByMapPoint(
    {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    },
    stops.filter((stop) => getStopMarkerKind(stop) !== 'accommodation'),
  );
};

const getNearestStopIdByMapPoint = (point: MapPoint, stops: TripStop[]): string | null => {
  let nearest: { stopId: string; distance: number } | null = null;
  for (const stop of stops) {
    const stopPoint = toMapPoint(stop);
    const distance = Math.hypot(point.x - stopPoint.x, point.y - stopPoint.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { stopId: stop.id, distance };
    }
  }
  return nearest?.stopId ?? null;
};

const buildPolylinePath = (points: MapPoint[]): string => {
  if (points.length === 0) {
    return '';
  }
  const [first, ...rest] = points;
  return [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`, ...rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)].join(' ');
};

const getSegmentRoutePoints = (
  from: TripStop,
  to: TripStop,
  segment: RouteSegment,
  option: TransportOption | undefined,
  mode: RouteDisplayMode,
): MapPoint[] => {
  const fromPoint = toMapPoint(from);
  const toPoint = toMapPoint(to);
  if (mode === 'simple') {
    return [fromPoint, toPoint];
  }

  const providerPath = option?.routePath?.map(lngLatToMapPoint).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (providerPath && providerPath.length >= 2) {
    return providerPath;
  }

  return buildFallbackRoutePoints(fromPoint, toPoint, option?.mode ?? segment.selectedMode);
};

const buildFallbackRoutePoints = (from: MapPoint, to: MapPoint, mode: TransportOption['mode']): MapPoint[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (mode === 'walk') {
    return [
      from,
      { x: from.x + dx * 0.18, y: from.y + dy * 0.08 },
      { x: from.x + dx * 0.36, y: from.y + dy * 0.44 },
      { x: from.x + dx * 0.68, y: from.y + dy * 0.58 },
      { x: from.x + dx * 0.86, y: from.y + dy * 0.92 },
      to,
    ];
  }
  if (mode === 'taxi') {
    return [
      from,
      { x: from.x + dx * 0.24, y: from.y + dy * 0.04 },
      { x: from.x + dx * 0.72, y: from.y + dy * 0.86 },
      to,
    ];
  }
  if (mode === 'manual') {
    return [from, midpoint(from, to), to];
  }
  return [
    from,
    { x: from.x + dx * 0.22, y: from.y },
    { x: from.x + dx * 0.22, y: from.y + dy * 0.52 },
    { x: from.x + dx * 0.64, y: from.y + dy * 0.52 },
    { x: from.x + dx * 0.64, y: to.y },
    to,
  ];
};

const isMapControlTarget = (target: EventTarget): boolean =>
  target instanceof Element && Boolean(target.closest('button, input, select, textarea, .map-toolbar, .layers, [role="button"]'));

const isMapInteractiveTarget = (target: EventTarget): boolean =>
  target instanceof Element &&
  Boolean(target.closest('.marker, .segment-hit, .route-hit-path, .dining-marker, .callout, .state-overlay'));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
