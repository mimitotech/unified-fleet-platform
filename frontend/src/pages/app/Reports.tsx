import { useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { useReportTypes } from '@/hooks/useDomain';
import { clientApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

function toCsv(data: Record<string, unknown>[]): string {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { data: types, isLoading } = useReportTypes();
  const [generating, setGenerating] = useState<string | null>(null);

  async function generateReport(type: string, label: string, format: string) {
    setGenerating(type);
    try {
      const data = await clientApi.getReportData(type);
      if (format === 'csv' && Array.isArray(data)) {
        const csv = toCsv(data as Record<string, unknown>[]);
        downloadFile(csv, `${type}-report.csv`, 'text/csv');
        toast.success(`${label} downloaded`);
      } else {
        downloadFile(JSON.stringify(data, null, 2), `${type}-report.json`, 'application/json');
        toast.success(`${label} downloaded`);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate report');
    } finally {
      setGenerating(null);
    }
  }

  return (
    <AppLayout title="Reports" subtitle="Exportable fleet reports">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-32" />)
        ) : (
          types?.map((t) => (
            <div key={t.id} className="fleet-card flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <FileText className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold">{t.label}</h3>
                  <p className="text-sm text-muted-foreground uppercase">{t.format}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-auto"
                disabled={generating === t.id}
                onClick={() => generateReport(t.id, t.label, t.format)}
              >
                <Download className="w-4 h-4 mr-2" />
                {generating === t.id ? 'Generating…' : 'Download'}
              </Button>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
