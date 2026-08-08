import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { clientApi, getTenantSlug } from '@/lib/api';
import { categoryLabel } from '@/lib/alertCategories';
import { formatDistanceToNow } from 'date-fns';

function LiveHeader({
  title,
  description,
  count,
  icon: Icon,
}: {
  title: string;
  description: string;
  count?: number;
  icon: typeof Bell;
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {count != null && (
            <Badge variant="secondary" className="tabular-nums">
              {count}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/** Alert types tab — click a type to open Inbox filtered to that type only. */
export function AlertTypesPanel() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['alert-types', getTenantSlug() || 'default'],
    queryFn: () => clientApi.getAlertTypes(),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const types = data?.types ?? [];
  const totalEvents = useMemo(
    () => types.reduce((sum, t) => sum + (t.eventCount || 0), 0),
    [types],
  );
  const groupCount = useMemo(
    () => new Set(types.map((t) => t.category || 'other')).size,
    [types],
  );

  const openType = (key: string, name: string) => {
    const q = new URLSearchParams({
      tab: 'inbox',
      alertType: key,
      alertTypeName: name,
    });
    navigate(`/app/alerts?${q.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <LiveHeader
          title="Alert types"
          description="Every alert this client receives, listed by name and grouped like Inbox. Click a type to view only those alerts."
          count={data?.count}
          icon={Bell}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <div className="branded-panel px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total types</p>
          <p className="text-lg font-semibold tabular-nums leading-tight">{data?.count ?? '—'}</p>
        </div>
        <div className="branded-panel px-3 py-2 border-l-[3px] border-l-primary">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Events</p>
          <p className="text-lg font-semibold tabular-nums leading-tight">
            {isLoading ? '—' : totalEvents}
          </p>
        </div>
        <div className="branded-panel px-3 py-2 col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Groups</p>
          <p className="text-lg font-semibold tabular-nums leading-tight">
            {isLoading ? '—' : groupCount}
          </p>
        </div>
      </div>

      <div className="branded-panel p-3">
        {isLoading ? (
          <Skeleton className="h-28" />
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">Could not load alert types.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !types.length ? (
          <p className="text-sm text-muted-foreground">
            No alert types yet. When events appear in Inbox, their types are listed here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alert type</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow
                    key={t.key}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openType(t.key, t.name)}
                  >
                    <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                      {t.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.categoryLabel || categoryLabel(t.category)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.eventCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.lastSeen
                        ? formatDistanceToNow(new Date(t.lastSeen), { addSuffix: true })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
