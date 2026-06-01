import type { MapProviderErrorCode, PlaceSearchResult, PlannedRoute } from '../services/mapProvider/types';
import {
  addTripDays,
  deleteTripDayById,
  getDateRangeForDays,
  normalizeTripDateRange,
  reorderTripDays,
  syncTripDaysToDateRange,
} from '../services/tripDates';
import { isAccommodationStop } from '../types/stopKinds';
import type { DaySummary, DiningStop, DiningType, RouteSegment, StopKind, TransportOption, TripDay, TripPlan, TripStop } from '../types/trip';

export interface TripState {
  trip: TripPlan;
  activeDayId: string;
  selectedStopId: string | null;
  selectedSegmentId: string | null;
  deletedStops: DeletedStopRecord[];
}

interface DeletedStopRecord {
  dayId: string;
  stops: TripStop[];
  routeSegments: RouteSegment[];
  selectedStopId: string | null;
  selectedSegmentId: string | null;
}

type Direction = 'up' | 'down';
type DiningStopPatch = Partial<Pick<DiningStop, 'diningType' | 'startTime' | 'averagePriceCny' | 'note' | 'tags'>>;

type TripAction =
  | { type: 'setActiveDay'; dayId: string }
  | { type: 'selectStop'; stopId: string }
  | { type: 'selectRouteSegment'; segmentId: string }
  | { type: 'clearSelection' }
  | { type: 'addStopFromSearchResult'; result: PlaceSearchResult; kind?: StopKind }
  | { type: 'addDiningStopFromSearchResult'; result: PlaceSearchResult; diningType: DiningType }
  | { type: 'updateDiningStop'; stopId: string; patch: DiningStopPatch }
  | { type: 'deleteDiningStop'; stopId: string }
  | { type: 'addAlternativeFromSearchResult'; result: PlaceSearchResult }
  | { type: 'addAlternativeToDay'; stopId: string; targetIndex?: number }
  | { type: 'updateAlternativeStop'; stopId: string; patch: Partial<Pick<TripStop, 'name' | 'address' | 'city' | 'note' | 'tags' | 'stayMinutes'>> }
  | { type: 'deleteStop'; stopId: string }
  | { type: 'undoLastDelete' }
  | { type: 'moveStop'; stopId: string; direction: Direction }
  | { type: 'moveStopToAlternatives'; stopId: string }
  | { type: 'reorderStop'; stopId: string; targetIndex: number }
  | { type: 'swapStops'; firstStopId: string; secondStopId: string }
  | { type: 'addTripDay' }
  | { type: 'deleteTripDay'; dayId: string }
  | { type: 'reorderTripDay'; dayId: string; targetIndex: number }
  | { type: 'markRouteSegmentsLoading'; segmentIds: string[] }
  | { type: 'markRouteSegmentsStale'; segmentIds: string[] }
  | { type: 'applyRoutePlan'; segmentId: string; route: PlannedRoute }
  | { type: 'markRouteSegmentFailed'; segmentId: string; errorCode: MapProviderErrorCode }
  | { type: 'selectTransportOption'; segmentId: string; optionId: string }
  | { type: 'updateRouteSegmentNote'; segmentId: string; planningNote: string }
  | { type: 'updateStopNote'; stopId: string; note: string }
  | { type: 'updateStopKind'; stopId: string; kind: StopKind }
  | { type: 'updateStopSchedule'; stopId: string; startTime?: string; stayMinutes?: number }
  | { type: 'updateTripMeta'; title?: string; dateRange?: string }
  | { type: 'importTripPlan'; trip: TripPlan };

