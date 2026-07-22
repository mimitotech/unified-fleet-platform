import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PeriodPreset = 'today' | '7d' | '14d' | '30d' | 'custom';

export function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PRESETS: Array<{ id: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '30d', label: '30d' },
];

export function PeriodAssetControls({
  fromDate,
  toDate,
  todayStr,
  asset,
  assetNames,
  assetLabel = 'Asset',
  onFromChange,
  onToChange,
  onAssetChange,
  onPreset,
  activePreset,
  className,
  compact,
  trailing,
  hideAsset,
}: {
  fromDate: string;
  toDate: string;
  todayStr: string;
  asset?: string;
  assetNames?: string[];
  assetLabel?: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAssetChange?: (v: string) => void;
  /** When set, called instead of applying dates locally (for draft/execute flows). */
  onPreset?: (p: Exclude<PeriodPreset, 'custom'>) => void;
  activePreset?: PeriodPreset | 'custom' | null;
  className?: string;
  compact?: boolean;
  /** Optional Execute / Run / extra controls on the same row. */
  trailing?: ReactNode;
  hideAsset?: boolean;
}) {
  const uid = useId();
  const fromId = `${uid}-from`;
  const toId = `${uid}-to`;
  const assetId = `${uid}-asset`;
  const showAsset =
    !hideAsset && Boolean(onAssetChange) && asset != null && Array.isArray(assetNames);

  const applyPreset = (p: Exclude<PeriodPreset, 'custom'>) => {
    if (onPreset) {
      onPreset(p);
      return;
    }
    if (p === 'today') {
      onFromChange(todayStr);
      onToChange(todayStr);
      return;
    }
    const days = p === '7d' ? 6 : p === '14d' ? 13 : 29;
    onFromChange(shiftDays(todayStr, -days));
    onToChange(todayStr);
  };

  const controlH = compact ? 'h-6' : 'h-7';
  const dateW = compact ? 'w-[120px]' : 'w-[132px]';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={activePreset === id ? 'default' : 'outline'}
            className={cn('px-2 text-[11px]', controlH, compact && 'px-1.5')}
            onClick={() => applyPreset(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={fromId}
          className="text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0"
        >
          From
        </Label>
        <Input
          id={fromId}
          type="date"
          value={fromDate}
          max={toDate}
          className={cn(controlH, dateW, 'text-xs')}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={toId}
          className="text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0"
        >
          To
        </Label>
        <Input
          id={toId}
          type="date"
          value={toDate}
          min={fromDate}
          max={todayStr}
          className={cn(controlH, dateW, 'text-xs')}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>

      {showAsset && (
        <div className="flex items-center gap-1.5 min-w-[140px] max-w-[200px]">
          <Label
            htmlFor={assetId}
            className="text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0"
          >
            {assetLabel}
          </Label>
          <select
            id={assetId}
            className={cn(
              'w-full rounded-md border border-input bg-background px-2 text-xs',
              controlH,
            )}
            value={asset}
            onChange={(e) => onAssetChange?.(e.target.value)}
          >
            <option value="all">All {assetLabel.toLowerCase()}s</option>
            {assetNames!.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {trailing ? (
        <>
          <div className="grow basis-2 min-w-0" aria-hidden />
          <div className="flex items-center gap-2 shrink-0">{trailing}</div>
        </>
      ) : null}
    </div>
  );
}
