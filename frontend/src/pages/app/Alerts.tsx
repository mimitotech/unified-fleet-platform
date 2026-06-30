import { AppLayout } from '@/components/app/AppLayout';
import { useAlerts, useAcknowledgeAlert } from '@/hooks/useAlerts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Check } from 'lucide-react';

interface AlertRow {
  id: string;
  title: string;
  description?: string;
  severity: string;
  sourceType: string;
  timestamp: string;
  acknowledged?: boolean;
}

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts(100);
  const acknowledge = useAcknowledgeAlert();

  return (
    <AppLayout title="Alerts" subtitle="Unified alert inbox from all sources">
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-3">
          {(alerts as AlertRow[])?.length === 0 && (
            <p className="text-muted-foreground text-center py-12">No alerts yet</p>
          )}
          {(alerts as AlertRow[])?.map((alert) => (
            <div
              key={alert.id}
              className="fleet-card flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium">{alert.title}</span>
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.severity}
                  </Badge>
                  <Badge variant="outline">{alert.sourceType}</Badge>
                  {alert.acknowledged && <Badge variant="outline">Acknowledged</Badge>}
                </div>
                {alert.description && (
                  <p className="text-sm text-muted-foreground">{alert.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                </p>
              </div>
              {!alert.acknowledged && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledge.mutate(alert.id)}
                  disabled={acknowledge.isPending}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Acknowledge
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
