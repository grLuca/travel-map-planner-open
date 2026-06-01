import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { shanghaiSampleTrip } from './data/sampleTrip';
import { TRIP_EXPORT_VERSION, exportTripToJson } from './services/importExport';
import { MAP_API_SETTINGS_STORAGE_KEY } from './services/mapApiSettings';
import { PROJECT_LIBRARY_STORAGE_KEY } from './services/projectLibrary';
import type { LngLat } from './types/trip';

type EventHandler = (event?: unknown) => void;

const baiduAppStub = vi.hoisted(() => {
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
  }

  class Polyline extends EventTargetStub {}

  class InfoWindow {}

  class NavigationControl {}

  class ScaleControl {}

  const maps: MapStub[] = [];

  class MapStub extends EventTargetStub {
    readonly enableScrollWheelZoom = vi.fn();
    readonly enableDragging = vi.fn();
    readonly addControl = vi.fn();
    readonly centerAndZoom = vi.fn();
    readonly addOverlay = vi.fn();
    readonly clearOverlays = vi.fn();
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
      LocalSearch: class {},
      TransitRoute: class {},
      DrivingRoute: class {},
      WalkingRoute: class {},
    },
    maps,
    reset() {
      maps.length = 0;
    },
  };
});

const baiduSdkMock = vi.hoisted(() => ({
  loadBaiduApi: vi.fn(),
  resetBaiduApiLoader: vi.fn(),
}));

vi.mock('./services/mapProvider/baiduSdk', () => ({
  loadBaiduApi: baiduSdkMock.loadBaiduApi,
  resetBaiduApiLoader: baiduSdkMock.resetBaiduApiLoader,
  createBaiduPoint: vi.fn((api: typeof baiduAppStub.api, lngLat: LngLat) => new api.Point(lngLat[0], lngLat[1])),
  getSuccessStatus: vi.fn(() => 0),
  isBaiduApiReady: vi.fn(() => false),
  BAIDU_BROWSER_AK: '',
}));

describe('App', () => {
  beforeEach(() => {
    baiduAppStub.reset();
    baiduSdkMock.loadBaiduApi.mockReset();
    baiduSdkMock.loadBaiduApi.mockResolvedValue(baiduAppStub.api);
    baiduSdkMock.resetBaiduApiLoader.mockReset();

    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
      },
    });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  });

  const enableStoredBaiduAk = () => {
    window.localStorage.setItem(MAP_API_SETTINGS_STORAGE_KEY, JSON.stringify({ baiduBrowserAk: 'test-ak' }));
  };

