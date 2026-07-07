import { AppLayout } from '@/components/app/AppLayout';
import { useAlerts, useAcknowledgeAlert } from '@/hooks/useAlerts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Check } from 'lucide-react';
import { WialonNotificationsPanel } from '@/components/app/WialonLivePanels';

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
  const { data: alerts, isLoading, isError, refetch } = useAlerts(100);
  const acknowledge = useAcknowledgeAlert();

  return (
    <AppLayout title="Alerts" subtitle="Unified alert inbox from all sources">
      {isError && (
        <QueryErrorBanner message="Could not load alerts." onRetry={() => refetch()} className="mb-4" />
      )}
      <WialonNotificationsPanel />
      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-3">
          {(alerts as AlertRow[])?.length === 0 && (
            <EmptyState
              icon={Bell}
              title="No alerts"
              description="Your fleet is running smoothly. New alerts from all connected sources will appear here in real time."
            />
          )}
          {(alerts as AlertRow[])?.map((alert) => (
            <div
              key={alert.id}
              className="fleet-card-hover flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium">{alert.title}</span>
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.severity}
                  </Badge>
                  <Badge variant="outline">{alert.sourceType}</Badge>
                  {alert.acknowledged && <Badge variant="outline" className="bg-success/10 text-success border-success/20">Acknowledged</Badge>}
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
                  className="border-primary/20 hover:bg-primary/5"
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
