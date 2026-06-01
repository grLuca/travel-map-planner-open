import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  House,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TripMap } from './components/map/TripMap';
import { provinceCityOptions } from './data/chinaCityDirectory';
import { cityProjectPresets, createBlankTripPlanForCity, createTripPlanForCity, getDefaultCityCenter } from './data/cityPresets';
import type { CityProjectPreset } from './data/cityPresets';
import { shanghaiSampleTrip } from './data/sampleTrip';
import { exportTripToJson, parseImportedTrip } from './services/importExport';
import {
  getConfiguredBaiduBrowserAk,
  hasConfiguredBaiduBrowserAk,
  readMapApiSettings,
  saveMapApiSettings,
} from './services/mapApiSettings';
import type { MapApiSettings } from './services/mapApiSettings';
import { AmapProvider } from './services/mapProvider/amapProvider';
import { BaiduProvider } from './services/mapProvider/baiduProvider';
import { CachedMapProvider } from './services/mapProvider/routeCache';
import { MockMapProvider } from './services/mapProvider/mockMapProvider';
import { resetBaiduApiLoader } from './services/mapProvider/baiduSdk';
import { MapProviderError } from './services/mapProvider/types';
import type { MapProvider, MapProviderErrorCode, PlaceSearchResult } from './services/mapProvider/types';
import { loadTripDraft, saveTripDraft } from './services/persistence';
import {
  deleteTripProject,
  duplicateTripProject,
  getTripProjectSummaries,
  readTripProjectLibrary,
  saveTripProject,
} from './services/projectLibrary';
import type { TripProjectRecord, TripProjectSummary } from './services/projectLibrary';
import { parseTripDateRange } from './services/tripDates';
import {
  addAlternativeFromSearchResult,
  addDiningStopFromSearchResult,
  addAlternativeToDay,
  addStopFromSearchResult,
  addTripDay,
  applyRoutePlan,
  clearSelection,
  createInitialTripState,
  deleteDiningStop,
  deleteTripDay,
  deleteStop,
  importTripPlan,
  markRouteSegmentFailed,
  markRouteSegmentsLoading,
  markRouteSegmentsStale,
  moveStopToAlternatives,
  reorderTripDay,
  reorderStop,
  selectCurrentDay,
  selectCurrentSummary,
  selectRouteSegment,
  selectStop,
  selectTransportOption,
  setActiveDay,
  swapStops,
  tripReducer,
  undoLastDelete,
  updateStopNote,
  updateStopSchedule,
  updateAlternativeStop,
  updateDiningStop,
  updateTripMeta,
  updateRouteSegmentNote,
  updateStopKind,
} from './state/tripReducer';
import type { TripState } from './state/tripReducer';
import { getStopMarkerKind } from './types/stopKinds';
import type { DiningStop, DiningType, RouteSegment, StopKind, TransportOption, TripDay, TripPlan, TripStop } from './types/trip';
import './styles.css';

type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type DemoState = 'normal' | 'mapError' | 'transitError';
type ToastKind = 'success' | 'info' | 'warn' | 'error';
type ProviderMode = 'mock' | 'amap' | 'baidu';
type AppView = 'planner' | 'console';
type PlannerMode = 'route' | 'dining';
type SearchAddKind = StopKind | 'dining';

const consoleHeroBackground = '/assets/console-travel-background.png';

interface ManualProjectRequest {
  cityName: string;
  title: string;
  startDate: string;
  endDate: string;
}

interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
  durationMs: number;
}

interface TextFileDownload {
  filename: string;
  content: string;
  type: string;
  url: string;
}

type SaveTextFileResult = 'saved' | 'cancelled' | 'unsupported';

const toastDurations: Record<ToastKind, number> = {
  success: 3000,
  info: 4000,
  warn: 5000,
  error: 8000,
};

