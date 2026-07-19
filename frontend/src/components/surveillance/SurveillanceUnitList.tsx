import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { WialonVideoUnit } from '@/lib/api';
import { cn } from '@/lib/utils';

function UnitListItem({
  unit,
  selected,
  onSelect,
}: {
  unit: WialonVideoUnit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-2.5 rounded-lg border transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 rounded-full shrink-0',
            unit.connected ? 'bg-status-moving' : 'bg-muted-foreground'
          )}
        />
        <p className="font-medium text-sm truncate flex-1">{unit.name}</p>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {unit.cameraCount ?? unit.cameras?.length ?? 0} cam
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate pl-4">
        {unit.hwType || unit.uniqueId || `ID ${unit.id}`}
      </p>
    </button>
  );
}

type Props = {
  units: WialonVideoUnit[];
  filtered: WialonVideoUnit[];
  selectedId: number | null;
  isLoading?: boolean;
  isFetching?: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (unit: WialonVideoUnit) => void;
};

export function SurveillanceUnitList({
  units,
  filtered,
  selectedId,
  isLoading,
  isFetching,
  query,
  onQueryChange,
  onSelect,
}: Props) {
  const onlineCount = units.filter((u) => u.connected).length;

  return (
    <div className="fleet-card p-3 flex flex-col max-h-[75vh]">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search units…"
          className="pl-8 h-9"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        {filtered.length} video units · {onlineCount} online
        {isFetching && units.length ? ' · refreshing…' : ''}
      </p>
      <div className="flex-1 overflow-auto space-y-1">
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)
        ) : filtered.length ? (
          filtered.map((u) => (
            <UnitListItem
              key={u.id}
              unit={u}
              selected={selectedId === u.id}
              onSelect={() => onSelect(u)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No video units. Ask your administrator to enable video monitoring and configure cameras.
          </p>
        )}
      </div>
    </div>
  );
}
