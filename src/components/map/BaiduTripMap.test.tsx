import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shanghaiSampleTrip } from '../../data/sampleTrip';
import type { DiningStop, LngLat, RouteSegment, TripDay, TripStop } from '../../types/trip';
import { BaiduTripMap } from './BaiduTripMap';

type EventHandler = (event?: unknown) => void;

const baiduStub = vi.hoisted(() => {
  class EventTargetStub {
    readonly handlers = new globalThis.Map<string, EventHandler[]>();

    readonly addEventListener = vi.fn((eventName: string, handler: EventHandler) => {
      const handlers = this.handlers.get(eventName) ?? [];
      handlers.push(handler);
      this.handlers.set(eventName, handlers);
    });

    readonly removeEventListener = vi.fn((eventName: string, handler: EventHandler) => {
      const handlers = this.handlers.get(eventName) ?? [];
      this.handlers.set(
        eventName,
        handlers.filter((item) => item !== handler),
      );
    });

    trigger(eventName: string, event?: unknown) {
      this.handlers.get(eventName)?.forEach((handler) => handler(event));
    }
  }

  class Point {
    constructor(
      public lng: number,
      public lat: number,
    ) {}
  }

  class Size {
    constructor(
      public width: number,
      public height: number,
    ) {}
  }

  class Icon {
    constructor(
      public imageUrl: string,
      public size: Size,
      public options?: Record<string, unknown>,
    ) {}
  }

  class Marker extends EventTargetStub {
    readonly enableDragging = vi.fn();
    readonly setIcon = vi.fn((icon: Icon) => {
      this.options = { ...this.options, icon };
    });
    readonly setPosition = vi.fn((point: Point) => {
      this.point = point;
    });

    constructor(
      public point: Point,
      public options?: Record<string, unknown>,
    ) {
      super();
      markers.push(this);
    }
  }

  class Polyline extends EventTargetStub {
    constructor(
      public points: Point[],
      public options?: Record<string, unknown>,
    ) {
      super();
      polylines.push(this);
    }

    getPath() {
      return this.points;
    }

    setPath(points: Point[]) {
      this.points = points;
    }
  }

  class InfoWindow {
    constructor(
      public content: string | HTMLElement,
      public options?: Record<string, unknown>,
    ) {}
  }

  class NavigationControl {}

  class ScaleControl {}

  type Overlay = Marker | Polyline;

  const maps: MapStub[] = [];
  const markers: Marker[] = [];
  const polylines: Polyline[] = [];

  class MapStub extends EventTargetStub {
    readonly overlays: Overlay[] = [];
    readonly controls: Array<NavigationControl | ScaleControl> = [];
    readonly enableScrollWheelZoom = vi.fn();
    readonly enableDragging = vi.fn();
    readonly centerAndZoom = vi.fn();
    readonly addControl = vi.fn((control: NavigationControl | ScaleControl) => {
      this.controls.push(control);
    });
    readonly addOverlay = vi.fn((overlay: Overlay) => {
      this.overlays.push(overlay);
    });
    readonly clearOverlays = vi.fn(() => {
      this.overlays.length = 0;
    });
    readonly removeOverlay = vi.fn((overlay: Overlay) => {
      const index = this.overlays.indexOf(overlay);
      if (index >= 0) {
        this.overlays.splice(index, 1);
      }
    });
    readonly openInfoWindow = vi.fn();

    constructor(
      public container: HTMLElement | string,
      public options?: Record<string, unknown>,
    ) {
      super();
      maps.push(this);
    }
  }

  return {
    api: {
      Map: MapStub,
      Point,
      Size,
      Icon,
      Marker,
      Polyline,
      InfoWindow,
      NavigationControl,
      ScaleControl,
    },
    maps,
    markers,
    polylines,
    reset() {
      maps.length = 0;
      markers.length = 0;
      polylines.length = 0;
    },
  };
});

vi.mock('../../services/mapProvider/baiduSdk', () => ({
  loadBaiduApi: vi.fn(() => Promise.resolve(baiduStub.api)),
  createBaiduPoint: vi.fn((api: typeof baiduStub.api, lngLat: LngLat) => new api.Point(lngLat[0], lngLat[1])),
}));

const activeDay = shanghaiSampleTrip.days[0];

