import { useWialonTrackHistory } from '@/hooks/useWialonTrackHistory';

/** Wialon-style trip-colored route segments for the selected unit. */
export function useWialonColoredTripTrack(unitId: number | null, enabled: boolean, minutes = 360) {
  const { tripSegments, isLoading } = useWialonTrackHistory(unitId, enabled, minutes, false);
  return { segments: tripSegments, isLoading };
}
