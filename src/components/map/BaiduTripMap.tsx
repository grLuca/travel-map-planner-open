import { useEffect, useMemo, useRef, useState } from 'react';
import { loadBaiduApi } from '../../services/mapProvider/baiduSdk';
import type { BaiduApi, BaiduPoint } from '../../services/mapProvider/baiduSdk';
import { getStopMarkerKind, getVisibleStopMarkerOrder } from '../../types/stopKinds';
import type { DiningStop, LngLat, RouteSegment, TransportOption, TripDay, TripStop } from '../../types/trip';

type RouteDisplayMode = 'simple' | 'full';

interface BaiduTripMapProps {
  baiduAk?: string;
  day: TripDay;
  selectedStopId: string | null;
  selectedSegmentId: string | null;
  showDiningStops?: boolean;
  tripCenter?: LngLat;
  onSelectStop: (stopId: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onClearSelection?: () => void;
  onSwapStops: (firstStopId: string, secondStopId: string) => void;
  onLoadError?: () => void;
}

interface BaiduMapApi extends BaiduApi {
  Map: new (container: HTMLElement | string, options?: Record<string, unknown>) => BaiduMapInstance;
  Marker: new (point: BaiduPoint, options?: Record<string, unknown>) => BaiduOverlay;
  Polyline: new (points: BaiduPoint[], options?: Record<string, unknown>) => BaiduOverlay;
  InfoWindow: new (content: string | HTMLElement, options?: Record<string, unknown>) => unknown;
  NavigationControl: new () => unknown;
  ScaleControl: new () => unknown;
  Icon: new (imageUrl: string, size: unknown, options?: Record<string, unknown>) => unknown;
  Size: new (width: number, height: number) => unknown;
}

interface BaiduMapInstance {
  enableScrollWheelZoom: (enabled: boolean) => void;
  enableDragging: () => void;
  addControl: (control: unknown) => void;
  addEventListener?: (eventName: string, handler: (event?: unknown) => void) => void;
  removeEventListener?: (eventName: string, handler: (event?: unknown) => void) => void;
  centerAndZoom: (point: BaiduPoint, zoom: number) => void;
  addOverlay: (overlay: BaiduOverlay) => void;
  clearOverlays?: () => void;
  removeOverlay?: (overlay: BaiduOverlay) => void;
  openInfoWindow: (infoWindow: unknown, point: BaiduPoint) => void;
}

interface BaiduOverlay {
  addEventListener: (eventName: string, handler: (event?: unknown) => void) => void;
  removeEventListener?: (eventName: string, handler: (event?: unknown) => void) => void;
  enableDragging?: () => void;
  setIcon?: (icon: unknown) => void;
  setPosition?: (point: BaiduPoint) => void;
}

interface BaiduOverlayClickListener {
  overlay: BaiduOverlay;
  eventName: string;
  handler: (event?: unknown) => void;
}

export function BaiduTripMap({
  baiduAk,
  day,
  selectedStopId,
  selectedSegmentId,
  showDiningStops = false,
  tripCenter,
  onSelectStop,
  onSelectSegment,
  onClearSelection,
  onSwapStops,
  onLoadError,
}: BaiduTripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayClickListenersRef = useRef<BaiduOverlayClickListener[]>([]);
  const suppressNextMapClickRef = useRef(false);
  const suppressMapClickResetRef = useRef<number | null>(null);
  const diningInfoStyleTimersRef = useRef<number[]>([]);
  const diningInfoObserverRef = useRef<MutationObserver | null>(null);
  const initialCenterLngLats = useMemo(() => getVisibleCenterLngLats(day, showDiningStops, tripCenter), [day, showDiningStops, tripCenter]);
  const initialCenterRef = useRef<LngLat>(getCenterLngLat(initialCenterLngLats));
  const centeredStopsKeyRef = useRef<string>(getCenterKey(initialCenterLngLats));
  const [api, setApi] = useState<BaiduMapApi | null>(null);
  const [map, setMap] = useState<BaiduMapInstance | null>(null);
  const [routeMode, setRouteMode] = useState<RouteDisplayMode>('simple');
  const [loadFailed, setLoadFailed] = useState(false);
  const [isDiningInfoOpen, setIsDiningInfoOpen] = useState(false);
  const stopsById = useMemo(() => new Map(day.stops.map((stop) => [stop.id, stop])), [day.stops]);
  const visibleCenterLngLats = useMemo(() => getVisibleCenterLngLats(day, showDiningStops, tripCenter), [day, showDiningStops, tripCenter]);
  const stopsCenterKey = useMemo(() => getCenterKey(visibleCenterLngLats), [visibleCenterLngLats]);
  const routeModeLabel = routeMode === 'simple' ? '完整路线' : '简约路线';

  useEffect(() => {
    let cancelled = false;

    loadBaiduApi({ ak: baiduAk })
      .then((loadedApi) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const baiduApi = loadedApi as BaiduMapApi;
        const baiduMap = new baiduApi.Map(containerRef.current);
        baiduMap.enableScrollWheelZoom(true);
        baiduMap.enableDragging();
        baiduMap.addControl(new baiduApi.NavigationControl());
        baiduMap.addControl(new baiduApi.ScaleControl());
        baiduMap.centerAndZoom(toPoint(baiduApi, initialCenterRef.current), 13);

        setApi(baiduApi);
        setMap(baiduMap);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          onLoadError?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baiduAk, onLoadError]);

  useEffect(() => {
    if (!api || !map || centeredStopsKeyRef.current === stopsCenterKey) {
      return;
    }

    centeredStopsKeyRef.current = stopsCenterKey;
    map.centerAndZoom(toPoint(api, getCenterLngLat(visibleCenterLngLats)), 13);
  }, [api, map, stopsCenterKey, visibleCenterLngLats]);

  useEffect(() => {
    if (!api || !map) {
      return undefined;
    }

    clearMapOverlays(map, overlayClickListenersRef.current);
    const nextOverlayClickListeners: BaiduOverlayClickListener[] = [];
    const clearDiningInfoChrome = () => {
      setIsDiningInfoOpen(false);
      diningInfoStyleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      diningInfoStyleTimersRef.current = [];
      diningInfoObserverRef.current?.disconnect();
      diningInfoObserverRef.current = null;
      document.querySelectorAll('.dining-info-native-shell').forEach((node) => node.classList.remove('dining-info-native-shell'));
      document.querySelectorAll('.dining-info-native-shadow').forEach((node) => {
        (node as HTMLElement).style.display = '';
        node.classList.remove('dining-info-native-shadow');
      });
    };
    const markDiningInfoChrome = () => {
      const content = document.querySelector('.dining-info-window');
      document.querySelectorAll('.dining-info-native-shell').forEach((node) => node.classList.remove('dining-info-native-shell'));
      document.querySelectorAll('.dining-info-native-shadow').forEach((node) => {
        (node as HTMLElement).style.display = '';
        node.classList.remove('dining-info-native-shadow');
      });
      getDiningInfoChromeNodes(content).forEach((node) => {
        node.classList.add('dining-info-native-shell');
        const element = node as HTMLElement;
        element.style.overflow = 'visible';
        element.style.overflowX = 'visible';
        element.style.overflowY = 'visible';
        element.style.background = 'transparent';
        element.style.backgroundColor = 'transparent';
        element.style.backgroundImage = 'none';
        element.style.border = '0';
        element.style.padding = '0';
        element.style.boxShadow = 'none';
        element.style.filter = 'none';
      });
      getDiningInfoShadowNodes(content).forEach((node) => {
        node.classList.add('dining-info-native-shadow');
        (node as HTMLElement).style.display = 'none';
      });
    };
    const queueDiningInfoChrome = () => {
      diningInfoStyleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (typeof window.MutationObserver !== 'undefined') {
        diningInfoObserverRef.current?.disconnect();
        diningInfoObserverRef.current = new window.MutationObserver(() => {
          markDiningInfoChrome();
        });
        diningInfoObserverRef.current.observe(document.body, { childList: true, subtree: true });
      }
      diningInfoStyleTimersRef.current = [0, 40, 120, 300, 700].map((delay) =>
        window.setTimeout(() => {
          markDiningInfoChrome();
        }, delay),
      );
    };
    const suppressNextMapClick = () => {
      suppressNextMapClickRef.current = true;
      if (suppressMapClickResetRef.current !== null) {
        window.clearTimeout(suppressMapClickResetRef.current);
      }
      suppressMapClickResetRef.current = window.setTimeout(() => {
        suppressNextMapClickRef.current = false;
        suppressMapClickResetRef.current = null;
      }, 0);
    };
    const handleMapClick = () => {
      if (suppressNextMapClickRef.current) {
        suppressNextMapClickRef.current = false;
        if (suppressMapClickResetRef.current !== null) {
          window.clearTimeout(suppressMapClickResetRef.current);
          suppressMapClickResetRef.current = null;
        }
        return;
      }
      onClearSelection?.();
      clearDiningInfoChrome();
    };
    map.addEventListener?.('click', handleMapClick);
    const renderedMarkers = new Map<string, { marker: BaiduOverlay; stop: TripStop; order: number; selected: boolean }>();
    let snapTargetStopId: string | null = null;
    let dragContext: { sourceStopId: string; originMarker: BaiduOverlay } | null = null;

    const setSnapTarget = (targetStopId: string | null) => {
      if (snapTargetStopId === targetStopId) {
        return;
      }
      if (snapTargetStopId) {
        const previous = renderedMarkers.get(snapTargetStopId);
        if (previous) {
          const previousMarker =
            dragContext && snapTargetStopId === dragContext.sourceStopId ? dragContext.originMarker : previous.marker;
          previousMarker.setIcon?.(
            createStopMarkerIcon(api, previous.stop, previous.order, {
              selected: previous.selected,
              originGhost: dragContext?.sourceStopId === snapTargetStopId,
            }),
          );
        }
      }
      snapTargetStopId = targetStopId;
      if (snapTargetStopId) {
        const next = renderedMarkers.get(snapTargetStopId);
        if (next) {
          const nextMarker = dragContext && snapTargetStopId === dragContext.sourceStopId ? dragContext.originMarker : next.marker;
          nextMarker.setIcon?.(
            createStopMarkerIcon(api, next.stop, next.order, {
              selected: next.selected,
              originGhost: dragContext?.sourceStopId === snapTargetStopId,
              snapTarget: true,
            }),
          );
        }
      }
    };

    day.stops.forEach((stop, index) => {
      const point = toPoint(api, stop.lngLat);
      const stopMarkerKind = getStopMarkerKind(stop);
      const markerOrder = getVisibleStopMarkerOrder(day.stops, index);
      const marker = new api.Marker(point, {
        title: escapeHtml(stop.name),
        icon: createStopMarkerIcon(api, stop, markerOrder ?? 0, { selected: selectedStopId === stop.id }),
        zIndex: selectedStopId === stop.id ? 1000 : 500,
      });
      renderedMarkers.set(stop.id, { marker, stop, order: markerOrder ?? 0, selected: selectedStopId === stop.id });
      const handleClick = () => {
        suppressNextMapClick();
        clearDiningInfoChrome();
        onSelectStop(stop.id);
        map.openInfoWindow(new api.InfoWindow(renderStopInfo(stop), { title: escapeHtml(stop.name) }), point);
      };
      marker.addEventListener('click', handleClick);
      map.addOverlay(marker);
      nextOverlayClickListeners.push({ overlay: marker, eventName: 'click', handler: handleClick });

      if (stopMarkerKind === 'accommodation') {
        return;
      }

      marker.enableDragging?.();
      const handleDragStart = () => {
        const originMarker = new api.Marker(point, {
          title: escapeHtml(stop.name),
          icon: createStopMarkerIcon(api, stop, markerOrder ?? 0, { selected: selectedStopId === stop.id, originGhost: true }),
          zIndex: 420,
        });
        dragContext = { sourceStopId: stop.id, originMarker };
        map.addOverlay(originMarker);
        setSnapTarget(stop.id);
      };
      const handleDragging = (event?: unknown) => {
        const eventPoint = getEventPoint(event);
        setSnapTarget(eventPoint ? getNearestSnapStopId(eventPoint, day.stops) : null);
      };
      const handleDragEnd = (event?: unknown) => {
        const eventPoint = getEventPoint(event);
        const targetStopId = eventPoint ? getNearestSnapStopId(eventPoint, day.stops) ?? stop.id : stop.id;
        const targetStop = stopsById.get(targetStopId) ?? stop;
        marker.setPosition?.(toPoint(api, targetStop.lngLat));
        setSnapTarget(null);
        if (dragContext) {
          map.removeOverlay?.(dragContext.originMarker);
          dragContext = null;
        }
        if (targetStopId !== stop.id) {
          onSwapStops(stop.id, targetStopId);
        }
      };
      marker.addEventListener('dragstart', handleDragStart);
      marker.addEventListener('dragging', handleDragging);
      marker.addEventListener('dragend', handleDragEnd);
      nextOverlayClickListeners.push({ overlay: marker, eventName: 'dragstart', handler: handleDragStart });
      nextOverlayClickListeners.push({ overlay: marker, eventName: 'dragging', handler: handleDragging });
      nextOverlayClickListeners.push({ overlay: marker, eventName: 'dragend', handler: handleDragEnd });
    });

    if (showDiningStops) {
      day.diningStops.forEach((stop) => {
        const point = toPoint(api, stop.lngLat);
        const marker = new api.Marker(point, {
          title: escapeHtml(stop.name),
          icon: createDiningMarkerIcon(api),
          zIndex: 620,
        });
        const handleClick = () => {
          suppressNextMapClick();
          setIsDiningInfoOpen(true);
          map.openInfoWindow(
            new api.InfoWindow(renderDiningInfo(stop), { title: '', width: 244, offset: new api.Size(-18, 0), enableMessage: false }),
            point,
          );
          queueDiningInfoChrome();
        };
        marker.addEventListener('click', handleClick);
        map.addOverlay(marker);
        nextOverlayClickListeners.push({ overlay: marker, eventName: 'click', handler: handleClick });
      });
    }

    day.routeSegments.forEach((segment) => {
      const from = stopsById.get(segment.fromStopId);
      const to = stopsById.get(segment.toStopId);
      if (!from || !to) {
        return;
      }

      const selectedOption = getSelectedOption(segment);
      const routeLngLats = getSegmentRouteLngLats(from, to, segment, selectedOption, routeMode);
      const points = routeLngLats.map((lngLat) => toPoint(api, lngLat));
      const polyline = new api.Polyline(points, {
        strokeColor: selectedSegmentId === segment.id ? '#0071e3' : '#5aa9f8',
        strokeOpacity: selectedSegmentId === segment.id ? 0.86 : 0.64,
        strokeWeight: selectedSegmentId === segment.id ? 8 : 6,
      });
      const infoPoint = getInfoWindowPoint(api, routeLngLats);
      const handleClick = () => {
        suppressNextMapClick();
        clearDiningInfoChrome();
        onSelectSegment(segment.id);
        map.openInfoWindow(new api.InfoWindow(renderSegmentInfo(selectedOption), { title: escapeHtml(selectedOption?.title ?? 'Route') }), infoPoint);
      };
      polyline.addEventListener('click', handleClick);
      map.addOverlay(polyline);
      nextOverlayClickListeners.push({ overlay: polyline, eventName: 'click', handler: handleClick });
    });

    overlayClickListenersRef.current = nextOverlayClickListeners;

    return () => {
      clearDiningInfoChrome();
      map.removeEventListener?.('click', handleMapClick);
      clearMapOverlays(map, overlayClickListenersRef.current);
      overlayClickListenersRef.current = [];
    };
  }, [api, day, map, onClearSelection, onSelectSegment, onSelectStop, onSwapStops, routeMode, selectedSegmentId, selectedStopId, showDiningStops, stopsById]);

  return (
    <section
      className={`map-wrap baidu-map-wrap${isDiningInfoOpen ? ' dining-info-open' : ''}`}
      role="region"
      aria-label="Baidu trip map"
      data-route-mode={routeMode}
    >
      <div className="map-toolbar" aria-label="Map tools">
        <button
          className="tool text-tool"
          type="button"
          aria-label={routeModeLabel}
          aria-pressed={routeMode === 'full'}
          title={routeModeLabel}
          onClick={() => setRouteMode((current) => (current === 'simple' ? 'full' : 'simple'))}
        >
          {routeModeLabel}
        </button>
      </div>
      <div ref={containerRef} className="baidu-map-canvas" />
      {loadFailed ? (
        <div className="state-overlay error">
          <div className="state-card">
            <strong>Baidu map unavailable</strong>
            <p>Map SDK failed to load.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const getSelectedOption = (segment: RouteSegment): TransportOption | undefined =>
  segment.options.find((option) => option.id === segment.selectedOptionId) ??
  segment.options.find((option) => option.mode === segment.selectedMode);

const getSegmentRouteLngLats = (
  from: TripStop,
  to: TripStop,
  segment: RouteSegment,
  option: TransportOption | undefined,
  mode: RouteDisplayMode,
): LngLat[] => {
  if (mode === 'simple') {
    return [from.lngLat, to.lngLat];
  }

  const routePath = option?.routePath?.filter(isValidLngLat);
  if (routePath && routePath.length >= 2) {
    return routePath;
  }

  return buildFallbackRouteLngLats(from.lngLat, to.lngLat, option?.mode ?? segment.selectedMode);
};

const buildFallbackRouteLngLats = (from: LngLat, to: LngLat, mode: TransportOption['mode']): LngLat[] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (mode === 'walk') {
    return [
      from,
      [from[0] + dx * 0.18, from[1] + dy * 0.08],
      [from[0] + dx * 0.36, from[1] + dy * 0.44],
      [from[0] + dx * 0.68, from[1] + dy * 0.58],
      [from[0] + dx * 0.86, from[1] + dy * 0.92],
      to,
    ];
  }
  if (mode === 'taxi') {
    return [
      from,
      [from[0] + dx * 0.24, from[1] + dy * 0.04],
      [from[0] + dx * 0.72, from[1] + dy * 0.86],
      to,
    ];
  }
  if (mode === 'manual') {
    return [from, getMidpoint(from, to), to];
  }
  return [
    from,
    [from[0] + dx * 0.22, from[1]],
    [from[0] + dx * 0.22, from[1] + dy * 0.52],
    [from[0] + dx * 0.64, from[1] + dy * 0.52],
    [from[0] + dx * 0.64, to[1]],
    to,
  ];
};

const clearMapOverlays = (map: BaiduMapInstance, listeners: BaiduOverlayClickListener[]) => {
  listeners.forEach(({ overlay, eventName, handler }) => overlay.removeEventListener?.(eventName, handler));
  const overlays = listeners.map(({ overlay }) => overlay);
  if (map.clearOverlays) {
    map.clearOverlays();
    return;
  }
  overlays.forEach((overlay) => map.removeOverlay?.(overlay));
};

const getVisibleCenterLngLats = (day: TripDay, showDiningStops: boolean, tripCenter?: LngLat): LngLat[] => {
  const visibleLngLats = [
    ...day.stops.map((stop) => stop.lngLat),
    ...(showDiningStops ? day.diningStops.map((stop) => stop.lngLat) : []),
  ];
  return visibleLngLats.length > 0 ? visibleLngLats : [tripCenter ?? [121.4737, 31.2304]];
};

const getCenterLngLat = (lngLats: LngLat[]): LngLat => {
  if (lngLats.length === 0) {
    return [121.4737, 31.2304];
  }
  const totals = lngLats.reduce(
    (sum, lngLat) => ({
      lng: sum.lng + lngLat[0],
      lat: sum.lat + lngLat[1],
    }),
    { lng: 0, lat: 0 },
  );
  return [totals.lng / lngLats.length, totals.lat / lngLats.length];
};

const getCenterKey = (lngLats: LngLat[]): string => lngLats.map((lngLat) => lngLat.join(',')).join('|');

const getInfoWindowPoint = (api: BaiduMapApi, routeLngLats: LngLat[]): BaiduPoint => {
  if (routeLngLats.length === 0) {
    return toPoint(api, [121.4737, 31.2304]);
  }
  const index = Math.floor(routeLngLats.length / 2);
  return toPoint(api, routeLngLats[index]);
};

const getMidpoint = (from: LngLat, to: LngLat): LngLat => [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

const toPoint = (api: BaiduMapApi, lngLat: LngLat): BaiduPoint => {
  // Baidu POIs are stored as BD-09 and render directly; mock/manual/AMap points may have small offsets until conversion is added.
  return new api.Point(lngLat[0], lngLat[1]);
};

interface MarkerIconOptions {
  selected?: boolean;
  snapTarget?: boolean;
  originGhost?: boolean;
}

const createStopMarkerIcon = (api: BaiduMapApi, stop: TripStop, order: number, options: MarkerIconOptions): unknown => {
  if (getStopMarkerKind(stop) === 'accommodation') {
    return createAccommodationMarkerIcon(api, options);
  }
  return createNumberedMarkerIcon(api, order, options);
};

const getMarkerPalette = ({ selected = false, snapTarget = false }: MarkerIconOptions) => {
  if (snapTarget) {
    return {
      outer: '#f8fafc',
      inner: '#8e99a8',
      text: '#ffffff',
      halo: 'rgba(142,153,168,0.28)',
      shadow: 'rgba(16,24,40,0.18)',
    };
  }
  return {
    outer: '#ffffff',
    inner: selected ? '#005bb8' : '#0071e3',
    text: '#ffffff',
    halo: selected ? 'rgba(0,113,227,0.28)' : 'rgba(255,255,255,0.82)',
    shadow: selected ? 'rgba(0,113,227,0.3)' : 'rgba(16,24,40,0.18)',
  };
};

const createNumberedMarkerIcon = (api: BaiduMapApi, order: number, options: MarkerIconOptions): unknown => {
  const palette = getMarkerPalette(options);
  const opacity = options.originGhost ? '0.42' : '1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 50 50" data-snap-target="${options.snapTarget ? 'true' : 'false'}" data-origin-ghost="${options.originGhost ? 'true' : 'false'}" opacity="${opacity}">
    <defs>
      <filter id="markerShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="${palette.shadow}"/>
      </filter>
    </defs>
    <circle class="marker-sticker-outer" cx="25" cy="24" r="20" fill="${palette.outer}" stroke="#ffffff" stroke-width="4" filter="url(#markerShadow)"/>
    <circle class="marker-sticker-inner" cx="25" cy="24" r="13.5" fill="${palette.inner}"/>
    <circle cx="25" cy="24" r="23" fill="none" stroke="${palette.halo}" stroke-width="3"/>
    <text x="25" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="${palette.text}">${order}</text>
  </svg>`;
  return createSvgIcon(api, svg);
};

const createAccommodationMarkerIcon = (api: BaiduMapApi, options: MarkerIconOptions): unknown => {
  const palette = getMarkerPalette(options);
  const opacity = options.originGhost ? '0.42' : '1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 50 50" data-snap-target="${options.snapTarget ? 'true' : 'false'}" data-origin-ghost="${options.originGhost ? 'true' : 'false'}" opacity="${opacity}">
    <defs>
      <filter id="markerShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="${palette.shadow}"/>
      </filter>
    </defs>
    <circle class="marker-sticker-outer" cx="25" cy="24" r="20" fill="${palette.outer}" stroke="#ffffff" stroke-width="4" filter="url(#markerShadow)"/>
    <circle class="marker-sticker-inner" cx="25" cy="24" r="13.5" fill="${palette.inner}"/>
    <circle cx="25" cy="24" r="23" fill="none" stroke="${palette.halo}" stroke-width="3"/>
    <path class="marker-house-icon" d="M17.8 25.2 25 18.8l7.2 6.4" fill="none" stroke="${palette.text}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="marker-house-icon" d="M20.2 24.2v7.6h9.6v-7.6" fill="none" stroke="${palette.text}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="marker-house-icon" d="M23.6 31.8v-4.2h2.8v4.2" fill="none" stroke="${palette.text}" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
  return createSvgIcon(api, svg);
};

const createDiningMarkerIcon = (api: BaiduMapApi): unknown => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 48 48">
    <defs>
      <filter id="diningShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="rgba(88,50,26,0.28)"/>
      </filter>
    </defs>
    <circle class="marker-dining-halo" cx="24" cy="23" r="20" fill="#ffffff" stroke="rgba(245,158,11,0.38)" stroke-width="4" filter="url(#diningShadow)"/>
    <circle cx="24" cy="23" r="15" fill="#f59e0b"/>
    <g class="marker-dining-icon" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16.8 14.8v6.8"/>
      <path d="M20 14.8v6.8"/>
      <path d="M23.2 14.8v6.8"/>
      <path d="M16.8 22c0 2.2 1.4 3.7 3.2 3.7s3.2-1.5 3.2-3.7"/>
      <path d="M20 25.7v7.2"/>
      <path d="M31.6 14.9c-2.8 2.5-3.2 7.8-.2 10.5"/>
      <path d="M31.6 14.9v18"/>
    </g>
  </svg>`;
  return new api.Icon(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new api.Size(42, 42), {
    anchor: new api.Size(21, 21),
  });
};

const createSvgIcon = (api: BaiduMapApi, svg: string): unknown => {
  return new api.Icon(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new api.Size(40, 40), {
    anchor: new api.Size(20, 20),
  });
};

const getEventPoint = (event: unknown): BaiduPoint | null => {
  if (!event || typeof event !== 'object' || !('point' in event)) {
    return null;
  }
  return (event as { point?: BaiduPoint }).point ?? null;
};

const getDiningInfoChromeNodes = (content: Element | null | undefined): Element[] => {
  const nodes: Element[] = [];
  let current = content?.parentElement ?? null;
  while (current && current !== document.body) {
    const className = String(current.className);
    if (isBaiduMapLayerNode(current, className)) {
      break;
    }
    if (current.querySelector('.dining-info-window') && isBaiduPopupChromeNode(className)) {
      nodes.push(current);
      if (isBaiduPopupRootNode(className)) {
        break;
      }
    }
    current = current.parentElement;
  }
  return nodes;
};

const getDiningInfoShadowNodes = (content: Element | null | undefined): Element[] => {
  const mapCanvas = content?.closest('.baidu-map-canvas') ?? document;
  return Array.from(mapCanvas.querySelectorAll('.BMap_shadow')).filter((node) =>
    Boolean(node.querySelector('img[src*="iws"]')),
  );
};

const isBaiduMapLayerNode = (node: Element, className: string): boolean =>
  node.classList.contains('baidu-map-canvas') ||
  node.classList.contains('baidu-map-wrap') ||
  node.classList.contains('map-wrap') ||
  /\bBMap_(?:mapPane|tileLayer|markerPane|labelPane|floatPane|mask|vector)\b/.test(className);

const isBaiduPopupChromeNode = (className: string): boolean => /\bBMap_(?:pop|bubble|bubble_pop|bubble_content|bubble_title)\b/.test(className);

const isBaiduPopupRootNode = (className: string): boolean => /\bBMap_(?:pop|bubble_pop)\b/.test(className);

const getNearestSnapStopId = (point: BaiduPoint, stops: TripStop[]): string | null => {
  let nearest: { stopId: string; distance: number } | null = null;
  for (const stop of stops.filter((item) => getStopMarkerKind(item) !== 'accommodation')) {
    const distance = Math.hypot(point.lng - stop.lngLat[0], point.lat - stop.lngLat[1]);
    if (!nearest || distance < nearest.distance) {
      nearest = { stopId: stop.id, distance };
    }
  }
  return nearest?.stopId ?? null;
};

const isValidLngLat = (lngLat: LngLat): boolean => Number.isFinite(lngLat[0]) && Number.isFinite(lngLat[1]);

const renderStopInfo = (stop: TripStop): string =>
  `<div class="baidu-info-window"><strong>${escapeHtml(stop.name)}</strong><p>${escapeHtml(stop.startTime)}</p><small>${escapeHtml(
    stop.note,
  )}</small></div>`;

const renderSegmentInfo = (option: TransportOption | undefined): string =>
  `<div class="baidu-info-window"><strong>${escapeHtml(option?.title ?? 'Route')}</strong><p>${option?.durationMinutes ?? 0} min · CNY ${
    option?.costCny ?? 0
  }</p></div>`;

const diningInfoWindowStyle =
  'box-sizing:border-box;position:relative;width:100%;min-width:220px;margin:0;padding:0;color:#1d1d1f;font-family:inherit;overflow:visible;border:1px solid rgba(255,255,255,0.92);border-left:4px solid #f59e0b;border-radius:8px;background:linear-gradient(145deg,rgba(255,255,255,0.72),rgba(255,248,235,0.50));-webkit-backdrop-filter:blur(20px) saturate(1.65);backdrop-filter:blur(20px) saturate(1.65);box-shadow:0 0 0 1px rgba(120,120,128,0.10),inset 0 1px 0 rgba(255,255,255,0.82),inset 0 -1px 0 rgba(255,255,255,0.24),12px 12px 24px -8px rgba(16,24,40,0.26),4px 4px 10px -3px rgba(16,24,40,0.14);';

const renderDiningInfo = (stop: DiningStop): string =>
  `<div class="baidu-info-window dining-info-window" style="${diningInfoWindowStyle}">
    <div class="dining-info-surface" style="border:0;border-radius:0;background:transparent;box-shadow:none;padding:14px 15px 13px 11px;">
      <span class="dining-info-accent" aria-hidden="true"></span>
      <div class="dining-info-header">
        <span class="dining-info-pill">${escapeHtml(stop.tags.join(' / ') || '餐饮')}</span>
        <strong class="dining-info-name">${escapeHtml(stop.name)}</strong>
      </div>
      <small class="dining-info-address">${escapeHtml(stop.address)}</small>
    </div>
    <span class="dining-info-tail" aria-hidden="true"></span>
  </div>`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
