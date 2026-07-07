import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bell, Leaf, Video, ExternalLink, MapPin, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { useMonitoringEvents, type MonitoringEventRow } from '@/hooks/useMonitoringEvents';
import type { FleetUnit } from '@/lib/fleetUnits';
import { cn } from '@/lib/utils';

const categoryMeta = {
  alert: { label: 'Alert', icon: Bell, className: 'text-primary' },
  eco: { label: 'Eco', icon: Leaf, className: 'text-emerald-600' },
  video: { label: 'Video', icon: Video, className: 'text-violet-600' },
} as const;

type CategoryFilter = 'all' | MonitoringEventRow['category'];

type Props = {
  units?: FleetUnit[];
  unitId?: string | null;
  onViewUnitOnMap?: (unitId: string) => void;
  className?: string;
};

function matchUnit(event: MonitoringEventRow, unit: FleetUnit | undefined): boolean {
  if (!unit) return false;
  const hay = event.unitName?.toLowerCase();
  if (!hay) return false;
  return hay === unit.name.toLowerCase() || hay.includes(unit.plate?.toLowerCase() || '___');
}

export function MonitoringEventsView({ units = [], unitId, onViewUnitOnMap, className }: Props) {
  const { events, isLoading, isError, refetch } = useMonitoringEvents(80);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [unitOnly, setUnitOnly] = useState(false);

  const selectedUnit = units.find((u) => u.id === unitId);

  const filtered = useMemo(() => {
    let rows = events;
    if (category !== 'all') rows = rows.filter((e) => e.category === category);
    if (unitOnly && selectedUnit) rows = rows.filter((e) => matchUnit(e, selectedUnit));
    return rows;
  }, [events, category, unitOnly, selectedUnit]);

  const categories: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'alert', label: 'Alerts' },
    { id: 'eco', label: 'Eco' },
    { id: 'video', label: 'Video' },
  ];

  if (isLoading && !events.length) {
    return (
      <div className={cn('fleet-card p-4 space-y-3 monitoring-workspace', className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('fleet-card p-0 overflow-hidden monitoring-workspace flex flex-col', className)}>
      {isError && (
        <QueryErrorBanner
          message="Could not load fleet events."
          onRetry={() => refetch()}
          className="m-3 mb-0 shrink-0"
        />
      )}

      <div className="px-3 py-2.5 border-b border-border/60 shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">Fleet events & violations</h3>
            <p className="text-[11px] text-muted-foreground">
              Alerts, eco-driving, and video events from Wialon integrations
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link to="/app/alerts">All alerts</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link to="/app/surveillance">Surveillance</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors',
                category === c.id
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {c.label}
            </button>
          ))}
          {selectedUnit && (
            <button
              type="button"
              onClick={() => setUnitOnly((v) => !v)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ml-1',
                unitOnly
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {selectedUnit.name}
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border/60 flex-1 overflow-auto min-h-0">
        {filtered.map((ev) => {
          const meta = categoryMeta[ev.category];
          const Icon = meta.icon;
          const matchedUnit = units.find((u) => matchUnit(ev, u));

          return (
            <li key={ev.id} className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-muted/30 transition-colors">
              <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', meta.className)} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-snug">{ev.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {[ev.unitName, ev.driverName].filter(Boolean).join(' · ') || 'Fleet event'}
                </p>
                {ev.occurredAt && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(ev.occurredAt), { addSuffix: true })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px] h-5">
                  {meta.label}
                </Badge>
                {ev.severity && (
                  <Badge
                    variant={ev.severity === 'critical' ? 'destructive' : 'secondary'}
                    className="text-[10px] h-5 capitalize"
                  >
                    {ev.severity}
                  </Badge>
                )}
                {matchedUnit && onViewUnitOnMap && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() => onViewUnitOnMap(matchedUnit.id)}
                  >
                    <MapPin className="h-3 w-3 mr-0.5" />
                    Map
                  </Button>
                )}
                {ev.videoUrl && (
                  <a
                    href={ev.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary inline-flex items-center gap-0.5"
                  >
                    Clip <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
        {!filtered.length && (
          <li className="px-4 py-16 text-center text-muted-foreground text-sm">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No events match your filters.
          </li>
        )}
      </ul>
    </div>
  );
}
