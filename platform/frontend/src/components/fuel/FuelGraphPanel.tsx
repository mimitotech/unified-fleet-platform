/**
 * Independent Fuel Graph — prefers native Wialon report charts
 * (Processed fuel level + On/Off from render_json), then full message series.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Droplets, Loader2, RefreshCw } from 'lucide-react';
import { clientApi } from '@/lib/api';
import { FuelLevelChart } from '@/components/fuel/FuelLevelChart';
import {
  WialonProcessedFuelChart,
  chartHasWialonDatasets,
} from '@/components/fuel/WialonProcessedFuelChart';
import type { WialonReportChart, WialonReportTable } from '@/lib/reportUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { fuelTransactionsFromReportTables } from '@/lib/fuelGraphFromReport';

function chartPngSrc(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  for (const key of ['image', 'png', 'base64', 'url', 'imageUrl']) {
    const v = obj[key];
    if (typeof v === 'string' && (v.startsWith('data:image/') || /^https?:/i.test(v))) return v;
  }
  return null;
}

export type FuelGraphUnitOption = { id: number; name: string };

type Props = {
  unitOptions: FuelGraphUnitOption[];
  preferredUnitId?: number;
  fromTs: number;
  toTs: number;
  tables?: WialonReportTable[];
  charts?: WialonReportChart[];
  fallbackUnitName?: string;
};

export function FuelGraphPanel({
  unitOptions,
  preferredUnitId,
  fromTs,
  toTs,
  tables = [],
  charts = [],
  fallbackUnitName = 'Asset',
}: Props) {
  const options = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of unitOptions) {
      if (Number.isFinite(u.id) && u.id > 0) map.set(u.id, u.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [unitOptions]);

  const [unitId, setUnitId] = useState<string>('');

  useEffect(() => {
    if (!options.length) {
      setUnitId('');
      return;
    }
    setUnitId((prev) => {
      if (prev && options.some((o) => String(o.id) === prev)) return prev;
      if (preferredUnitId && options.some((o) => o.id === preferredUnitId)) {
        return String(preferredUnitId);
      }
      return String(options[0].id);
    });
  }, [options, preferredUnitId]);

  const selectedId = Number(unitId);
  const selectedName = options.find((o) => o.id === selectedId)?.name || fallbackUnitName;

  const query = useQuery({
    queryKey: ['fuel-level-series', selectedId, fromTs, toTs],
    queryFn: () => clientApi.getWialonFuelLevelSeries(selectedId, fromTs, toTs),
    enabled: Number.isFinite(selectedId) && selectedId > 0 && fromTs < toTs,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const reportFallback = useMemo(
    () => fuelTransactionsFromReportTables(tables, selectedName),
    [tables, selectedName],
  );

  const forUnitFallback = useMemo(() => {
    const matched = reportFallback.filter(
      (t) => t.unitName.trim().toLowerCase() === selectedName.trim().toLowerCase(),
    );
    return matched.length ? matched : reportFallback;
  }, [reportFallback, selectedName]);

  const wialonCharts = useMemo(
    () => charts.filter((c) => chartHasWialonDatasets(c) || Boolean(c.data)),
    [charts],
  );

  return (
    <div className="space-y-4">
      {wialonCharts.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Report charts (Wialon)</p>
            <p className="text-[11px] text-muted-foreground">
              Same processed fuel / On/Off series from the report template — zoom with the brush.
            </p>
          </div>
          {wialonCharts.map((c) => {
            if (chartHasWialonDatasets(c)) {
              return <WialonProcessedFuelChart key={`wj-${c.index}`} chart={c} />;
            }
            const img = chartPngSrc(c.data);
            if (!img) return null;
            return (
              <div key={`wp-${c.index}`} className="fleet-card p-3">
                <p className="mb-2 text-xs font-semibold">{c.name}</p>
                <img src={img} alt={c.name} className="mx-auto max-w-full rounded-md border bg-white" />
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2" data-no-print>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Unit fuel graph</p>
            <p className="text-[11px] text-muted-foreground">
              Full message history for one asset · processed level · fill / drain · On/Off when
              available
              {query.data
                ? ` · ${query.data.pointCount.toLocaleString()} points · ${query.data.fillCount} fills · ${query.data.drainCount} drains`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {options.length > 0 && (
              <Select value={unitId || undefined} onValueChange={setUnitId}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {options.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={query.isFetching || !options.length}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {!options.length ? (
          <div className="fleet-card py-12 text-center text-muted-foreground">
            <Droplets className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Select a unit to load the fuel graph</p>
          </div>
        ) : (
          <FuelLevelChart
            transactions={query.data?.points?.length ? undefined : forUnitFallback}
            seriesPoints={query.data?.points}
            vehicles={[{ name: query.data?.unitName || selectedName }]}
            isLoading={query.isLoading}
            error={query.isError ? (query.error as Error) : null}
            onRetry={() => void query.refetch()}
            fromDate={format(new Date(fromTs * 1000), 'yyyy-MM-dd')}
            toDate={format(new Date(toTs * 1000), 'yyyy-MM-dd')}
            unitLabel="Asset"
            dense
          />
        )}
      </div>
    </div>
  );
}
