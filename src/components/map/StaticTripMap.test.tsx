import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { shanghaiSampleTrip } from '../../data/sampleTrip';
import type { DiningStop } from '../../types/trip';
import { StaticTripMap } from './StaticTripMap';

describe('StaticTripMap', () => {
  it('calls onSelectStop when a marker is clicked', async () => {
    const user = userEvent.setup();
    const day = shanghaiSampleTrip.days[0];
    const onSelectStop = vi.fn();
    const onClearSelection = vi.fn();

    render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={onSelectStop}
        onSelectSegment={vi.fn()}
        onClearSelection={onClearSelection}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    const firstMarker = screen
      .getAllByRole('button')
      .find((button) => button.classList.contains('marker') && button.textContent === '1');

    expect(firstMarker).toBeInTheDocument();
    await user.click(firstMarker as HTMLElement);

    expect(onSelectStop).toHaveBeenCalledWith(day.stops[0].id);
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('clears selection when the blank map area is clicked', () => {
    const day = shanghaiSampleTrip.days[0];
    const onClearSelection = vi.fn();

    render(
      <StaticTripMap
        day={day}
        selectedStopId={day.stops[0].id}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onClearSelection={onClearSelection}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('map-world'));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('emits a stop swap when one marker is dropped onto another marker', () => {
    const day = shanghaiSampleTrip.days[0];
    const onSwapStops = vi.fn();

    render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={onSwapStops}
        onDemoState={vi.fn()}
      />,
    );

    const firstMarker = screen.getByRole('button', { name: `选择地图点位 ${day.stops[0].name}` });
    const thirdMarker = screen.getByRole('button', { name: `选择地图点位 ${day.stops[2].name}` });

    fireEvent.dragStart(firstMarker);
    fireEvent.dragEnter(thirdMarker);
    fireEvent.dragOver(thirdMarker);
    fireEvent.drop(thirdMarker);
    fireEvent.dragEnd(firstMarker);

    expect(onSwapStops).toHaveBeenCalledWith(day.stops[0].id, day.stops[2].id);
  });

  it('snaps a marker drop to the nearest map point and previews the target marker', () => {
    const day = shanghaiSampleTrip.days[0];
    const onSwapStops = vi.fn();

    render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={onSwapStops}
        onDemoState={vi.fn()}
      />,
    );

    const mapWorld = screen.getByTestId('map-world');
    setElementRect(mapWorld, { left: 0, top: 0, width: 1000, height: 800 });

    const firstMarker = getMarkerByText('1');
    const thirdMarker = getMarkerByText('3');
    const targetPoint = getMarkerClientPoint(thirdMarker, mapWorld);

    fireEvent.dragStart(firstMarker);
    expect(getMarkerByText('1')).toHaveClass('drag-origin');

    fireEvent(mapWorld, dragEventWithPoint('dragOver', mapWorld, targetPoint.x + 55, targetPoint.y + 45));

    expect(getMarkerByText('3')).toHaveClass('drop-target');

    fireEvent(mapWorld, dragEventWithPoint('drop', mapWorld, targetPoint.x + 55, targetPoint.y + 45));
    fireEvent.dragEnd(firstMarker);

    expect(onSwapStops).toHaveBeenCalledWith(day.stops[0].id, day.stops[2].id);
  });

  it('renders an accommodation stop with a house marker icon', () => {
    const day = {
      ...shanghaiSampleTrip.days[0],
      stops: shanghaiSampleTrip.days[0].stops.map((stop, index) =>
        index === 0 ? { ...stop, tags: ['hotel'] } : stop,
      ),
    };

    render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    const accommodationMarker = screen
      .getAllByRole('button')
      .find((button) => button.classList.contains('marker') && button.getAttribute('data-stop-kind') === 'accommodation');

    expect(accommodationMarker).toBeInTheDocument();
    expect(accommodationMarker?.querySelector('.marker-house-icon')).toBeInTheDocument();
    expect(accommodationMarker).toHaveAttribute('draggable', 'false');
    expect(accommodationMarker).not.toHaveTextContent('1');
  });

  it('restarts visible stop marker numbers after an accommodation marker', () => {
    const day = {
      ...shanghaiSampleTrip.days[0],
      stops: shanghaiSampleTrip.days[0].stops.map((stop, index) =>
        index === 2 ? { ...stop, tags: ['hotel'] } : stop,
      ),
    };

    const { container } = render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    const markerLabels = Array.from(container.querySelectorAll('.marker[data-stop-kind="default"] .marker-inner')).map(
      (marker) => marker.textContent,
    );

    expect(markerLabels).toEqual(['1', '2', '1']);
  });

  it('does not render visible route midpoint dots over segment lines', () => {
    const day = shanghaiSampleTrip.days[0];
    const { container } = render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    expect(container.querySelector('.route-dot')).not.toBeInTheDocument();
  });

  it('renders hand-drawn paper map layers without decorative objects', () => {
    const day = shanghaiSampleTrip.days[0];
    const { container } = render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    expect(container.querySelector('.paper-map-texture')).toBeInTheDocument();
    expect(container.querySelectorAll('.map-patch')).toHaveLength(3);
    expect(
      container.querySelector(
        [
          '.map-stamp',
          '.map-tape',
          '.map-postcard',
          '.map-clip',
          '.map-paperclip',
          '.map-airplane',
          '.map-heart',
          '.map-star',
          '.map-sticker',
          '.stamp',
          '.tape',
          '.postcard',
          '.clip',
          '.paperclip',
          '.airplane',
          '.heart',
          '.star',
          '.sticker-decoration',
        ].join(', '),
      ),
    ).not.toBeInTheDocument();
  });

  it('renders numbered static markers with sticker inner content', () => {
    const day = shanghaiSampleTrip.days[0];
    const { container } = render(
      <StaticTripMap
        day={day}
        selectedStopId={day.stops[0].id}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    const firstMarker = screen.getByRole('button', { name: `选择地图点位 ${day.stops[0].name}` });
    expect(firstMarker).toHaveClass('active');
    expect(firstMarker.querySelector('.marker-inner')).toHaveTextContent('1');
    expect(container.querySelectorAll('.marker-inner')).toHaveLength(day.stops.length);
  });

  it('renders dining markers separately from route stop markers and can hide them', () => {
    const day = shanghaiSampleTrip.days[0];
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

    const { container, rerender } = render(
      <StaticTripMap
        day={{ ...day, diningStops }}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        showDiningStops
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    const diningMarker = screen.getByRole('button', { name: '选择地图餐饮点 新天地午餐' });
    expect(diningMarker).toBeInTheDocument();
    expect(diningMarker).toHaveAttribute('data-dining-type', 'lunch');
    expect(diningMarker.querySelector('.dining-marker-halo')).toBeInTheDocument();
    expect(diningMarker.querySelector('.dining-marker-core')).toBeInTheDocument();
    expect(diningMarker.querySelector('.dining-marker-utensils')).toBeInTheDocument();
    expect(diningMarker.querySelector('.dining-marker-utensils path[d^="M16.6"]')).toHaveAttribute(
      'd',
      expect.stringMatching(/^M16\.6 3\.4c-/),
    );
    expect(container.querySelectorAll('.marker-inner')).toHaveLength(day.stops.length);
    expect(container.querySelectorAll('.dining-marker')).toHaveLength(1);

    rerender(
      <StaticTripMap
        day={{ ...day, diningStops }}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        showDiningStops={false}
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={vi.fn()}
        onDemoState={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '选择地图餐饮点 新天地午餐' })).not.toBeInTheDocument();
  });

  it('excludes accommodation stops from static map snap targets', () => {
    const day = {
      ...shanghaiSampleTrip.days[0],
      stops: shanghaiSampleTrip.days[0].stops.map((stop, index) =>
        index === 2 ? { ...stop, tags: ['hotel'] } : stop,
      ),
    };
    const onSwapStops = vi.fn();

    render(
      <StaticTripMap
        day={day}
        selectedStopId={null}
        selectedSegmentId={null}
        demoState="normal"
        onSelectStop={vi.fn()}
        onSelectSegment={vi.fn()}
        onSwapStops={onSwapStops}
        onDemoState={vi.fn()}
      />,
    );

    const mapWorld = screen.getByTestId('map-world');
    setElementRect(mapWorld, { left: 0, top: 0, width: 1000, height: 800 });
    const firstMarker = getMarkerByText('1');
    const accommodationMarker = getAccommodationMarker();
    const accommodationPoint = getMarkerClientPoint(accommodationMarker, mapWorld);

    fireEvent.dragStart(firstMarker);
    fireEvent(mapWorld, dragEventWithPoint('dragOver', mapWorld, accommodationPoint.x, accommodationPoint.y));

    expect(accommodationMarker).not.toHaveClass('drop-target');
    expect(getMarkerByStopName(day.stops[3].name)).toHaveClass('drop-target');

    fireEvent(mapWorld, dragEventWithPoint('drop', mapWorld, accommodationPoint.x, accommodationPoint.y));

    expect(onSwapStops).toHaveBeenCalledWith(day.stops[0].id, day.stops[3].id);
  });
});

const getMarkerByText = (text: string): HTMLElement => {
  const marker = screen
    .getAllByRole('button')
    .find((button) => button.classList.contains('marker') && button.textContent === text);
  if (!marker) {
    throw new Error(`Expected marker ${text}`);
  }
  return marker;
};

const getMarkerClientPoint = (marker: HTMLElement, container: HTMLElement): { x: number; y: number } => {
  const rect = container.getBoundingClientRect();
  return {
    x: rect.left + (parseFloat(marker.style.left) / 100) * rect.width,
    y: rect.top + (parseFloat(marker.style.top) / 100) * rect.height,
  };
};

const getAccommodationMarker = (): HTMLElement => {
  const marker = screen
    .getAllByRole('button')
    .find((button) => button.classList.contains('marker') && button.getAttribute('data-stop-kind') === 'accommodation');
  if (!marker) {
    throw new Error('Expected accommodation marker');
  }
  return marker;
};

const getMarkerByStopName = (stopName: string): HTMLElement => {
  const marker = screen
    .getAllByRole('button')
    .find((button) => button.classList.contains('marker') && button.getAttribute('aria-label')?.includes(stopName));
  if (!marker) {
    throw new Error(`Expected marker for ${stopName}`);
  }
  return marker;
};

const setElementRect = (
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON: () => rect,
    }),
  });
};

const dragEventWithPoint = (
  type: 'dragOver' | 'drop',
  element: HTMLElement,
  clientX: number,
  clientY: number,
): Event => {
  const event = type === 'dragOver' ? createEvent.dragOver(element) : createEvent.drop(element);
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
};
