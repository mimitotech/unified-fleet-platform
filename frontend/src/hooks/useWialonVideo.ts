import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { pollWhenVisible } from '@/lib/liveRefresh';

export function useSurveillanceUnits() {
  return useQuery({
    queryKey: ['surveillance-units'],
    queryFn: () => clientApi.getSurveillanceUnits(),
    refetchInterval: pollWhenVisible(120_000),
    staleTime: 120_000,
    placeholderData: (prev) => prev,
    select: (d) =>
      (d.units ?? []).map((u) => ({
        ...u,
        cameras: u.cameras ?? [],
        commands: [],
        cameraCount: u.cameraCount ?? u.cameras?.length ?? 0,
      })),
  });
}

export function useSurveillanceUnit(unitId: number | null) {
  return useQuery({
    queryKey: ['surveillance-unit', unitId],
    queryFn: () => clientApi.getSurveillanceUnit(unitId!),
    enabled: unitId != null,
    staleTime: 30_000,
    select: (u) => ({
      ...u,
      cameras: u.cameras ?? [],
      commands: u.commands ?? [],
      cameraCount: u.cameraCount ?? u.cameras?.length ?? 0,
    }),
  });
}

export function useSurveillanceUnitFiles(unitId: number | null, from?: number, to?: number) {
  return useQuery({
    queryKey: ['surveillance-files', unitId, from, to],
    queryFn: () => clientApi.getSurveillanceUnitFiles(unitId!, from, to),
    enabled: unitId != null,
    select: (d) => d.files ?? [],
    staleTime: 60_000,
  });
}

export function useSurveillanceLiveStream(
  unitId: number | null,
  channel: number | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['surveillance-live', unitId, channel],
    queryFn: () => clientApi.startSurveillanceLiveStream(unitId!, channel!),
    enabled: enabled && unitId != null && channel != null && channel > 0,
    staleTime: 90_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
