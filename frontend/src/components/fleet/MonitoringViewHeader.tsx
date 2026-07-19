import { Map, List, Route, AlertTriangle, Activity, Pause, Power, MapPin, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FleetAssetProfile } from '@/hooks/useFleetAssetProfile';

export type MonitoringViewMode = 'map' | 'list' | 'tracks' | 'violations' | 'reports';

const tabs: { id: MonitoringViewMode; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Live Map', icon: Map },
  { id: 'list', label: 'Fleet List', icon: List },
  // Track | Events — clearer for mixed / generator fleets
  { id: 'tracks', label: 'Track', icon: Route },
  { id: 'violations', label: 'Events', icon: AlertTriangle },
  { id: 'reports', label: 'Reports', icon: FileText },
];

type StatusCounts = {
  moving: number;
  idle: number;
  stopped: number;
  offline: number;
};

type Props = {
  mode: MonitoringViewMode;
  onChange: (mode: MonitoringViewMode) => void;
  fleetCount: number;
  live?: boolean;
  counts?: StatusCounts;
  assetProfile?: FleetAssetProfile;
};

const kpiItems: { key: keyof StatusCounts; label: string; icon: typeof Activity; className: string }[] = [
  { key: 'moving', label: 'Moving', icon: Activity, className: 'text-status-moving' },
  { key: 'idle', label: 'Idle', icon: Pause, className: 'text-status-idle' },
  { key: 'stopped', label: 'Stopped', icon: Power, className: 'text-status-stopped' },
  { key: 'offline', label: 'Offline', icon: MapPin, className: 'text-muted-foreground' },
];

export function MonitoringViewHeader({ mode, onChange, fleetCount, live, counts, assetProfile }: Props) {
  const centerTitle = assetProfile?.isGeneratorOnly
    ? 'Generator Monitoring'
    : assetProfile?.isMixed
      ? 'Asset Monitoring Center'
      : 'Fleet Monitoring Center';
  const countLabel = assetProfile?.isGeneratorOnly
    ? `${fleetCount} generator${fleetCount === 1 ? '' : 's'} tracked`
    : `${fleetCount} ${assetProfile?.unitLabelPlural ?? 'units'} tracked`;

  const useRunningChip =
    assetProfile?.isGeneratorOnly ||
    assetProfile?.primaryType === 'machinery' ||
    (assetProfile?.generators ?? 0) + (assetProfile?.machinery ?? 0) >
      (assetProfile?.vehicles ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{centerTitle}</h2>
          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{countLabel}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-status-moving font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-status-moving animate-pulse" />
                Live
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border border-border/60 shrink-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                mode === id
                  ? 'bg-card text-foreground shadow-sm border border-border/80'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {counts && (
        <div className="flex flex-wrap gap-1.5">
          {(useRunningChip
            ? [
                { key: 'idle' as const, label: 'Running', icon: Activity, className: 'text-status-moving' },
                { key: 'stopped' as const, label: 'Stopped', icon: Power, className: 'text-status-stopped' },
                { key: 'offline' as const, label: 'Offline', icon: MapPin, className: 'text-muted-foreground' },
              ]
            : kpiItems
          ).map(({ key, label, icon: Icon, className }) => (
            <div key={`${key}-${label}`} className="monitoring-kpi">
              <Icon className={cn('h-3.5 w-3.5', className)} />
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold tabular-nums">
                {useRunningChip && key === 'idle'
                  ? counts.idle + counts.moving
                  : counts[key]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
