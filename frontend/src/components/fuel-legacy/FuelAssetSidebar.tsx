import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FuelAnalyticsAssetRow, WialonFuelAssetRow } from '@/lib/fuelTypes';
import { Truck, Layers, Search } from 'lucide-react';

type Props = {
  assets: WialonFuelAssetRow[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  byAsset?: FuelAnalyticsAssetRow[];
};

export function FuelAssetSidebar({ assets, selectedId, onSelect, byAsset }: Props) {
  const [q, setQ] = useState('');

  const usageByUnit = useMemo(() => {
    const m = new Map<number, FuelAnalyticsAssetRow>();
    for (const a of byAsset ?? []) m.set(a.unitId, a);
    return m;
  }, [byAsset]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return assets;
    return assets.filter(
      (a) => a.name.toLowerCase().includes(s) || (a.plate || '').toLowerCase().includes(s)
    );
  }, [assets, q]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/20">
      <div className="p-2 border-b space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Truck className="h-3.5 w-3.5 text-primary" />
          Assets ({assets.length})
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-[10px]"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors',
            selectedId === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">All fleet</div>
          </div>
        </button>
        {filtered.map((a) => {
          const usage = usageByUnit.get(a.unitId);
          return (
            <button
              key={a.unitId}
              type="button"
              title={a.name}
              onClick={() => onSelect(a.unitId)}
              className={cn(
                'w-full text-left px-2.5 py-2 rounded text-xs transition-colors',
                selectedId === a.unitId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              <div className="font-medium text-xs leading-snug break-words">{a.name}</div>
              <div
                className={cn(
                  'text-[10px] flex justify-between gap-2 mt-0.5',
                  selectedId === a.unitId ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                <span className="break-words min-w-0">{a.plate || a.assetType}</span>
                <span className="tabular-nums shrink-0">
                  {usage ? `${usage.consumed}L` : a.fuelLiters != null ? `${a.fuelLiters}L` : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
