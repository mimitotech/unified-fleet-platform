import { useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import {
  useWorkshopKpis,
  useInspections,
  useMaintenanceLogs,
  useBreakdowns,
  useCreateInspection,
  useCreateMaintenance,
  useCreateBreakdown,
} from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { Wrench, ClipboardCheck, AlertOctagon, DollarSign, Plus, FileText } from 'lucide-react';
import { format } from 'date-fns';
import type { FleetUnit } from '@/lib/fleetUnits';
import {
  WorkshopCostingPanel,
} from '@/components/workshop/WorkshopCostingPanel';
import { WorkshopReportsInline } from '@/components/reports/moduleReportPanels';

type MaintLike = {
  vehicleName?: string;
  totalCost?: number | string;
  maintenanceType?: string;
  status?: string;
};
type BreakLike = {
  vehicleName?: string;
  totalCost?: number | string;
  severity?: string;
  status?: string;
};

function unitFields(unit: FleetUnit | null) {
  if (!unit) return {};
  return {
    vehicleId: unit.wialonId ? String(unit.wialonId) : unit.id,
    vehicleName: unit.name,
    vehiclePlate: unit.plate || '',
    assetId: unit.id,
  };
}

export default function Workshop() {
  const { data: kpis, isLoading } = useWorkshopKpis();
  const { data: inspections } = useInspections();
  const { data: maintenance } = useMaintenanceLogs();
  const { data: breakdowns } = useBreakdowns();
  const createInspection = useCreateInspection();
  const createMaintenance = useCreateMaintenance();
  const createBreakdown = useCreateBreakdown();

  const [maintOpen, setMaintOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);

  const [maintForm, setMaintForm] = useState({
    maintenanceType: 'scheduled',
    priority: 'medium',
    description: '',
    mechanicName: '',
    totalCost: '',
  });
  const [inspForm, setInspForm] = useState({
    inspectionType: 'scheduled',
    overallStatus: 'pass',
    odometerReading: '',
    inspectorName: '',
    notes: '',
  });
  const [breakForm, setBreakForm] = useState({
    severity: 'minor',
    description: '',
    cause: '',
    totalCost: '',
  });

  const submitMaintenance = () => {
    if (!selectedUnit || !maintForm.description || !maintForm.mechanicName) {
      notify.error('Select vehicle and fill required fields');
      return;
    }
    createMaintenance.mutate(
      {
        ...unitFields(selectedUnit),
        ...maintForm,
        totalCost: Number(maintForm.totalCost) || 0,
      },
      {
        onSuccess: () => {
          notify.success('Maintenance job created');
          setMaintOpen(false);
          setMaintForm({ maintenanceType: 'scheduled', priority: 'medium', description: '', mechanicName: '', totalCost: '' });
        },
        onError: (e) => notify.error('Failed', e.message),
      }
    );
  };

  const submitInspection = () => {
    if (!selectedUnit) {
      notify.error('Select a vehicle');
      return;
    }
    createInspection.mutate(
      {
        ...unitFields(selectedUnit),
        ...inspForm,
        odometerReading: Number(inspForm.odometerReading) || 0,
      },
      {
        onSuccess: () => {
          notify.success('Inspection recorded');
          setInspOpen(false);
        },
        onError: (e) => notify.error('Failed', e.message),
      }
    );
  };

  const submitBreakdown = () => {
    if (!selectedUnit || !breakForm.description) {
      notify.error('Select vehicle and describe the breakdown');
      return;
    }
    createBreakdown.mutate(
      {
        ...unitFields(selectedUnit),
        ...breakForm,
        totalCost: Number(breakForm.totalCost) || 0,
      },
      {
        onSuccess: () => {
          notify.success('Breakdown reported');
          setBreakOpen(false);
        },
        onError: (e) => notify.error('Failed', e.message),
      }
    );
  };

  return (
    <AppLayout title="Workshop" subtitle="Maintenance, inspections and breakdowns">
      <div className="space-y-6">
        <div className="stat-strip-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : (
            <>
              <MetricCard title="Pending Jobs" value={kpis?.pendingMaintenance ?? 0} icon={Wrench} variant="primary" size="xxs" />
              <MetricCard title="Completed (Month)" value={kpis?.completedThisMonth ?? 0} icon={ClipboardCheck} variant="success" size="xxs" />
              <MetricCard title="Open Breakdowns" value={kpis?.openBreakdowns ?? 0} icon={AlertOctagon} variant="destructive" size="xxs" />
              <MetricCard title="Total Cost" value={`${((kpis?.totalMaintenanceCost ?? 0) / 1000).toFixed(0)}k`} icon={DollarSign} variant="info" size="xxs" />
            </>
          )}
        </div>

        <Tabs defaultValue="maintenance">
          <TabsList>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="breakdowns">Breakdowns</TabsTrigger>
            <TabsTrigger value="costing">Costing</TabsTrigger>
            <TabsTrigger value="reports" className="gap-1">
              <FileText className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maintenance" className="fleet-card mt-4">
            <div className="flex justify-end mb-3">
              <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => setSelectedUnit(null)}>
                    <Plus className="h-4 w-4 mr-1" /> New job
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create maintenance job</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Vehicle</Label>
                      <FleetUnitSelect
                        value={selectedUnit?.id}
                        onValueChange={(_, u) => setSelectedUnit(u)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Type</Label>
                        <Select value={maintForm.maintenanceType} onValueChange={(v) => setMaintForm((f) => ({ ...f, maintenanceType: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['scheduled', 'repair', 'breakdown', 'preventive'].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Priority</Label>
                        <Select value={maintForm.priority} onValueChange={(v) => setMaintForm((f) => ({ ...f, priority: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['low', 'medium', 'high', 'critical'].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={maintForm.description} onChange={(e) => setMaintForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Mechanic</Label>
                        <Input value={maintForm.mechanicName} onChange={(e) => setMaintForm((f) => ({ ...f, mechanicName: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Est. cost</Label>
                        <Input type="number" value={maintForm.totalCost} onChange={(e) => setMaintForm((f) => ({ ...f, totalCost: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <LoadingButton loading={createMaintenance.isPending} onClick={submitMaintenance}>Create</LoadingButton>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Mechanic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(maintenance as Array<Record<string, unknown>>)?.map((m) => (
                  <TableRow key={m.id as string}>
                    <TableCell className="font-medium">{m.vehicleName as string}</TableCell>
                    <TableCell><Badge variant="outline">{m.maintenanceType as string}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{m.description as string}</TableCell>
                    <TableCell>{m.mechanicName as string}</TableCell>
                    <TableCell><Badge>{m.status as string}</Badge></TableCell>
                    <TableCell>{Number(m.totalCost).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="inspections" className="fleet-card mt-4">
            <div className="flex justify-end mb-3">
              <Dialog open={inspOpen} onOpenChange={setInspOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => setSelectedUnit(null)}>
                    <Plus className="h-4 w-4 mr-1" /> New inspection
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record inspection</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Vehicle</Label>
                      <FleetUnitSelect value={selectedUnit?.id} onValueChange={(_, u) => setSelectedUnit(u)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Type</Label>
                        <Select value={inspForm.inspectionType} onValueChange={(v) => setInspForm((f) => ({ ...f, inspectionType: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['pre-trip', 'post-trip', 'pre-delivery', 'scheduled'].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Result</Label>
                        <Select value={inspForm.overallStatus} onValueChange={(v) => setInspForm((f) => ({ ...f, overallStatus: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['pass', 'fail', 'needs-attention'].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Odometer</Label>
                        <Input type="number" value={inspForm.odometerReading} onChange={(e) => setInspForm((f) => ({ ...f, odometerReading: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Inspector</Label>
                        <Input value={inspForm.inspectorName} onChange={(e) => setInspForm((f) => ({ ...f, inspectorName: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea value={inspForm.notes} onChange={(e) => setInspForm((f) => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  <DialogFooter>
                    <LoadingButton loading={createInspection.isPending} onClick={submitInspection}>Save</LoadingButton>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inspections as Array<Record<string, unknown>>)?.map((i) => (
                  <TableRow key={i.id as string}>
                    <TableCell>{i.vehicleName as string}</TableCell>
                    <TableCell>{i.inspectionType as string}</TableCell>
                    <TableCell>{format(new Date(i.inspectionDate as string), 'dd MMM yyyy')}</TableCell>
                    <TableCell><Badge variant={i.overallStatus === 'pass' ? 'default' : 'destructive'}>{i.overallStatus as string}</Badge></TableCell>
                    <TableCell>{(i.inspectorName as string) || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="breakdowns" className="fleet-card mt-4">
            <div className="flex justify-end mb-3">
              <Dialog open={breakOpen} onOpenChange={setBreakOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => setSelectedUnit(null)}>
                    <Plus className="h-4 w-4 mr-1" /> Report breakdown
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Report breakdown</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Vehicle</Label>
                      <FleetUnitSelect value={selectedUnit?.id} onValueChange={(_, u) => setSelectedUnit(u)} />
                    </div>
                    <div>
                      <Label>Severity</Label>
                      <Select value={breakForm.severity} onValueChange={(v) => setBreakForm((f) => ({ ...f, severity: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['minor', 'major', 'critical'].map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={breakForm.description} onChange={(e) => setBreakForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Cause</Label>
                        <Input value={breakForm.cause} onChange={(e) => setBreakForm((f) => ({ ...f, cause: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Est. cost</Label>
                        <Input type="number" value={breakForm.totalCost} onChange={(e) => setBreakForm((f) => ({ ...f, totalCost: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <LoadingButton loading={createBreakdown.isPending} onClick={submitBreakdown}>Report</LoadingButton>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(breakdowns as Array<Record<string, unknown>>)?.map((b) => (
                  <TableRow key={b.id as string}>
                    <TableCell>{b.vehicleName as string}</TableCell>
                    <TableCell className="max-w-sm truncate">{b.description as string}</TableCell>
                    <TableCell><Badge variant={b.severity === 'critical' ? 'destructive' : 'outline'}>{b.severity as string}</Badge></TableCell>
                    <TableCell>{format(new Date(b.breakdownTime as string), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{Number(b.totalCost).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="costing" className="mt-4 space-y-4">
            <WorkshopCostingPanel
              maintenance={maintenance as MaintLike[]}
              breakdowns={breakdowns as BreakLike[]}
            />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <WorkshopReportsInline />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