export const setActiveDay = (dayId: string): TripAction => ({ type: 'setActiveDay', dayId });
export const selectStop = (stopId: string): TripAction => ({ type: 'selectStop', stopId });
export const selectRouteSegment = (segmentId: string): TripAction => ({ type: 'selectRouteSegment', segmentId });
export const clearSelection = (): TripAction => ({ type: 'clearSelection' });
export const addStopFromSearchResult = (result: PlaceSearchResult, kind?: StopKind): TripAction => ({ type: 'addStopFromSearchResult', result, kind });
export const addDiningStopFromSearchResult = (result: PlaceSearchResult, diningType: DiningType): TripAction => ({
  type: 'addDiningStopFromSearchResult',
  result,
  diningType,
});
export const updateDiningStop = (stopId: string, patch: DiningStopPatch): TripAction => ({ type: 'updateDiningStop', stopId, patch });
export const deleteDiningStop = (stopId: string): TripAction => ({ type: 'deleteDiningStop', stopId });
export const addAlternativeFromSearchResult = (result: PlaceSearchResult): TripAction => ({ type: 'addAlternativeFromSearchResult', result });
export const addAlternativeToDay = (stopId: string, targetIndex?: number): TripAction => ({ type: 'addAlternativeToDay', stopId, targetIndex });
export const updateAlternativeStop = (
  stopId: string,
  patch: Partial<Pick<TripStop, 'name' | 'address' | 'city' | 'note' | 'tags' | 'stayMinutes'>>,
): TripAction => ({ type: 'updateAlternativeStop', stopId, patch });
export const deleteStop = (stopId: string): TripAction => ({ type: 'deleteStop', stopId });
export const undoLastDelete = (): TripAction => ({ type: 'undoLastDelete' });
export const moveStop = (stopId: string, direction: Direction): TripAction => ({ type: 'moveStop', stopId, direction });
export const moveStopToAlternatives = (stopId: string): TripAction => ({ type: 'moveStopToAlternatives', stopId });
export const reorderStop = (stopId: string, targetIndex: number): TripAction => ({ type: 'reorderStop', stopId, targetIndex });
export const swapStops = (firstStopId: string, secondStopId: string): TripAction => ({
  type: 'swapStops',
  firstStopId,
  secondStopId,
});
export const addTripDay = (): TripAction => ({ type: 'addTripDay' });
export const deleteTripDay = (dayId: string): TripAction => ({ type: 'deleteTripDay', dayId });
export const reorderTripDay = (dayId: string, targetIndex: number): TripAction => ({ type: 'reorderTripDay', dayId, targetIndex });
export const markRouteSegmentsLoading = (segmentIds: string[]): TripAction => ({ type: 'markRouteSegmentsLoading', segmentIds });
export const markRouteSegmentsStale = (segmentIds: string[]): TripAction => ({ type: 'markRouteSegmentsStale', segmentIds });
export const applyRoutePlan = (segmentId: string, route: PlannedRoute): TripAction => ({ type: 'applyRoutePlan', segmentId, route });
export const markRouteSegmentFailed = (segmentId: string, errorCode: MapProviderErrorCode): TripAction => ({
  type: 'markRouteSegmentFailed',
  segmentId,
  errorCode,
});
export const selectTransportOption = (segmentId: string, optionId: string): TripAction => ({
  type: 'selectTransportOption',
  segmentId,
  optionId,
});
export const updateRouteSegmentNote = (segmentId: string, planningNote: string): TripAction => ({
  type: 'updateRouteSegmentNote',
  segmentId,
  planningNote,
});
export const updateStopNote = (stopId: string, note: string): TripAction => ({ type: 'updateStopNote', stopId, note });
export const updateStopKind = (stopId: string, kind: StopKind): TripAction => ({ type: 'updateStopKind', stopId, kind });
export const updateStopSchedule = (stopId: string, schedule: { startTime?: string; stayMinutes?: number }): TripAction => ({
  type: 'updateStopSchedule',
  stopId,
  ...schedule,
});
export const updateTripMeta = (meta: { title?: string; dateRange?: string }): TripAction => ({ type: 'updateTripMeta', ...meta });
export const importTripPlan = (trip: TripPlan): TripAction => ({ type: 'importTripPlan', trip });

export const createInitialTripState = (trip: TripPlan): TripState => {
  const plan = normalizeTripPlan(cloneTrip(trip));
  const firstDay = plan.days[0];
  return {
    trip: plan,
    activeDayId: firstDay.id,
    selectedStopId: firstDay.stops[1]?.id ?? firstDay.stops[0]?.id ?? null,
    selectedSegmentId: firstDay.routeSegments[1]?.id ?? firstDay.routeSegments[0]?.id ?? null,
    deletedStops: [],
  };
};

export const selectCurrentDay = (state: TripState): TripDay => {
  const day = state.trip.days.find((item) => item.id === state.activeDayId);
  if (!day) {
    throw new Error(`Active day not found: ${state.activeDayId}`);
  }
  return day;
};

export const selectCurrentSummary = (state: TripState): DaySummary => {
  const day = selectCurrentDay(state);
  const selectedOptions = day.routeSegments
    .map((segment) => ({ segment, option: getSelectedOption(segment) }))
    .filter(({ segment, option }) => option && segment.status !== 'stale' && segment.status !== 'loading' && !option.unavailableReason)
    .map(({ option }) => option as TransportOption);
  const stayMinutes = day.stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
  const transportMinutes = selectedOptions.reduce((sum, option) => sum + option.durationMinutes, 0);
  const walkingMeters = selectedOptions.reduce((sum, option) => sum + option.walkingMeters, 0);
  const transportCostCny = selectedOptions.reduce((sum, option) => sum + option.costCny, 0);
  const risks = Array.from(
    new Set([
      ...day.stops.flatMap((stop) => stop.tags.filter((tag) => ['需预约', '人流高', '跨城风险'].includes(tag))),
      ...day.routeSegments.flatMap((segment) => (segment.warning ? [segment.warning] : [])),
      ...(day.stops.length > 8 ? ['当天点位较密'] : []),
    ]),
  );

  return {
    stopCount: day.stops.length,
    alternativeCount: state.trip.alternatives.length,
    stayMinutes,
    transportMinutes,
    walkingMeters,
    transportCostCny,
    totalMinutes: stayMinutes + transportMinutes,
    risks,
  };
};

