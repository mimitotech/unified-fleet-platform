import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Clock, ArrowDownToLine, MapPin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EnrichedGenerator, Generator, GeneratorStatus } from '@/types';

/**
 * GeneratorListRow — single-row presentation of one generator inside a site group.
 *
 * Pure presentational component; consumes a fully-resolved Generator (already
 * transformed by `transformToGenerator` upstream) and renders status, location,
 * and runtime columns to match the surrounding table layout. The tank-level
 * percentage, load, and last-update columns were removed in favour of the more
 * actionable "Fuel Used" period column; tank fill is still surfaced via
 * FuelKpiCards and the dedicated fuel-level chart on the Generators tab.
 *
 * When `showPeriod` is true and the generator carries `EnrichedGenerator`
 * fields, the Runtime column displays the period sum and an extra "Fuel Used"
 * column is rendered with consumed litres (drains folded in, matching the
 * daily-breakdown modal) plus a tooltip breakdown of fills for the same
 * window.
 *
 * When `onSelect` is supplied the row becomes clickable; the parent uses this
 * to open the per-day fuel breakdown modal for the chosen generator.
 */

interface GeneratorListRowProps {
  generator: Generator | EnrichedGenerator;
  showPeriod?: boolean;
  /** Invoked when the row is clicked (or activated via keyboard). When omitted
   *  the row stays static and non-interactive. */
  onSelect?: () => void;
}

const STATUS_STYLES: Record<GeneratorStatus, { label: string; classes: string; dot: string }> = {
  running: { label: 'Running', classes: 'bg-status-moving/15 text-status-moving', dot: 'bg-status-moving' },
  stopped: { label: 'Stopped', classes: 'bg-status-stopped/15 text-status-stopped', dot: 'bg-status-stopped' },
  offline: { label: 'Offline', classes: 'bg-status-offline/15 text-status-offline', dot: 'bg-status-offline' },
};

function safeRelative(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function GeneratorListRow({
  generator,
  showPeriod = false,
  onSelect,
}: GeneratorListRowProps) {
  const status = STATUS_STYLES[generator.status] ?? STATUS_STYLES.offline;

  // Period metrics — only present when caller supplies EnrichedGenerator data
  const enriched = generator as EnrichedGenerator;
  const runtimePeriod = enriched.runtimeHoursPeriod;
  const fuelConsumedPeriod = enriched.fuelConsumedPeriod;
  const fuelFilledPeriod = enriched.fuelFilledPeriod;
  const fuelDrainsPeriod = enriched.fuelDrainsPeriod;
  const locationName = enriched.locationName;

  const isInteractive = typeof onSelect === 'function';
  const handleRowClick = isInteractive ? () => onSelect?.() : undefined;
  const handleKey = isInteractive
    ? (e: ReactKeyboardEvent<HTMLTableRowElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }
    : undefined;

  return (
    <tr
      className={cn(
        'border-b border-border/30 last:border-0',
        isInteractive && 'cursor-pointer hover:bg-muted/40 transition-colors',
      )}
      onClick={handleRowClick}
      onKeyDown={handleKey}
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? 'button' : undefined}
    >
      <td className="py-2.5 pr-3">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{generator.name}</span>
          <span className="text-[11px] text-muted-foreground font-mono">{generator.assetId}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full font-medium px-2 py-0.5 text-xs',
          status.classes,
        )}>
          <span className={cn('rounded-full w-1.5 h-1.5', status.dot)} />
          {status.label}
        </span>
      </td>
      <td className="py-2.5 px-3">
        {locationName ? (
          <div className="flex items-center gap-1.5 text-xs text-foreground/90 max-w-[14rem]">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate min-w-0" title={locationName}>
              {locationName}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono tabular-nums">
            {showPeriod
              ? `${(runtimePeriod ?? 0).toFixed(1)} h`
              : `${generator.totalRunningHours.toFixed(1)} h`}
          </span>
        </div>
      </td>
      {showPeriod && (
        <td className="py-2.5 pl-3 text-right">
          <FuelUsedCell
            consumed={fuelConsumedPeriod}
            filled={fuelFilledPeriod}
            drained={fuelDrainsPeriod}
          />
        </td>
      )}
    </tr>
  );
}

interface FuelUsedCellProps {
  consumed: number | undefined;
  filled: number | undefined;
  drained: number | undefined;
}

function FuelUsedCell({ consumed, filled, drained }: FuelUsedCellProps) {
  // Drains are treated as consumption (matching the daily-breakdown modal),
  // so the displayed total folds drained litres into the consumed figure.
  const consumedL = (consumed ?? 0) + (drained ?? 0);
  const filledL = filled ?? 0;
  const hasAny = consumedL > 0 || filledL > 0;

  if (!hasAny) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-end cursor-help">
          <span className="font-mono tabular-nums">
            {Math.round(consumedL).toLocaleString()} L
          </span>
          {filledL > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5">
                <ArrowDownToLine className="h-3 w-3" />
                {Math.round(filledL).toLocaleString()}
              </span>
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-3 py-2">
        <div className="space-y-1 text-xs">
          <p className="font-medium text-popover-foreground mb-1.5">Fuel activity (period)</p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Consumed</span>
            <span className="font-mono tabular-nums">{Math.round(consumedL).toLocaleString()} L</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Filled</span>
            <span className="font-mono tabular-nums">{Math.round(filledL).toLocaleString()} L</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export const FUEL_CRITICAL_THRESHOLD_PERCENT = 20;
export const FUEL_WARNING_THRESHOLD_PERCENT = 35;
