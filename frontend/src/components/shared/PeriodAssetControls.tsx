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
  className,
  compact,
}: {
  fromDate: string;
  toDate: string;
  todayStr: string;
  asset: string;
  assetNames: string[];
  assetLabel?: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAssetChange: (v: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const applyPreset = (p: PeriodPreset) => {
    if (p === 'today') {
      onFromChange(todayStr);
      onToChange(todayStr);
      return;
    }
    const days = p === '7d' ? 6 : p === '14d' ? 13 : 29;
    onFromChange(shiftDays(todayStr, -days));
    onToChange(todayStr);
  };

  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['today', 'Today'],
            ['7d', '7d'],
            ['14d', '14d'],
            ['30d', '30d'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant="outline"
            className={cn('h-7 px-2 text-[11px]', compact && 'h-6 px-1.5')}
            onClick={() => applyPreset(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">From</Label>
        <Input
          type="date"
          value={fromDate}
          max={toDate}
          className={cn('h-7 w-[132px] text-xs', compact && 'h-6 w-[120px]')}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">To</Label>
        <Input
          type="date"
          value={toDate}
          min={fromDate}
          max={todayStr}
          className={cn('h-7 w-[132px] text-xs', compact && 'h-6 w-[120px]')}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>
      <div className="space-y-0.5 min-w-[140px]">
        <Label className="text-[10px] text-muted-foreground">{assetLabel}</Label>
        <select
          className={cn(
            'h-7 w-full rounded-md border border-input bg-background px-2 text-xs',
            compact && 'h-6',
          )}
          value={asset}
          onChange={(e) => onAssetChange(e.target.value)}
        >
          <option value="all">All {assetLabel.toLowerCase()}s</option>
          {assetNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
