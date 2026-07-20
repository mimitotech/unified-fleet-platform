import { AppLayout } from '@/components/app/AppLayout';
import { useAssets } from '@/hooks/useAssets';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Container, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';
import { CHART } from '@/lib/chartColors';

export default function Trailers() {
  const { data: assets, isLoading } = useAssets();

  const trailers = (assets as Array<{ id: string; name: string; registrationPlate?: string; make?: string; model?: string }>)
    ?.filter((a) => /trailer|semi|flatbed/i.test(a.name) || /T$/i.test(a.registrationPlate || ''));

  const rows = (trailers ?? []).map((t) => ({
    name: t.name,
    plate: t.registrationPlate || '—',
    make: [t.make, t.model].filter(Boolean).join(' ') || '—',
    makeKey: t.make || 'Unknown',
    count: 1,
  }));

  return (
    <AppLayout title="Trailers" subtitle="Trailer fleet overview">
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="list">Trailers</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-0">
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="fleet-card branded-panel">
              <div className="flex items-center gap-2 mb-4">
                <Container className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-primary">Registered Trailers</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Make / Model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trailers?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.registrationPlate || '—'}</TableCell>
                      <TableCell>{[t.make, t.model].filter(Boolean).join(' ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!trailers?.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No trailers found in asset registry. Trailers appear when synced from telematics sources.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Trailers"
            title="Trailer roster"
            blurb="Registered trailers and plates."
            kpis={[{ label: 'Trailers', value: rows.length }]}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'plate', label: 'Plate' },
              { key: 'make', label: 'Make / Model' },
            ]}
            rows={rows}
            charts={{
              heading: 'Trailer performance · roster analytics',
              categoryKey: 'makeKey',
              bar: {
                title: 'Trailers by make',
                subtitle: 'Standing bars — headcount per manufacturer',
                metrics: [{ key: 'count', label: 'Trailers', color: CHART.brand }],
                topN: 8,
              },
              secondary: {
                type: 'category',
                title: 'Make mix',
                subtitle: 'Share of trailers by manufacturer',
                groupKey: 'makeKey',
                as: 'pie',
              },
            }}
          />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
