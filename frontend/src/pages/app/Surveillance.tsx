import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/app/AppLayout';
import { useSurveillanceUnits, useSurveillanceUnit, useSurveillanceLiveStream } from '@/hooks/useWialonVideo';
import { useVideoStreams } from '@/hooks/useDomain';
import { WialonLiveCameraGrid } from '@/components/surveillance/WialonLiveCameraGrid';
import { WialonVideoPlayer } from '@/components/surveillance/WialonVideoPlayer';
import { WialonCommandButton } from '@/components/fleet/WialonCommandButton';
import { SurveillanceUnitList } from '@/components/surveillance/SurveillanceUnitList';
import { SurveillanceFilesTab } from '@/components/surveillance/SurveillanceFilesTab';
import { SurveillanceEventsTab } from '@/components/surveillance/SurveillanceEventsTab';
import { CameraManagementPanel } from '@/components/surveillance/CameraManagementPanel';
import { ExternalStreamsPanel } from '@/components/surveillance/ExternalStreamsPanel';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { ModuleIntegrationBanner } from '@/components/shared/ModuleIntegrationBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, FileVideo, List, Play, Video, VideoOff, Radio, MapPin, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { clientApi, type WialonVideoClipRef, type WialonVideoFile, type WialonVideoUnit } from '@/lib/api';
import { notify } from '@/lib/notify';
import { safeArray } from '@/lib/safeArray';
import {
  buildVideoCommandParam,
  findLiveCommand,
  findPlaybackCommand,
} from '@/lib/surveillanceUtils';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';
import { CHART } from '@/lib/chartColors';

