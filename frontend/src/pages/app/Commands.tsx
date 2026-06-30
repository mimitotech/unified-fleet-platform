import { AppLayout } from '@/components/app/AppLayout';
import { useAssets } from '@/hooks/useAssets';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';

export default function Commands() {
  const { data: assets, isLoading } = useAssets();

  function sendCommand(assetName: string, command: string) {
    toast.info(`Command "${command}" queued for ${assetName}`, {
      description: 'Remote commands require active telematics integration.',
    });
  }

  return (
    <AppLayout title="Commands" subtitle="Remote vehicle commands">
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-3">
          {(assets as Array<{ id: string; name: string; registrationPlate?: string }>)?.map((a) => (
            <div key={a.id} className="fleet-card flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.registrationPlate || '—'}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => sendCommand(a.name, 'lock')}>
                  <Lock className="w-4 h-4 mr-1" /> Lock
                </Button>
                <Button size="sm" variant="outline" onClick={() => sendCommand(a.name, 'unlock')}>
                  <Unlock className="w-4 h-4 mr-1" /> Unlock
                </Button>
                <Button size="sm" variant="default" onClick={() => sendCommand(a.name, 'locate')}>
                  <Send className="w-4 h-4 mr-1" /> Locate
                </Button>
              </div>
            </div>
          ))}
          {!assets?.length && (
            <p className="text-muted-foreground text-center py-12">No vehicles available</p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