export const tripReducer = (state: TripState, action: TripAction): TripState => {
  switch (action.type) {
    case 'setActiveDay': {
      const day = state.trip.days.find((item) => item.id === action.dayId) ?? selectCurrentDay(state);
      return {
        ...state,
        activeDayId: day.id,
        selectedStopId: day.stops[0]?.id ?? null,
        selectedSegmentId: day.routeSegments[0]?.id ?? null,
      };
    }

    case 'selectStop':
      return { ...state, selectedStopId: action.stopId, selectedSegmentId: null };

    case 'selectRouteSegment':
      return { ...state, selectedSegmentId: action.segmentId, selectedStopId: null };

    case 'clearSelection':
      return { ...state, selectedStopId: null, selectedSegmentId: null };

    case 'addStopFromSearchResult':
      return updateActiveDay(state, (day) => {
        const stop = placeResultToStop(action.result, day.stops.length, state.trip.city, action.kind);
        const stopToAdd =
          action.kind === 'accommodation'
            ? {
                ...stop,
                startTime: day.stops[0]?.startTime ?? nextTimeByIndex(0),
              }
            : stop;
        const stops = [...day.stops, stopToAdd];

        return {
          day: reconcileDayStops(day, stops, action.kind === 'accommodation' ? stopToAdd.id : undefined),
          statePatch: {
            selectedStopId: stopToAdd.id,
            selectedSegmentId: null,
          },
        };
      });

    case 'addDiningStopFromSearchResult':
      return updateActiveDay(state, (day) => {
        const diningStop = placeResultToDiningStop(action.result, day.diningStops.length, state.trip.city, action.diningType);
        return {
          day: { ...day, diningStops: [...day.diningStops, diningStop] },
          statePatch: {
            selectedStopId: null,
            selectedSegmentId: null,
          },
        };
      });

    case 'updateDiningStop':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          diningStops: day.diningStops.map((stop) =>
            stop.id === action.stopId
              ? {
                  ...stop,
                  ...normalizeDiningStopPatch(action.patch, stop),
                }
              : stop,
          ),
        },
      }));

    case 'deleteDiningStop':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          diningStops: day.diningStops.filter((stop) => stop.id !== action.stopId),
        },
      }));

    case 'addAlternativeFromSearchResult': {
      const alternative = placeResultToAlternativeStop(action.result, state.trip.alternatives.length, state.trip.city);
      return {
        ...state,
        trip: {
          ...state.trip,
          alternatives: [...state.trip.alternatives, alternative],
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case 'addAlternativeToDay': {
      const alternative = state.trip.alternatives.find((stop) => stop.id === action.stopId);
      if (!alternative) {
        return state;
      }
      return updateActiveDay(state, (day) => {
        const targetIndex = action.targetIndex === undefined ? day.stops.length : clampIndex(action.targetIndex, day.stops.length);
        const stopToAdd = { ...alternative, id: uniqueStopId(alternative.id, day.stops), startTime: nextTimeByIndex(targetIndex), priority: 'nice' as const };
        const stops = [...day.stops];
        stops.splice(targetIndex, 0, stopToAdd);
        return {
          day: reconcileDayStops(day, stops, isAccommodationStop(stopToAdd) ? stopToAdd.id : undefined),
          tripPatch: {
            alternatives: state.trip.alternatives.filter((stop) => stop.id !== action.stopId),
          },
          statePatch: { selectedStopId: stopToAdd.id, selectedSegmentId: null },
        };
      });
    }

    case 'updateAlternativeStop':
      return {
        ...state,
        trip: {
          ...state.trip,
          alternatives: state.trip.alternatives.map((stop) =>
            stop.id === action.stopId
              ? {
                  ...stop,
                  ...normalizeAlternativePatch(action.patch, stop),
                }
              : stop,
          ),
          updatedAt: new Date().toISOString(),
        },
      };

    case 'deleteStop':
      return updateActiveDay(state, (day) => {
        const stopIndex = day.stops.findIndex((stop) => stop.id === action.stopId);
        if (stopIndex < 0) {
          return { day };
        }

        const nextStops = day.stops.filter((stop) => stop.id !== action.stopId);
        return {
          day: reconcileDayStops(day, nextStops),
          statePatch: {
            selectedStopId: nextStops[Math.max(0, stopIndex - 1)]?.id ?? null,
            selectedSegmentId: null,
            deletedStops: [
              ...state.deletedStops,
              {
                dayId: day.id,
                stops: day.stops,
                routeSegments: day.routeSegments,
                selectedStopId: state.selectedStopId,
                selectedSegmentId: state.selectedSegmentId,
              },
            ],
          },
        };
      });

    case 'undoLastDelete': {
      const dayIds = new Set(state.trip.days.map((day) => day.id));
      const lastValidIndex = findLastValidDeletedStopIndex(state.deletedStops, dayIds);
      if (lastValidIndex < 0) {
        return state.deletedStops.length === 0 ? state : { ...state, deletedStops: [] };
      }
      const last = state.deletedStops[lastValidIndex];
      return {
        ...state,
        trip: {
          ...state.trip,
          days: state.trip.days.map((day) =>
            day.id === last.dayId ? { ...day, stops: last.stops, routeSegments: last.routeSegments } : day,
          ),
        },
        activeDayId: last.dayId,
        selectedStopId: last.selectedStopId,
        selectedSegmentId: last.selectedSegmentId,
        deletedStops: state.deletedStops.slice(0, lastValidIndex),
      };
    }

    case 'moveStopToAlternatives':
      return updateActiveDay(state, (day) => {
        const stopIndex = day.stops.findIndex((stop) => stop.id === action.stopId);
        if (stopIndex < 0) {
          return { day };
        }

        const stop = day.stops[stopIndex];
        const stops = day.stops.filter((item) => item.id !== action.stopId);
        const alternative = routeStopToAlternative(stop);
        return {
          day: reconcileDayStops(day, stops),
          tripPatch: {
            alternatives: [...state.trip.alternatives.filter((item) => item.id !== alternative.id), alternative],
          },
          statePatch: {
            selectedStopId: stops[Math.max(0, stopIndex - 1)]?.id ?? stops[0]?.id ?? null,
            selectedSegmentId: null,
          },
        };
      });

    case 'moveStop':
      return updateActiveDay(state, (day) => {
        const currentIndex = day.stops.findIndex((stop) => stop.id === action.stopId);
        const targetIndex = action.direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= day.stops.length) {
          return { day };
        }

        const stops = moveStopInList(day.stops, currentIndex, targetIndex);
        return {
          day: reconcileDayStops(day, stops),
          statePatch: { selectedStopId: action.stopId, selectedSegmentId: null },
        };
      });

    case 'reorderStop':
      return updateActiveDay(state, (day) => {
        const currentIndex = day.stops.findIndex((stop) => stop.id === action.stopId);
        const targetIndex = clampIndex(action.targetIndex, day.stops.length - 1);
        if (currentIndex < 0 || currentIndex === targetIndex) {
          return { day };
        }

        const stops = moveStopInList(day.stops, currentIndex, targetIndex);
        return {
          day: reconcileDayStops(day, stops),
          statePatch: { selectedStopId: action.stopId, selectedSegmentId: null },
        };
      });

    case 'swapStops': {
      const day = selectCurrentDay(state);
      const firstIndex = day.stops.findIndex((stop) => stop.id === action.firstStopId);
      const secondIndex = day.stops.findIndex((stop) => stop.id === action.secondStopId);
      if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) {
        return state;
      }

      const stops = [...day.stops];
      [stops[firstIndex], stops[secondIndex]] = [stops[secondIndex], stops[firstIndex]];

      return updateActiveDay(state, () => ({
        day: reconcileDayStops(day, stops),
        statePatch: { selectedStopId: action.firstStopId, selectedSegmentId: null },
      }));
    }

    case 'addTripDay': {
      const days = addTripDays(state.trip.days, state.trip.dateRange);
      const addedDay = days.at(-1);
      return {
        ...state,
        activeDayId: addedDay?.id ?? state.activeDayId,
        selectedStopId: addedDay?.stops[0]?.id ?? null,
        selectedSegmentId: addedDay?.routeSegments[0]?.id ?? null,
        trip: {
          ...state.trip,
          days,
          dateRange: getDateRangeForDays(days, state.trip.dateRange),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case 'deleteTripDay': {
      const deletedIndex = state.trip.days.findIndex((day) => day.id === action.dayId);
      const days = deleteTripDayById(state.trip.days, action.dayId, state.trip.dateRange);
      if (days === state.trip.days) {
        return state;
      }
      const activeDay =
        action.dayId === state.activeDayId
          ? days[Math.min(Math.max(deletedIndex, 0), days.length - 1)]
          : days.find((day) => day.id === state.activeDayId) ?? days[0];
      return {
        ...state,
        activeDayId: activeDay.id,
        selectedStopId: activeDay.stops[0]?.id ?? null,
        selectedSegmentId: activeDay.routeSegments[0]?.id ?? null,
        deletedStops: pruneDeletedStopsForDays(state.deletedStops, days),
        trip: {
          ...state.trip,
          days,
          dateRange: getDateRangeForDays(days, state.trip.dateRange),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case 'reorderTripDay': {
      const days = reorderTripDays(state.trip.days, action.dayId, action.targetIndex, state.trip.dateRange);
      if (days === state.trip.days) {
        return state;
      }
      const activeDay = days.find((day) => day.id === action.dayId) ?? days[0];
      return {
        ...state,
        activeDayId: activeDay.id,
        selectedStopId: activeDay.stops[0]?.id ?? null,
        selectedSegmentId: activeDay.routeSegments[0]?.id ?? null,
        trip: {
          ...state.trip,
          days,
          dateRange: getDateRangeForDays(days, state.trip.dateRange),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case 'markRouteSegmentsLoading':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) =>
            action.segmentIds.includes(segment.id)
              ? {
                  ...segment,
                  status: 'loading',
                  warning: segment.warning ?? '正在重新计算',
                  errorCode: undefined,
                }
              : segment,
          ),
        },
      }));

    case 'markRouteSegmentsStale':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) =>
            action.segmentIds.includes(segment.id)
              ? {
                  ...segment,
                  status: 'stale',
                  warning: '待重新计算',
                  errorCode: undefined,
                }
              : segment,
          ),
        },
      }));

    case 'applyRoutePlan':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) => {
            if (segment.id !== action.segmentId) {
              return segment;
            }

            const selected = action.route.options.find((option) => option.isRecommended) ?? action.route.options[0];
            if (!selected) {
              return {
                ...segment,
                status: 'failed',
                warning: action.route.warning ?? '路线规划失败',
              };
            }

            return {
              ...segment,
              status: 'ready',
              selectedMode: selected.mode,
              selectedOptionId: selected.id,
              options: action.route.options,
              provider: action.route.provider,
              cached: action.route.cached,
              warning: action.route.warning,
              errorCode: undefined,
            };
          }),
        },
        statePatch: { selectedSegmentId: action.segmentId, selectedStopId: null },
      }));

    case 'markRouteSegmentFailed':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) => {
            if (segment.id !== action.segmentId) {
              return segment;
            }

            const fallbackOptions = createFallbackOptions(segment, day, action.errorCode);
            return {
              ...segment,
              status: 'failed',
              selectedMode: 'manual',
              selectedOptionId: fallbackOptions.at(-1)?.id ?? segment.selectedOptionId,
              options: fallbackOptions,
              warning: routeFailureMessage(action.errorCode),
              errorCode: action.errorCode,
            };
          }),
        },
        statePatch: { selectedSegmentId: action.segmentId, selectedStopId: null },
      }));

    case 'selectTransportOption':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) => {
            if (segment.id !== action.segmentId) {
              return segment;
            }
            const selected = segment.options.find((option) => option.id === action.optionId);
            if (!selected) {
              return segment;
            }
            return {
              ...segment,
              selectedMode: selected.mode,
              selectedOptionId: selected.id,
              status: 'ready',
            };
          }),
        },
        statePatch: { selectedSegmentId: action.segmentId, selectedStopId: null },
      }));

    case 'updateRouteSegmentNote':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          routeSegments: day.routeSegments.map((segment) =>
            segment.id === action.segmentId ? { ...segment, planningNote: action.planningNote } : segment,
          ),
        },
      }));

    case 'updateStopNote':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          stops: day.stops.map((stop) => (stop.id === action.stopId ? { ...stop, note: action.note } : stop)),
        },
      }));

    case 'updateStopKind':
      return updateActiveDay(state, (day) => {
        const stops = day.stops.map((stop) => (stop.id === action.stopId ? { ...stop, kind: action.kind } : stop));
        return {
          day: reconcileDayStops(day, stops, action.kind === 'accommodation' ? action.stopId : undefined),
          statePatch: {
            selectedStopId: action.stopId,
            selectedSegmentId: null,
          },
        };
      });

    case 'updateStopSchedule':
      return updateActiveDay(state, (day) => ({
        day: {
          ...day,
          stops: day.stops.map((stop) => {
            if (stop.id !== action.stopId) {
              return stop;
            }
            return {
              ...stop,
              startTime: normalizeStartTime(action.startTime) ?? stop.startTime,
              stayMinutes: normalizeStayMinutes(action.stayMinutes) ?? stop.stayMinutes,
            };
          }),
        },
      }));

    case 'updateTripMeta': {
      const title = normalizeText(action.title) ?? state.trip.title;
      const requestedDateRange = normalizeText(action.dateRange);
      const dateRange =
        requestedDateRange === undefined
          ? state.trip.dateRange
          : normalizeTripDateRange(requestedDateRange, getTripFallbackYear(state.trip)) ?? requestedDateRange;
      const days = dateRange === state.trip.dateRange ? state.trip.days : syncTripDaysToDateRange(state.trip.days, dateRange);
      const activeDay = days.find((day) => day.id === state.activeDayId) ?? days[0];
      return {
        ...state,
        activeDayId: activeDay.id,
        selectedStopId: activeDay.stops.find((stop) => stop.id === state.selectedStopId)?.id ?? activeDay.stops[0]?.id ?? null,
        selectedSegmentId:
          activeDay.routeSegments.find((segment) => segment.id === state.selectedSegmentId)?.id ?? activeDay.routeSegments[0]?.id ?? null,
        deletedStops: pruneDeletedStopsForDays(state.deletedStops, days),
        trip: {
          ...state.trip,
          title,
          dateRange,
          days,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    case 'importTripPlan':
      return createInitialTripState(action.trip);

    default:
      return state;
  }
};

type ActiveDayUpdate = {
  day: TripDay;
  tripPatch?: Partial<TripPlan>;
  statePatch?: Partial<TripState>;
};

const updateActiveDay = (state: TripState, updater: (day: TripDay) => ActiveDayUpdate): TripState => {
  const current = selectCurrentDay(state);
  const result = updater(current);
  return {
    ...state,
    ...result.statePatch,
    trip: {
      ...state.trip,
      ...result.tripPatch,
      updatedAt: new Date().toISOString(),
      days: state.trip.days.map((day) => (day.id === current.id ? result.day : day)),
    },
  };
};

const getSelectedOption = (segment: RouteSegment): TransportOption | undefined =>
  segment.options.find((option) => option.id === segment.selectedOptionId) ??
  segment.options.find((option) => option.mode === segment.selectedMode);

const placeResultToStop = (result: PlaceSearchResult, index: number, tripCity: string, kind?: StopKind): TripStop => ({
  id: `stop-${result.id}-${index + 1}`,
  placeId: result.id,
  name: result.name,
  address: result.address,
  city: result.city.trim() || tripCity,
  lngLat: result.lngLat,
  startTime: nextTimeByIndex(index),
  stayMinutes: 80,
  note: '',
  tags: isSameCity(result.city, tripCity) ? ['待安排'] : ['跨城风险'],
  kind,
  priority: 'must',
  source: result.source,
});

const placeResultToDiningStop = (result: PlaceSearchResult, index: number, tripCity: string, diningType: DiningType): DiningStop => ({
  id: `dining-${result.id}-${index + 1}`,
  placeId: result.id,
  name: result.name,
  address: result.address,
  city: result.city.trim() || tripCity,
  lngLat: result.lngLat,
  diningType,
  startTime: defaultDiningTime(diningType),
  averagePriceCny: 0,
  note: '',
  tags: [diningTypeLabel(diningType)],
  source: result.source,
});

const placeResultToAlternativeStop = (result: PlaceSearchResult, index: number, tripCity: string): TripStop => ({
  ...placeResultToStop(result, index, tripCity),
  id: `alt-${result.id}-${index + 1}`,
  startTime: '备选',
  priority: 'nice',
  tags: isSameCity(result.city, tripCity) ? ['备选'] : ['备选', '跨城风险'],
});

const routeStopToAlternative = (stop: TripStop): TripStop => ({
  ...stop,
  startTime: '备选',
  priority: 'nice',
  tags: stop.tags.includes('备选') ? stop.tags : ['备选', ...stop.tags],
});

const isSameCity = (placeCity: string, tripCity: string): boolean => {
  const normalizedPlaceCity = normalizeCityName(placeCity) || normalizeCityName(tripCity);
  return normalizedPlaceCity === normalizeCityName(tripCity);
};

const normalizeTripPlan = (trip: TripPlan): TripPlan => ({
  ...trip,
  days: trip.days.map((day) => {
    const stops = prioritizeAccommodationStop(day.stops.map((stop) => normalizeStopRiskTags(stop, trip.city)));
    const routeSegments = day.routeSegments.map((segment) => ({
      ...segment,
      planningNote: segment.planningNote ?? '',
    }));

    return {
      ...day,
      stops,
      diningStops: (day.diningStops ?? []).map(normalizeDiningStop),
      routeSegments: reconcileRouteSegments(stops, routeSegments),
    };
  }),
  alternatives: trip.alternatives.map((stop) => normalizeStopRiskTags(stop, trip.city)),
});

const normalizeStopRiskTags = (stop: TripStop, tripCity: string): TripStop => {
  if (!stop.tags.includes('跨城风险') || !isStopInTripCity(stop, tripCity)) {
    return stop;
  }
  const city = stop.city.trim() || tripCity;
  const tags = stop.tags.filter((tag) => tag !== '跨城风险');
  return {
    ...stop,
    city,
    tags: tags.length > 0 ? tags : ['待安排'],
  };
};

const normalizeDiningStop = (stop: DiningStop): DiningStop => ({
  ...stop,
  averagePriceCny: normalizePrice(stop.averagePriceCny) ?? 0,
  tags: stop.tags.length > 0 ? stop.tags : [diningTypeLabel(stop.diningType)],
});

const isStopInTripCity = (stop: TripStop, tripCity: string): boolean => {
  if (isSameCity(stop.city, tripCity)) {
    return true;
  }
  const normalizedTripCity = normalizeCityName(tripCity);
  const address = normalizeCityName(stop.address);
  return Boolean(normalizedTripCity) && address.includes(normalizedTripCity);
};

const normalizeCityName = (value: string): string => value.trim().replace(/市$/u, '');

const nextTimeByIndex = (index: number): string => {
  const minutes = 9 * 60 + 30 + index * 120;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const uniqueStopId = (baseId: string, stops: TripStop[]): string => {
  const existing = new Set(stops.map((stop) => stop.id));
  let candidate = baseId;
  let index = 1;
  while (existing.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }
  return candidate;
};

const createStaleSegment = (fromStopId: string, toStopId: string): RouteSegment => {
  const manualOption: TransportOption = {
    id: `option-${fromStopId}-${toStopId}-manual`,
    mode: 'manual',
    title: '待重新计算',
    durationMinutes: 0,
    costCny: 0,
    walkingMeters: 0,
    transfers: 0,
    description: '点位顺序已变化，保留直线连接，可手动填写或刷新交通方案。',
  };
  return {
    id: `segment-${fromStopId}-${toStopId}`,
    fromStopId,
    toStopId,
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

const normalizeAlternativePatch = (
  patch: Partial<Pick<TripStop, 'name' | 'address' | 'city' | 'note' | 'tags' | 'stayMinutes'>>,
  fallback: TripStop,
): Partial<Pick<TripStop, 'name' | 'address' | 'city' | 'note' | 'tags' | 'stayMinutes'>> => ({
  name: normalizeText(patch.name) ?? fallback.name,
  address: patch.address === undefined ? fallback.address : patch.address.trim(),
  city: patch.city === undefined ? fallback.city : patch.city.trim(),
  note: patch.note === undefined ? fallback.note : patch.note,
  tags: patch.tags?.map((tag) => tag.trim()).filter(Boolean) ?? fallback.tags,
  stayMinutes: normalizeStayMinutes(patch.stayMinutes) ?? fallback.stayMinutes,
});

const normalizeDiningStopPatch = (patch: DiningStopPatch, fallback: DiningStop): DiningStopPatch => {
  const diningType = patch.diningType ?? fallback.diningType;
  return {
    diningType,
    startTime: patch.startTime === undefined ? fallback.startTime : patch.startTime.trim() || fallback.startTime,
    averagePriceCny: normalizePrice(patch.averagePriceCny) ?? fallback.averagePriceCny,
    note: patch.note === undefined ? fallback.note : patch.note,
    tags: patch.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [diningTypeLabel(diningType)],
  };
};

const findLastValidDeletedStopIndex = (records: DeletedStopRecord[], dayIds: Set<string>): number => {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (dayIds.has(records[index].dayId)) {
      return index;
    }
  }
  return -1;
};

const pruneDeletedStopsForDays = (records: DeletedStopRecord[], days: TripDay[]): DeletedStopRecord[] => {
  const dayIds = new Set(days.map((day) => day.id));
  return records.filter((record) => dayIds.has(record.dayId));
};

const defaultDiningTime = (type: DiningType): string => {
  if (type === 'breakfast') return '08:30';
  if (type === 'lunch') return '12:00';
  if (type === 'dinner') return '18:30';
  if (type === 'dessert' || type === 'coffee') return '15:30';
  if (type === 'lateNight') return '22:00';
  return '待定';
};

const getTripFallbackYear = (trip: TripPlan): number => {
  const match = trip.days[0]?.date.match(/^(\d{4})-/u);
  return match ? Number(match[1]) : new Date().getFullYear();
};

const diningTypeLabel = (type: DiningType): string => {
  if (type === 'breakfast') return '早餐';
  if (type === 'lunch') return '午餐';
  if (type === 'dinner') return '晚餐';
  if (type === 'dessert') return '甜品';
  if (type === 'snack') return '小吃';
  if (type === 'coffee') return '咖啡';
  if (type === 'lateNight') return '夜宵';
  return '餐饮';
};

const reconcileDayStops = (day: TripDay, stops: TripStop[], preferredAccommodationId?: string): TripDay => {
  const orderedStops = prioritizeAccommodationStop(stops, preferredAccommodationId);
  return {
    ...day,
    stops: orderedStops,
    routeSegments: reconcileRouteSegments(orderedStops, day.routeSegments),
  };
};

const prioritizeAccommodationStop = (stops: TripStop[], preferredAccommodationId?: string): TripStop[] => {
  const preferredIndex =
    preferredAccommodationId === undefined
      ? -1
      : stops.findIndex((stop) => stop.id === preferredAccommodationId && isAccommodationStop(stop));
  const accommodationIndex = preferredIndex >= 0 ? preferredIndex : stops.findIndex(isAccommodationStop);

  if (accommodationIndex <= 0) {
    return stops;
  }

  const orderedStops = [...stops];
  const [accommodationStop] = orderedStops.splice(accommodationIndex, 1);
  return [accommodationStop, ...orderedStops];
};

const reconcileRouteSegments = (stops: TripStop[], existingSegments: RouteSegment[]): RouteSegment[] => {
  const segments: RouteSegment[] = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const fromStopId = stops[index].id;
    const toStopId = stops[index + 1].id;
    const existing = existingSegments.find((segment) => segment.fromStopId === fromStopId && segment.toStopId === toStopId);
    segments.push(existing ?? createStaleSegment(fromStopId, toStopId));
  }
  return segments;
};

const moveStopInList = (stops: TripStop[], currentIndex: number, targetIndex: number): TripStop[] => {
  const next = [...stops];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

const clampIndex = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

const normalizeText = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : undefined;
};

const normalizeStartTime = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : undefined;
};

const normalizeStayMinutes = (value: number | undefined): number | undefined => {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.round(value));
};