export default function Surveillance() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('live');
  const [q, setQ] = useState('');
  const [cameraIndex, setCameraIndex] = useState(0);
  const [playbackFrom, setPlaybackFrom] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [playbackTo, setPlaybackTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [showPlayer, setShowPlayer] = useState(false);
  const [liveChannel, setLiveChannel] = useState<number | null>(null);
  const [liveFromHeader, setLiveFromHeader] = useState(false);
  const [filePreview, setFilePreview] = useState<WialonVideoFile | null>(null);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const urlUnitId = params.get('unitId') || params.get('unit');
  const selectedId = urlUnitId ? Number(urlUnitId) : null;

  const { data: units, isLoading, isFetching, isError, error } = useSurveillanceUnits();
  const { data: unitDetail, isLoading: detailLoading } = useSurveillanceUnit(selectedId);
  const { data: streams } = useVideoStreams(true);
  const unitList = safeArray<WialonVideoUnit>(units);

  const filtered = useMemo(() => {
    const hay = q.trim().toLowerCase();
    if (!hay) return unitList;
    return unitList.filter(
      (u) =>
        u.name.toLowerCase().includes(hay) ||
        String(u.id).includes(hay) ||
        (u.uniqueId || '').toLowerCase().includes(hay)
    );
  }, [unitList, q]);

  const selected = useMemo(
    () => filtered.find((u) => u.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const activeUnit = useMemo((): WialonVideoUnit | null => {
    if (!selected) return null;
    if (unitDetail && unitDetail.id === selected.id) {
      return { ...selected, ...unitDetail, commands: unitDetail.commands ?? [] };
    }
    return selected;
  }, [selected, unitDetail]);

  useEffect(() => {
    if (selected && !selectedId) {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('unitId', String(selected.id));
        return next;
      }, { replace: true });
    }
  }, [selected, selectedId, setParams]);

  const selectUnit = (unit: WialonVideoUnit) => {
    setCameraIndex(0);
    setLiveChannel(null);
    setLiveFromHeader(false);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('unitId', String(unit.id));
      return next;
    }, { replace: true });
  };

  const cameras = activeUnit?.cameras ?? [];
  const commands = activeUnit?.commands ?? [];
  const selectedCamera = cameras[cameraIndex] || cameras[0];
  const selectedChannel = selectedCamera?.channel ?? cameraIndex + 1;
  const liveCmd = findLiveCommand(commands);
  const playbackCmd = findPlaybackCommand(commands);
  const allCameras = unitDetail?.allCameras;
  const liveCameras = allCameras?.length ? allCameras : cameras;

  const mainLive = useSurveillanceLiveStream(
    activeUnit?.id ?? null,
    liveChannel,
    tab === 'live' && liveChannel != null
  );

  const goLive = () => {
    if (!activeUnit || !selectedChannel) return;
    setLiveFromHeader(true);
    setLiveChannel(selectedChannel);
    setTab('live');
  };

  const changeLiveChannel = (channel: number | null) => {
    setLiveFromHeader(false);
    setLiveChannel(channel);
  };

  const requestPlayback = useMutation({
    mutationFn: () => {
      if (!activeUnit) throw new Error('No unit selected');
      const cmd = playbackCmd?.name || liveCmd?.name;
      if (!cmd) throw new Error('No playback command configured for this unit');
      const fromSec = Math.floor(new Date(playbackFrom).getTime() / 1000);
      const toSec = Math.floor(new Date(playbackTo).getTime() / 1000);
      const param = buildVideoCommandParam(playbackCmd || liveCmd, {
        cameraIndex: selectedChannel,
        fromSec,
        toSec,
      });
      return clientApi.sendSurveillanceCommand(activeUnit.id, cmd, param);
    },
    onSuccess: () => {
      notify.success('Playback requested', 'Historical video is being prepared on the device.');
      setShowPlayer(true);
    },
    onError: (e: Error) => notify.error('Playback request failed', e.message),
  });

  useEffect(() => () => {
    if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
  }, [fileBlobUrl]);

  const openFilePreview = async (file: WialonVideoFile) => {
    if (!activeUnit) return;
    setFileLoading(true);
    setFilePreview(file);
    try {
      if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
      let blob: Blob;
      if (file.source === 'message' && file.messageId != null) {
        blob = await clientApi.fetchSurveillanceMessageVideoBlob(activeUnit.id, file.messageId);
      } else if (file.source === 'storage' && file.path) {
        blob = await clientApi.fetchSurveillanceFileBlob(activeUnit.id, file.path, file.storageType ?? 2);
      } else {
        notify.info('Unavailable', 'This clip cannot be played in-app.');
        setFilePreview(null);
        return;
      }
      setFileBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      notify.error('Could not load file', (e as Error).message);
      setFilePreview(null);
    } finally {
      setFileLoading(false);
    }
  };

  const openClipPreview = async (clip: WialonVideoClipRef, label?: string) => {
    const unitId = clip.unitId;
    const pseudoFile: WialonVideoFile = {
      id: `clip-${clip.messageId ?? clip.path}`,
      name: label || 'Event clip',
      path: clip.path || '',
      source: clip.source,
      messageId: clip.messageId,
      storageType: clip.storageType,
    };
    setFileLoading(true);
    setFilePreview(pseudoFile);
    try {
      if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
      let blob: Blob;
      if (clip.source === 'message' && clip.messageId != null) {
        blob = await clientApi.fetchSurveillanceMessageVideoBlob(unitId, clip.messageId);
      } else if (clip.source === 'storage' && clip.path) {
        blob = await clientApi.fetchSurveillanceFileBlob(unitId, clip.path, clip.storageType ?? 2);
      } else {
        notify.info('Unavailable', 'This clip cannot be played in-app.');
        setFilePreview(null);
        return;
      }
      setFileBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      notify.error('Could not load clip', (e as Error).message);
      setFilePreview(null);
    } finally {
      setFileLoading(false);
    }
  };

  const streamCount = safeArray(streams).length;

  return (
    <AppLayout title="Surveillance" subtitle="Live video, playback, and saved files">
      <div className="space-y-4">
        <WialonContextBanner compact />
        <ModuleIntegrationBanner moduleKey="surveillance" />

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="fleet-card px-4 py-2">
            <span className="text-muted-foreground">Video units: </span>
            <strong>{unitList.length}</strong>
            <span className="text-status-moving ml-1">
              ({unitList.filter((u) => u.connected).length} online)
            </span>
          </span>
          <span className="fleet-card px-4 py-2">
            <span className="text-muted-foreground">Cameras: </span>
            <strong>
              {unitList.reduce((n, u) => n + (u.cameraCount ?? u.cameras?.length ?? 0), 0)}
            </strong>
          </span>
          {streamCount > 0 && (
            <span className="fleet-card px-4 py-2">
              <span className="text-muted-foreground">Active streams: </span>
              <strong>{streamCount}</strong>
            </span>
          )}
        </div>

        {isError && (
          <p className="text-sm text-destructive">{(error as Error)?.message || 'Could not load video units'}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
          <div className="lg:col-span-3">
            <SurveillanceUnitList
              units={unitList}
              filtered={filtered}
              selectedId={selected?.id ?? null}
              isLoading={isLoading && !unitList.length}
              isFetching={isFetching}
              query={q}
              onQueryChange={setQ}
              onSelect={selectUnit}
            />
          </div>

          <div className="lg:col-span-9 space-y-4">
            {activeUnit ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      {activeUnit.connected ? (
                        <Radio className="h-4 w-4 text-status-moving" />
                      ) : (
                        <VideoOff className="h-4 w-4 text-muted-foreground" />
                      )}
                      {activeUnit.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeUnit.hwType || 'MDVR'} · {activeUnit.cameraCount} camera(s) ·{' '}
                      {activeUnit.source === 'wialon_local' ? 'Local video' : 'Cloud video'}
                      {detailLoading && commands.length === 0 ? ' · loading commands…' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/monitoring?view=map&unitId=${activeUnit.id}`}>
                        <MapPin className="h-3.5 w-3.5 mr-1" />
                        Monitoring
                      </Link>
                    </Button>
                    <Button variant="default" size="sm" onClick={goLive} disabled={!activeUnit.connected}>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Go Live
                    </Button>
                    {liveCmd && (
                      <WialonCommandButton
                        unitId={activeUnit.id}
                        commandName={liveCmd.name}
                        label={liveCmd.label}
                        param={{
                          camera: selectedChannel,
                        }}
                        variant="outline"
                        size="sm"
                      />
                    )}
                  </div>
                </div>

                {cameras.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {cameras.map((cam, i) => (
                      <Button
                        key={cam.index}
                        size="sm"
                        variant={cameraIndex === i ? 'default' : 'outline'}
                        onClick={() => setCameraIndex(i)}
                      >
                        {cam.name}
                        {!cam.active && <span className="ml-1 opacity-60">(off)</span>}
                      </Button>
                    ))}
                  </div>
                )}

                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="branded-tabs flex-wrap h-auto">
                    <TabsTrigger value="cameras" className="gap-1.5">
                      <Video className="h-3.5 w-3.5" />Cameras
                    </TabsTrigger>
                    <TabsTrigger value="live" className="gap-1.5">
                      <Video className="h-3.5 w-3.5" />Live
                    </TabsTrigger>
                    <TabsTrigger value="playback" className="gap-1.5">
                      <Play className="h-3.5 w-3.5" />Playback
                    </TabsTrigger>
                    <TabsTrigger value="files" className="gap-1.5">
                      <FileVideo className="h-3.5 w-3.5" />Files
                    </TabsTrigger>
                    <TabsTrigger value="commands" className="gap-1.5">
                      <List className="h-3.5 w-3.5" />Commands
                    </TabsTrigger>
                    <TabsTrigger value="events" className="gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />Events
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" />Reports
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="cameras" className="mt-4">
                    <CameraManagementPanel unit={activeUnit} allCameras={allCameras} />
                  </TabsContent>

                  <TabsContent value="live" className="mt-4 space-y-4">
                    {liveFromHeader && liveChannel != null && (
                      <div className="fleet-card p-3">
                        <p className="text-sm font-medium mb-2">
                          Live — {selectedCamera?.name ?? `Camera ${liveChannel}`}
                        </p>
                        <WialonVideoPlayer
                          unit={activeUnit}
                          camera={selectedCamera}
                          playbackUrl={mainLive.data?.playbackUrl}
                          streamType={mainLive.data?.streamType}
                          isLoading={mainLive.isPending}
                          errorMessage={mainLive.isError ? (mainLive.error as Error)?.message : null}
                          onRetry={() => mainLive.refetch()}
                        />
                      </div>
                    )}
                    <WialonLiveCameraGrid
                      unit={activeUnit}
                      cameras={liveCameras}
                      enabled={tab === 'live'}
                      liveChannel={liveChannel}
                      onLiveChannelChange={changeLiveChannel}
                      liveSession={mainLive.data}
                      liveLoading={mainLive.isPending}
                      liveError={mainLive.isError ? (mainLive.error as Error)?.message : null}
                      onLiveRetry={() => mainLive.refetch()}
                      mainViewerActive={liveFromHeader && liveChannel != null}
                    />
                    <ExternalStreamsPanel streams={safeArray(streams)} selectedUnitId={activeUnit.id} />
                  </TabsContent>

                  <TabsContent value="playback" className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                      <div>
                        <Label className="text-xs">From</Label>
                        <Input type="datetime-local" value={playbackFrom} onChange={(e) => setPlaybackFrom(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">To</Label>
                        <Input type="datetime-local" value={playbackTo} onChange={(e) => setPlaybackTo(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => requestPlayback.mutate()}
                        disabled={requestPlayback.isPending || (!playbackCmd && !liveCmd)}
                      >
                        {requestPlayback.isPending ? 'Requesting…' : 'Request playback'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowPlayer(true)}>
                        Open player
                      </Button>
                    </div>
                    {showPlayer && (
                      <WialonVideoPlayer
                        unit={activeUnit}
                        camera={selectedCamera}
                        playbackUrl={mainLive.data?.playbackUrl}
                        streamType={mainLive.data?.streamType}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="files" className="mt-4">
                    <SurveillanceFilesTab unit={activeUnit} onPreview={openFilePreview} />
                  </TabsContent>

                  <TabsContent value="commands" className="mt-4">
                    {commands.length ? (
                      <div className="flex flex-wrap gap-2">
                        {commands.map((c) => (
                          <WialonCommandButton
                            key={c.name}
                            unitId={activeUnit.id}
                            commandName={c.name}
                            label={c.label}
                            param={{ camera: selectedChannel }}
                            variant="outline"
                            size="sm"
                          />
                        ))}
                      </div>
                    ) : detailLoading ? (
                      <Skeleton className="h-10 w-full max-w-md" />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No commands configured for this unit.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="events" className="fleet-card mt-4 p-4">
                    <SurveillanceEventsTab unitId={activeUnit.id} onPlayClip={openClipPreview} />
                  </TabsContent>

                  <TabsContent value="reports" className="mt-4">
                    <GenericModuleReports
                      moduleLabel="Surveillance"
                      title="Surveillance executive"
                      blurb="Video-capable units and camera coverage."
                      kpis={[
                        { label: 'Video units', value: unitList.length },
                        {
                          label: 'Cameras',
                          value: unitList.reduce((s, u) => s + (u.cameras?.length || 0), 0),
                        },
                      ]}
                      columns={[
                        { key: 'name', label: 'Unit' },
                        { key: 'cameras', label: 'Cameras', align: 'right' },
                        { key: 'uid', label: 'Device ID' },
                      ]}
                      rows={unitList.map((u) => {
                        const cams = u.cameras?.length ?? 0;
                        const coverage =
                          cams <= 0 ? 'No cameras' : cams === 1 ? '1 camera' : cams <= 4 ? '2–4 cameras' : '5+ cameras';
                        return {
                          name: u.name,
                          cameras: cams,
                          uid: u.uniqueId || String(u.id),
                          coverage,
                        };
                      })}
                      charts={{
                        heading: 'Asset performance · surveillance analytics',
                        categoryKey: 'name',
                        bar: {
                          title: 'Cameras by unit',
                          subtitle: 'Standing bars — camera channels per video unit',
                          metrics: [{ key: 'cameras', label: 'Cameras', color: CHART.brand }],
                          topN: 8,
                        },
                        secondary: {
                          type: 'category',
                          title: 'Coverage mix',
                          subtitle: 'Units by camera-count band',
                          groupKey: 'coverage',
                          as: 'pie',
                        },
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </>
            ) : isLoading && !unitList.length ? (
              <Skeleton className="h-[60vh]" />
            ) : (
              <div className="fleet-card p-12 text-center text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Select a unit with video cameras configured.</p>
              </div>
            )}
          </div>
        </div>

        <Dialog
          open={Boolean(filePreview)}
          onOpenChange={(open) => {
            if (!open) {
              setFilePreview(null);
              if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
              setFileBlobUrl(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{filePreview?.name}</DialogTitle>
            </DialogHeader>
            {fileLoading ? (
              <Skeleton className="aspect-video w-full" />
            ) : fileBlobUrl ? (
              <video src={fileBlobUrl} className="w-full rounded-lg bg-black" controls autoPlay />
            ) : (
              <p className="text-sm text-muted-foreground">Could not load video.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
