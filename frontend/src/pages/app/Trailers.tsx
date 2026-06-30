import { AppLayout } from '@/components/app/AppLayout';
import { useAssets } from '@/hooks/useAssets';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Container } from 'lucide-react';

export default function Trailers() {
  const { data: assets, isLoading } = useAssets();

  const trailers = (assets as Array<{ id: string; name: string; registrationPlate?: string; make?: string; model?: string }>)
    ?.filter((a) => /trailer|semi|flatbed/i.test(a.name) || /T$/i.test(a.registrationPlate || ''));

  return (
    <AppLayout title="Trailers" subtitle="Trailer fleet overview">
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="fleet-card">
          <div className="flex items-center gap-2 mb-4">
            <Container className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Registered Trailers</h3>
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
    </AppLayout>
  );
}
