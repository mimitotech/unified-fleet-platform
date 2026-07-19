import { useMemo, useState } from 'react';
import { useWialonContext, useWialonRoutes, useWialonReportTemplates, useWialonNotifications } from '@/hooks/useWialon';
import {
  useWialonFleet,
  useWialonUnits,
  useWialonGeofencesLive,
  useWialonUnitSensors,
  useWialonRouteRounds,
  useExecWialonReport,
  useSendWialonCommand,
} from '@/hooks/useWialonLive';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { Satellite, Route, FileText, Bell, Gauge, MapPin, Send } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function LiveHeader({
  title,
  description,
  count,
  icon: Icon,
}: {
  title: string;
  description: string;
  count?: number;
  icon: typeof Satellite;
}) {
  return (
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {title}
            <Badge variant="outline" className="text-[10px] font-normal">Live</Badge>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {count != null && <Badge variant="secondary">{count}</Badge>}
      </div>
    </CardHeader>
  );
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WialonLiveUnitsPanel() {
  const { connected } = useWialonContext();
  const { data, isLoading, isError } = useWialonFleet(connected);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const { data: sensorData } = useWialonUnitSensors(selectedUnit, connected);
  const sendCmd = useSendWialonCommand();

  if (!connected) return null;

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader title="Live units" description="Real-time units for your linked account — vehicles, trackers, sensors, cameras, and more." count={data?.counts?.total} icon={Satellite} />
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-32" /> : isError ? (
          <p className="text-sm text-destructive">Could not load live units.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.units || []).slice(0, 20).map((u) => (
                <TableRow key={u.id} className={selectedUnit === u.id ? 'bg-primary/5' : ''}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{u.hwName || (u.hw != null ? `HW ${u.hw}` : '—')}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{u.status}</Badge></TableCell>
                  <TableCell>{u.position?.speed ?? '—'} km/h</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedUnit(u.id)}>Sensors</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {selectedUnit && sensorData?.sensors && (
          <div className="rounded-lg border p-3 bg-muted/20">
            <p className="text-xs font-medium mb-2">Sensors — unit #{selectedUnit}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              {sensorData.sensors.map((s) => (
                <div key={s.name} className="rounded border px-2 py-1">
                  <p className="text-[10px] text-muted-foreground">{s.name}</p>
                  <p className="font-medium">{s.value}{s.unit ? ` ${s.unit}` : ''}</p>
                </div>
              ))}
            </div>
            <LoadingButton
              size="sm"
              variant="outline"
              className="mt-2"
              loading={sendCmd.isPending}
              onClick={() =>
                sendCmd.mutate(
                  { unitId: selectedUnit, commandName: 'request_position' },
                  { onSuccess: () => notify.success('Locate sent'), onError: (e) => notify.error('Command failed', e.message) }
                )
              }
            >
              <Send className="h-3 w-3 mr-1" /> Request position
            </LoadingButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WialonRoutesPanel() {
  const { connected } = useWialonContext();
  const { data, isLoading, isError } = useWialonRoutes(connected);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const { data: rounds, isLoading: roundsLoading } = useWialonRouteRounds(expandedRoute, connected);

  if (!connected) return null;

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader title="Routes" description="Route objects from your linked account — expand to see rounds/schedules." count={data?.count} icon={Route} />
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : isError ? (
          <p className="text-sm text-destructive">Could not load routes.</p>
        ) : !data?.routes?.length ? (
          <p className="text-sm text-muted-foreground">No routes for this account.</p>
        ) : (
          <div className="space-y-2">
            {data.routes.map((r) => (
              <div key={r.id} className="rounded-lg border">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                  onClick={() => setExpandedRoute(expandedRoute === r.id ? null : r.id)}
                >
                  <span className="font-medium text-sm">{r.name}</span>
                  <Badge variant="outline" className="text-[10px]">ID {r.id}</Badge>
                </button>
                {expandedRoute === r.id && (
                  <div className="px-3 pb-3 text-xs text-muted-foreground">
                    {roundsLoading ? 'Loading rounds…' : `${rounds?.count ?? 0} round(s)`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WialonReportsPanel() {
  const { connected } = useWialonContext();
  const { data, isLoading, isError } = useWialonReportTemplates(connected);
  const { data: units } = useWialonUnits(connected);
  const exec = useExecWialonReport();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [reportRows, setReportRows] = useState<Record<string, unknown>[]>([]);

  const template = useMemo(
    () => data?.templates?.find((t) => `${t.resourceId}-${t.id}` === selectedTemplate),
    [data?.templates, selectedTemplate]
  );

  if (!connected) return null;

  const runReport = () => {
    if (!template || !selectedUnit) {
      notify.error('Select template and unit');
      return;
    }
    const to = Math.floor(Date.now() / 1000);
    const from = to - 7 * 24 * 3600;
    exec.mutate(
      {
        reportResourceId: template.resourceId,
        reportTemplateId: template.id,
        reportObjectId: parseInt(selectedUnit, 10),
        from,
        to,
      },
      {
        onSuccess: (res) => {
          const rows = (res.rows || []) as Record<string, unknown>[];
          setReportRows(rows);
          notify.success('Report ready', `${rows.length} rows`);
        },
        onError: (e) => notify.error('Report failed', e.message),
      }
    );
  };

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader title="Reports" description="Run report templates live against your fleet units." count={data?.count} icon={FileText} />
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-32" /> : isError ? (
          <p className="text-sm text-destructive">Could not load report templates.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Report template" /></SelectTrigger>
                <SelectContent>
                  {(data?.templates || []).map((t) => (
                    <SelectItem key={`${t.resourceId}-${t.id}`} value={`${t.resourceId}-${t.id}`}>
                      {t.name} · {t.resourceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  {(units?.units || []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LoadingButton loading={exec.isPending} onClick={runReport} disabled={!template || !selectedUnit}>
              Run report (last 7 days)
            </LoadingButton>
            {reportRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">{reportRows.length} rows</p>
                  <Button size="sm" variant="outline" onClick={() => downloadCsv(reportRows, 'wialon-report.csv')}>
                    Download CSV
                  </Button>
                </div>
                <pre className="text-[10px] max-h-48 overflow-auto rounded border p-2 bg-muted/30">
                  {JSON.stringify(reportRows.slice(0, 5), null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function WialonNotificationsPanel() {
  const { connected } = useWialonContext();
  const { data, isLoading, isError } = useWialonNotifications(connected);

  if (!connected) return null;

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader
        title="Configured notification rules"
        description="Rules active on this account. When they fire, events appear in the inbox above automatically."
        count={data?.count}
        icon={Bell}
      />
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : isError ? (
          <p className="text-sm text-destructive">Could not load notifications.</p>
        ) : !data?.notifications?.length ? (
          <p className="text-sm text-muted-foreground">No notifications for this account.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Triggers</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.notifications.map((n) => (
                <TableRow key={`${n.resourceId}-${n.id}`}>
                  <TableCell className="font-medium">{n.name}</TableCell>
                  <TableCell className="text-muted-foreground">{n.resourceName}</TableCell>
                  <TableCell>{n.triggers ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={n.active ? 'default' : 'secondary'}>{n.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function WialonGeofencesLivePanel() {
  const { connected } = useWialonContext();
  const { data, isLoading, isError } = useWialonGeofencesLive(connected);

  if (!connected) return null;

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader title="Geofences" description="Zones configured for this account." count={data?.count} icon={MapPin} />
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : isError ? (
          <p className="text-sm text-destructive">Could not load geofences.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(data?.geofences || []).slice(0, 12).map((z) => (
              <div key={`${z.resourceId}-${z.id}`} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{z.name}</p>
                <p className="text-xs text-muted-foreground">{z.resourceName} · {z.type}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WialonSensorsPanel() {
  const { connected } = useWialonContext();
  const { data: units, isLoading } = useWialonUnits(connected);
  const [unitId, setUnitId] = useState<number | null>(null);
  const { data: sensors, isFetching } = useWialonUnitSensors(unitId, connected);

  if (!connected) return null;

  return (
    <Card className="border-primary/20 mb-6">
      <LiveHeader title="Sensors" description="Latest sensor values for the selected unit." icon={Gauge} />
      <CardContent className="space-y-3">
        <Select value={unitId ? String(unitId) : ''} onValueChange={(v) => setUnitId(parseInt(v, 10))}>
          <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
          <SelectContent>
            {(units?.units || []).map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLoading || isFetching ? <Skeleton className="h-20" /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(sensors?.sensors || []).map((s) => (
              <div key={s.name} className="rounded border p-2">
                <p className="text-[10px] text-muted-foreground">{s.name}</p>
                <p className="font-semibold">{s.value}{s.unit ? ` ${s.unit}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
