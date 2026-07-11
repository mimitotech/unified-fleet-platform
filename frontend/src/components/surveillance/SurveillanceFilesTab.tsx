import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Download, Link2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSurveillanceUnitFiles } from '@/hooks/useWialonVideo';
import { clientApi, type WialonVideoFile, type WialonVideoUnit } from '@/lib/api';
import { notify } from '@/lib/notify';
import { safeArray } from '@/lib/safeArray';

type Props = {
  unit: WialonVideoUnit;
  onPreview: (file: WialonVideoFile) => void;
};

export function SurveillanceFilesTab({ unit, onPreview }: Props) {
  const [fromLocal, setFromLocal] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toLocal, setToLocal] = useState(() => new Date().toISOString().slice(0, 10));
  const [sharingId, setSharingId] = useState<string | null>(null);

  const fromMs = new Date(`${fromLocal}T00:00:00`).getTime();
  const toMs = new Date(`${toLocal}T23:59:59`).getTime();

  const { data: files, isLoading } = useSurveillanceUnitFiles(unit.id, fromMs, toMs);
  const fileList = safeArray<WialonVideoFile>(files);

  const downloadFile = async (file: WialonVideoFile) => {
    if (file.source !== 'storage' || !file.path) return;
    try {
      const blob = await clientApi.fetchSurveillanceFileBlob(unit.id, file.path, file.storageType ?? 2);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error('Download failed', (e as Error).message);
    }
  };

  const shareFile = async (file: WialonVideoFile) => {
    if (file.source === 'storage' && !file.path) return;
    if (file.source === 'message' && file.messageId == null) return;
    setSharingId(file.id);
    try {
      const link = await clientApi.createSurveillanceShareLink({
        unitId: unit.id,
        source: file.source === 'message' ? 'message' : 'storage',
        path: file.path || undefined,
        storageType: file.storageType,
        messageId: file.messageId,
        label: file.name,
      });
      await navigator.clipboard.writeText(link.shareUrl);
      notify.success('Share link copied', 'Link expires in 72 hours by default.');
    } catch (e) {
      notify.error('Share failed', (e as Error).message);
    } finally {
      setSharingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : fileList.length ? (
        <ul className="space-y-2">
          {fileList.map((f) => (
            <li key={f.id} className="fleet-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.eventType || f.tag || f.source}
                  {f.occurredAt
                    ? ` · ${formatDistanceToNow(new Date(f.occurredAt), { addSuffix: true })}`
                    : ''}
                  {f.sizeBytes ? ` · ${(f.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline">{f.source}</Badge>
                {(f.source === 'storage' && f.path) || (f.source === 'message' && f.messageId != null) ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onPreview(f)}>
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sharingId === f.id}
                      onClick={() => shareFile(f)}
                      title="Copy share link"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
                {f.source === 'storage' && f.path ? (
                  <Button size="sm" variant="ghost" onClick={() => downloadFile(f)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="fleet-card p-8 text-center text-muted-foreground text-sm">
          No saved video files in this date range.
        </div>
      )}
    </div>
  );
}
