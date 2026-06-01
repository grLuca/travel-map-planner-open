import { useCallback, useState } from 'react';
import type { LngLat, TripDay } from '../../types/trip';
import { BaiduTripMap } from './BaiduTripMap';
import { StaticTripMap } from './StaticTripMap';

type DemoState = 'normal' | 'mapError' | 'transitError';
type ProviderMode = 'mock' | 'amap' | 'baidu';

interface TripMapProps {
  providerMode: ProviderMode;
  baiduAk?: string;
  day: TripDay;
  selectedStopId: string | null;
  selectedSegmentId: string | null;
  demoState: DemoState;
  showDiningStops?: boolean;
  tripCenter?: LngLat;
  onSelectStop: (stopId: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onClearSelection: () => void;
  onSwapStops: (firstStopId: string, secondStopId: string) => void;
  onDemoState: (state: DemoState) => void;
}

export function TripMap({
  providerMode,
  baiduAk,
  day,
  selectedStopId,
  selectedSegmentId,
  demoState,
  showDiningStops = false,
  tripCenter,
  onSelectStop,
  onSelectSegment,
  onClearSelection,
  onSwapStops,
  onDemoState,
}: TripMapProps) {
  const [baiduLoadFailed, setBaiduLoadFailed] = useState(false);

  const handleBaiduLoadError = useCallback(() => {
    setBaiduLoadFailed(true);
  }, []);

  const handleDemoState = useCallback(
    (nextState: DemoState) => {
      if (providerMode === 'baidu' && nextState === 'normal') {
        setBaiduLoadFailed(false);
      }
      onDemoState(nextState);
    },
    [onDemoState, providerMode],
  );

  if (providerMode === 'baidu' && demoState !== 'mapError' && !baiduLoadFailed) {
    return (
      <BaiduTripMap
        baiduAk={baiduAk}
        day={day}
        selectedStopId={selectedStopId}
        selectedSegmentId={selectedSegmentId}
        showDiningStops={showDiningStops}
        tripCenter={tripCenter}
        onSelectStop={onSelectStop}
        onSelectSegment={onSelectSegment}
        onClearSelection={onClearSelection}
        onSwapStops={onSwapStops}
        onLoadError={handleBaiduLoadError}
      />
    );
  }

  return (
    <StaticTripMap
      day={day}
      selectedStopId={selectedStopId}
      selectedSegmentId={selectedSegmentId}
      demoState={providerMode === 'baidu' && baiduLoadFailed ? 'mapError' : demoState}
      showDiningStops={showDiningStops}
      tripCenter={tripCenter}
      onSelectStop={onSelectStop}
      onSelectSegment={onSelectSegment}
      onClearSelection={onClearSelection}
      onSwapStops={onSwapStops}
      onDemoState={handleDemoState}
    />
  );
}
