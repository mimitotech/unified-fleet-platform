import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { fleetSnapshotQueryKey } from '@/hooks/useFleetSnapshot';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { useWialonContext } from '@/hooks/useWialon';

export function useWialonUnits(enabled: boolean) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: fleetSnapshotQueryKey(connected),
    queryFn: () => clientApi.getFleetSnapshot(),
    enabled: enabled && connected,
    select: (data) => ({
      units: (data?.units ?? []).map((u) => ({
        id: Number(u.wialonId ?? u.id),
        name: u.name,
        plate: u.plate,
        status: u.status,
        hwName: u.hwName,
        hw: u.hw,
        motionState: u.motionState,
        position: u.position
          ? { lat: u.position.lat, lng: u.position.lng, speed: u.position.speed, time: u.position.time }
          : undefined,
      })),
      count: data?.units?.length ?? 0,
    }),
    staleTime: 3_000,
  });
}

export function useWialonFleet(enabled: boolean) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: fleetSnapshotQueryKey(connected),
    queryFn: () => clientApi.getFleetSnapshot(),
    enabled: enabled && connected,
    select: (data) => ({
      units: (data?.units ?? []).map((u) => ({
        ...u,
        id: Number(u.wialonId ?? u.id),
      })),
      counts: data?.counts,
      fetchedAt: data?.fetchedAt,
      accountId: data?.accountId,
      accountName: data?.accountName,
    }),
    staleTime: 3_000,
  });
}

export function useWialonGeofencesLive(enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-geofences-live'],
    queryFn: () => clientApi.getWialonGeofencesLive(),
    enabled,
    staleTime: LIVE_POLL.geofences,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.geofences) : false,
  });
}

export function useWialonUnitDetail(unitId: number | null, enabled: boolean, live = false) {
  return useQuery({
    queryKey: ['wialon-unit-detail', unitId, live ? 'live' : 'normal'],
    queryFn: () => clientApi.getWialonUnitDetail(unitId!),
    enabled: enabled && unitId != null,
    staleTime: live ? LIVE_POLL.unitDetail : 15_000,
    refetchInterval: enabled && unitId != null && live ? LIVE_POLL.unitDetail : false,
    placeholderData: (prev, prevQuery) => {
      const prevId = prevQuery?.queryKey[1];
      return prevId === unitId ? prev : undefined;
    },
    select: (data) => data.detail,
  });
}

export function prefetchWialonUnitDetail(client: QueryClient, unitId: number, live = true) {
  return client.prefetchQuery({
    queryKey: ['wialon-unit-detail', unitId, live ? 'live' : 'normal'],
    queryFn: () => clientApi.getWialonUnitDetail(unitId),
    staleTime: LIVE_POLL.unitDetail,
  });
}

export function useWialonUnitSensors(unitId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-unit-sensors', unitId],
    queryFn: () => clientApi.getWialonUnitSensors(unitId!),
    enabled: enabled && unitId != null,
    staleTime: LIVE_POLL.unitDetail,
    refetchInterval: enabled && unitId != null ? pollWhenVisible(LIVE_POLL.unitDetail) : false,
  });
}

export function useWialonUnitCommands(unitId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-unit-commands', unitId],
    queryFn: () => clientApi.getWialonUnitCommands(unitId!),
    enabled: enabled && unitId != null,
    staleTime: 60_000,
  });
}

export function useWialonRouteRounds(routeId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-route-rounds', routeId],
    queryFn: () => clientApi.getWialonRouteRounds(routeId!),
    enabled: enabled && routeId != null,
    staleTime: 30_000,
  });
}

export function useExecWialonReport() {
  return useMutation({
    mutationFn: (payload: {
      reportResourceId: number;
      reportTemplateId: number;
      reportObjectId: number;
      from: number;
      to: number;
    }) => clientApi.execWialonReport(payload),
  });
}

export function useSendWialonCommand() {
  return useMutation({
    mutationFn: ({
      unitId,
      commandName,
      param,
    }: {
      unitId: number;
      commandName: string;
      param?: Record<string, unknown>;
    }) => clientApi.sendWialonUnitCommand(unitId, commandName, param),
  });
}

export function useSendWialonAssetCommand() {
  return useMutation({
    mutationFn: ({
      assetId,
      commandName,
      param,
    }: {
      assetId: string;
      commandName: string;
      param?: Record<string, unknown>;
    }) => clientApi.sendWialonAssetCommand(assetId, commandName, param),
  });
}

export function useCreateWialonGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createWialonGeofence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wialon-geofences-live'] }),
  });
}
