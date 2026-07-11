import { useFuelReportCapabilities } from '@/hooks/useFuelReportCapabilities';
import { cn } from '@/lib/utils';
import { CheckCircle2, CircleAlert, Truck, Zap } from 'lucide-react';

const SLOT_META: Record<
  string,
  { icon: typeof Truck; familyLabel: string; roleLabel: string }
> = {
  'vehicle.group': { icon: Truck, familyLabel: 'Vehicles', roleLabel: 'Group' },
  'vehicle.unit': { icon: Truck, familyLabel: 'Vehicles', roleLabel: 'Unit' },
  'generator.group': { icon: Zap, familyLabel: 'Generators', roleLabel: 'Gensets' },
  'generator.unit': { icon: Zap, familyLabel: 'Generators', roleLabel: 'Units' },
};

/**
 * Shows the four canonical Wialon fuel reports each tenant should have:
 *   Fuel Report(Group) · Fuel Report(Unit)
 *   Fuel Usage Report(Gensets) · Fuel Usage Report(Units)
 */
export function FuelReportCoverageStrip() {
  const { data, isLoading } = useFuelReportCapabilities();
  if (isLoading || !data?.slots?.length) return null;

  const ready = data.readyCount ?? data.slots.filter((s) => s.available).length;
  const total = data.slots.length;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-tight">Wialon fuel reports</p>
          <p className="text-[11px] text-muted-foreground">
            {ready}/{total} canonical templates linked
            {data.uniform ? ' · uniform setup complete' : ' · create missing reports in Wialon'}
          </p>
        </div>
        {!data.uniform && data.missingReports?.length > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 max-w-md text-right">
            Missing: {data.missingReports.join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {data.slots.map((slot) => {
          const meta = SLOT_META[slot.key] ?? {
            icon: CircleAlert,
            familyLabel: slot.family,
            roleLabel: slot.role,
          };
          const Icon = meta.icon;
          return (
            <div
              key={slot.key}
              className={cn(
                'rounded-lg border px-3 py-2 space-y-1 transition-colors',
                slot.available
                  ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                  : 'border-amber-500/30 bg-amber-500/[0.06]',
              )}
              title={
                slot.available
                  ? `Matched: ${slot.matchedName}`
                  : `Create "${slot.expectedName}" in Wialon for this client`
              }
            >
              <div className="flex items-center gap-1.5">
                {slot.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <CircleAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-medium truncate">
                  {meta.familyLabel} · {meta.roleLabel}
                </span>
              </div>
              <p className="text-xs font-semibold leading-snug truncate">{slot.expectedName}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {slot.available ? `Using: ${slot.matchedName}` : 'Not found on this account'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
