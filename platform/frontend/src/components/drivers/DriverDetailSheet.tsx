import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LoadingButton } from '@/components/shared/LoadingButton';
import type { DriverDetail, DriverPenaltyConfig } from '@/lib/api';
import { safeArray } from '@/lib/safeArray';
import { cn } from '@/lib/utils';
import {
  Award, Car, CreditCard, Mail, Pencil, Phone, RefreshCw, Trash2, User,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  available: 'bg-success/15 text-success',
  driving: 'bg-info/15 text-info',
  'off-duty': 'bg-muted text-muted-foreground',
};

const gradeColors: Record<string, string> = {
  good: 'bg-success/15 text-success border-success/30',
  bad: 'bg-warning/15 text-warning border-warning/30',
  ugly: 'bg-destructive/15 text-destructive border-destructive/30',
};

function licenseState(expiryRaw?: string | null): { label: string; className: string } | null {
  if (!expiryRaw) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(`${expiryRaw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return null;
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, className: 'bg-destructive/15 text-destructive' };
  if (days <= 30) return { label: `Expires in ${days}d`, className: 'bg-warning/15 text-warning' };
  return { label: 'Valid', className: 'bg-success/15 text-success' };
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: ReactNode; icon?: typeof User }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{value || '—'}</div>
      </div>
    </div>
  );
}

type ViolationRow = {
  id: string;
  occurredAt?: string;
  violationType: string;
  severity?: string;
  unitName?: string;
  source?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverDetail | null;
  loading: boolean;
  violations: ViolationRow[];
  violationsLoading?: boolean;
  penaltyConfig?: DriverPenaltyConfig | null;
  onEdit: () => void;
  onRecompute: () => void;
  onRemove: () => void;
  recomputePending?: boolean;
};

export function DriverDetailSheet({
  open,
  onOpenChange,
  driver,
  loading,
  violations,
  violationsLoading,
  penaltyConfig,
  onEdit,
  onRecompute,
  onRemove,
  recomputePending,
}: Props) {
  const score = driver?.safetyScore ?? driver?.projectedScore;
  const grade = String(driver?.grade || driver?.projectedGrade || '').toLowerCase();
  const license = licenseState(driver?.licenseExpiryDate);
  const windowDays = driver?.scoringWindowDays ?? 30;
  const breakdown = driver?.violationBreakdown || {};
  const baseScore = penaltyConfig?.baseScore ?? 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : driver ? (
          <>
            <div className="border-b bg-muted/30 px-6 pt-6 pb-5">
              <SheetHeader className="text-left space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                    {(driver.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-xl leading-tight">{driver.name}</SheetTitle>
                    <SheetDescription className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge className={statusColors[driver.status] || ''}>{driver.status}</Badge>
                      {driver.wialonDriverId ? (
                        <Badge variant="outline" className="text-[10px]">Fleet linked</Badge>
                      ) : null}
                      {license ? <Badge className={license.className}>{license.label}</Badge> : null}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className={cn('rounded-lg border px-3 py-2 text-center', gradeColors[grade] || 'border-border')}>
                  <p className="text-[10px] uppercase tracking-wide opacity-80">Grade</p>
                  <p className="text-lg font-bold capitalize">{grade || '—'}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</p>
                  <p className="text-lg font-bold tabular-nums">{score ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Penalties</p>
                  <p className="text-lg font-bold tabular-nums text-destructive">
                    {driver.penaltyPoints != null ? `−${driver.penaltyPoints}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Violations</p>
                  <p className="text-lg font-bold tabular-nums">{driver.violationsCount ?? 0}</p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground mt-3">
                Scores use violations on the assigned vehicle only · last {windowDays} days
                {driver.snapshotDate ? ` · updated ${String(driver.snapshotDate).slice(0, 10)}` : ''}
              </p>
            </div>

            <div className="p-6 space-y-5">
              <section className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Contact &amp; license
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow label="License number" value={driver.licenseNumber} />
                  <InfoRow label="Permit class" value={driver.permitClass} />
                  <InfoRow
                    label="License expiry"
                    value={
                      driver.licenseExpiryDate
                        ? String(driver.licenseExpiryDate).slice(0, 10)
                        : 'Not set'
                    }
                  />
                  <InfoRow label="Phone" value={driver.phone} icon={Phone} />
                  <InfoRow label="Email" value={driver.email} icon={Mail} />
                  <InfoRow
                    label="Fuel card"
                    value={driver.fuelCardNumber}
                    icon={CreditCard}
                  />
                  <InfoRow
                    label="Hire date"
                    value={driver.hireDate ? String(driver.hireDate).slice(0, 10) : undefined}
                  />
                </div>
              </section>

              <section className="rounded-lg border p-4 space-y-2">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" /> Assigned vehicle
                </h4>
                {driver.assignedAssetId ? (
                  <div className="rounded-md bg-muted/40 px-3 py-2.5">
                    <p className="font-semibold">
                      {driver.assignedAssetPlate || driver.assignedAssetName || 'Assigned unit'}
                    </p>
                    {driver.assignedAssetName && driver.assignedAssetPlate ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{driver.assignedAssetName}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{driver.tripsCount ?? 0} trips</span>
                      <span>{Number(driver.totalDistance ?? 0).toLocaleString()} km</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No vehicle assigned — assign a unit to score violations from that asset.
                  </p>
                )}
              </section>

              {Object.keys(breakdown).length > 0 && (
                <section className="rounded-lg border p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" /> Penalty breakdown
                  </h4>
                  <div className="text-xs text-muted-foreground mb-1">
                    Base score {baseScore} minus penalties below
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => {
                        const pts = penaltyConfig?.penalties?.[type] ?? 0;
                        const total = count * pts;
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between text-sm border rounded px-2.5 py-1.5"
                          >
                            <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {count}×{pts > 0 ? ` −${total}` : ''}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </section>
              )}

              <section className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Violations ({windowDays} days)</h4>
                {violationsLoading ? (
                  <Skeleton className="h-32" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeArray(violations).slice(0, 20).map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-xs capitalize">
                            {String(v.violationType || '').replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {v.source === 'alert' ? 'Camera / alert' : 'Eco-driving'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!safeArray(violations).length && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-xs">
                            {driver.assignedAssetId
                              ? 'No violations on the assigned vehicle in this period'
                              : 'Assign a vehicle to see asset violations'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </section>

              <div className="flex flex-wrap gap-2 pt-1">
                <LoadingButton size="sm" loading={recomputePending} onClick={onRecompute}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Recompute score
                </LoadingButton>
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit driver
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={onRemove}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Driver not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
