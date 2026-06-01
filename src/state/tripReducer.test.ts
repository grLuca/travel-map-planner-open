import { describe, expect, it } from 'vitest';
import { shanghaiSampleTrip } from '../data/sampleTrip';
import type { PlaceSearchResult } from '../services/mapProvider/types';
import { isAccommodationStop } from '../types/stopKinds';
import {
  addStopFromSearchResult,
  addAlternativeFromSearchResult,
  addAlternativeToDay,
  addDiningStopFromSearchResult,
  addTripDay,
  applyRoutePlan,
  createInitialTripState,
  deleteDiningStop,
  deleteTripDay,
  deleteStop,
  markRouteSegmentFailed,
  markRouteSegmentsLoading,
  moveStopToAlternatives,
  moveStop,
  reorderTripDay,
  reorderStop,
  selectCurrentDay,
  selectCurrentSummary,
  selectRouteSegment,
  selectTransportOption,
  setActiveDay,
  swapStops,
  tripReducer,
  undoLastDelete,
  updateAlternativeStop,
  updateDiningStop,
  updateRouteSegmentNote,
  updateStopKind,
  updateStopSchedule,
  updateTripMeta,
} from './tripReducer';

const xintiandi: PlaceSearchResult = {
  id: 'mock-xintiandi',
  name: '新天地',
  address: '上海市黄浦区太仓路',
  city: '上海',
  lngLat: [121.4751, 31.2193],
  source: 'mock',
};