export default function App() {
  const initialLoad = useMemo(() => loadInitialTrip(), []);
  const initialMapApiSettings = useMemo(() => readMapApiSettings(), []);

  const [state, dispatch] = useReducer(tripReducer, initialLoad.trip, createInitialTripState);
  const [query, setQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [demoState, setDemoState] = useState<DemoState>('normal');
  const [mapApiSettings, setMapApiSettings] = useState<MapApiSettings>(initialMapApiSettings);
  const [mapApiSettingsRevision, setMapApiSettingsRevision] = useState(0);
  const [mapSettingsDraft, setMapSettingsDraft] = useState<MapApiSettings>(initialMapApiSettings);
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [providerMode, setProviderMode] = useState<ProviderMode>('baidu');
  const [currentView, setCurrentView] = useState<AppView>('console');
  const [plannerMode, setPlannerMode] = useState<PlannerMode>('route');
  const [showDiningOnMap, setShowDiningOnMap] = useState(true);
  const [projectRecords, setProjectRecords] = useState<TripProjectRecord[]>(() => readTripProjectLibrary());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [exportDownload, setExportDownload] = useState<TextFileDownload | null>(null);
  const configuredBaiduAk = getConfiguredBaiduBrowserAk(mapApiSettings);
  const provider: MapProvider = useMemo(
    () => new CachedMapProvider(createMapProvider(providerMode, configuredBaiduAk)),
    [configuredBaiduAk, providerMode],
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const routeRequestsRef = useRef<Set<string>>(new Set());
  const restoredToastRef = useRef(false);
  const autosaveReadyRef = useRef(false);

  const currentDay = selectCurrentDay(state);
  const summary = selectCurrentSummary(state);
  const visibleProjectRecords = useMemo(() => mergeCurrentTripIntoProjects(state.trip, projectRecords), [projectRecords, state.trip]);
  const projectSummaries = useMemo(() => getTripProjectSummaries(visibleProjectRecords), [visibleProjectRecords]);

  const pushToast = useCallback((kind: ToastKind, message: string, title = toastTitle(kind)) => {
    const toast: ToastMessage = {
      id: `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind,
      title,
      message,
      durationMs: toastDurations[kind],
    };
    setToasts((current) => [...current, toast].slice(-3));
  }, []);

  useEffect(() => {
    if (initialLoad.restoredDraft && !restoredToastRef.current) {
      restoredToastRef.current = true;
      pushToast('info', '已从本地草稿恢复行程。');
    }
  }, [initialLoad.restoredDraft, pushToast]);

  useEffect(() => {
    if (!autosaveReadyRef.current) {
      autosaveReadyRef.current = true;
      return;
    }

    try {
      saveTripDraft(state.trip);
      saveTripProject(state.trip);
    } catch {
      // Local persistence should never block editing the current trip.
    }
  }, [state.trip]);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!nextQuery.trim()) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }
    setSearchStatus('loading');
  };

  useEffect(() => {
    if (!query.trim()) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      provider
        .searchPlaces({ keyword: query, city: state.trip.city })
        .then((results) => {
          if (cancelled) {
            return;
          }
          setSearchResults(results);
          setSearchStatus(results.length > 0 ? 'ready' : 'empty');
        })
        .catch(() => {
          if (!cancelled) {
            setSearchStatus('error');
            pushToast('error', providerMode === 'amap' ? '地点搜索失败，请确认高德代理已启动。' : '地点搜索失败，请稍后重试。');
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [provider, providerMode, pushToast, query, state.trip.city]);

  useEffect(() => {
    const staleSegments = currentDay.routeSegments.filter((segment) => segment.status === 'stale');
    if (staleSegments.length === 0) {
      return undefined;
    }

    const segmentsToPlan = staleSegments.filter((segment) => !routeRequestsRef.current.has(segment.id));
    if (segmentsToPlan.length === 0) {
      return undefined;
    }

    segmentsToPlan.forEach((segment) => routeRequestsRef.current.add(segment.id));
    dispatch(markRouteSegmentsLoading(segmentsToPlan.map((segment) => segment.id)));

    segmentsToPlan.forEach((segment) => {
      const from = currentDay.stops.find((stop) => stop.id === segment.fromStopId);
      const to = currentDay.stops.find((stop) => stop.id === segment.toStopId);
      if (!from || !to) {
        routeRequestsRef.current.delete(segment.id);
        return;
      }

      provider
        .planRoute({
          origin: from.lngLat,
          destination: to.lngLat,
          mode: segment.selectedMode === 'manual' ? 'transit' : segment.selectedMode,
          city: state.trip.city,
        })
        .then((route) => {
          dispatch(applyRoutePlan(segment.id, route));
          if (route.cached) {
            pushToast('info', '已使用本地缓存展示路线结果。');
          }
        })
        .catch((error) => {
          const code = getMapErrorCode(error);
          dispatch(markRouteSegmentFailed(segment.id, code));
          pushToast(code === 'noTransitRoute' ? 'warn' : 'error', routeErrorToast(code));
        })
        .finally(() => {
          routeRequestsRef.current.delete(segment.id);
        });
    });

    return undefined;
  }, [currentDay.routeSegments, currentDay.stops, provider, pushToast, state.trip.city]);

  useEffect(() => {
    if (toasts.length === 0) {
      return undefined;
    }
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.durationMs),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  useEffect(
    () => () => {
      if (exportDownload?.url.startsWith('blob:')) {
        URL.revokeObjectURL(exportDownload.url);
      }
    },
    [exportDownload],
  );

  const handleAddSearchResult = (result: PlaceSearchResult, kind?: SearchAddKind) => {
    if (kind === 'dining' || (plannerMode === 'dining' && kind !== 'accommodation')) {
      dispatch(addDiningStopFromSearchResult(result, 'lunch'));
      setQuery('');
      setSearchResults([]);
      setSearchStatus('idle');
      pushToast('success', `已添加“${result.name}”到 ${currentDay.label} 餐饮点位`);
      return;
    }

    const addedStopId = `stop-${result.id}-${currentDay.stops.length + 1}`;
    dispatch(addStopFromSearchResult(result, kind));
    window.setTimeout(() => dispatch(selectStop(addedStopId)), 0);
    setQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    pushToast('success', kind === 'accommodation' ? `已添加“${result.name}”为住宿点` : `已添加“${result.name}”到 ${currentDay.label}`);
  };

  const handleProviderModeChange = (nextMode: ProviderMode) => {
    if (nextMode === 'baidu' && !configuredBaiduAk) {
      setMapSettingsDraft(mapApiSettings);
      setMapSettingsOpen(true);
      pushToast('warn', '请先填写百度浏览器端 AK 后启用百度地图。');
      return;
    }
    setProviderMode(nextMode);
    pushToast(
      'info',
      providerModeToast(nextMode),
    );
  };

  const openMapSettings = () => {
    setMapSettingsDraft(mapApiSettings);
    setMapSettingsOpen(true);
  };

  const handleSaveMapApiSettings = (settings: MapApiSettings) => {
    const saved = saveMapApiSettings(settings);
    setMapApiSettings(saved);
    setMapSettingsDraft(saved);
    setMapApiSettingsRevision((revision) => revision + 1);
    resetBaiduApiLoader();

    if (hasConfiguredBaiduBrowserAk(saved)) {
      setProviderMode('baidu');
      setDemoState('normal');
      pushToast('success', '百度地图 API Key 已保存并启用。');
    } else {
      setProviderMode('mock');
      pushToast('warn', '未填写百度浏览器端 AK，已保留 Mock 地图。');
    }
    setMapSettingsOpen(false);
  };

  const persistProject = (trip: TripPlan) => {
    saveTripDraft(trip);
    setProjectRecords(saveTripProject(trip));
  };

  const handleOpenProject = (projectId: string) => {
    const record = visibleProjectRecords.find((item) => item.id === projectId);
    if (!record) {
      pushToast('error', '未找到这个旅行项目。');
      return;
    }

    setProjectRecords(saveTripProject(state.trip));
    dispatch(importTripPlan(record.trip));
    saveTripDraft(record.trip);
    setCurrentView('planner');
    pushToast('info', `已打开“${record.trip.title}”。`);
  };

  const handleSelectProject = (projectId: string) => {
    const record = visibleProjectRecords.find((item) => item.id === projectId);
    if (!record || record.id === state.trip.id) {
      return;
    }

    setProjectRecords(saveTripProject(state.trip));
    dispatch(importTripPlan(record.trip));
    saveTripDraft(record.trip);
  };

  const handleOpenCreateProject = () => {
    setCityDialogOpen(true);
  };

  const handleCreateProject = (cityId: string, selectedPopularPlaceIds: string[] = []) => {
    const city = cityProjectPresets.find((item) => item.id === cityId) ?? cityProjectPresets[0];
    const trip = createTripPlanForCity(city, { selectedPopularPlaceIds });
    saveTripProject(state.trip);
    dispatch(importTripPlan(trip));
    persistProject(trip);
    setCityDialogOpen(false);
    setCurrentView('planner');
    const placeMessage = selectedPopularPlaceIds.length ? `，已加入 ${selectedPopularPlaceIds.length} 个热门地点` : '';
    pushToast('success', `已创建${city.name}旅行规划${placeMessage}。`);
  };

  const handleCreateManualProject = (request: ManualProjectRequest) => {
    const trip = createBlankTripPlanForCity(request);
    saveTripProject(state.trip);
    dispatch(importTripPlan(trip));
    persistProject(trip);
    setCityDialogOpen(false);
    setCurrentView('planner');
    pushToast('success', `已创建${trip.city}空白旅行规划。`);
  };

  const handleRenameProject = (projectId: string, title: string) => {
    const normalizedTitle = title.trim();
    const source = visibleProjectRecords.find((item) => item.id === projectId);
    if (!source || !normalizedTitle) {
      return;
    }

    const renamedTrip = { ...source.trip, title: normalizedTitle, updatedAt: new Date().toISOString() };
    if (projectId === state.trip.id) {
      dispatch(updateTripMeta({ title: normalizedTitle }));
      saveTripDraft(renamedTrip);
    }
    setProjectRecords(saveTripProject(renamedTrip));
    pushToast('success', `已重命名为“${normalizedTitle}”。`);
  };

  const handleDuplicateProject = (projectId: string) => {
    const source = visibleProjectRecords.find((item) => item.id === projectId);
    if (!source) {
      pushToast('error', '未找到要复制的旅行项目。');
      return;
    }

    const trip = duplicateTripProject(source.trip);
    setProjectRecords(saveTripProject(trip));
    pushToast('success', `已复制“${source.trip.title}”。`);
  };

  const handleDeleteProject = (projectId: string) => {
    const source = visibleProjectRecords.find((item) => item.id === projectId);
    setProjectRecords(deleteTripProject(projectId));
    pushToast('warn', source ? `已从控制台删除“${source.trip.title}”。` : '已删除旅行项目。');
  };

  const handleSave = () => {
    try {
      persistProject(state.trip);
      pushToast('success', '方案已保存到本地草稿。');
    } catch {
      pushToast('error', '保存失败，本地编辑内容仍保留在当前页面。');
    }
  };

  const handleExportProject = async () => {
    try {
      const download = createTextFileDownload(getTripExportFilename(state.trip), exportTripToJson(state.trip), 'application/json');
      setExportDownload(download);
      const result = await saveTextFileWithPicker(download);
      if (result === 'saved') {
        pushToast('success', '项目数据已保存到本地，可用于再次导入继续编辑。');
        return;
      }
      if (result === 'cancelled') {
        pushToast('info', '导出文件已准备好，可点击右上角保存到本地。');
        return;
      }
      pushToast('warn', '浏览器未开放保存窗口，可点击右上角备用下载链接。');
    } catch {
      pushToast('error', '导出失败，请检查浏览器下载权限后重试。');
    }
  };

  const handleSavePreparedExport = async () => {
    if (!exportDownload) {
      return;
    }

    try {
      const result = await saveTextFileWithPicker(exportDownload);
      if (result === 'saved') {
        pushToast('success', '项目数据已保存到本地。');
      } else if (result === 'cancelled') {
        pushToast('info', '已取消文件另存。');
      } else {
        triggerTextFileDownload(exportDownload);
        pushToast('warn', '浏览器未开放保存窗口，已尝试备用下载。');
      }
    } catch {
      pushToast('error', '保存失败，请检查浏览器下载权限后重试。');
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const trip = parseImportedTrip(text);
      dispatch(importTripPlan(trip));
      persistProject(trip);
      setCurrentView('planner');
      pushToast('success', '旅行方案已导入。');
    } catch {
      pushToast('error', '导入失败，文件不是有效的旅行方案。');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const selectDemoState = (nextState: DemoState) => {
    setDemoState(nextState);
    if (nextState === 'mapError') {
      pushToast('error', '地图服务加载失败，请检查网络或稍后重试。');
    }
    if (nextState === 'transitError') {
      pushToast('warn', '未找到公交路线，已保留替代交通入口。');
    }
  };

  const handleTripMetaChange = (meta: { title?: string; dateRange?: string }): boolean => {
    if (!meta.dateRange || meta.dateRange === state.trip.dateRange) {
      dispatch(updateTripMeta(meta));
      return true;
    }

    const shrinkRisk = getDateRangeShrinkRisk(state.trip, meta.dateRange);
    if (!shrinkRisk.requiresConfirmation) {
      dispatch(updateTripMeta(meta));
      return true;
    }

    const confirmed = window.confirm(`调整日期段将删除 ${shrinkRisk.removedDayCount} 天规划，其中已有内容。确认继续吗？`);
    if (!confirmed) {
      return false;
    }
    dispatch(updateTripMeta(meta));
    return true;
  };

  return (
    <div className={`app ${currentView === 'console' ? 'console-app' : 'planner-app full-bleed-map-app'}`}>
      {currentView === 'planner' ? (
        <TopBar
          state={state}
          query={query}
          plannerMode={plannerMode}
          searchStatus={searchStatus}
          searchResults={searchResults}
          onQueryChange={handleQueryChange}
          onAddSearchResult={handleAddSearchResult}
          onImportClick={() => importInputRef.current?.click()}
          onExportProject={handleExportProject}
          onSave={handleSave}
          onConsoleClick={() => setCurrentView('console')}
          providerMode={providerMode}
          onProviderModeChange={handleProviderModeChange}
          onMapApiSettingsClick={openMapSettings}
          onTripMetaChange={handleTripMetaChange}
        />
      ) : null}

      <input ref={importInputRef} className="hidden-file" type="file" accept="application/json,.json" onChange={handleImport} />
      {exportDownload ? (
        <ExportDownloadPanel download={exportDownload} onSave={handleSavePreparedExport} onClose={() => setExportDownload(null)} />
      ) : null}
      {mapSettingsOpen ? (
        <MapApiSettingsDialog
          initialSettings={mapSettingsDraft}
          hasEnvBaiduAk={Boolean(import.meta.env.VITE_BAIDU_BROWSER_AK)}
          onCancel={() => setMapSettingsOpen(false)}
          onSave={handleSaveMapApiSettings}
        />
      ) : null}
      {cityDialogOpen ? (
        <CityProjectDialog
          cities={cityProjectPresets}
          onCancel={() => setCityDialogOpen(false)}
          onCreate={handleCreateProject}
          onCreateManual={handleCreateManualProject}
        />
      ) : null}

      {currentView === 'console' ? (
        <ProjectConsole
          currentTripId={state.trip.id}
          summaries={projectSummaries}
          onBackToPlanner={() => setCurrentView('planner')}
          onCreateProject={handleOpenCreateProject}
          onImportClick={() => importInputRef.current?.click()}
          onSelectProject={handleSelectProject}
          onOpenProject={handleOpenProject}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />
      ) : (
        <>
          <main className="main-grid">
            <ItinerarySidebar
              state={state}
              dispatch={dispatch}
              plannerMode={plannerMode}
              onPlannerModeChange={setPlannerMode}
              showDiningOnMap={showDiningOnMap}
              onToggleDiningVisibility={() => setShowDiningOnMap((current) => !current)}
            />
            <TripMap
              key={`${providerMode}-${mapApiSettingsRevision}`}
              providerMode={providerMode}
              baiduAk={configuredBaiduAk}
              day={currentDay}
              selectedStopId={state.selectedStopId}
              selectedSegmentId={state.selectedSegmentId}
              demoState={demoState}
              showDiningStops={showDiningOnMap}
              tripCenter={state.trip.center ?? getDefaultCityCenter(state.trip.city)}
              onSelectStop={(stopId) => dispatch(selectStop(stopId))}
              onSelectSegment={(segmentId) => dispatch(selectRouteSegment(segmentId))}
              onClearSelection={() => dispatch(clearSelection())}
              onSwapStops={(firstStopId, secondStopId) => dispatch(swapStops(firstStopId, secondStopId))}
              onDemoState={selectDemoState}
            />
            <DetailPanel
              state={state}
              demoState={demoState}
              dispatch={dispatch}
              pushToast={pushToast}
              onResetDemo={() => setDemoState('normal')}
            />
          </main>

          <SummaryBar state={state} summary={summary} />
        </>
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}

function ExportDownloadPanel({
  download,
  onSave,
  onClose,
}: {
  download: TextFileDownload;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="export-download-panel" aria-label="导出文件">
      <span className="export-download-copy">
        <strong>导出文件已准备好</strong>
        <small>{download.filename}</small>
      </span>
      <button className="export-download-link export-download-primary" type="button" onClick={onSave}>
        <Save size={14} aria-hidden="true" />
        另存 JSON
      </button>
      <a className="export-download-link" href={download.url} download={download.filename}>
        <Download size={14} aria-hidden="true" />
        备用下载
      </a>
      <button className="icon-close export-download-close" type="button" aria-label="关闭导出下载提示" onClick={onClose}>
        <X size={14} aria-hidden="true" />
      </button>
    </aside>
  );
}

interface TopBarProps {
  state: TripState;
  query: string;
  plannerMode: PlannerMode;
  searchStatus: SearchStatus;
  searchResults: PlaceSearchResult[];
  onQueryChange: (query: string) => void;
  onAddSearchResult: (result: PlaceSearchResult, kind?: SearchAddKind) => void;
  onImportClick: () => void;
  onExportProject: () => void;
  onSave: () => void;
  onConsoleClick: () => void;
  providerMode: ProviderMode;
  onProviderModeChange: (mode: ProviderMode) => void;
  onMapApiSettingsClick: () => void;
  onTripMetaChange: (meta: { title?: string; dateRange?: string }) => boolean;
}

function TopBar({
  state,
  query,
  plannerMode,
  searchStatus,
  searchResults,
  onQueryChange,
  onAddSearchResult,
  onImportClick,
  onExportProject,
  onSave,
  onConsoleClick,
  providerMode,
  onProviderModeChange,
  onMapApiSettingsClick,
  onTripMetaChange,
}: TopBarProps) {
  const commitTitle = (input: HTMLInputElement) => {
    const title = input.value.trim();
    input.value = title || state.trip.title;
    if (title) {
      onTripMetaChange({ title });
    }
  };

  const commitDateRange = (input: HTMLInputElement) => {
    const dateRange = input.value.trim();
    input.value = dateRange || state.trip.dateRange;
    if (dateRange) {
      const accepted = onTripMetaChange({ dateRange });
      if (!accepted) {
        input.value = state.trip.dateRange;
      }
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <input
          key={state.trip.title}
          className="brand-title-input"
          aria-label="编辑行程标题"
          defaultValue={state.trip.title}
          onBlur={(event) => commitTitle(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <span>
          <input
            key={state.trip.dateRange}
            className="brand-date-input"
            aria-label="编辑行程日期"
            defaultValue={state.trip.dateRange}
            onBlur={(event) => commitDateRange(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
          <span aria-hidden="true"> · </span>
          {state.trip.city} · 本地草稿
        </span>
      </div>

      <div className="search-shell">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          role="searchbox"
          aria-label="搜索地点"
          value={query}
          placeholder="搜索地点、地铁站、餐厅或景点"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        {query.trim() ? (
          <div className="search-results" role="listbox" aria-label="搜索结果">
            {searchStatus === 'loading' ? <div className="search-empty">正在搜索...</div> : null}
            {searchStatus === 'empty' ? <div className="search-empty">没有找到相关地点</div> : null}
            {searchStatus === 'error' ? <div className="search-empty">搜索服务暂不可用</div> : null}
            {searchResults.map((result) => (
              <div key={result.id} className={`search-result-row ${plannerMode === 'route' ? 'with-search-actions' : ''}`}>
                <button
                  className="search-result"
                  type="button"
                  aria-label={`添加 ${result.name} 到 ${selectCurrentDay(state).label}`}
                  onClick={() => onAddSearchResult(result)}
                >
                  <MapPin size={16} aria-hidden="true" />
                  <span>
                    <strong>{result.name}</strong>
                    <small>{result.address}</small>
                  </span>
                  <Plus size={16} aria-hidden="true" />
                </button>
                {plannerMode === 'route' ? (
                  <>
                    <button
                      className="search-result-action search-result-dining"
                      type="button"
                      title="作为餐饮添加"
                      aria-label={`作为餐饮添加 ${result.name}`}
                      onClick={() => onAddSearchResult(result, 'dining')}
                    >
                      <Utensils size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="search-result-action search-result-lodging"
                      type="button"
                      title="作为住宿添加"
                      aria-label={`作为住宿添加 ${result.name}`}
                      onClick={() => onAddSearchResult(result, 'accommodation')}
                    >
                      <House size={15} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="top-actions">
        <button className="btn icon-text" type="button" onClick={onConsoleClick}>
          <LayoutDashboard size={16} aria-hidden="true" />
          控制台
        </button>
        <label className="provider-select">
          <span>地图源</span>
          <select value={providerMode} onChange={(event) => onProviderModeChange(event.currentTarget.value as ProviderMode)}>
            <option value="mock">Mock</option>
            <option value="amap">高德代理</option>
            <option value="baidu">百度地图</option>
          </select>
        </label>
        <button className="btn icon-text" type="button" onClick={onMapApiSettingsClick}>
          <KeyRound size={16} aria-hidden="true" />
          地图 API 设置
        </button>
        <button className="btn icon-text" type="button" onClick={onImportClick}>
          <Upload size={16} aria-hidden="true" />
          导入
        </button>
        <button className="btn icon-text" type="button" onClick={onExportProject}>
          <Download size={16} aria-hidden="true" />
          导出
        </button>
        <button className="btn primary icon-text" type="button" onClick={onSave}>
          <Save size={16} aria-hidden="true" />
          保存方案
        </button>
      </div>
    </header>
  );
}

interface ProjectConsoleProps {
  currentTripId: string;
  summaries: TripProjectSummary[];
  onBackToPlanner: () => void;
  onCreateProject: () => void;
  onImportClick: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

function ProjectConsole({
  currentTripId,
  summaries,
  onBackToPlanner,
  onCreateProject,
  onImportClick,
  onSelectProject,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
}: ProjectConsoleProps) {
  const handleProjectCardClick = (event: MouseEvent<HTMLElement>, projectId: string) => {
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, a')) {
      return;
    }
    onSelectProject(projectId);
  };

  return (
    <main className="project-console" role="main" aria-label="旅行项目控制台">
      <img className="console-bg-image" src={consoleHeroBackground} alt="" aria-hidden="true" />
      <section className="console-hero" aria-labelledby="console-title">
        <div className="console-hero-copy">
          <span className="console-kicker">旅行工作台</span>
          <h1 id="console-title">旅行控制台</h1>
          <p>选择方案，进入地图继续调整路线、时间与点位。</p>
        </div>
        <div className="console-actions">
          <button className="btn icon-text" type="button" onClick={onBackToPlanner}>
            <MapPin size={16} aria-hidden="true" />
            返回规划
          </button>
          <button className="btn icon-text" type="button" onClick={onImportClick}>
            <Upload size={16} aria-hidden="true" />
            导入
          </button>
          <button className="btn primary icon-text" type="button" onClick={onCreateProject}>
            <Plus size={16} aria-hidden="true" />
            新建项目
          </button>
        </div>
      </section>

      <section className="project-list-section" aria-label="项目列表">
        <div className="project-list-heading">
          <span className="console-kicker">最近编辑</span>
          <h2>旅行方案</h2>
        </div>
        <div className="project-list project-list-scroll" aria-label="可滚动项目列表">
          {summaries.map((project) => (
            <article
              key={project.id}
              className={`project-card ${project.id === currentTripId ? 'active' : ''}`}
              aria-current={project.id === currentTripId ? 'true' : undefined}
              onClick={(event) => handleProjectCardClick(event, project.id)}
            >
              <div className="project-card-main">
                <div className="project-card-topline">
                  <span className="pill city-pill">
                    <MapPin size={13} aria-hidden="true" />
                    {project.city}
                  </span>
                  {project.id === currentTripId && <span className="active-chip">当前</span>}
                </div>
                <input
                  key={project.title}
                  className="project-title-input"
                  aria-label={`编辑项目标题 ${project.title}`}
                  defaultValue={project.title}
                  onBlur={(event) => {
                    const title = event.currentTarget.value.trim();
                    event.currentTarget.value = title || project.title;
                    if (title && title !== project.title) {
                      onRenameProject(project.id, title);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <div className="project-detail-row">
                  <span>
                    <CalendarDays size={14} aria-hidden="true" />
                    {project.dateRange}
                  </span>
                  <span>
                    <Clock3 size={14} aria-hidden="true" />
                    更新于 {formatDateTime(project.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="project-actions">
                <button className="btn tight icon-text" type="button" onClick={() => onOpenProject(project.id)} aria-label={`打开 ${project.title}`}>
                  <FolderOpen size={15} aria-hidden="true" />
                  打开
                </button>
                <button
                  className="btn tight icon-text"
                  type="button"
                  onClick={() => onDuplicateProject(project.id)}
                  aria-label={`复制 ${project.title}`}
                >
                  <Copy size={15} aria-hidden="true" />
                  复制
                </button>
                <button
                  className="btn tight icon-text danger"
                  type="button"
                  onClick={() => onDeleteProject(project.id)}
                  aria-label={`删除 ${project.title}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

interface CityProjectDialogProps {
  cities: CityProjectPreset[];
  onCancel: () => void;
  onCreate: (cityId: string, selectedPopularPlaceIds?: string[]) => void;
  onCreateManual: (request: ManualProjectRequest) => void;
}

function CityProjectDialog({ cities, onCancel, onCreate, onCreateManual }: CityProjectDialogProps) {
  const [selectedCityId, setSelectedCityId] = useState(cities[0]?.id ?? '');
  const [selectedPopularPlaceIds, setSelectedPopularPlaceIds] = useState<string[]>([]);
  const [creationMode, setCreationMode] = useState<'recommended' | 'manual'>('recommended');
  const [manualProvince, setManualProvince] = useState(provinceCityOptions[0]?.province ?? '');
  const manualProvinceOption = provinceCityOptions.find((option) => option.province === manualProvince) ?? provinceCityOptions[0];
  const [manualCity, setManualCity] = useState(manualProvinceOption?.cities[0] ?? '');
  const [manualTitle, setManualTitle] = useState(`${manualCity || '旅行'}规划`);
  const [manualStartDate, setManualStartDate] = useState(() => formatDateInput(addCalendarDays(new Date(), 14)));
  const [manualEndDate, setManualEndDate] = useState(() => formatDateInput(addCalendarDays(new Date(), 16)));
  const selectedCity = cities.find((city) => city.id === selectedCityId);

  const submitProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedCity) {
      onCreate(selectedCity.id, selectedPopularPlaceIds);
    }
  };

  const selectCity = (cityId: string) => {
    setSelectedCityId(cityId);
    setSelectedPopularPlaceIds([]);
  };

  const togglePopularPlace = (placeId: string) => {
    setSelectedPopularPlaceIds((current) =>
      current.includes(placeId) ? current.filter((item) => item !== placeId) : [...current, placeId],
    );
  };

  const skipPopularPlaces = () => {
    if (selectedCity) {
      onCreate(selectedCity.id, []);
    }
  };

  const submitManualProject = () => {
    onCreateManual({
      cityName: manualCity || manualProvince,
      title: manualTitle,
      startDate: manualStartDate,
      endDate: manualEndDate,
    });
  };

  const handleProvinceChange = (province: string) => {
    const option = provinceCityOptions.find((item) => item.province === province) ?? provinceCityOptions[0];
    const city = option?.cities[0] ?? province;
    setManualProvince(province);
    setManualCity(city);
    setManualTitle(`${city}旅行规划`);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card city-picker" role="dialog" aria-modal="true" aria-label="选择城市" onSubmit={submitProject}>
        <div className="modal-heading city-picker-heading">
          <div>
            <span className="console-kicker">新建旅行</span>
            <strong>先选城市，再挑几个起点</strong>
            <p>热门地点只做初始草稿，后续仍可在地图里搜索添加任意地点。</p>
          </div>
          <button className="icon-close" type="button" aria-label="关闭城市选择" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="dialog-tabs" role="tablist" aria-label="新建方式">
          <button
            type="button"
            role="tab"
            aria-selected={creationMode === 'recommended'}
            className={creationMode === 'recommended' ? 'active' : ''}
            onClick={() => setCreationMode('recommended')}
          >
            推荐城市
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={creationMode === 'manual'}
            className={creationMode === 'manual' ? 'active' : ''}
            onClick={() => setCreationMode('manual')}
          >
            自主选择
          </button>
        </div>

        {creationMode === 'recommended' ? (
          <>
            <div className="city-grid" aria-label="可选城市">
              {cities.map((city) => (
                <button
                  key={city.id}
                  className={`city-card ${city.id === selectedCityId ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={city.id === selectedCityId}
                  aria-label={`选择城市 ${city.name}`}
                  onClick={() => selectCity(city.id)}
                >
                  <span className="city-code">{city.code}</span>
                  <strong>{city.name}</strong>
                  <span>{city.region}</span>
                  <p>{city.description}</p>
                </button>
              ))}
            </div>

            {selectedCity ? (
              <section className="popular-place-panel" aria-label={`${selectedCity.name}热门地点`}>
                <div className="popular-place-heading">
                  <span className="console-kicker">热门地点</span>
                  <strong>{selectedCity.name}可先加入</strong>
                  <small>{selectedPopularPlaceIds.length} 个已选</small>
                </div>
                <div className="popular-place-grid">
                  {selectedCity.popularPlaces.map((place) => {
                    const selected = selectedPopularPlaceIds.includes(place.id);
                    return (
                      <button
                        key={place.id}
                        className={`popular-place-card ${selected ? 'selected' : ''}`}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`选择热门地点 ${place.name}`}
                        onClick={() => togglePopularPlace(place.id)}
                      >
                        <span className="popular-place-area">{place.area}</span>
                        <strong>{place.name}</strong>
                        <span>{place.stayMinutes} 分钟</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="popular-place-empty">
                <Search size={18} aria-hidden="true" />
                <span>选择城市后可挑热门地点，或直接进入地图搜索。</span>
              </div>
            )}
          </>
        ) : (
          <div className="manual-city-form">
            <label className="field-stack">
              <span>省份</span>
              <select aria-label="省份" value={manualProvince} onChange={(event) => handleProvinceChange(event.currentTarget.value)}>
                {provinceCityOptions.map((option) => (
                  <option key={option.province} value={option.province}>
                    {option.province}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span>城市</span>
              <select
                aria-label="城市"
                value={manualCity}
                onChange={(event) => {
                  setManualCity(event.currentTarget.value);
                  setManualTitle(`${event.currentTarget.value}旅行规划`);
                }}
              >
                {(manualProvinceOption?.cities ?? []).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span>规划名称</span>
              <input aria-label="规划名称" value={manualTitle} onChange={(event) => setManualTitle(event.currentTarget.value)} />
            </label>
            <label className="field-stack">
              <span>开始日期</span>
              <input type="date" value={manualStartDate} onChange={(event) => setManualStartDate(event.currentTarget.value)} />
            </label>
            <label className="field-stack">
              <span>结束日期</span>
              <input type="date" value={manualEndDate} onChange={(event) => setManualEndDate(event.currentTarget.value)} />
            </label>
          </div>
        )}

        <div className="modal-actions city-picker-actions">
          <button className="btn" type="button" onClick={onCancel}>
            取消
          </button>
          {creationMode === 'recommended' ? (
            <>
              <button className="btn icon-text" type="button" onClick={skipPopularPlaces} disabled={!selectedCity}>
                <Search size={16} aria-hidden="true" />
                跳过推荐，进入空白规划
              </button>
              <button className="btn primary" type="submit" disabled={!selectedCity}>
                {selectedPopularPlaceIds.length ? `创建并添加 ${selectedPopularPlaceIds.length} 个地点` : '创建项目'}
              </button>
            </>
          ) : (
            <button className="btn primary" type="button" onClick={submitManualProject}>
              创建空白项目
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

interface MapApiSettingsDialogProps {
  initialSettings: MapApiSettings;
  hasEnvBaiduAk: boolean;
  onCancel: () => void;
  onSave: (settings: MapApiSettings) => void;
}

function MapApiSettingsDialog({ initialSettings, hasEnvBaiduAk, onCancel, onSave }: MapApiSettingsDialogProps) {
  const [draft, setDraft] = useState<MapApiSettings>(initialSettings);

  const submitSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card map-settings" role="dialog" aria-modal="true" aria-label="地图 API 设置" onSubmit={submitSettings}>
        <div className="modal-heading">
          <div>
            <strong>地图 API 设置</strong>
            <p>填写百度浏览器端 AK 后会立即启用百度地图。</p>
          </div>
          <button className="icon-close" type="button" aria-label="关闭地图 API 设置" onClick={onCancel}>
            ×
          </button>
        </div>

        <label className="field-stack">
          <span>百度浏览器端 AK</span>
          <input
            type="password"
            autoComplete="off"
            aria-label="百度浏览器端 AK"
            value={draft.baiduBrowserAk}
            placeholder={hasEnvBaiduAk ? '已从 .env 读取，可留空继续使用' : '粘贴百度 JavaScript API AK'}
            onChange={(event) => setDraft({ baiduBrowserAk: event.currentTarget.value })}
          />
        </label>

        <div className="settings-note">
          <strong>高德代理 Key</strong>
          <span>请写入本地 .env 的 AMAP_WEB_SERVICE_KEY，再运行 npm run amap:proxy。</span>
        </div>

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" type="submit">
            保存并启用百度地图
          </button>
        </div>
      </form>
    </div>
  );
}

interface SidebarProps {
  state: TripState;
  dispatch: React.Dispatch<Parameters<typeof tripReducer>[1]>;
  plannerMode: PlannerMode;
  onPlannerModeChange: (mode: PlannerMode) => void;
  showDiningOnMap: boolean;
  onToggleDiningVisibility: () => void;
}

function ItinerarySidebar({
  state,
  dispatch,
  plannerMode,
  onPlannerModeChange,
  showDiningOnMap,
  onToggleDiningVisibility,
}: SidebarProps) {
  const day = selectCurrentDay(state);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [draggingDayId, setDraggingDayId] = useState<string | null>(null);
  const [draggingAlternativeId, setDraggingAlternativeId] = useState<string | null>(null);
  const [dayDropTargetId, setDayDropTargetId] = useState<string | null>(null);
  const [stopDropTargetId, setStopDropTargetId] = useState<string | null>(null);
  const [deleteDayId, setDeleteDayId] = useState<string | null>(null);
  const [deleteStopId, setDeleteStopId] = useState<string | null>(null);
  const dayTabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!dayTabsRef.current?.contains(target)) {
        setDeleteDayId(null);
      }
      if (!(target instanceof Element) || !target.closest('.stop-card')) {
        setDeleteStopId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    const dayTabs = dayTabsRef.current;
    if (!dayTabs) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      const canScroll = dayTabs.scrollWidth > dayTabs.clientWidth || state.trip.days.length > 3;
      if (!canScroll || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      dayTabs.scrollLeft += event.deltaY;
    };

    dayTabs.addEventListener('wheel', handleWheel, { passive: false });
    return () => dayTabs.removeEventListener('wheel', handleWheel);
  }, [state.trip.days.length]);

  const visibleDeleteDayId = deleteDayId && state.trip.days.some((item) => item.id === deleteDayId) ? deleteDayId : null;
  const visibleDeleteStopId = deleteStopId && day.stops.some((stop) => stop.id === deleteStopId) ? deleteStopId : null;

  const handleDrop = (targetStopId: string) => {
    if (draggingAlternativeId) {
      const targetIndex = day.stops.findIndex((stop) => stop.id === targetStopId);
      dispatch(addAlternativeToDay(draggingAlternativeId, targetIndex));
      setDraggingAlternativeId(null);
      setStopDropTargetId(null);
      return;
    }
    if (!draggingStopId || draggingStopId === targetStopId) {
      setDraggingStopId(null);
      setStopDropTargetId(null);
      return;
    }
    const targetIndex = day.stops.findIndex((stop) => stop.id === targetStopId);
    dispatch(reorderStop(draggingStopId, targetIndex));
    setDraggingStopId(null);
    setStopDropTargetId(null);
  };

  const handleDayDrop = (targetDayId: string) => {
    if (!draggingDayId || draggingDayId === targetDayId) {
      setDraggingDayId(null);
      setDayDropTargetId(null);
      return;
    }
    const targetIndex = state.trip.days.findIndex((item) => item.id === targetDayId);
    dispatch(reorderTripDay(draggingDayId, targetIndex));
    setDraggingDayId(null);
    setDayDropTargetId(null);
  };

  const handleDeleteDay = () => {
    if (state.trip.days.length <= 1) {
      return;
    }
    const hasContent = dayHasContent(day);
    if (hasContent && !window.confirm(`确认删除 ${day.label}？该日期已有规划内容。`)) {
      return;
    }
    dispatch(deleteTripDay(day.id));
    setDeleteDayId(null);
  };

  const handleDropToAlternatives = () => {
    if (!draggingStopId) {
      return;
    }
    dispatch(moveStopToAlternatives(draggingStopId));
    setDraggingStopId(null);
    setStopDropTargetId(null);
  };

  const handleAddManualAlternative = () => {
    const fallbackLngLat = day.stops[0]?.lngLat ?? day.diningStops[0]?.lngLat ?? ([121.4737, 31.2304] as [number, number]);
    dispatch(
      addAlternativeFromSearchResult({
        id: `manual-alternative-${state.trip.alternatives.length + 1}`,
        name: '新增备选点位',
        address: `${state.trip.city} 待定位`,
        city: state.trip.city,
        lngLat: fallbackLngLat,
        source: 'manual',
      }),
    );
  };

  return (
    <aside className="sidebar" role="complementary" aria-label="行程列表">
      <div className="sidebar-scroll stable-scrollbar">
        <div className="day-strip">
        <div
          ref={dayTabsRef}
          className="day-tabs"
          role="tablist"
          aria-label="行程日期"
        >
          {state.trip.days.map((item) => {
            const active = item.id === state.activeDayId;
            return (
              <div
                key={item.id}
                className={[
                  'day-tab-shell',
                  active ? 'active' : '',
                  draggingDayId === item.id ? 'day-drag-origin' : '',
                  dayDropTargetId === item.id && draggingDayId !== item.id ? 'day-drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className="day-tab-button"
                  role="tab"
                  aria-label={`${item.label} ${item.date.slice(5)}`}
                  aria-selected={active}
                  draggable
                  onClick={() => {
                    dispatch(setActiveDay(item.id));
                    setDeleteDayId(item.id);
                  }}
                  onDragStart={() => {
                    setDraggingDayId(item.id);
                    setDayDropTargetId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingDayId(null);
                    setDayDropTargetId(null);
                  }}
                  onDragOver={(event) => {
                    if (draggingDayId) {
                      event.preventDefault();
                      setDayDropTargetId(item.id);
                    }
                  }}
                  onDragLeave={() => setDayDropTargetId((current) => (current === item.id ? null : current))}
                  onDrop={() => handleDayDrop(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.date.slice(5)}</span>
                </button>
                {active && visibleDeleteDayId === item.id ? (
                  <button
                    className="day-delete-button"
                    type="button"
                    aria-label={`删除 ${item.label}`}
                    disabled={state.trip.days.length <= 1}
                    onClick={handleDeleteDay}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
          <button className="day-add-button" type="button" aria-label="增加日期" onClick={() => dispatch(addTripDay())}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="day-mode-tools" aria-label="餐饮显示控制">
          <button
            className={`square-tool dining-mode-toggle ${plannerMode === 'dining' ? 'active' : ''}`}
            type="button"
            aria-label={plannerMode === 'dining' ? '路线规划' : '餐饮规划'}
            aria-pressed={plannerMode === 'dining'}
            title={plannerMode === 'dining' ? '路线规划' : '餐饮规划'}
            onClick={() => onPlannerModeChange(plannerMode === 'dining' ? 'route' : 'dining')}
          >
            <Utensils size={15} aria-hidden="true" />
          </button>
          <button
            className="square-tool"
            type="button"
            aria-label={showDiningOnMap ? '隐藏餐饮点' : '显示餐饮点'}
            aria-pressed={showDiningOnMap}
            title={showDiningOnMap ? '隐藏餐饮点' : '显示餐饮点'}
            onClick={onToggleDiningVisibility}
          >
            {showDiningOnMap ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {plannerMode === 'dining' ? (
        <>
          <div className="section-title">
            <span>餐饮点位</span>
            <span>{day.diningStops.length} 个</span>
          </div>
          {day.diningStops.length === 0 ? (
            <div className="panel-state compact">
              <strong>暂无餐饮点位</strong>
              <p>搜索餐厅、小吃或咖啡店后可加入当天餐饮规划。</p>
            </div>
          ) : (
            <div className="stop-list dining-list">
              {day.diningStops.map((stop) => (
                <DiningStopCard
                  key={stop.id}
                  stop={stop}
                  onUpdate={(patch) => dispatch(updateDiningStop(stop.id, patch))}
                  onDelete={() => dispatch(deleteDiningStop(stop.id))}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="section-title">
            <span>当天路线</span>
            <span>{day.stops.length} 个点位</span>
          </div>

          {day.stops.length === 0 ? (
            <div className="panel-state compact">
              <strong>Day 暂无点位</strong>
              <p>搜索地点后可加入当天路线。</p>
            </div>
          ) : (
            <div className="stop-list">
              {day.stops.map((stop, index) => (
                <div key={stop.id} className="stop-stack">
                  <StopCard
                    stop={stop}
                    active={state.selectedStopId === stop.id}
                    showDelete={visibleDeleteStopId === stop.id}
                    onSelect={() => {
                      dispatch(selectStop(stop.id));
                      setDeleteStopId(stop.id);
                    }}
                    onDelete={() => {
                      dispatch(deleteStop(stop.id));
                      setDeleteStopId(null);
                    }}
                    onDragStart={() => {
                      setDraggingStopId(stop.id);
                      setStopDropTargetId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingStopId(null);
                      setStopDropTargetId(null);
                    }}
                    onDragOver={(event) => {
                      if (draggingStopId || draggingAlternativeId) {
                        event.preventDefault();
                        setStopDropTargetId(stop.id);
                      }
                    }}
                    onDragLeave={() => setStopDropTargetId((current) => (current === stop.id ? null : current))}
                    onDrop={() => handleDrop(stop.id)}
                    dragging={draggingStopId === stop.id}
                    dropTarget={stopDropTargetId === stop.id && draggingStopId !== stop.id}
                  />
                  {day.routeSegments[index] ? (
                    <RouteLeg
                      segment={day.routeSegments[index]}
                      day={day}
                      active={state.selectedSegmentId === day.routeSegments[index].id}
                      onSelect={() => dispatch(selectRouteSegment(day.routeSegments[index].id))}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {plannerMode === 'route' ? (
        <section
          className={`alternatives-drop-zone ${draggingStopId ? 'drop-ready' : ''}`}
          role="region"
          aria-label="备选点位"
          onDragOver={(event) => {
            if (draggingStopId) {
              event.preventDefault();
            }
          }}
          onDrop={handleDropToAlternatives}
        >
          <div className="section-title alternatives">
            <span>备选点位</span>
            <span>{state.trip.alternatives.length} 个</span>
          </div>
          <button className="btn tight icon-text" type="button" onClick={handleAddManualAlternative}>
            <Plus size={15} aria-hidden="true" />
            新增备选点位
          </button>
          <div className="stop-list alt-list">
            {state.trip.alternatives.map((stop) => (
              <AlternativeStopCard
                key={stop.id}
                stop={stop}
                onAddToDay={() => dispatch(addAlternativeToDay(stop.id))}
                onUpdate={(patch) => dispatch(updateAlternativeStop(stop.id, patch))}
                onDragStart={() => {
                  setDraggingAlternativeId(stop.id);
                  setStopDropTargetId(null);
                }}
                onDragEnd={() => {
                  setDraggingAlternativeId(null);
                  setStopDropTargetId(null);
                }}
                dragging={draggingAlternativeId === stop.id}
              />
            ))}
          </div>
        </section>
      ) : null}

        <button className="btn subtle undo" type="button" onClick={() => dispatch(undoLastDelete())}>
          撤销删除
        </button>
      </div>
    </aside>
  );
}

interface StopCardProps {
  stop: TripStop;
  active: boolean;
  showDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  dragging: boolean;
  dropTarget: boolean;
}

function StopCard({
  stop,
  active,
  showDelete,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dragging,
  dropTarget,
}: StopCardProps) {
  return (
    <article
      className={`stop-card route-stop-card ${active ? 'active' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`}
      draggable
      data-testid={`stop-card-${stop.id}`}
      aria-label={`拖拽排序 ${stop.name}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button className="stop-main" type="button" aria-pressed={active} aria-label={`${stop.startTime} ${stop.name}`} onClick={onSelect}>
        <span className="stop-time-block">
          <span className="time">{stop.startTime}</span>
          <span className="stop-stay">{stop.stayMinutes}min</span>
        </span>
        <span className="stop-copy">
          <strong>{stop.name}</strong>
          <small>
            {stop.address}
          </small>
        </span>
        <span className="drag-handle" aria-hidden="true" title="拖拽排序">
          <GripVertical size={15} />
        </span>
      </button>
      {showDelete ? (
        <button className="stop-delete-button" type="button" aria-label={`删除 ${stop.name}`} onClick={onDelete}>
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

interface RouteLegProps {
  segment: RouteSegment;
  day: TripDay;
  active: boolean;
  onSelect: () => void;
}

function RouteLeg({ segment, day, active, onSelect }: RouteLegProps) {
  const from = day.stops.find((stop) => stop.id === segment.fromStopId);
  const to = day.stops.find((stop) => stop.id === segment.toStopId);
  const option = getSelectedOption(segment);
  const status = routeStatusText(segment.status);

  if (!from || !to) {
    return null;
  }

  return (
    <button
      className={`route-leg ${active ? 'active' : ''} ${segment.status}`}
      type="button"
      aria-label={`查看路线 ${from.name} 到 ${to.name}`}
      onClick={onSelect}
    >
      <Route size={14} aria-hidden="true" />
      <span>{option?.title ?? '待规划'}</span>
      <strong>{segment.status === 'ready' ? `${option?.durationMinutes ?? 0} 分钟` : status}</strong>
    </button>
  );
}

interface DiningStopCardProps {
  stop: DiningStop;
  onUpdate: (patch: Partial<Pick<DiningStop, 'diningType'>>) => void;
  onDelete: () => void;
}

function DiningStopCard({ stop, onUpdate, onDelete }: DiningStopCardProps) {
  const diningTypeLabel = diningTypeOptions.find((option) => option.value === stop.diningType)?.label ?? '餐饮';
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const currentTypeIndex = diningTypeOptions.findIndex((option) => option.value === stop.diningType);

  const updateDiningType = (diningType: DiningType, keepMenuOpen = false) => {
    onUpdate({ diningType });
    setTypeMenuOpen(keepMenuOpen);
  };

  const moveDiningType = (step: number) => {
    const currentIndex = currentTypeIndex >= 0 ? currentTypeIndex : 0;
    const nextIndex = (currentIndex + step + diningTypeOptions.length) % diningTypeOptions.length;
    updateDiningType(diningTypeOptions[nextIndex].value, true);
  };

  const jumpDiningType = (index: number) => {
    updateDiningType(diningTypeOptions[index].value, true);
  };

  const handleTypeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      setTypeMenuOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveDiningType(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveDiningType(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      jumpDiningType(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      jumpDiningType(diningTypeOptions.length - 1);
    }
  };

  return (
    <article className="dining-stop-card dining-card-compact">
      <div className="dining-main-row">
        <span
          className={`dining-type-control ${typeMenuOpen ? 'open' : ''}`}
          onBlur={(event) => {
            const nextFocus = event.relatedTarget;
            if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
              setTypeMenuOpen(false);
            }
          }}
          onKeyDown={handleTypeKeyDown}
        >
          <button
            className="dining-type-trigger"
            type="button"
            aria-label={`编辑餐饮类型 ${stop.name}，当前${diningTypeLabel}`}
            aria-haspopup="listbox"
            aria-expanded={typeMenuOpen}
            onClick={() => setTypeMenuOpen((open) => !open)}
          >
            <span className="dining-type-badge" aria-hidden="true">
              <span>{diningTypeLabel}</span>
              <ChevronDown size={10} />
            </span>
          </button>
          {typeMenuOpen ? (
            <span className="dining-type-menu" role="listbox" aria-label={`餐饮类型选项 ${stop.name}`}>
              {diningTypeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`dining-type-option ${option.value === stop.diningType ? 'selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === stop.diningType}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    updateDiningType(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </span>
          ) : null}
        </span>
        <span className="dining-copy">
          <strong>{stop.name}</strong>
          <small>{stop.address}</small>
        </span>
      </div>
      <button className="icon-close dining-delete-button" type="button" aria-label={`删除餐饮 ${stop.name}`} onClick={onDelete}>
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </article>
  );
}

interface AlternativeStopCardProps {
  stop: TripStop;
  onAddToDay: () => void;
  onUpdate: (patch: Partial<Pick<TripStop, 'name' | 'note' | 'address' | 'tags'>>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}

function AlternativeStopCard({ stop, onAddToDay, onUpdate, onDragStart, onDragEnd, dragging }: AlternativeStopCardProps) {
  const commitName = (input: HTMLInputElement) => {
    const name = input.value.trim();
    input.value = name || stop.name;
    if (name && name !== stop.name) {
      onUpdate({ name });
    }
  };

  const commitNote = (input: HTMLInputElement) => {
    if (input.value !== stop.note) {
      onUpdate({ note: input.value });
    }
  };

  return (
    <article
      className={`alt-stop editable-alt ${dragging ? 'dragging' : ''}`}
      draggable
      data-testid={`alternative-card-${stop.id}`}
      aria-label={`拖拽备选点位 ${stop.name}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span>
        <input
          key={stop.name}
          className="alt-input"
          aria-label={`编辑备选名称 ${stop.name}`}
          defaultValue={stop.name}
          onBlur={(event) => commitName(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <input
          key={stop.note}
          className="alt-note-input"
          aria-label={`编辑备选备注 ${stop.name}`}
          defaultValue={stop.note}
          onBlur={(event) => commitNote(event.currentTarget)}
        />
      </span>
      <button className="icon-close alt-add-button" type="button" aria-label={`加入当天路线 ${stop.name}`} onClick={onAddToDay}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

interface DetailPanelProps {
  state: TripState;
  demoState: DemoState;
  dispatch: React.Dispatch<Parameters<typeof tripReducer>[1]>;
  pushToast: (kind: ToastKind, message: string, title?: string) => void;
  onResetDemo: () => void;
}

function DetailPanel({ state, demoState, dispatch, pushToast, onResetDemo }: DetailPanelProps) {
  const day = selectCurrentDay(state);
  const selectedSegment = day.routeSegments.find((segment) => segment.id === state.selectedSegmentId);
  const selectedStop = day.stops.find((stop) => stop.id === state.selectedStopId);

  return (
    <aside className="detail" role="complementary" aria-label="详情面板">
      {demoState === 'transitError' ? (
        <div className="detail-card alert">
          <div className="alert-title">
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>未找到合适公交路线</strong>
          </div>
          <p>保留地图直线连接。可以改为打车、步行或手动记录交通方式。</p>
          <button className="btn primary" type="button" onClick={onResetDemo}>
            使用替代交通
          </button>
        </div>
      ) : null}

      {selectedStop ? (
        <StopDetail key={selectedStop.id} stop={selectedStop} dispatch={dispatch} />
      ) : selectedSegment ? (
        <SegmentDetail
          day={day}
          segment={selectedSegment}
          dispatch={dispatch}
          pushToast={pushToast}
        />
      ) : (
        <div className="panel-state compact">
          <strong>选择一个点位或路线段</strong>
          <p>详情会同步显示交通方案、备注和提醒。</p>
        </div>
      )}
    </aside>
  );
}

interface SegmentDetailProps {
  day: TripDay;
  segment: RouteSegment;
  dispatch: React.Dispatch<Parameters<typeof tripReducer>[1]>;
  pushToast: (kind: ToastKind, message: string, title?: string) => void;
}

function SegmentDetail({ day, segment, dispatch, pushToast }: SegmentDetailProps) {
  const from = day.stops.find((stop) => stop.id === segment.fromStopId);
  const to = day.stops.find((stop) => stop.id === segment.toStopId);
  const selected = getSelectedOption(segment);

  return (
    <>
      <div className="section-title">
        <span>当前路线段</span>
        <span className={`pill ${segment.status === 'ready' ? 'green' : 'warn'}`}>
          {routeStatusText(segment.status)}
        </span>
      </div>

      <div className="detail-card selected">
        <h2>
          {from?.name} → {to?.name}
        </h2>
        <div className="metrics">
          <div className="metric">
            <strong>{selected?.durationMinutes ?? 0} 分</strong>
            <span>预计耗时</span>
          </div>
          <div className="metric">
            <strong>{selected?.costCny ?? 0} 元</strong>
            <span>交通费用</span>
          </div>
          <div className="metric">
            <strong>{selected?.walkingMeters ?? 0} m</strong>
            <span>步行</span>
          </div>
        </div>
        <span className="pill warn">换乘 {selected?.transfers ?? 0} 次</span>
        {segment.warning ? <span className="pill">{segment.warning}</span> : null}
      </div>

      <div className="section-title">
        <span>交通方案</span>
        <button
          className="btn tight"
          type="button"
          onClick={() => {
            dispatch(markRouteSegmentsStale([segment.id]));
            pushToast('info', '路线段已标记重新计算。');
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="detail-card options-card">
        {segment.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`option-row ${option.id === segment.selectedOptionId ? 'active' : ''}`}
            aria-label={`选择交通方案 ${option.title} ${option.durationMinutes} 分钟 ${option.costCny} 元`}
            onClick={() => {
              dispatch(selectTransportOption(segment.id, option.id));
              pushToast('success', `已切换为“${option.title}”`);
            }}
          >
            <span>
              <strong>{option.title}</strong>
              <small>{option.unavailableReason ?? option.description}</small>
            </span>
            <span className={option.isRecommended ? 'pill green' : 'pill'}>{option.isRecommended ? '推荐' : `${option.costCny} 元`}</span>
          </button>
        ))}
      </div>

      <div className="section-title">
        <span>路线规划备注</span>
        <span>自动保存</span>
      </div>
      <textarea
        className="notes"
        value={segment.planningNote}
        aria-label={`路线规划备注 ${from?.name ?? '起点'} 到 ${to?.name ?? '终点'}`}
        onChange={(event) => dispatch(updateRouteSegmentNote(segment.id, event.currentTarget.value))}
      />
    </>
  );
}

function StopDetail({ stop, dispatch }: { stop: TripStop; dispatch: React.Dispatch<Parameters<typeof tripReducer>[1]> }) {
  const [startTimeDraft, setStartTimeDraft] = useState(stop.startTime);
  const [stayMinutesDraft, setStayMinutesDraft] = useState(String(stop.stayMinutes));
  const stopKind = getStopMarkerKind(stop);

  const handleStartTimeChange = (value: string) => {
    setStartTimeDraft(value);
    if (/^\d{2}:\d{2}$/.test(value)) {
      dispatch(updateStopSchedule(stop.id, { startTime: value }));
    }
  };

  const commitStartTime = () => {
    const value = startTimeDraft.trim();
    if (/^\d{2}:\d{2}$/.test(value)) {
      setStartTimeDraft(value);
      dispatch(updateStopSchedule(stop.id, { startTime: value }));
      return;
    }
    setStartTimeDraft(stop.startTime);
  };

  const handleStayMinutesChange = (value: string) => {
    setStayMinutesDraft(value);
    const minutes = Number(value);
    if (value.trim() && Number.isFinite(minutes)) {
      dispatch(updateStopSchedule(stop.id, { stayMinutes: minutes }));
    }
  };

  const commitStayMinutes = () => {
    const minutes = Number(stayMinutesDraft);
    if (stayMinutesDraft.trim() && Number.isFinite(minutes)) {
      const normalizedMinutes = Math.max(0, Math.round(minutes));
      setStayMinutesDraft(String(normalizedMinutes));
      dispatch(updateStopSchedule(stop.id, { stayMinutes: normalizedMinutes }));
      return;
    }
    setStayMinutesDraft(String(stop.stayMinutes));
  };

  return (
    <>
      <div className="section-title">
        <span>当前点位</span>
        <span className="pill green">{stop.city}</span>
      </div>
      <div className="detail-card selected">
        <h2>{stop.name}</h2>
        <p>{stop.address}</p>
        <label className="stop-kind-field">
          <span>点位类型</span>
          <select
            aria-label={`${stop.name} 点位类型`}
            value={stopKind}
            onChange={(event) => dispatch(updateStopKind(stop.id, event.currentTarget.value as StopKind))}
          >
            <option value="default">普通点位</option>
            <option value="accommodation">住宿点</option>
          </select>
        </label>
        <div className="metrics">
          <div className="metric">
            <input
              className="metric-input time-input"
              aria-label={`${stop.name} 开始时间`}
              value={startTimeDraft}
              inputMode="numeric"
              placeholder="HH:MM"
              onChange={(event) => handleStartTimeChange(event.currentTarget.value)}
              onBlur={commitStartTime}
            />
            <span>开始时间</span>
          </div>
          <div className="metric">
            <input
              className="metric-input number-input"
              type="number"
              min="0"
              step="5"
              aria-label={`${stop.name} 停留分钟数`}
              value={stayMinutesDraft}
              onChange={(event) => handleStayMinutesChange(event.currentTarget.value)}
              onBlur={commitStayMinutes}
            />
            <span>停留</span>
          </div>
        </div>
      </div>
      <div className="section-title">
        <span>点位备注</span>
        <span>自动保存</span>
      </div>
      <textarea
        className="notes"
        value={stop.note}
        aria-label={`${stop.name} 备注`}
        onChange={(event) => dispatch(updateStopNote(stop.id, event.currentTarget.value))}
      />
    </>
  );
}

interface SummaryBarProps {
  state: TripState;
  summary: ReturnType<typeof selectCurrentSummary>;
}

function SummaryBar({ state, summary }: SummaryBarProps) {
  const day = selectCurrentDay(state);
  return (
    <footer className="summary" role="contentinfo" aria-label="行程摘要">
      <div className="summary-left">
        <div className="summary-item">
          <strong>{day.label}</strong>
          <span>
            {summary.stopCount} 个确认点 · {summary.alternativeCount} 个备选
          </span>
        </div>
      </div>
      <div className="summary-mid">
        <div className="summary-item">
          <strong data-testid="summary-total">{formatMinutes(summary.totalMinutes)}</strong>
          <span>总行程</span>
        </div>
        <div className="summary-item">
          <strong>{formatMinutes(summary.transportMinutes)}</strong>
          <span>交通</span>
        </div>
        <div className="summary-item">
          <strong>{(summary.walkingMeters / 1000).toFixed(1)} km</strong>
          <span>步行</span>
        </div>
        <div className="summary-item">
          <strong data-testid="summary-cost">{summary.transportCostCny} 元</strong>
          <span>公共交通</span>
        </div>
      </div>
      <div className="summary-right">
        {summary.risks.slice(0, 2).map((risk) => (
          <span key={risk} className="pill warn">
            {risk}
          </span>
        ))}
      </div>
    </footer>
  );
}

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-label="消息提醒">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
          <small>{Math.round(toast.durationMs / 1000)} 秒</small>
        </div>
      ))}
    </div>
  );
}

const getSelectedOption = (segment: RouteSegment): TransportOption | undefined =>
  segment.options.find((option) => option.id === segment.selectedOptionId) ??
  segment.options.find((option) => option.mode === segment.selectedMode);

const formatMinutes = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} 分`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const toastTitle = (kind: ToastKind): string => {
  if (kind === 'success') return '成功';
  if (kind === 'warn') return '警告';
  if (kind === 'error') return '错误';
  return '提示';
};

const createMapProvider = (mode: ProviderMode, baiduAk: string): MapProvider => {
  if (mode === 'amap') {
    return new AmapProvider();
  }
  if (mode === 'baidu') {
    return new BaiduProvider({ ak: baiduAk });
  }
  return new MockMapProvider();
};

const providerModeToast = (mode: ProviderMode): string => {
  if (mode === 'amap') {
    return '已切换到高德代理。请先运行 npm run amap:proxy 并配置 AMAP_WEB_SERVICE_KEY。';
  }
  if (mode === 'baidu') {
    return '已切换到百度地图。浏览器端 AK 将直接调用百度 JavaScript API。';
  }
  return '已切换到 Mock 地图服务。';
};

const loadInitialTrip = (): { trip: TripPlan; restoredDraft: boolean } => {
  if (typeof window === 'undefined') {
    return { trip: shanghaiSampleTrip, restoredDraft: false };
  }

  try {
    const draft = loadTripDraft();
    if (draft) {
      return { trip: draft, restoredDraft: true };
    }
  } catch {
    // Fall through to the project library before using the built-in sample.
  }

  try {
    const latestProject = readTripProjectLibrary()[0];
    if (latestProject) {
      return { trip: latestProject.trip, restoredDraft: false };
    }
  } catch {
    // Fall back to the bundled sample if local storage cannot be read.
  }

  return { trip: shanghaiSampleTrip, restoredDraft: false };
};

const mergeCurrentTripIntoProjects = (trip: TripPlan, records: TripProjectRecord[]): TripProjectRecord[] => {
  const currentRecord: TripProjectRecord = {
    id: trip.id,
    trip,
    createdAt: trip.updatedAt,
    updatedAt: trip.updatedAt,
  };
  return [currentRecord, ...records.filter((record) => record.id !== trip.id)].sort(
    (first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt),
  );
};

const getMapErrorCode = (error: unknown): MapProviderErrorCode => (error instanceof MapProviderError ? error.code : 'network');

const routeErrorToast = (code: MapProviderErrorCode): string => {
  if (code === 'quotaExceeded') return '地图配额超限，已停止自动刷新，可手动填写交通方式。';
  if (code === 'noTransitRoute') return '未找到公交路线，已保留打车、步行和手动交通入口。';
  if (code === 'invalidKey') return '地图 Key 无效，请检查地图 API 设置或 AMAP_WEB_SERVICE_KEY。';
  return '路线规划失败，已保留手动交通入口。';
};

const routeStatusText = (status: RouteSegment['status']): string => {
  if (status === 'ready') return '已规划';
  if (status === 'loading') return '计算中';
  if (status === 'failed') return '规划失败';
  return '待计算';
};

const diningTypeOptions: Array<{ value: DiningType; label: string }> = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'dessert', label: '甜品' },
  { value: 'snack', label: '小吃' },
  { value: 'coffee', label: '咖啡' },
  { value: 'lateNight', label: '夜宵' },
  { value: 'other', label: '其他' },
];

const dayHasContent = (day: TripDay): boolean => day.stops.length > 0 || day.routeSegments.length > 0 || day.diningStops.length > 0;

const getTripFallbackYear = (trip: TripPlan): number => {
  const match = trip.days[0]?.date.match(/^(\d{4})-/u);
  return match ? Number(match[1]) : new Date().getFullYear();
};

const getDateRangeShrinkRisk = (
  trip: TripPlan,
  nextDateRange: string,
): { requiresConfirmation: boolean; removedDayCount: number } => {
  const range = parseTripDateRange(nextDateRange, getTripFallbackYear(trip));
  if (!range) {
    return { requiresConfirmation: false, removedDayCount: 0 };
  }
  const nextDayCount = getInclusiveDayCount(range.start, range.end);
  const removedDayCount = Math.max(0, trip.days.length - nextDayCount);
  const removedDays = removedDayCount > 0 ? trip.days.slice(nextDayCount) : [];
  return {
    requiresConfirmation: removedDays.some(dayHasContent),
    removedDayCount,
  };
};

const addCalendarDays = (value: Date, days: number): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const formatDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getInclusiveDayCount = (start: Date, end: Date): number =>
  end < start ? 1 : Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

const getTripExportFilename = (trip: TripPlan): string => {
  const title = sanitizeFilenamePart(trip.title) || '旅行规划';
  const dateRange = sanitizeFilenamePart(trip.dateRange.replace(/\s*-\s*/g, '-'));
  return dateRange ? `${title}-${dateRange}.json` : `${title}.json`;
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 90);

const createTextFileDownload = (filename: string, content: string, type: string): TextFileDownload => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Downloads are only available in the browser.');
  }

  return {
    filename,
    content,
    type,
    url: `data:${type};charset=utf-8,${encodeURIComponent(content)}`,
  };
};

type NativeWritableFile = {
  write: (content: string) => Promise<void> | void;
  close: () => Promise<void> | void;
};

type NativeSaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<NativeWritableFile>;
}>;

const saveTextFileWithPicker = async (download: TextFileDownload): Promise<SaveTextFileResult> => {
  if (typeof window === 'undefined') {
    return 'unsupported';
  }

  const nativeSaveFilePicker = (window as Window & { showSaveFilePicker?: NativeSaveFilePicker }).showSaveFilePicker;
  if (typeof nativeSaveFilePicker !== 'function') {
    return 'unsupported';
  }

  try {
    const handle = await nativeSaveFilePicker({
      suggestedName: download.filename,
      types: [
        {
          description: 'JSON 文件',
          accept: { [download.type]: ['.json'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(download.content);
    await writable.close();
    return 'saved';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled';
    }
    throw error;
  }
};

const triggerTextFileDownload = (download: TextFileDownload): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = download.url;
  link.download = download.filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
};