describe('BaiduTripMap', () => {
  beforeEach(() => {
    baiduStub.reset();
    vi.clearAllMocks();
  });

  it('initializes the Baidu map and adds marker and route overlays for the active day', async () => {
    const map = await renderBaiduTripMap();

    expect(map.enableScrollWheelZoom).toHaveBeenCalledWith(true);
    expect(map.enableDragging).toHaveBeenCalledTimes(1);
    expect(map.centerAndZoom).toHaveBeenCalledWith(expect.any(baiduStub.api.Point), expect.any(Number));
    expect(map.addControl).toHaveBeenCalledWith(expect.any(baiduStub.api.NavigationControl));
    expect(map.addControl).toHaveBeenCalledWith(expect.any(baiduStub.api.ScaleControl));
    expect(map.overlays.filter((overlay) => overlay instanceof baiduStub.api.Marker)).toHaveLength(activeDay.stops.length);
    expect(map.overlays.filter((overlay) => overlay instanceof baiduStub.api.Polyline)).toHaveLength(activeDay.routeSegments.length);
  });

  it('selects a stop when its marker is clicked', async () => {
    const onSelectStop = vi.fn();
    const onClearSelection = vi.fn();
    await renderBaiduTripMap({ onSelectStop, onClearSelection });

    act(() => {
      baiduStub.markers[0].trigger('click');
    });

    expect(onSelectStop).toHaveBeenCalledWith(activeDay.stops[0].id);
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('clears selection when the Baidu map background is clicked', async () => {
    const onClearSelection = vi.fn();
    const map = await renderBaiduTripMap({ selectedStopId: activeDay.stops[0].id, onClearSelection });

    act(() => {
      map.trigger('click');
    });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('keeps the stop detail visible when a Baidu marker click also reaches the map', async () => {
    const onSelectStop = vi.fn();
    const onClearSelection = vi.fn();
    const map = await renderBaiduTripMap({ onSelectStop, onClearSelection });

    act(() => {
      baiduStub.markers[0].trigger('click');
      map.trigger('click');
    });

    expect(onSelectStop).toHaveBeenCalledWith(activeDay.stops[0].id);
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('keeps the route detail visible when a Baidu route click also reaches the map', async () => {
    const onSelectSegment = vi.fn();
    const onClearSelection = vi.fn();
    const map = await renderBaiduTripMap({ onSelectSegment, onClearSelection });
    const targetPolyline = getLatestSegmentPolyline(activeDay, 'segment-anfu-museum');

    act(() => {
      targetPolyline.trigger('click');
      map.trigger('click');
    });

    expect(onSelectSegment).toHaveBeenCalledWith('segment-anfu-museum');
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('uses numbered scrapbook SVG icons for Baidu markers', async () => {
    await renderBaiduTripMap();

    const firstIcon = baiduStub.markers[0].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const svg = decodeURIComponent(firstIcon.imageUrl);

    expect(firstIcon).toBeInstanceOf(baiduStub.api.Icon);
    expect(firstIcon.size).toMatchObject({ width: 40, height: 40 });
    expect(svg).toContain('class="marker-sticker-outer"');
    expect(svg).toContain('class="marker-sticker-inner"');
    expect(svg).toContain('fill="#0071e3"');
    expect(svg).toContain('<svg');
    expect(svg).toContain('>1<');
    expect(baiduStub.markers[0].enableDragging).toHaveBeenCalledTimes(1);
  });

  it('uses a deeper blue selected inner fill for numbered Baidu markers', async () => {
    await renderBaiduTripMap({ selectedStopId: activeDay.stops[0].id });

    const firstIcon = baiduStub.markers[0].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const svg = decodeURIComponent(firstIcon.imageUrl);

    expect(svg).toContain('class="marker-sticker-inner"');
    expect(svg).toContain('fill="#005bb8"');
    expect(svg).toContain('>1<');
  });

  it('uses a house-in-circle SVG icon for accommodation Baidu markers', async () => {
    const day = {
      ...activeDay,
      stops: activeDay.stops.map((stop, index) => (index === 0 ? { ...stop, tags: ['住宿'] } : stop)),
    };

    await renderBaiduTripMap({ day });

    const firstIcon = baiduStub.markers[0].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const svg = decodeURIComponent(firstIcon.imageUrl);

    expect(svg).toContain('marker-house-icon');
    expect(svg).not.toContain('>1<');
    expect(baiduStub.markers[0].enableDragging).not.toHaveBeenCalled();
  });

  it('restarts visible Baidu marker numbers after an accommodation marker', async () => {
    const day = {
      ...activeDay,
      stops: activeDay.stops.map((stop, index) => (index === 2 ? { ...stop, tags: ['hotel'] } : stop)),
    };

    await renderBaiduTripMap({ day });

    const firstIcon = baiduStub.markers[0].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const secondIcon = baiduStub.markers[1].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const accommodationIcon = baiduStub.markers[2].options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const restartedIcon = baiduStub.markers[3].options?.icon as InstanceType<typeof baiduStub.api.Icon>;

    expect(decodeURIComponent(firstIcon.imageUrl)).toContain('>1<');
    expect(decodeURIComponent(secondIcon.imageUrl)).toContain('>2<');
    expect(decodeURIComponent(accommodationIcon.imageUrl)).toContain('marker-house-icon');
    expect(decodeURIComponent(restartedIcon.imageUrl)).toContain('>1<');
  });

  it('renders dining markers as separate non-draggable Baidu overlays when visible', async () => {
    const diningStops: DiningStop[] = [
      {
        id: 'dining-lunch',
        placeId: 'dining-lunch',
        name: '新天地午餐',
        address: '上海市黄浦区太仓路',
        city: '上海',
        lngLat: [121.4751, 31.2193],
        diningType: 'lunch',
        startTime: '12:00',
        averagePriceCny: 0,
        note: '',
        tags: ['午餐'],
        source: 'manual',
      },
    ];
    const map = await renderBaiduTripMap({ day: { ...activeDay, diningStops }, showDiningStops: true });

    expect(map.overlays.filter((overlay) => overlay instanceof baiduStub.api.Marker)).toHaveLength(activeDay.stops.length + 1);
    const diningIcon = baiduStub.markers.at(-1)?.options?.icon as InstanceType<typeof baiduStub.api.Icon>;
    const svg = decodeURIComponent(diningIcon.imageUrl);
    expect(svg).toContain('marker-dining-icon');
    expect(svg).toContain('marker-dining-halo');
    expect(svg).toContain('<path d="M31.6 14.9c-2.8');
    expect(svg).toContain('#f59e0b');
    expect(svg).not.toContain('#34c759');
    expect(diningIcon.size.width).toBe(42);
    expect(diningIcon.size.height).toBe(42);
    expect(baiduStub.markers.at(-1)?.enableDragging).not.toHaveBeenCalled();
  });

  it('opens a styled dining InfoWindow when a Baidu dining marker is clicked', async () => {
    const diningStops: DiningStop[] = [
      {
        id: 'dining-lunch',
        placeId: 'dining-lunch',
        name: 'Xintiandi Lunch',
        address: 'Taicang Road',
        city: 'Shanghai',
        lngLat: [121.4751, 31.2193],
        diningType: 'lunch',
        startTime: '12:00',
        averagePriceCny: 0,
        note: '',
        tags: ['Lunch'],
        source: 'manual',
      },
    ];
    const map = await renderBaiduTripMap({ day: { ...activeDay, diningStops }, showDiningStops: true });
    const diningMarker = baiduStub.markers.at(-1);

    act(() => {
      diningMarker?.trigger('click');
    });

    const infoWindow = getLastInfoWindow(map);
    expect(infoWindow.options).toMatchObject({ title: '', width: 244, enableMessage: false });
    expect(infoWindow.options?.offset).toEqual(expect.objectContaining({ width: -18, height: 0 }));
    expect(screen.getByRole('region', { name: 'Baidu trip map' })).toHaveClass('dining-info-open');
    expect(String(infoWindow.content)).toContain('class="baidu-info-window dining-info-window"');
    expect(String(infoWindow.content)).toContain('border-left:4px solid #f59e0b');
    expect(String(infoWindow.content)).toContain('border-radius:8px');
    expect(String(infoWindow.content)).toContain('backdrop-filter:blur(20px) saturate(1.65)');
    expect(String(infoWindow.content)).toContain('12px 12px 24px -8px rgba(16,24,40,0.26)');
    expect(String(infoWindow.content)).toContain('class="dining-info-surface"');
    expect(String(infoWindow.content)).toContain('class="dining-info-tail"');
    expect(String(infoWindow.content)).toContain('class="dining-info-accent"');
    expect(String(infoWindow.content)).toContain('class="dining-info-pill"');
    expect(String(infoWindow.content)).toContain('class="dining-info-name"');
    expect(String(infoWindow.content)).not.toContain('class="dining-info-meta"');
    expect(String(infoWindow.content)).not.toContain('class="dining-info-time"');
    expect(String(infoWindow.content)).toContain('Xintiandi Lunch');
    expect(String(infoWindow.content)).not.toContain('12:00');
    expect(String(infoWindow.content)).toContain('Lunch');
    expect(String(infoWindow.content)).toContain('Taicang Road');
  });

  it('clears Baidu dining InfoWindow chrome without clearing the map container', async () => {
    const diningStops: DiningStop[] = [
      {
        id: 'dining-lunch',
        placeId: 'dining-lunch',
        name: 'Xintiandi Lunch',
        address: 'Taicang Road',
        city: 'Shanghai',
        lngLat: [121.4751, 31.2193],
        diningType: 'lunch',
        startTime: '12:00',
        averagePriceCny: 0,
        note: '',
        tags: ['Lunch'],
        source: 'manual',
      },
    ];
    const map = await renderBaiduTripMap({ day: { ...activeDay, diningStops }, showDiningStops: true });
    const region = screen.getByRole('region', { name: 'Baidu trip map' }) as HTMLElement;
    const canvas = region.querySelector('.baidu-map-canvas') as HTMLElement;
    region.style.background = 'rgb(250, 250, 250)';
    region.style.border = '1px solid red';
    region.style.boxShadow = '0 0 3px red';

    map.openInfoWindow.mockImplementation((infoWindow: InstanceType<typeof baiduStub.api.InfoWindow>) => {
      const mapPane = document.createElement('div');
      mapPane.className = 'BMap_mapPane';
      mapPane.style.overflow = 'hidden';
      mapPane.style.backgroundImage = 'url("tile-pane.png")';

      const shadow = document.createElement('div');
      shadow.className = 'BMap_shadow';
      const shadowImage = document.createElement('img');
      shadowImage.src = 'https://api.map.baidu.com/images/iws3.png';
      shadow.append(shadowImage);

      const tileLayer = document.createElement('div');
      tileLayer.className = 'BMap_tileLayer';
      tileLayer.style.backgroundImage = 'url("map-tile.png")';

      const shell = document.createElement('div');
      shell.className = 'BMap_bubble_pop';
      shell.style.overflow = 'hidden';
      shell.style.background = 'rgb(255, 255, 255)';
      shell.style.border = '1px solid rgb(0, 0, 0)';
      shell.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.4)';

      const contentShell = document.createElement('div');
      contentShell.className = 'BMap_bubble_content';
      contentShell.style.overflow = 'hidden';
      contentShell.innerHTML = String(infoWindow.content);

      shell.append(contentShell);
      mapPane.append(shadow, tileLayer, shell);
      canvas.append(mapPane);
    });

    act(() => {
      baiduStub.markers.at(-1)?.trigger('click');
    });

    const shell = canvas.querySelector('.BMap_bubble_pop') as HTMLElement;
    const contentShell = canvas.querySelector('.BMap_bubble_content') as HTMLElement;
    await waitFor(() => expect(shell).toHaveClass('dining-info-native-shell'));
    expect(shell.style.overflow).toBe('visible');
    expect(shell.style.background).toBe('transparent');
    expect(shell.style.border).toBe('0px');
    expect(shell.style.boxShadow).toBe('none');
    expect(contentShell.style.overflow).toBe('visible');
    const mapPane = canvas.querySelector('.BMap_mapPane') as HTMLElement;
    const tileLayer = canvas.querySelector('.BMap_tileLayer') as HTMLElement;
    expect(mapPane).not.toHaveClass('dining-info-native-shell');
    expect(mapPane.style.overflow).toBe('hidden');
    expect(mapPane.style.backgroundImage).toBe('url("tile-pane.png")');
    expect(tileLayer.style.backgroundImage).toBe('url("map-tile.png")');
    const nativeShadow = canvas.querySelector('.BMap_shadow') as HTMLElement;
    expect(nativeShadow).toHaveClass('dining-info-native-shadow');
    expect(nativeShadow.style.display).toBe('none');
    expect(region).not.toHaveClass('dining-info-native-shell');
    expect(region.style.background).toBe('rgb(250, 250, 250)');
    expect(region.style.border).toBe('1px solid red');
    expect(region.style.boxShadow).toBe('0 0 3px red');
  });

  it('keeps dining InfoWindow native chrome CSS scoped to marked popup shells', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(styles).not.toContain(':has(.dining-info-window)');
    expect(styles).not.toContain('.baidu-map-wrap.dining-info-open :is(.BMap_pop, .BMap_bubble_pop)');
    expect(styles).toContain('.dining-info-native-shell > div:not(.baidu-info-window');
    expect(styles).toContain('.dining-info-native-shell.BMap_bubble_content');
    expect(styles).toContain('.dining-info-native-shadow');
    expect(styles).toContain('.dining-info-tail');
    expect(styles).toContain('left: calc(50% - 9px);');
    expect(styles).toContain('transform: rotate(45deg);');
  });

  it('swaps stops when a Baidu marker is dragged onto another stop location', async () => {
    const onSwapStops = vi.fn();
    await renderBaiduTripMap({ onSwapStops });
    const sourceMarker = baiduStub.markers[0];
    const targetStop = activeDay.stops[2];
    const originalPoint = { lng: sourceMarker.point.lng, lat: sourceMarker.point.lat };

    act(() => {
      sourceMarker.trigger('dragend', {
        point: new baiduStub.api.Point(targetStop.lngLat[0], targetStop.lngLat[1]),
      });
    });

    expect(onSwapStops).toHaveBeenCalledWith(activeDay.stops[0].id, targetStop.id);
    expect(sourceMarker.setPosition).toHaveBeenCalledWith(expect.objectContaining({ lng: targetStop.lngLat[0], lat: targetStop.lngLat[1] }));
    expect(sourceMarker.point).not.toMatchObject(originalPoint);
  });

  it('snaps a Baidu marker back to its own point when that is the nearest stop', async () => {
    const onSwapStops = vi.fn();
    await renderBaiduTripMap({ onSwapStops });
    const sourceMarker = baiduStub.markers[0];
    const sourceStop = activeDay.stops[0];

    act(() => {
      sourceMarker.trigger('dragend', {
        point: new baiduStub.api.Point(sourceStop.lngLat[0] + 0.0004, sourceStop.lngLat[1] - 0.0002),
      });
    });

    expect(onSwapStops).not.toHaveBeenCalled();
    expect(sourceMarker.setPosition).toHaveBeenCalledWith(expect.objectContaining({ lng: sourceStop.lngLat[0], lat: sourceStop.lngLat[1] }));
  });

  it('adds a translucent origin marker while a Baidu marker is being dragged', async () => {
    const map = await renderBaiduTripMap();
    const sourceMarker = baiduStub.markers[0];
    const initialMarkerCount = baiduStub.markers.length;

    act(() => {
      sourceMarker.trigger('dragstart');
    });

    const originMarker = baiduStub.markers.at(-1);
    const originIcon = originMarker?.options?.icon as InstanceType<typeof baiduStub.api.Icon> | undefined;

    expect(baiduStub.markers).toHaveLength(initialMarkerCount + 1);
    expect(map.addOverlay).toHaveBeenCalledWith(originMarker);
    expect(decodeURIComponent(originIcon?.imageUrl ?? '')).toContain('data-origin-ghost="true"');

    act(() => {
      sourceMarker.trigger('dragend', {
        point: new baiduStub.api.Point(activeDay.stops[0].lngLat[0], activeDay.stops[0].lngLat[1]),
      });
    });

    expect(map.removeOverlay).toHaveBeenCalledWith(originMarker);
  });

  it('greys the nearest Baidu marker during dragging even when it is not within a close threshold', async () => {
    await renderBaiduTripMap();
    const sourceMarker = baiduStub.markers[0];
    const targetStop = activeDay.stops[2];
    const targetMarker = baiduStub.markers[2];

    act(() => {
      sourceMarker.trigger('dragging', {
        point: new baiduStub.api.Point(targetStop.lngLat[0] + 0.012, targetStop.lngLat[1] + 0.012),
      });
    });

    const highlightedIcon = targetMarker.setIcon.mock.calls.at(-1)?.[0] as InstanceType<typeof baiduStub.api.Icon> | undefined;
    const svg = decodeURIComponent(highlightedIcon?.imageUrl ?? '');

    expect(highlightedIcon).toBeInstanceOf(baiduStub.api.Icon);
    expect(svg).toContain('data-snap-target="true"');
    expect(svg).toContain('#8e99a8');
    expect(svg).not.toContain('#4f4639');
  });

  it('excludes accommodation stops from Baidu snap targets', async () => {
    const day = {
      ...activeDay,
      stops: activeDay.stops.map((stop, index) => (index === 2 ? { ...stop, tags: ['hotel'] } : stop)),
    };
    const onSwapStops = vi.fn();
    await renderBaiduTripMap({ day, onSwapStops });
    const sourceMarker = baiduStub.markers[0];
    const accommodationStop = day.stops[2];
    const nearestAvailableStop = day.stops[3];

    act(() => {
      sourceMarker.trigger('dragend', {
        point: new baiduStub.api.Point(accommodationStop.lngLat[0], accommodationStop.lngLat[1]),
      });
    });

    expect(onSwapStops).toHaveBeenCalledWith(day.stops[0].id, nearestAvailableStop.id);
    expect(sourceMarker.setPosition).toHaveBeenCalledWith(expect.objectContaining({ lng: nearestAvailableStop.lngLat[0], lat: nearestAvailableStop.lngLat[1] }));
  });

  it('escapes hostile stop names in marker InfoWindow title and content', async () => {
    const hostileName = '<img src=x onerror=alert("stop")> Hostile stop';
    const escapedName = '&lt;img src=x onerror=alert(&quot;stop&quot;)&gt; Hostile stop';
    const day = withStopName(activeDay, activeDay.stops[0].id, hostileName);
    const map = await renderBaiduTripMap({ day });

    act(() => {
      baiduStub.markers[0].trigger('click');
    });

    const infoWindow = getLastInfoWindow(map);
    expect(String(infoWindow.options?.title)).not.toContain('<img');
    expect(String(infoWindow.options?.title)).toContain(escapedName);
    expect(String(infoWindow.content)).not.toContain('<img');
    expect(String(infoWindow.content)).toContain(escapedName);
  });

  it('selects a route segment when its polyline is clicked', async () => {
    const onSelectSegment = vi.fn();
    await renderBaiduTripMap({ onSelectSegment });
    const targetPolyline = getLatestSegmentPolyline(activeDay, 'segment-anfu-museum');

    act(() => {
      targetPolyline.trigger('click');
    });

    expect(onSelectSegment).toHaveBeenCalledWith('segment-anfu-museum');
  });

  it('escapes hostile route option titles in polyline InfoWindow title and content', async () => {
    const hostileTitle = 'Fast route <script>alert("route")</script>';
    const escapedTitle = 'Fast route &lt;script&gt;alert(&quot;route&quot;)&lt;/script&gt;';
    const day = withSelectedOptionTitle(activeDay, 'segment-anfu-museum', hostileTitle);
    const map = await renderBaiduTripMap({ day });
    const targetPolyline = getLatestSegmentPolyline(day, 'segment-anfu-museum');

    act(() => {
      targetPolyline.trigger('click');
    });

    const infoWindow = getLastInfoWindow(map);
    expect(String(infoWindow.options?.title)).not.toContain('<script');
    expect(String(infoWindow.options?.title)).toContain(escapedTitle);
    expect(String(infoWindow.content)).not.toContain('<script');
    expect(String(infoWindow.content)).toContain(escapedTitle);
  });

  it('recenters the map when day stops change without remounting', async () => {
    const { map, rerenderMap } = await renderBaiduTripMapWithControls();
    const recenteredDay: TripDay = {
      ...activeDay,
      stops: [
        { ...activeDay.stops[0], lngLat: [121.1, 31.1] },
        { ...activeDay.stops[1], lngLat: [121.3, 31.5] },
      ],
      routeSegments: [],
    };

    expect(map.centerAndZoom).toHaveBeenCalledTimes(1);

    rerenderMap({ day: recenteredDay });

    await waitFor(() => expect(map.centerAndZoom).toHaveBeenCalledTimes(2));
    const [centerPoint, zoom] = map.centerAndZoom.mock.calls.at(-1) ?? [];
    expect(centerPoint.lng).toBeCloseTo(121.2);
    expect(centerPoint.lat).toBeCloseTo(31.3);
    expect(zoom).toBe(13);
  });

  it('centers on visible dining stops when no route stops exist', async () => {
    const diningOnlyDay: TripDay = {
      ...activeDay,
      stops: [],
      routeSegments: [],
      diningStops: [
        {
          id: 'dining-manual',
          placeId: 'dining-manual',
          name: '北京午餐',
          address: '北京市东城区',
          city: '北京',
          lngLat: [116.3974, 39.9093],
          diningType: 'lunch',
          startTime: '12:00',
          averagePriceCny: 0,
          note: '',
          tags: ['午餐'],
          source: 'manual',
        },
      ],
    };

    const map = await renderBaiduTripMap({ day: diningOnlyDay, showDiningStops: true });

    const [centerPoint, zoom] = map.centerAndZoom.mock.calls[0] ?? [];
    expect(centerPoint.lng).toBeCloseTo(116.3974);
    expect(centerPoint.lat).toBeCloseTo(39.9093);
    expect(zoom).toBe(13);
  });

  it('recenters when dining visibility changes on a dining-only day', async () => {
    const diningOnlyDay: TripDay = {
      ...activeDay,
      stops: [],
      routeSegments: [],
      diningStops: [
        {
          id: 'dining-manual',
          placeId: 'dining-manual',
          name: '北京午餐',
          address: '北京市东城区',
          city: '北京',
          lngLat: [116.3974, 39.9093],
          diningType: 'lunch',
          startTime: '12:00',
          averagePriceCny: 0,
          note: '',
          tags: ['午餐'],
          source: 'manual',
        },
      ],
    };
    const { map, rerenderMap } = await renderBaiduTripMapWithControls({ day: diningOnlyDay, showDiningStops: false });

    rerenderMap({ day: diningOnlyDay, showDiningStops: true });

    await waitFor(() => expect(map.centerAndZoom).toHaveBeenCalledTimes(2));
    const [centerPoint] = map.centerAndZoom.mock.calls.at(-1) ?? [];
    expect(centerPoint.lng).toBeCloseTo(116.3974);
    expect(centerPoint.lat).toBeCloseTo(39.9093);
  });

  it('removes overlay click listeners during unmount cleanup', async () => {
    const { unmount } = await renderBaiduTripMapWithControls();
    const marker = baiduStub.markers[0];
    const markerClickHandler = marker.addEventListener.mock.calls.find(([eventName]) => eventName === 'click')?.[1];
    const markerDragEndHandler = marker.addEventListener.mock.calls.find(([eventName]) => eventName === 'dragend')?.[1];
    const polyline = getLatestSegmentPolyline(activeDay, 'segment-anfu-museum');
    const polylineClickHandler = polyline.addEventListener.mock.calls.find(([eventName]) => eventName === 'click')?.[1];

    unmount();

    expect(marker.removeEventListener).toHaveBeenCalledWith('click', markerClickHandler);
    expect(marker.removeEventListener).toHaveBeenCalledWith('dragend', markerDragEndHandler);
    expect(polyline.removeEventListener).toHaveBeenCalledWith('click', polylineClickHandler);
  });

  it('uses soft Apple blue route styling for Baidu polylines', async () => {
    await renderBaiduTripMap({ selectedSegmentId: 'segment-anfu-museum' });

    const inactivePolyline = getLatestSegmentPolyline(activeDay, 'segment-wukang-anfu');
    const activePolyline = getLatestSegmentPolyline(activeDay, 'segment-anfu-museum');

    expect(inactivePolyline.options).toMatchObject({
      strokeColor: '#5aa9f8',
      strokeOpacity: 0.64,
      strokeWeight: 6,
    });
    expect(activePolyline.options).toMatchObject({
      strokeColor: '#0071e3',
      strokeOpacity: 0.86,
      strokeWeight: 8,
    });
  });

  it('switches from simple endpoint routes to full routePath geometry', async () => {
    const user = userEvent.setup();
    const routePath: LngLat[] = [
      [121.4462, 31.2116],
      [121.4625, 31.2168],
      [121.5048, 31.2224],
      [121.544, 31.227],
    ];
    const day = withRoutePath(activeDay, 'segment-anfu-museum', routePath);
    await renderBaiduTripMap({ day });

    const routeModeButton = screen.getByRole('button', { name: '完整路线' });
    expect(routeModeButton).toHaveAttribute('aria-pressed', 'false');
    expect(pointTuples(getLatestSegmentPolyline(day, 'segment-anfu-museum').getPath())).toEqual([
      getStop(day, 'stop-anfu-road').lngLat,
      getStop(day, 'stop-shanghai-museum-east').lngLat,
    ]);

    await user.click(routeModeButton);

    expect(screen.getByRole('button', { name: '简约路线' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(pointTuples(getLatestSegmentPolyline(day, 'segment-anfu-museum').getPath())).toEqual(routePath);
    });
  });
});

interface RenderOptions {
  day?: TripDay;
  selectedStopId?: string | null;
  selectedSegmentId?: string | null;
  onSelectStop?: (stopId: string) => void;
  onSelectSegment?: (segmentId: string) => void;
  onClearSelection?: () => void;
  onSwapStops?: (firstStopId: string, secondStopId: string) => void;
  showDiningStops?: boolean;
}

const renderBaiduTripMap = async (options: RenderOptions = {}) => {
  const { map } = await renderBaiduTripMapWithControls(options);
  return map;
};

const renderBaiduTripMapWithControls = async (options: RenderOptions = {}) => {
  const props = getMapProps(options);
  const view = render(<BaiduTripMap {...props} />);

  await waitFor(() => expect(baiduStub.maps).toHaveLength(1));
  const map = baiduStub.maps[0];
  const expectedOverlayCount =
    props.day.stops.length + props.day.routeSegments.length + (props.showDiningStops ? (props.day.diningStops?.length ?? 0) : 0);
  await waitFor(() => expect(map.overlays.length).toBe(expectedOverlayCount));

  return {
    map,
    unmount: view.unmount,
    rerenderMap(nextOptions: RenderOptions = {}) {
      view.rerender(<BaiduTripMap {...getMapProps({ ...props, ...nextOptions })} />);
    },
  };
};

const getMapProps = ({
  day = activeDay,
  selectedStopId = null,
  selectedSegmentId = null,
  onSelectStop = vi.fn(),
  onSelectSegment = vi.fn(),
  onClearSelection = vi.fn(),
  onSwapStops = vi.fn(),
  showDiningStops = false,
}: RenderOptions = {}) => ({
  day,
  selectedStopId,
  selectedSegmentId,
  showDiningStops,
  onSelectStop,
  onSelectSegment,
  onClearSelection,
  onSwapStops,
});

const getLatestSegmentPolyline = (day: TripDay, segmentId: string) => {
  const segmentIndex = day.routeSegments.findIndex((segment) => segment.id === segmentId);
  if (segmentIndex < 0) {
    throw new Error(`Unknown segment ${segmentId}`);
  }
  const latestBatch = baiduStub.polylines.slice(-day.routeSegments.length);
  const polyline = latestBatch[segmentIndex];
  if (!polyline) {
    throw new Error(`Polyline not rendered for ${segmentId}`);
  }
  return polyline;
};

const pointTuples = (points: Array<{ lng: number; lat: number }>): LngLat[] => points.map((point) => [point.lng, point.lat]);

const getLastInfoWindow = (map: Awaited<ReturnType<typeof renderBaiduTripMap>>) => {
  const [infoWindow] = map.openInfoWindow.mock.calls.at(-1) ?? [];
  if (!infoWindow) {
    throw new Error('Expected an InfoWindow to be opened');
  }
  return infoWindow as InstanceType<typeof baiduStub.api.InfoWindow>;
};

const getStop = (day: TripDay, stopId: string): TripStop => {
  const stop = day.stops.find((item) => item.id === stopId);
  if (!stop) {
    throw new Error(`Unknown stop ${stopId}`);
  }
  return stop;
};

const withStopName = (day: TripDay, stopId: string, name: string): TripDay => ({
  ...day,
  stops: day.stops.map((stop): TripStop => (stop.id === stopId ? { ...stop, name } : stop)),
});

const withSelectedOptionTitle = (day: TripDay, segmentId: string, title: string): TripDay => ({
  ...day,
  routeSegments: day.routeSegments.map((segment): RouteSegment => {
    if (segment.id !== segmentId) {
      return segment;
    }
    return {
      ...segment,
      options: segment.options.map((option) => (option.id === segment.selectedOptionId ? { ...option, title } : option)),
    };
  }),
});

const withRoutePath = (day: TripDay, segmentId: string, routePath: LngLat[]): TripDay => ({
  ...day,
  routeSegments: day.routeSegments.map((segment): RouteSegment => {
    if (segment.id !== segmentId) {
      return segment;
    }
    return {
      ...segment,
      options: segment.options.map((option) =>
        option.id === segment.selectedOptionId
          ? {
              ...option,
              routePath,
            }
          : option,
      ),
    };
  }),
});