const renderPlanner = async (user = userEvent.setup()) => {
    render(<App />);
    expect(screen.getByRole('main', { name: '旅行项目控制台' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回规划' }));
  return user;
};

const readDataUrlText = (url: string): string => decodeURIComponent(url.split(',')[1] ?? '');

  it('renders the planner shell with itinerary, map, detail, and summary regions', async () => {
    await renderPlanner();

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue(shanghaiSampleTrip.title);
    expect(screen.getByRole('complementary', { name: '行程列表' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Baidu trip map' })).toBeInTheDocument();
    const appShell = screen.getByRole('region', { name: 'Baidu trip map' }).closest('.app');
    expect(appShell).toHaveClass('planner-app');
    expect(appShell).toHaveClass('full-bleed-map-app');
    expect(screen.getByRole('complementary', { name: '详情面板' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: '行程摘要' })).toBeInTheDocument();
    expect(screen.getByText(shanghaiSampleTrip.days[0].stops[0].name)).toBeInTheDocument();
  });

  it('renders compact day tabs with inline add/delete and icon-only dining controls', async () => {
    await renderPlanner();
    const sidebar = screen.getByRole('complementary', { name: '行程列表' });
    const dayTabs = within(sidebar).getByRole('tablist', { name: '行程日期' });
    const dayOne = within(dayTabs).getByRole('tab', { name: `Day 1 ${shanghaiSampleTrip.days[0].date.slice(5)}` });

    expect(dayOne).toBeInTheDocument();
    expect(within(dayTabs).queryByText(/点/)).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: '增加日期' })).toHaveClass('day-add-button');
    expect(within(sidebar).queryByRole('button', { name: '删除 Day 1' })).not.toBeInTheDocument();

    await userEvent.click(dayOne);
    expect(within(sidebar).getByRole('button', { name: '删除 Day 1' })).toHaveClass('day-delete-button');

    const diningMode = within(sidebar).getByRole('button', { name: '餐饮规划' });
    const diningVisibility = within(sidebar).getByRole('button', { name: '隐藏餐饮点' });
    expect(diningMode).toHaveClass('square-tool');
    expect(diningVisibility).toHaveClass('square-tool');
    expect(diningMode).toHaveTextContent('');
    expect(diningVisibility).toHaveTextContent('');
  });

  it('scrolls the day strip horizontally with the mouse wheel and hides day deletion on outside click', async () => {
    const user = await renderPlanner();
    const sidebar = screen.getByRole('complementary', { name: '行程列表' });
    const dayTabs = within(sidebar).getByRole('tablist', { name: '行程日期' });

    for (let index = 0; index < 5; index += 1) {
      await user.click(within(sidebar).getByRole('button', { name: '增加日期' }));
    }

    fireEvent.wheel(dayTabs, { deltaY: 96 });
    expect(dayTabs.scrollLeft).toBe(96);

    await user.click(within(dayTabs).getByRole('tab', { name: `Day 1 ${shanghaiSampleTrip.days[0].date.slice(5)}` }));
    expect(within(sidebar).getByRole('button', { name: '删除 Day 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('region', { name: 'Baidu trip map' }));
    expect(within(sidebar).queryByRole('button', { name: '删除 Day 1' })).not.toBeInTheDocument();
  });

  it('uses Baidu Maps as the default map mode', async () => {
    await renderPlanner();

    expect(screen.getByRole('combobox', { name: '地图源' })).toHaveValue('baidu');
    expect(screen.getByRole('button', { name: '地图 API 设置' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '百度地图' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Baidu trip map' })).toBeInTheDocument();
    await waitFor(() => expect(baiduSdkMock.loadBaiduApi).toHaveBeenCalledTimes(1));
  });

  it('saves a Baidu browser AK from the settings dialog and enables Baidu Maps', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '地图 API 设置' }));
    await user.type(screen.getByLabelText('百度浏览器端 AK'), 'test-baidu-ak');
    await user.click(screen.getByRole('button', { name: '保存并启用百度地图' }));

    expect(window.localStorage.getItem(MAP_API_SETTINGS_STORAGE_KEY)).toBe(JSON.stringify({ baiduBrowserAk: 'test-baidu-ak' }));
    expect(screen.getByRole('combobox', { name: '地图源' })).toHaveValue('baidu');
    expect(screen.getByRole('region', { name: 'Baidu trip map' })).toBeInTheDocument();
    await waitFor(() => expect(baiduSdkMock.loadBaiduApi).toHaveBeenCalledTimes(2));
    expect(baiduSdkMock.resetBaiduApiLoader).toHaveBeenCalledTimes(1);
  });

  it('initializes the real Baidu map when the default SDK load resolves', async () => {
    enableStoredBaiduAk();
    await renderPlanner();

    expect(await screen.findByRole('region', { name: 'Baidu trip map' })).toBeInTheDocument();
    await waitFor(() => expect(baiduAppStub.maps).toHaveLength(1));
    expect(baiduAppStub.maps[0].container).toBeInstanceOf(HTMLElement);
  });

  it('falls back to the static itinerary map with the map error overlay when Baidu SDK loading fails', async () => {
    enableStoredBaiduAk();
    baiduSdkMock.loadBaiduApi.mockRejectedValueOnce(new Error('sdk unavailable'));

    await renderPlanner();

    expect(await screen.findByText('地图暂时无法加载')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '地图画布' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `选择地图点位 ${shanghaiSampleTrip.days[0].stops[0].name}` })).toBeInTheDocument();
  });

  it('retries the real Baidu map after a transient SDK loading failure is reset', async () => {
    const user = userEvent.setup();
    enableStoredBaiduAk();
    baiduSdkMock.loadBaiduApi.mockRejectedValueOnce(new Error('sdk unavailable'));

    await renderPlanner(user);

    expect(await screen.findByText('地图暂时无法加载')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '恢复' }));

    expect(await screen.findByRole('region', { name: 'Baidu trip map' })).toBeInTheDocument();
    await waitFor(() => expect(baiduSdkMock.loadBaiduApi).toHaveBeenCalledTimes(2));
  });

  it('searches and adds a place to the active day', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);
    const day = shanghaiSampleTrip.days[0];

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.type(screen.getByRole('searchbox'), shanghaiSampleTrip.city);
    const searchResults = within(await screen.findByRole('listbox'));
    await user.click((await searchResults.findAllByRole('button', { name: /添加/ }))[0]);

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    expect(within(itinerary).getAllByRole('button', { name: /^\d{2}:\d{2}/ })).toHaveLength(day.stops.length + 1);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect((await screen.findAllByText('地铁 10 号线 → 2 号线')).length).toBeGreaterThan(0);
  });

  it('adds a searched place as lodging without relying on the place name', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.type(screen.getByRole('searchbox'), shanghaiSampleTrip.city);
    const searchResults = within(await screen.findByRole('listbox'));
    await user.click((await searchResults.findAllByRole('button', { name: /作为住宿添加/ }))[0]);

    const accommodationMarker = screen
      .getAllByRole('button')
      .find((button) => button.classList.contains('marker') && button.getAttribute('data-stop-kind') === 'accommodation');
    expect(accommodationMarker).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: /点位类型/ })).toHaveValue('accommodation');
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('adds a searched place as dining from route mode without switching panels', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.type(screen.getByRole('searchbox'), shanghaiSampleTrip.city);
    const searchResults = within(await screen.findByRole('listbox'));
    const diningAddButtons = await searchResults.findAllByRole('button', { name: /作为餐饮添加/ });
    const lodgingAddButtons = await searchResults.findAllByRole('button', { name: /作为住宿添加/ });
    expect(
      Boolean(diningAddButtons[0].compareDocumentPosition(lodgingAddButtons[0]) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    await user.click(diningAddButtons[0]);

    const sidebar = screen.getByRole('complementary', { name: '行程列表' });
    expect(within(sidebar).getByText('当天路线')).toBeInTheDocument();
    expect(within(sidebar).queryByText('餐饮点位')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择地图餐饮点/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('switches an existing route stop to lodging from the detail panel', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);
    const sidebar = screen.getByRole('complementary', { name: '行程列表' });

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(within(sidebar).getAllByRole('button', { name: /^\d{2}:\d{2}/ })[1]);
    await user.selectOptions(screen.getByRole('combobox', { name: /点位类型/ }), 'accommodation');

    const accommodationMarker = screen
      .getAllByRole('button')
      .find((button) => button.classList.contains('marker') && button.getAttribute('data-stop-kind') === 'accommodation');
    expect(accommodationMarker).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '选择地图点位 安福路' })).toHaveAttribute('data-stop-kind', 'accommodation');
  });

  it('restores a local draft with a clear toast', async () => {
    window.localStorage.setItem(
      'travel-map-planner:draft',
      exportTripToJson({
        ...shanghaiSampleTrip,
        title: '本地草稿旅行',
      }),
    );

    await renderPlanner();

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('本地草稿旅行');
    await waitFor(() => expect(screen.getByLabelText('编辑行程标题')).toHaveValue('本地草稿旅行'));
  });

  it('shows saved local projects from the project library on the console', () => {
    window.localStorage.setItem(
      PROJECT_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'stored-trip',
          trip: {
            ...shanghaiSampleTrip,
            id: 'stored-trip',
            title: '历史本地方案',
            updatedAt: '2026-06-01T09:00:00.000Z',
          },
          createdAt: '2026-06-01T08:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
        },
      ]),
    );

    render(<App />);

    expect(screen.getByRole('textbox', { name: '编辑项目标题 历史本地方案' })).toHaveValue('历史本地方案');
  });

  it('uses the latest saved local project as the current console selection when there is no draft', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      PROJECT_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'stored-trip',
          trip: {
            ...shanghaiSampleTrip,
            id: 'stored-trip',
            title: '历史本地方案',
            updatedAt: '2026-06-01T09:00:00.000Z',
          },
          createdAt: '2026-06-01T08:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
        },
      ]),
    );

    render(<App />);

    const storedCard = screen.getByRole('textbox', { name: '编辑项目标题 历史本地方案' }).closest('.project-card');
    expect(storedCard).toHaveClass('active');
    expect(screen.queryByRole('textbox', { name: `编辑项目标题 ${shanghaiSampleTrip.title}` })).not.toBeInTheDocument();

    await user.click(storedCard as HTMLElement);

    const records = JSON.parse(window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY) ?? '[]') as Array<{ id: string }>;
    expect(records.map((record) => record.id)).toEqual(['stored-trip']);
  });

  it('selects a non-current project when its console card body is clicked', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      PROJECT_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'recent-trip',
          trip: {
            ...shanghaiSampleTrip,
            id: 'recent-trip',
            title: '当前本地方案',
            updatedAt: '2026-06-02T09:00:00.000Z',
          },
          createdAt: '2026-06-02T08:00:00.000Z',
          updatedAt: '2026-06-02T09:00:00.000Z',
        },
        {
          id: 'stored-trip',
          trip: {
            ...shanghaiSampleTrip,
            id: 'stored-trip',
            title: '历史本地方案',
            updatedAt: '2026-06-01T09:00:00.000Z',
          },
          createdAt: '2026-06-01T08:00:00.000Z',
          updatedAt: '2026-06-01T09:00:00.000Z',
        },
      ]),
    );

    render(<App />);

    const currentCard = screen.getByRole('textbox', { name: '编辑项目标题 当前本地方案' }).closest('.project-card');
    const storedCard = screen.getByRole('textbox', { name: '编辑项目标题 历史本地方案' }).closest('.project-card');
    expect(currentCard).toHaveClass('active');
    expect(storedCard).not.toHaveClass('active');

    await user.click(storedCard as HTMLElement);

    expect(screen.getByRole('main', { name: '旅行项目控制台' })).toBeInTheDocument();
    expect(currentCard).not.toHaveClass('active');
    expect(storedCard).toHaveClass('active');
    expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();
    const records = JSON.parse(window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY) ?? '[]') as Array<{ id: string }>;
    expect(records.map((record) => record.id).sort()).toEqual(['recent-trip', 'stored-trip']);
  });

  it('keeps the restored draft in the local project list when selecting another console card', async () => {
    const user = userEvent.setup();
    const restoredDraft = {
      ...shanghaiSampleTrip,
      id: 'restored-draft-trip',
      title: '恢复中的本地规划',
      updatedAt: '2026-06-03T09:00:00.000Z',
    };
    const storedTrip = {
      ...shanghaiSampleTrip,
      id: 'stored-trip',
      title: '历史本地方案',
      updatedAt: '2026-06-01T09:00:00.000Z',
    };
    window.localStorage.setItem('travel-map-planner:draft', exportTripToJson(restoredDraft));
    window.localStorage.setItem(
      PROJECT_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: storedTrip.id,
          trip: storedTrip,
          createdAt: '2026-06-01T08:00:00.000Z',
          updatedAt: storedTrip.updatedAt,
        },
      ]),
    );

    render(<App />);

    const restoredCard = screen.getByRole('textbox', { name: '编辑项目标题 恢复中的本地规划' }).closest('.project-card');
    const storedCard = screen.getByRole('textbox', { name: '编辑项目标题 历史本地方案' }).closest('.project-card');
    expect(restoredCard).toHaveClass('active');

    await user.click(storedCard as HTMLElement);

    expect(screen.getByRole('textbox', { name: '编辑项目标题 恢复中的本地规划' })).toBeInTheDocument();
    const records = JSON.parse(window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY) ?? '[]') as Array<{ id: string }>;
    expect(records.map((record) => record.id).sort()).toEqual(['restored-draft-trip', 'stored-trip']);
  });

  it('edits the trip title and date range inline from the top bar', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    const title = screen.getByLabelText('编辑行程标题');
    await user.clear(title);
    await user.type(title, '上海周末旅行');

    const dateRange = screen.getByLabelText('编辑行程日期');
    await user.clear(dateRange);
    await user.type(dateRange, '2026.07.01 - 07.03');

    expect(title).toHaveValue('上海周末旅行');
    expect(dateRange).toHaveValue('2026.07.01 - 07.03');
  });

  it('autosaves current trip edits to local draft and project library', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    const title = screen.getByLabelText('编辑行程标题');
    await user.clear(title);
    await user.type(title, '自动保存测试');
    await user.tab();

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem('travel-map-planner:draft');
      expect(rawDraft).toBeTruthy();
      const draft = JSON.parse(rawDraft ?? '{}') as { trip?: { title?: string } };
      expect(draft.trip?.title).toBe('自动保存测试');
    });

    const rawProjects = window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
    expect(rawProjects).toBeTruthy();
    const projects = JSON.parse(rawProjects ?? '[]') as Array<{ trip?: { title?: string } }>;
    expect(projects[0]?.trip?.title).toBe('自动保存测试');
  });

  it('saves the current project locally without opening the export file picker', async () => {
    const user = userEvent.setup();
    const showSaveFilePicker = vi.fn();
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: showSaveFilePicker });
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '保存方案' }));

    expect(showSaveFilePicker).not.toHaveBeenCalled();
    await waitFor(() => {
      const rawDraft = window.localStorage.getItem('travel-map-planner:draft');
      expect(rawDraft).toBeTruthy();
    });
    expect(screen.getByText('方案已保存到本地草稿。')).toBeInTheDocument();
  });

  it('asks before shrinking the date range when removed days have content', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPlanner(user);

    const dateRange = screen.getByLabelText('编辑行程日期');
    await user.clear(dateRange);
    await user.type(dateRange, '2026.06.12 - 06.12');
    fireEvent.blur(dateRange);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('将删除 3 天规划'));
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(dateRange).toHaveValue(shanghaiSampleTrip.dateRange);

    confirmSpy.mockRestore();
  });

  it('exports the full editable project data from a single export button', async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn();
    const clickedLinks: Array<{ connected: boolean; download: string; href: string }> = [];
    const revokeObjectUrl = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push({ connected: this.isConnected, download: this.download, href: this.href });
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    await renderPlanner(user);

    expect(screen.queryByRole('button', { name: 'JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Markdown' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导出' }));

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(clickedLinks).toEqual([]);
    expect(screen.getByRole('button', { name: '另存 JSON' })).toBeInTheDocument();
    const downloadLink = await screen.findByRole('link', { name: '备用下载' });
    expect(downloadLink).toHaveAttribute('download', '上海 4 日旅行规划-2026.06.12-06.15.json');
    expect(downloadLink).toHaveAttribute('href', expect.stringMatching(/^data:application\/json;charset=utf-8,/));
    const exported = JSON.parse(readDataUrlText(downloadLink.getAttribute('href') ?? '')) as {
      version: number;
      trip: { id: string; days: Array<{ diningStops: unknown[] }> };
    };
    expect(exported.version).toBe(TRIP_EXPORT_VERSION);
    expect(exported.trip.id).toBe(shanghaiSampleTrip.id);
    expect(exported.trip.days[0].diningStops).toEqual([]);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '关闭导出下载提示' }));

    expect(screen.queryByRole('link', { name: '备用下载' })).not.toBeInTheDocument();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('uses the browser save picker as the primary project export path when it is available', async () => {
    const user = userEvent.setup();
    const write = vi.fn();
    const close = vi.fn();
    const createWritable = vi.fn(async () => ({ write, close }));
    const showSaveFilePicker = vi.fn(async () => ({ createWritable }));
    const createObjectUrl = vi.fn();
    const clickedLinks: Array<{ connected: boolean; download: string; href: string }> = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push({ connected: this.isConnected, download: this.download, href: this.href });
    });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: showSaveFilePicker });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalled());
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: '上海 4 日旅行规划-2026.06.12-06.15.json',
      }),
    );
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(clickedLinks).toEqual([]);
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    const exported = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      version: number;
      trip: { id: string };
    };
    expect(exported.version).toBe(TRIP_EXPORT_VERSION);
    expect(exported.trip.id).toBe(shanghaiSampleTrip.id);
    expect(close).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('link', { name: '备用下载' })).toHaveAttribute(
      'download',
      '上海 4 日旅行规划-2026.06.12-06.15.json',
    );
    expect(screen.queryByText('已取消导出。')).not.toBeInTheDocument();
    clickSpy.mockRestore();
  });

  it('does not change local drafts or project records when exporting or saving the prepared export file', async () => {
    const user = userEvent.setup();
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    }));
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: showSaveFilePicker });
    await renderPlanner(user);

    const beforeDraft = window.localStorage.getItem('travel-map-planner:draft');
    const beforeProjects = window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);

    await user.click(screen.getByRole('button', { name: '导出' }));
    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalledTimes(1));

    expect(window.localStorage.getItem('travel-map-planner:draft')).toBe(beforeDraft);
    expect(window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY)).toBe(beforeProjects);

    await user.click(screen.getByRole('button', { name: '另存 JSON' }));
    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalledTimes(2));

    expect(window.localStorage.getItem('travel-map-planner:draft')).toBe(beforeDraft);
    expect(window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY)).toBe(beforeProjects);
  });

  it('edits a selected stop start time and stay minutes by clicking the fields', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);
    const stop = shanghaiSampleTrip.days[0].stops[1];

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    await user.click(within(itinerary).getByRole('button', { name: `${stop.startTime} ${stop.name}` }));

    const startTime = screen.getByLabelText(`${stop.name} 开始时间`);
    await user.clear(startTime);
    await user.type(startTime, '12:15');

    const stayMinutes = screen.getByLabelText(`${stop.name} 停留分钟数`);
    await user.clear(stayMinutes);
    await user.type(stayMinutes, '45');

    expect(startTime).toHaveValue('12:15');
    expect(stayMinutes).toHaveValue(45);
    expect(screen.getByTestId('summary-total')).toHaveTextContent('7 小时 26 分');
  });

  it('starts on the project console and manages local project cards', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('main', { name: '旅行项目控制台' })).toBeInTheDocument();
    expect(document.querySelector('.console-bg-image')).toHaveAttribute('src', '/assets/console-travel-background.png');
    expect(document.querySelector('.console-visual')).not.toBeInTheDocument();
    expect(screen.queryByText('SHA')).not.toBeInTheDocument();
    expect(screen.queryByText('PVG')).not.toBeInTheDocument();
    expect(screen.queryByText('本地项目')).not.toBeInTheDocument();
    expect(screen.queryByText('规划天数')).not.toBeInTheDocument();
    expect(screen.queryByText('确认点位')).not.toBeInTheDocument();
    expect(screen.queryByText(`${shanghaiSampleTrip.days.length} 天`)).not.toBeInTheDocument();
    expect(document.querySelector('.project-route-mark')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `打开 ${shanghaiSampleTrip.title}` })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `复制 ${shanghaiSampleTrip.title}` }));
    expect(await screen.findByRole('button', { name: `打开 ${shanghaiSampleTrip.title} 副本` })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `删除 ${shanghaiSampleTrip.title} 副本` }));
    expect(screen.queryByRole('button', { name: `打开 ${shanghaiSampleTrip.title} 副本` })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    expect(screen.getByRole('dialog', { name: '选择城市' })).toBeInTheDocument();
  });

  it('caps the console project list to a scrollable three-card viewport', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: `复制 ${shanghaiSampleTrip.title}` }));
    await user.click(screen.getByRole('button', { name: `复制 ${shanghaiSampleTrip.title}` }));
    await user.click(screen.getByRole('button', { name: `复制 ${shanghaiSampleTrip.title}` }));

    const projectList = screen.getByLabelText('可滚动项目列表');
    expect(projectList).toHaveClass('project-list-scroll');
    expect(projectList.querySelectorAll('.project-card')).toHaveLength(4);
  });

  it('renames a project directly from the console card', async () => {
    const user = userEvent.setup();
    render(<App />);

    const titleInput = screen.getByLabelText(`编辑项目标题 ${shanghaiSampleTrip.title}`);
    await user.clear(titleInput);
    await user.type(titleInput, '上海亲子旅行');
    fireEvent.blur(titleInput);

    expect(screen.getByRole('button', { name: '打开 上海亲子旅行' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开 上海亲子旅行' }));
    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('上海亲子旅行');
  });

  it('lets users choose a city before creating a project', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });

    await user.click(within(dialog).getByRole('button', { name: '选择城市 成都' }));
    await user.click(within(dialog).getByRole('button', { name: '创建项目' }));

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('成都旅行规划');
    await user.click(screen.getByRole('button', { name: '控制台' }));
    expect(screen.getByRole('button', { name: '打开 成都旅行规划' })).toBeInTheDocument();
    expect(screen.getByText('成都')).toBeInTheDocument();
  });

  it('starts the new project dialog with a city already selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });

    expect(within(dialog).getByRole('button', { name: '选择城市 上海' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: '选择热门地点 外滩' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '跳过推荐，进入空白规划' })).toBeEnabled();
  });

  it('adds selected popular places when creating a project', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });

    await user.click(within(dialog).getByRole('button', { name: '选择城市 成都' }));
    await user.click(within(dialog).getByRole('button', { name: '选择热门地点 人民公园' }));
    await user.click(within(dialog).getByRole('button', { name: '选择热门地点 宽窄巷子' }));
    await user.click(within(dialog).getByRole('button', { name: '创建并添加 2 个地点' }));

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('成都旅行规划');
    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    expect(within(itinerary).getByRole('button', { name: '09:30 人民公园' })).toBeInTheDocument();
    expect(within(itinerary).getByRole('button', { name: '11:30 宽窄巷子' })).toBeInTheDocument();
    expect(within(itinerary).getByRole('button', { name: '查看路线 人民公园 到 宽窄巷子' })).toBeInTheDocument();
  });

  it('can skip popular places and continue with the map search entry', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });

    await user.click(within(dialog).getByRole('button', { name: '选择城市 北京' }));
    await user.click(within(dialog).getByRole('button', { name: '跳过推荐，进入空白规划' }));

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('北京旅行规划');
    expect(screen.getByRole('searchbox', { name: '搜索地点' })).toBeInTheDocument();
    expect(screen.getByText('Day 暂无点位')).toBeInTheDocument();
  });

  it('keeps the previous project visible in the console after creating another project', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    let dialog = screen.getByRole('dialog', { name: '选择城市' });
    await user.click(within(dialog).getByRole('button', { name: '选择城市 北京' }));
    await user.click(within(dialog).getByRole('button', { name: '跳过推荐，进入空白规划' }));

    await user.click(screen.getByRole('button', { name: '控制台' }));
    expect(screen.getByRole('button', { name: `打开 ${shanghaiSampleTrip.title}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 北京旅行规划' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    dialog = screen.getByRole('dialog', { name: '选择城市' });
    await user.click(within(dialog).getByRole('button', { name: '选择城市 成都' }));
    await user.click(within(dialog).getByRole('button', { name: '跳过推荐，进入空白规划' }));

    await user.click(screen.getByRole('button', { name: '控制台' }));
    expect(screen.getByRole('button', { name: `打开 ${shanghaiSampleTrip.title}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 北京旅行规划' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 成都旅行规划' })).toBeInTheDocument();
  });

  it('centers a blank Beijing project on Beijing instead of the previous Shanghai map', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });
    await user.click(within(dialog).getByRole('button', { name: '选择城市 北京' }));
    await user.click(within(dialog).getByRole('button', { name: '跳过推荐，进入空白规划' }));

    await waitFor(() => expect(baiduAppStub.maps).toHaveLength(1));
    const [centerPoint] = baiduAppStub.maps[0].centerAndZoom.mock.calls.at(-1) ?? [];
    expect(centerPoint.lng).toBeCloseTo(116.4074);
    expect(centerPoint.lat).toBeCloseTo(39.9042);
  });

  it('creates a blank project from manual province and city selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const dialog = screen.getByRole('dialog', { name: '选择城市' });
    await user.click(within(dialog).getByRole('tab', { name: '自主选择' }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '省份' }), '浙江');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '城市' }), '杭州');
    await user.clear(within(dialog).getByLabelText('规划名称'));
    await user.type(within(dialog).getByLabelText('规划名称'), '杭州周末');
    await user.click(within(dialog).getByRole('button', { name: '创建空白项目' }));

    expect(screen.getByLabelText('编辑行程标题')).toHaveValue('杭州周末');
    expect(screen.getByText(/杭州 · 本地草稿/)).toBeInTheDocument();
  });

  it('selects a map marker and synchronizes the itinerary and detail panel', async () => {
    const user = userEvent.setup();
    const stop = shanghaiSampleTrip.days[0].stops[2];
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(screen.getByRole('button', { name: `选择地图点位 ${stop.name}` }));

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    const detail = screen.getByRole('complementary', { name: '详情面板' });
    expect(within(itinerary).getByRole('button', { name: `${stop.startTime} ${stop.name}` })).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail).getByText(stop.name)).toBeInTheDocument();
    expect(within(detail).getByText(stop.note)).toBeInTheDocument();
    expect(within(detail).queryByText('标签')).not.toBeInTheDocument();
    expect(within(detail).queryByText(stop.tags[0])).not.toBeInTheDocument();
  });

  it('clears the detail panel when the blank map area is clicked', async () => {
    const user = userEvent.setup();
    const stop = shanghaiSampleTrip.days[0].stops[2];
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(screen.getByRole('button', { name: `选择地图点位 ${stop.name}` }));

    const detail = screen.getByRole('complementary', { name: '详情面板' });
    expect(within(detail).getByText(stop.name)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('map-world'));

    expect(within(detail).queryByText(stop.name)).not.toBeInTheDocument();
    expect(within(detail).getByText('选择一个点位或路线段')).toBeInTheDocument();
  });

  it('supports wheel zooming and pointer dragging on the map canvas', async () => {
    await renderPlanner();
    fireEvent.change(screen.getByRole('combobox', { name: '地图源' }), { target: { value: 'mock' } });

    const map = screen.getByRole('region', { name: '地图画布' });
    const world = screen.getByTestId('map-world');
    expect(map).toHaveAttribute('data-zoom', '13');
    const initialTransform = world.style.transform;

    fireEvent.wheel(map, { deltaY: -120, clientX: 420, clientY: 260 });
    expect(map).toHaveAttribute('data-zoom', '14');
    expect(world.style.transform).not.toBe(initialTransform);

    const zoomedTransform = world.style.transform;
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 420, clientY: 260 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 370, clientY: 300 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 370, clientY: 300 });

    expect(world.style.transform).not.toBe(zoomedTransform);
  });

  it('selects a map route line and shows the transit detail panel', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    const day = shanghaiSampleTrip.days[0];
    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(screen.getByRole('button', { name: `选择地图路线 ${day.stops[1].name} 到 ${day.stops[2].name}` }));

    const detail = screen.getByRole('complementary', { name: '详情面板' });
    expect(within(detail).getByText(new RegExp(shanghaiSampleTrip.days[0].stops[1].name))).toBeInTheDocument();
    expect(within(detail).getByText('地铁 10 号线 → 2 号线')).toBeInTheDocument();
    expect(within(detail).getByText('交通大学站上车 · 南京东路换乘 · 上海科技馆站下车')).toBeInTheDocument();
  });

  it('edits route planning notes instead of showing shared hard-coded tips', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '查看路线 安福路 到 上海博物馆东馆' }));
    const detail = screen.getByRole('complementary', { name: '详情面板' });

    expect(within(detail).queryByText('18:30 外滩人流较高，建议预留步行缓冲。')).not.toBeInTheDocument();
    const note = within(detail).getByLabelText('路线规划备注 安福路 到 上海博物馆东馆');
    await user.clear(note);
    await user.type(note, '预约改到 15:00 后再刷新。');

    expect(note).toHaveValue('预约改到 15:00 后再刷新。');
  });

  it('switches the left sidebar into dining planning mode and can hide dining markers', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    const initialSidebar = screen.getByRole('complementary', { name: '行程列表' });
    expect(initialSidebar.querySelector('.sidebar-scroll')).toHaveClass('stable-scrollbar');

    await user.click(screen.getByRole('button', { name: '餐饮规划' }));
    const sidebar = screen.getByRole('complementary', { name: '行程列表' });

    expect(sidebar.querySelector('.sidebar-scroll')).toHaveClass('stable-scrollbar');
    expect(within(sidebar).getByText('餐饮点位')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隐藏餐饮点' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '隐藏餐饮点' }));
    expect(screen.getByRole('button', { name: '显示餐饮点' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds visible dining markers and edits dining cards inside dining mode', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(screen.getByRole('button', { name: '餐饮规划' }));
    const sidebar = screen.getByRole('complementary', { name: '行程列表' });
    expect(within(sidebar).queryByText('备选点位')).not.toBeInTheDocument();
    expect(within(sidebar).queryByLabelText('餐饮类型')).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), shanghaiSampleTrip.city);
    const searchResults = within(await screen.findByRole('listbox'));
    await user.click((await searchResults.findAllByRole('button', { name: /添加/ }))[0]);

    const typeTrigger = within(sidebar).getByRole('button', { name: /编辑餐饮类型/ });
    await user.click(typeTrigger);
    const typeMenu = within(sidebar).getByRole('listbox', { name: /餐饮类型选项/ });
    await user.click(within(typeMenu).getByRole('option', { name: '咖啡' }));

    expect(typeTrigger).toHaveTextContent('咖啡');
    expect(typeTrigger).toHaveAttribute('aria-label', expect.stringContaining('当前咖啡'));
    const diningCard = typeTrigger.closest('.dining-stop-card');
    expect(diningCard).toHaveClass('dining-card-compact');
    expect(diningCard?.querySelector('.dining-card-topline')).not.toBeInTheDocument();
    expect(diningCard?.querySelector('.dining-time-block')).not.toBeInTheDocument();
    expect(diningCard?.querySelector('.time')).not.toBeInTheDocument();
    expect(diningCard?.querySelector('.dining-copy')).toBeInTheDocument();
    expect(diningCard?.querySelector('.dining-type-badge')).toHaveTextContent('咖啡');
    expect(diningCard?.querySelector('.dining-type-menu')).not.toBeInTheDocument();
    expect(diningCard?.querySelector('.dining-quick-edit')).not.toBeInTheDocument();
    expect(diningCard?.querySelector('.dining-price-chip')).not.toBeInTheDocument();
    expect(within(sidebar).queryByLabelText(/编辑餐饮人均价格/)).not.toBeInTheDocument();
    expect(within(sidebar).queryByLabelText(/编辑餐饮时间/)).not.toBeInTheDocument();
    expect(within(sidebar).queryByLabelText(/编辑餐饮备注/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择地图餐饮点/ })).toBeInTheDocument();

    await user.click(typeTrigger);
    await user.keyboard('{ArrowDown}');
    expect(typeTrigger).toHaveTextContent('夜宵');
    expect(within(sidebar).getByRole('option', { name: '夜宵' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(diningCard?.querySelector('.dining-type-menu')).not.toBeInTheDocument();

    await user.click(within(sidebar).getByRole('button', { name: /删除餐饮/ }));
    expect(within(sidebar).queryByRole('button', { name: /编辑餐饮类型/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /选择地图餐饮点/ })).not.toBeInTheDocument();
  });

  it('moves a dragged itinerary stop into alternatives when dropped on the alternatives panel', async () => {
    await renderPlanner();
    const stop = shanghaiSampleTrip.days[0].stops[1];
    const stopCard = screen.getByTestId(`stop-card-${stop.id}`);
    const alternatives = screen.getByRole('region', { name: '备选点位' });

    fireEvent.dragStart(stopCard);
    fireEvent.dragOver(alternatives);
    fireEvent.drop(alternatives);

    expect(screen.queryByRole('button', { name: `${stop.startTime} ${stop.name}` })).not.toBeInTheDocument();
    expect(screen.getByLabelText(`编辑备选名称 ${stop.name}`)).toBeInTheDocument();
  });

  it('adds and edits an alternative place directly in the sidebar', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '新增备选点位' }));
    const nameInput = screen.getByLabelText('编辑备选名称 新增备选点位');
    await user.clear(nameInput);
    await user.type(nameInput, '田子坊');
    fireEvent.blur(nameInput);

    expect(screen.getByLabelText('编辑备选名称 田子坊')).toHaveValue('田子坊');
    expect(screen.getByRole('button', { name: '加入当天路线 田子坊' })).toBeInTheDocument();
  });

  it('keeps newly added alternatives editable beyond the first four items', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole('button', { name: '新增备选点位' }));
    }

    const nameInputs = screen.getAllByLabelText('编辑备选名称 新增备选点位');
    expect(nameInputs).toHaveLength(5);

    await user.clear(nameInputs[4]);
    await user.type(nameInputs[4], '第五个备选点');
    fireEvent.blur(nameInputs[4]);

    expect(screen.getByLabelText('编辑备选名称 第五个备选点')).toHaveValue('第五个备选点');
    expect(screen.getByRole('button', { name: '加入当天路线 第五个备选点' })).toBeInTheDocument();
  });

  it('switches map routes between simple and full geometry modes', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    const map = screen.getByRole('region', { name: '地图画布' });
    expect(map).toHaveAttribute('data-route-mode', 'simple');
    const route = screen.getByTestId('route-overlay-segment-anfu-museum');
    const simplePath = route.getAttribute('d');

    await user.click(screen.getByRole('button', { name: '完整路线' }));

    expect(map).toHaveAttribute('data-route-mode', 'full');
    expect(route.getAttribute('d')).not.toBe(simplePath);
  });

  it('switches transport options and updates the summary', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.click(screen.getByRole('button', { name: '查看路线 安福路 到 上海博物馆东馆' }));
    await user.click(screen.getByRole('button', { name: '选择交通方案 打车 32 分钟 58 元' }));

    expect(screen.getByTestId('summary-cost')).toHaveTextContent('62');
    expect(screen.getAllByText(/58/).length).toBeGreaterThan(0);
  });

  it('supports drag sorting in the itinerary without inline action buttons', async () => {
    await renderPlanner();

    const first = screen.getByTestId('stop-card-stop-wukang-road');
    const third = screen.getByTestId('stop-card-stop-shanghai-museum-east');
    expect(first).toHaveClass('route-stop-card');
    expect(first).toHaveTextContent(`${shanghaiSampleTrip.days[0].stops[0].stayMinutes}min`);
    expect(first).not.toHaveTextContent(`${shanghaiSampleTrip.days[0].stops[0].stayMinutes} 分`);
    expect(first.querySelector('.stop-actions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `上移 ${shanghaiSampleTrip.days[0].stops[0].name}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `下移 ${shanghaiSampleTrip.days[0].stops[0].name}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `删除 ${shanghaiSampleTrip.days[0].stops[0].name}` })).not.toBeInTheDocument();

    fireEvent.dragStart(first);
    fireEvent.dragOver(third);
    fireEvent.drop(third);

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    const stopButtons = within(itinerary).getAllByRole('button', { name: /^\d{2}:\d{2}/ });
    expect(stopButtons[0]).toHaveTextContent(shanghaiSampleTrip.days[0].stops[1].name);
    expect(stopButtons[2]).toHaveTextContent(shanghaiSampleTrip.days[0].stops[0].name);
  });

  it('shows a route stop delete control only after clicking the stop card', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);
    const stop = shanghaiSampleTrip.days[0].stops[0];

    expect(screen.queryByRole('button', { name: `删除 ${stop.name}` })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `${stop.startTime} ${stop.name}` }));

    expect(screen.getByRole('button', { name: `删除 ${stop.name}` })).toHaveClass('stop-delete-button');

    await user.click(screen.getByRole('region', { name: 'Baidu trip map' }));
    expect(screen.queryByRole('button', { name: `删除 ${stop.name}` })).not.toBeInTheDocument();
  });

  it('deletes a route stop from the floating delete control', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);
    const stop = shanghaiSampleTrip.days[0].stops[0];

    await user.click(screen.getByRole('button', { name: `${stop.startTime} ${stop.name}` }));
    await user.click(screen.getByRole('button', { name: `删除 ${stop.name}` }));

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    expect(within(itinerary).queryByRole('button', { name: `${stop.startTime} ${stop.name}` })).not.toBeInTheDocument();
  });

  it('previews a grey snap target while dragging day tabs', async () => {
    await renderPlanner();
    const dayOne = screen.getByRole('tab', { name: `Day 1 ${shanghaiSampleTrip.days[0].date.slice(5)}` });
    const dayThree = screen.getByRole('tab', { name: `Day 3 ${shanghaiSampleTrip.days[2].date.slice(5)}` });

    fireEvent.dragStart(dayOne);
    fireEvent.dragOver(dayThree);

    expect(dayOne.closest('.day-tab-shell')).toHaveClass('day-drag-origin');
    expect(dayThree.closest('.day-tab-shell')).toHaveClass('day-drop-target');
  });

  it('moves a dragged alternative back into the route list at the drop target', async () => {
    await renderPlanner();
    const alternative = shanghaiSampleTrip.alternatives[0];
    const targetStop = shanghaiSampleTrip.days[0].stops[1];

    const alternativeCard = screen.getByTestId(`alternative-card-${alternative.id}`);
    const targetCard = screen.getByTestId(`stop-card-${targetStop.id}`);
    fireEvent.dragStart(alternativeCard);
    fireEvent.dragOver(targetCard);
    fireEvent.drop(targetCard);

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    const stopButtons = within(itinerary).getAllByRole('button', { name: /^\d{2}:\d{2}/ });
    expect(stopButtons[1]).toHaveTextContent(alternative.name);
    expect(within(itinerary).queryByLabelText(`编辑备选名称 ${alternative.name}`)).not.toBeInTheDocument();
  });

  it('swaps itinerary order when one static map marker is dropped on another', async () => {
    const user = userEvent.setup();
    const day = shanghaiSampleTrip.days[0];
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');

    const firstMarker = screen.getByRole('button', { name: `选择地图点位 ${day.stops[0].name}` });
    const fourthMarker = screen.getByRole('button', { name: `选择地图点位 ${day.stops[3].name}` });
    fireEvent.dragStart(firstMarker);
    fireEvent.dragEnter(fourthMarker);
    fireEvent.dragOver(fourthMarker);
    fireEvent.drop(fourthMarker);
    fireEvent.dragEnd(firstMarker);

    const itinerary = screen.getByRole('complementary', { name: '行程列表' });
    const stopButtons = within(itinerary).getAllByRole('button', { name: /^\d{2}:\d{2}/ });
    expect(stopButtons[0]).toHaveTextContent(day.stops[3].name);
    expect(stopButtons[3]).toHaveTextContent(day.stops[0].name);
  });
  it('can trigger map and transit degraded states from the mock service controls', async () => {
    const user = userEvent.setup();
    await renderPlanner(user);

    await user.selectOptions(screen.getByRole('combobox', { name: '地图源' }), 'mock');
    await user.click(screen.getByRole('button', { name: '地图服务失败' }));
    expect(screen.getByText('地图暂时无法加载')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '公交路线不可用' }));
    expect(screen.getAllByText('未找到合适公交路线').length).toBeGreaterThanOrEqual(1);
  });
});