describe('tripReducer', () => {
  it('adds a searched place to the active day and marks the new route segment stale', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const before = selectCurrentDay(state);

    const next = tripReducer(state, addStopFromSearchResult(xintiandi));
    const currentDay = selectCurrentDay(next);
    const addedStop = currentDay.stops.at(-1);
    const newSegment = currentDay.routeSegments.at(-1);

    expect(currentDay.stops).toHaveLength(before.stops.length + 1);
    expect(addedStop?.name).toBe('新天地');
    expect(next.selectedStopId).toBe(addedStop?.id);
    expect(next.selectedSegmentId).toBeNull();
    expect(newSegment).toMatchObject({
      fromStopId: before.stops.at(-1)?.id,
      toStopId: addedStop?.id,
      status: 'stale',
      selectedMode: 'manual',
    });
  });

  it('does not mark same-city search results with municipal suffix as cross-city risk', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const resultWithMunicipalSuffix: PlaceSearchResult = {
      ...xintiandi,
      id: 'baidu-xintiandi',
      city: '上海市',
      source: 'baidu',
    };

    const next = tripReducer(state, addStopFromSearchResult(resultWithMunicipalSuffix));
    const addedStop = selectCurrentDay(next).stops.at(-1);

    expect(addedStop?.tags).toEqual(['待安排']);
  });

  it('marks searched places from a different city as cross-city risk', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const resultFromDifferentCity: PlaceSearchResult = {
      ...xintiandi,
      id: 'baidu-hangzhou-west-lake',
      name: '西湖风景名胜区',
      address: '杭州市西湖区龙井路1号',
      city: '杭州市',
      source: 'baidu',
    };

    const next = tripReducer(state, addStopFromSearchResult(resultFromDifferentCity));
    const addedStop = selectCurrentDay(next).stops.at(-1);

    expect(addedStop?.tags).toEqual(['跨城风险']);
  });

  it('cleans stale cross-city risk tags from same-city draft stops on load', () => {
    const staleDraft = {
      ...shanghaiSampleTrip,
      days: shanghaiSampleTrip.days.map((day, dayIndex) =>
        dayIndex === 0
          ? {
              ...day,
              stops: day.stops.map((stop, stopIndex) =>
                stopIndex === 0
                  ? { ...stop, city: '上海市', tags: ['跨城风险'] }
                  : stopIndex === 1
                    ? { ...stop, city: '', address: '上海市徐汇区安福路', tags: ['跨城风险'] }
                    : stop,
              ),
            }
          : day,
      ),
    };

    const state = createInitialTripState(staleDraft);
    const day = selectCurrentDay(state);

    expect(day.stops[0].tags).toEqual(['待安排']);
    expect(day.stops[1].tags).toEqual(['待安排']);
    expect(day.stops[1].city).toBe('上海');
  });

  it('uses the lodging stop as the first route origin without connecting it to every stop', () => {
    const lodgingTrip = {
      ...shanghaiSampleTrip,
      days: shanghaiSampleTrip.days.map((day, index) =>
        index === 0
          ? {
              ...day,
              stops: day.stops.map((stop, stopIndex) => (stopIndex === 0 ? { ...stop, tags: ['hotel'] } : stop)),
            }
          : day,
      ),
    };
    const state = createInitialTripState(lodgingTrip);
    const next = tripReducer(state, addStopFromSearchResult(xintiandi));
    const day = selectCurrentDay(next);
    const lodgingStop = day.stops[0];
    const addedStop = day.stops.at(-1);

    expect(day.routeSegments.map((segment) => [segment.fromStopId, segment.toStopId])).toEqual([
      [lodgingStop.id, day.stops[1].id],
      [day.stops[1].id, day.stops[2].id],
      [day.stops[2].id, day.stops[3].id],
      [day.stops[3].id, addedStop?.id],
    ]);
    expect(day.routeSegments.at(-1)).toMatchObject({
      fromStopId: day.stops[3].id,
      toStopId: addedStop?.id,
      status: 'stale',
    });
  });

  it('adds a searched place as an explicit accommodation even when its name is not lodging-like', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const apartmentResult: PlaceSearchResult = {
      ...xintiandi,
      id: 'lane-80',
      name: '巨鹿路 80 弄',
      address: '上海市黄浦区巨鹿路 80 弄',
    };

    const next = tripReducer(state, addStopFromSearchResult(apartmentResult, 'accommodation'));
    const day = selectCurrentDay(next);
    const addedStop = day.stops[0];

    expect(addedStop).toMatchObject({
      name: '巨鹿路 80 弄',
      kind: 'accommodation',
    });
    expect(isAccommodationStop(addedStop!)).toBe(true);
    expect(day.routeSegments.map((segment) => [segment.fromStopId, segment.toStopId])).toEqual([
      [addedStop.id, state.trip.days[0].stops[0].id],
      [state.trip.days[0].stops[0].id, state.trip.days[0].stops[1].id],
      [state.trip.days[0].stops[1].id, state.trip.days[0].stops[2].id],
      [state.trip.days[0].stops[2].id, state.trip.days[0].stops[3].id],
    ]);
  });

  it('can switch an existing searched place to the accommodation route origin and back to normal', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const stop = selectCurrentDay(state).stops[1];

    const asAccommodation = tripReducer(state, updateStopKind(stop.id, 'accommodation'));
    const accommodationDay = selectCurrentDay(asAccommodation);
    expect(accommodationDay.stops[0].id).toBe(stop.id);
    expect(isAccommodationStop(accommodationDay.stops[0])).toBe(true);
    expect(accommodationDay.routeSegments[0]).toMatchObject({
      fromStopId: stop.id,
      toStopId: state.trip.days[0].stops[0].id,
    });

    const asDefault = tripReducer(asAccommodation, updateStopKind(stop.id, 'default'));
    expect(selectCurrentDay(asDefault).stops[0].kind).toBe('default');
    expect(isAccommodationStop(selectCurrentDay(asDefault).stops[0])).toBe(false);
  });

  it('moves a stop and marks the affected day route segments stale', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const museumId = day.stops[2].id;

    const next = tripReducer(state, moveStop(museumId, 'up'));
    const reordered = selectCurrentDay(next);

    expect(reordered.stops.map((stop) => stop.id)).toEqual([
      day.stops[0].id,
      day.stops[2].id,
      day.stops[1].id,
      day.stops[3].id,
    ]);
    expect(reordered.routeSegments).toHaveLength(3);
    expect(reordered.routeSegments.every((segment) => segment.status === 'stale')).toBe(true);
  });

  it('deletes a stop, reconnects the remaining route, and can undo the delete', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);

    const deleted = tripReducer(state, deleteStop(day.stops[1].id));
    const afterDelete = selectCurrentDay(deleted);

    expect(afterDelete.stops.map((stop) => stop.id)).toEqual([
      day.stops[0].id,
      day.stops[2].id,
      day.stops[3].id,
    ]);
    expect(afterDelete.routeSegments[0]).toMatchObject({
      fromStopId: day.stops[0].id,
      toStopId: day.stops[2].id,
      status: 'stale',
    });

    const restored = tripReducer(deleted, undoLastDelete());
    expect(selectCurrentDay(restored).stops.map((stop) => stop.id)).toEqual(day.stops.map((stop) => stop.id));
  });

  it('preserves unaffected route segments when a stop is deleted', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const preservedSegment = day.routeSegments[2];

    const next = tripReducer(state, deleteStop(day.stops[1].id));
    const routeSegments = selectCurrentDay(next).routeSegments;

    expect(routeSegments[0]).toMatchObject({
      fromStopId: day.stops[0].id,
      toStopId: day.stops[2].id,
      status: 'stale',
    });
    expect(routeSegments[1]).toEqual(preservedSegment);
  });

  it('reorders a stop to an explicit index for drag and drop', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);

    const next = tripReducer(state, reorderStop(day.stops[0].id, 2));

    expect(selectCurrentDay(next).stops.map((stop) => stop.id)).toEqual([
      day.stops[1].id,
      day.stops[2].id,
      day.stops[0].id,
      day.stops[3].id,
    ]);
    expect(selectCurrentDay(next).routeSegments[0]).toEqual(day.routeSegments[1]);
    expect(selectCurrentDay(next).routeSegments.slice(1).every((segment) => segment.status === 'stale')).toBe(true);
  });

  it('swaps two stops for map marker reorder and marks changed route segments stale', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);

    const next = tripReducer(state, swapStops(day.stops[0].id, day.stops[3].id));
    const swapped = selectCurrentDay(next);

    expect(swapped.stops.map((stop) => stop.id)).toEqual([
      day.stops[3].id,
      day.stops[1].id,
      day.stops[2].id,
      day.stops[0].id,
    ]);
    expect(swapped.routeSegments).toHaveLength(day.stops.length - 1);
    expect(swapped.routeSegments[0]).toMatchObject({
      fromStopId: day.stops[3].id,
      toStopId: day.stops[1].id,
      status: 'stale',
    });
    expect(swapped.routeSegments[1]).toEqual(day.routeSegments[1]);
    expect(swapped.routeSegments[2]).toMatchObject({
      fromStopId: day.stops[2].id,
      toStopId: day.stops[0].id,
      status: 'stale',
    });
    expect(next.selectedStopId).toBe(day.stops[0].id);
    expect(next.selectedSegmentId).toBeNull();
  });

  it('leaves state unchanged when map marker swap ids are invalid or identical', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);

    expect(tripReducer(state, swapStops(day.stops[0].id, day.stops[0].id))).toBe(state);
    expect(tripReducer(state, swapStops(day.stops[0].id, 'missing-stop'))).toBe(state);
  });

  it('moves route segments through loading, ready, and failed planning states', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const routePlan = {
      status: 'ready' as const,
      provider: 'mock' as const,
      cached: true,
      options: [
        {
          id: 'planned-taxi',
          mode: 'taxi' as const,
          title: '打车',
          durationMinutes: 26,
          costCny: 48,
          walkingMeters: 80,
          transfers: 0,
          description: '缓存路线',
          isRecommended: true,
        },
      ],
    };

    const loading = tripReducer(state, markRouteSegmentsLoading([day.routeSegments[0].id]));
    expect(selectCurrentDay(loading).routeSegments[0].status).toBe('loading');

    const ready = tripReducer(loading, applyRoutePlan(day.routeSegments[0].id, routePlan));
    expect(selectCurrentDay(ready).routeSegments[0]).toMatchObject({
      status: 'ready',
      selectedMode: 'taxi',
      selectedOptionId: 'planned-taxi',
      provider: 'mock',
      cached: true,
    });

    const failed = tripReducer(loading, markRouteSegmentFailed(day.routeSegments[0].id, 'noTransitRoute'));
    const failedSegment = selectCurrentDay(failed).routeSegments[0];
    expect(failedSegment.status).toBe('failed');
    expect(failedSegment.errorCode).toBe('noTransitRoute');
    expect(failedSegment.options.map((option) => option.mode)).toEqual(['taxi', 'walk', 'manual']);
  });

  it('selects a transport option and updates the derived day summary', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const targetSegment = day.routeSegments[1];
    const taxiOption = targetSegment.options.find((option) => option.mode === 'taxi');

    const next = tripReducer(
      tripReducer(state, selectRouteSegment(targetSegment.id)),
      selectTransportOption(targetSegment.id, taxiOption?.id ?? ''),
    );
    const summary = selectCurrentSummary(next);

    expect(selectCurrentDay(next).routeSegments[1].selectedMode).toBe('taxi');
    expect(summary.transportCostCny).toBeGreaterThan(selectCurrentSummary(state).transportCostCny);
    expect(summary.transportMinutes).toBeGreaterThan(0);
    expect(next.selectedSegmentId).toBe(targetSegment.id);
  });

  it('updates a route segment planning note independently for the selected segment', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const targetSegment = day.routeSegments[1];

    const next = tripReducer(state, updateRouteSegmentNote(targetSegment.id, '博物馆预约改到 15:00 后再刷新路线。'));

    expect(selectCurrentDay(next).routeSegments[1].planningNote).toBe('博物馆预约改到 15:00 后再刷新路线。');
    expect(selectCurrentDay(next).routeSegments[0].planningNote ?? '').toBe('');
  });

  it('adds dining stops to the active day without changing route segments or route summary counts', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const beforeDay = selectCurrentDay(state);
    const beforeSummary = selectCurrentSummary(state);

    const next = tripReducer(state, addDiningStopFromSearchResult({ ...xintiandi, name: '新天地午餐' }, 'lunch'));
    const day = selectCurrentDay(next);

    expect(day.diningStops.map((stop) => [stop.name, stop.diningType])).toContainEqual(['新天地午餐', 'lunch']);
    expect(day.routeSegments).toEqual(beforeDay.routeSegments);
    expect(selectCurrentSummary(next).stopCount).toBe(beforeSummary.stopCount);
    expect(selectCurrentSummary(next).totalMinutes).toBe(beforeSummary.totalMinutes);
  });

  it('updates and deletes dining stops independently from route stops', () => {
    const state = tripReducer(createInitialTripState(shanghaiSampleTrip), addDiningStopFromSearchResult(xintiandi, 'lunch'));
    const diningStop = selectCurrentDay(state).diningStops[0];

    const updated = tripReducer(
      state,
      updateDiningStop(diningStop.id, {
        diningType: 'coffee',
        averagePriceCny: 88,
        startTime: '15:30',
        note: '靠窗位',
      }),
    );

    expect(selectCurrentDay(updated).diningStops[0]).toMatchObject({
      diningType: 'coffee',
      averagePriceCny: 88,
      startTime: '15:30',
      note: '靠窗位',
    });
    expect(selectCurrentDay(updated).stops).toEqual(selectCurrentDay(state).stops);

    const deleted = tripReducer(updated, deleteDiningStop(diningStop.id));
    expect(selectCurrentDay(deleted).diningStops).toEqual([]);
    expect(selectCurrentDay(deleted).routeSegments).toEqual(selectCurrentDay(state).routeSegments);
  });

  it('moves a route stop into alternatives when dropped on the alternatives area', () => {
    const state = createInitialTripState({ ...shanghaiSampleTrip, alternatives: [] });
    const day = selectCurrentDay(state);
    const movedStop = day.stops[1];

    const next = tripReducer(state, moveStopToAlternatives(movedStop.id));

    expect(selectCurrentDay(next).stops.map((stop) => stop.id)).not.toContain(movedStop.id);
    expect(next.trip.alternatives).toHaveLength(1);
    expect(next.trip.alternatives[0]).toMatchObject({
      id: movedStop.id,
      name: movedStop.name,
      startTime: '备选',
      priority: 'nice',
    });
    expect(selectCurrentDay(next).routeSegments).toHaveLength(day.stops.length - 2);
    expect(next.selectedStopId).not.toBe(movedStop.id);
  });

  it('moves an alternative back into the active day at a target index', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const alternative = state.trip.alternatives[0];

    const next = tripReducer(state, addAlternativeToDay(alternative.id, 1));
    const nextDay = selectCurrentDay(next);

    expect(nextDay.stops.map((stop) => stop.id)).toEqual([
      day.stops[0].id,
      alternative.id,
      day.stops[1].id,
      day.stops[2].id,
      day.stops[3].id,
    ]);
    expect(next.trip.alternatives.map((stop) => stop.id)).not.toContain(alternative.id);
    expect(nextDay.stops[1]).toMatchObject({
      name: alternative.name,
      startTime: '11:30',
      priority: 'nice',
    });
    expect(nextDay.routeSegments).toHaveLength(nextDay.stops.length - 1);
  });

  it('adds and edits alternatives without inserting them into the active day route', () => {
    const state = createInitialTripState({ ...shanghaiSampleTrip, alternatives: [] });

    const withAlternative = tripReducer(state, addAlternativeFromSearchResult(xintiandi));
    expect(withAlternative.trip.alternatives).toHaveLength(1);
    expect(selectCurrentDay(withAlternative).stops.map((stop) => stop.name)).not.toContain('新天地');

    const alternative = withAlternative.trip.alternatives[0];
    const renamed = tripReducer(
      withAlternative,
      updateAlternativeStop(alternative.id, { name: '新天地备选', note: '雨天备用点', tags: ['备选', '雨天'] }),
    );

    expect(renamed.trip.alternatives[0]).toMatchObject({
      name: '新天地备选',
      note: '雨天备用点',
      tags: ['备选', '雨天'],
    });
    expect(selectCurrentDay(renamed).routeSegments).toEqual(selectCurrentDay(state).routeSegments);
  });

  it('updates trip title and date range while preserving existing values for blank input', () => {
    const state = createInitialTripState(shanghaiSampleTrip);

    const renamed = tripReducer(state, updateTripMeta({ title: '  上海亲子旅行  ', dateRange: '  2026.07.01 - 07.04  ' }));
    const unchanged = tripReducer(renamed, updateTripMeta({ title: '   ', dateRange: '' }));

    expect(renamed.trip.title).toBe('上海亲子旅行');
    expect(renamed.trip.dateRange).toBe('2026.07.01 - 07.04');
    expect(unchanged.trip.title).toBe('上海亲子旅行');
    expect(unchanged.trip.dateRange).toBe('2026.07.01 - 07.04');
  });

  it('syncs day count, labels, and dates when the trip date range changes', () => {
    const state = createInitialTripState(shanghaiSampleTrip);

    const shortened = tripReducer(state, updateTripMeta({ dateRange: '2026.06.19 - 06.20' }));
    expect(shortened.trip.days).toHaveLength(2);
    expect(shortened.trip.days.map((day) => [day.label, day.date])).toEqual([
      ['Day 1', '2026-06-19'],
      ['Day 2', '2026-06-20'],
    ]);
    expect(shortened.trip.days[0].stops).toEqual(state.trip.days[0].stops);

    const expanded = tripReducer(shortened, updateTripMeta({ dateRange: '2026.06.19 - 06.22' }));
    expect(expanded.trip.days).toHaveLength(4);
    expect(expanded.trip.days.map((day) => [day.label, day.date])).toEqual([
      ['Day 1', '2026-06-19'],
      ['Day 2', '2026-06-20'],
      ['Day 3', '2026-06-21'],
      ['Day 4', '2026-06-22'],
    ]);
    expect(expanded.trip.days[2].stops).toEqual([]);
    expect(expanded.trip.days[2].routeSegments).toEqual([]);
  });

  it('syncs date range shorthand using the current trip year', () => {
    const state = createInitialTripState(shanghaiSampleTrip);

    const dotted = tripReducer(state, updateTripMeta({ dateRange: '6.19-6.22' }));
    expect(dotted.trip.dateRange).toBe('2026.06.19 - 06.22');
    expect(dotted.trip.days.map((day) => day.date)).toEqual(['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22']);

    const chinese = tripReducer(dotted, updateTripMeta({ dateRange: '6月19到6月20' }));
    expect(chinese.trip.dateRange).toBe('2026.06.19 - 06.20');
    expect(chinese.trip.days.map((day) => day.date)).toEqual(['2026-06-19', '2026-06-20']);
  });

  it('adds and deletes trip days while keeping date range and active selection synchronized', () => {
    const state = createInitialTripState({
      ...shanghaiSampleTrip,
      dateRange: '2026.06.19 - 06.20',
      days: shanghaiSampleTrip.days.slice(0, 2).map((day, index) => ({
        ...day,
        label: `Day ${index + 1}`,
        date: `2026-06-${19 + index}`,
      })),
    });

    const added = tripReducer(state, addTripDay());
    expect(added.trip.days.map((day) => [day.label, day.date])).toEqual([
      ['Day 1', '2026-06-19'],
      ['Day 2', '2026-06-20'],
      ['Day 3', '2026-06-21'],
    ]);
    expect(added.trip.dateRange).toBe('2026.06.19 - 06.21');
    expect(added.activeDayId).toBe(added.trip.days[2].id);

    const deleted = tripReducer(added, deleteTripDay(added.trip.days[1].id));
    expect(deleted.trip.days.map((day) => [day.label, day.date])).toEqual([
      ['Day 1', '2026-06-19'],
      ['Day 2', '2026-06-20'],
    ]);
    expect(deleted.trip.days[1].id).toBe(added.trip.days[2].id);
    expect(deleted.trip.dateRange).toBe('2026.06.19 - 06.20');
  });

  it('prunes stale undo records when deleting trip days', () => {
    const state = createInitialTripState({
      ...shanghaiSampleTrip,
      days: shanghaiSampleTrip.days.slice(0, 2),
    });
    const targetDay = state.trip.days[1];
    const withDeletedStop = tripReducer(tripReducer(state, setActiveDay(targetDay.id)), deleteStop(targetDay.stops[0].id));

    expect(withDeletedStop.deletedStops).toHaveLength(1);

    const withoutDay = tripReducer(withDeletedStop, deleteTripDay(targetDay.id));
    expect(withoutDay.deletedStops).toHaveLength(0);

    const undo = tripReducer(withoutDay, undoLastDelete());
    expect(undo.activeDayId).toBe(withoutDay.activeDayId);
    expect(undo.trip.days.map((day) => day.id)).not.toContain(targetDay.id);
  });

  it('ignores legacy undo records that reference removed days', () => {
    const state = createInitialTripState({
      ...shanghaiSampleTrip,
      days: shanghaiSampleTrip.days.slice(0, 2),
    });
    const removedDay = state.trip.days[1];
    const withDeletedStop = tripReducer(tripReducer(state, setActiveDay(removedDay.id)), deleteStop(removedDay.stops[0].id));
    const staleUndoState = {
      ...withDeletedStop,
      trip: {
        ...withDeletedStop.trip,
        days: [withDeletedStop.trip.days[0]],
      },
      activeDayId: withDeletedStop.trip.days[0].id,
    };

    const undo = tripReducer(staleUndoState, undoLastDelete());

    expect(undo.deletedStops).toHaveLength(0);
    expect(undo.activeDayId).toBe(staleUndoState.activeDayId);
    expect(selectCurrentDay(undo).id).toBe(staleUndoState.activeDayId);
  });

  it('reorders trip days and assigns dates by the new visual order', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const originalDayOne = state.trip.days[0];
    const originalDayThree = state.trip.days[2];

    const next = tripReducer(state, reorderTripDay(originalDayThree.id, 0));

    expect(next.trip.days[0].id).toBe(originalDayThree.id);
    expect(next.trip.days[0].label).toBe('Day 1');
    expect(next.trip.days[0].date).toBe(originalDayOne.date);
    expect(next.trip.days[1].id).toBe(originalDayOne.id);
    expect(next.trip.days[1].label).toBe('Day 2');
    expect(next.trip.days[1].date).toBe(state.trip.days[1].date);
    expect(next.activeDayId).toBe(originalDayThree.id);
  });

  it('updates a stop schedule and refreshes the derived day summary', () => {
    const state = createInitialTripState(shanghaiSampleTrip);
    const day = selectCurrentDay(state);
    const stop = day.stops[1];

    const next = tripReducer(state, updateStopSchedule(stop.id, { startTime: '12:15', stayMinutes: 45 }));
    const updatedStop = selectCurrentDay(next).stops[1];

    expect(updatedStop.startTime).toBe('12:15');
    expect(updatedStop.stayMinutes).toBe(45);
    expect(selectCurrentSummary(next).stayMinutes).toBe(selectCurrentSummary(state).stayMinutes - stop.stayMinutes + 45);
  });
});
