import { AppLayout } from '@/components/app/AppLayout';
import { useVideoStreams, useSurveillanceViolations } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Video, VideoOff, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Surveillance() {
  const { data: streams, isLoading: streamsLoading } = useVideoStreams();
  const { data: violations, isLoading: violationsLoading } = useSurveillanceViolations();

  const onlineCount = streams?.filter((s) => s.status === 'online').length ?? 0;

  return (
    <AppLayout title="Surveillance" subtitle="Video feeds from LocoNav and TrackSolid">
      <div className="space-y-6">
        <div className="flex gap-4 text-sm">
          <span className="fleet-card px-4 py-2">
            <span className="text-muted-foreground">Cameras: </span>
            <strong>{streams?.length ?? 0}</strong>
          </span>
          <span className="fleet-card px-4 py-2">
            <span className="text-muted-foreground">Online: </span>
            <strong className="text-success">{onlineCount}</strong>
          </span>
        </div>

        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">Live Feeds</TabsTrigger>
            <TabsTrigger value="violations">Violations</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-4">
            {streamsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {streams?.map((s) => (
                  <div key={s.id} className="fleet-card">
                    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-3">
                      {s.status === 'online' ? (
                        <Video className="w-12 h-12 text-primary opacity-60" />
                      ) : (
                        <VideoOff className="w-12 h-12 text-muted-foreground opacity-40" />
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{s.assetName}</p>
                        <p className="text-xs text-muted-foreground">{s.channel}</p>
                      </div>
                      <Badge variant={s.status === 'online' ? 'default' : 'secondary'}>
                        {s.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.sourceType}</p>
                  </div>
                ))}
                {!streams?.length && (
                  <p className="text-muted-foreground col-span-full text-center py-12">
                    No camera streams. Configure LocoNav or TrackSolid integration in Admin.
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="violations" className="fleet-card mt-4">
            {violationsLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <div className="space-y-3">
                {(violations as Array<Record<string, unknown>>)?.map((v, i) => (
                  <div key={(v.id as string) || i} className="flex items-start gap-3 border-b border-border pb-3">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {(v.violationType as string) || (v.title as string) || (v.type as string)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(v.unitName as string) || ''} · {(v.driverName as string) || ''}
                      </p>
                      {v.occurredAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(v.occurredAt as string), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline">{(v.severity as string) || (v.category as string)}</Badge>
                  </div>
                ))}
                {!violations?.length && (
                  <p className="text-muted-foreground text-center py-8">No violations recorded</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
