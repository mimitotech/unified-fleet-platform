import { MoreVertical, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type PeriodPreset, shiftDays } from '@/components/shared/PeriodAssetControls';
import {
  DASHBOARD_WIDGET_DEFS,
  type DashboardWidgetId,
  type DashboardWidgetVisibility,
} from '@/lib/dashboardWidgetPrefs';
import { cn } from '@/lib/utils';

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '30d', label: '30d' },
];

export function DashboardToolbar({
  todayStr,
  draftFrom,
  draftTo,
  draftPreset,
  onDraftFrom,
  onDraftTo,
  onDraftPreset,
  onExecute,
  visibility,
  onToggleWidget,
  enabledModules,
  isAdmin,
}: {
  todayStr: string;
  draftFrom: string;
  draftTo: string;
  draftPreset: PeriodPreset | 'custom';
  onDraftFrom: (v: string) => void;
  onDraftTo: (v: string) => void;
  onDraftPreset: (p: PeriodPreset | 'custom') => void;
  onExecute: () => void;
  visibility: DashboardWidgetVisibility;
  onToggleWidget: (id: DashboardWidgetId, next: boolean) => void;
  enabledModules: Set<string>;
  isAdmin: boolean;
}) {
  const applyPreset = (p: PeriodPreset) => {
    onDraftPreset(p);
    if (p === 'today') {
      onDraftFrom(todayStr);
      onDraftTo(todayStr);
      return;
    }
    const days = p === '7d' ? 6 : p === '14d' ? 13 : 29;
    onDraftFrom(shiftDays(todayStr, -days));
    onDraftTo(todayStr);
  };

  const menuItems = DASHBOARD_WIDGET_DEFS.filter((def) => {
    if (def.id === 'users_by_role') return isAdmin;
    if (!def.module) return true;
    return enabledModules.has(def.module);
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={draftPreset === id ? 'default' : 'outline'}
            className="h-7 px-2 text-[11px]"
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
          value={draftFrom}
          max={draftTo}
          className="h-7 w-[132px] text-xs"
          onChange={(e) => {
            onDraftPreset('custom');
            onDraftFrom(e.target.value);
          }}
        />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">To</Label>
        <Input
          type="date"
          value={draftTo}
          min={draftFrom}
          max={todayStr}
          className="h-7 w-[132px] text-xs"
          onChange={(e) => {
            onDraftPreset('custom');
            onDraftTo(e.target.value);
          }}
        />
      </div>
      <Button type="button" size="sm" className="h-7 gap-1 text-[11px]" onClick={onExecute}>
        <Play className="h-3 w-3" />
        Execute
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 ml-auto"
            aria-label="Customize charts"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-h-[min(70vh,420px)] overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Chart widgets</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {menuItems.map((def) => (
            <DropdownMenuCheckboxItem
              key={def.id}
              checked={visibility[def.id] !== false}
              onCheckedChange={(checked) => onToggleWidget(def.id, Boolean(checked))}
              onSelect={(e) => e.preventDefault()}
              className={cn('text-xs')}
            >
              {def.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