const normalizePrice = (value: number | undefined): number | undefined => {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.round(value));
};

const createFallbackOptions = (segment: RouteSegment, day: TripDay, errorCode: MapProviderErrorCode): TransportOption[] => {
  const from = day.stops.find((stop) => stop.id === segment.fromStopId);
  const to = day.stops.find((stop) => stop.id === segment.toStopId);
  const meters = from && to ? estimateDistanceMeters(from.lngLat, to.lngLat) : 3000;
  const taxiMinutes = Math.max(8, Math.round(meters / 420));
  const walkMinutes = Math.max(10, Math.round(meters / 80));
  const failureReason = routeFailureMessage(errorCode);

  return [
    {
      id: `option-${segment.fromStopId}-${segment.toStopId}-taxi-fallback`,
      mode: 'taxi',
      title: '打车',
      durationMinutes: taxiMinutes,
      costCny: Math.max(16, Math.round(meters * 0.004 + 14)),
      walkingMeters: 120,
      transfers: 0,
      description: '公交路线不可用时的估算打车方案。',
      unavailableReason: errorCode === 'quotaExceeded' || errorCode === 'network' ? failureReason : undefined,
    },
    {
      id: `option-${segment.fromStopId}-${segment.toStopId}-walk-fallback`,
      mode: 'walk',
      title: '步行',
      durationMinutes: walkMinutes,
      costCny: 0,
      walkingMeters: Math.round(meters),
      transfers: 0,
      description: '按两点距离估算，仅用于降级参考。',
      unavailableReason: errorCode === 'quotaExceeded' || errorCode === 'network' ? failureReason : undefined,
    },
    {
      id: `option-${segment.fromStopId}-${segment.toStopId}-manual-fallback`,
      mode: 'manual',
      title: '手动填写',
      durationMinutes: 0,
      costCny: 0,
      walkingMeters: 0,
      transfers: 0,
      description: '保留直线连接，可手动记录真实交通方式。',
    },
  ];
};

const routeFailureMessage = (code: MapProviderErrorCode): string => {
  if (code === 'quotaExceeded') return '地图配额超限，已停止自动刷新';
  if (code === 'noTransitRoute') return '未找到公交路线';
  if (code === 'invalidKey') return '地图 Key 无效';
  if (code === 'network') return '网络不可用';
  if (code === 'searchFailed') return '地点搜索失败';
  return '坐标或路线解析失败';
};

const estimateDistanceMeters = (origin: [number, number], destination: [number, number]): number => {
  const lngDelta = (destination[0] - origin[0]) * 94000;
  const latDelta = (destination[1] - origin[1]) * 111000;
  return Math.hypot(lngDelta, latDelta);
};

const cloneTrip = (trip: TripPlan): TripPlan => JSON.parse(JSON.stringify(trip)) as TripPlan;
