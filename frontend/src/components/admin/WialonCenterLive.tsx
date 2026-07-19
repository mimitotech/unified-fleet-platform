import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { Satellite, Send } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Props = {
  accountId?: string;
  motherId?: string;
};

export function WialonCenterLive({ accountId, motherId }: Props) {
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [sending, setSending] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wialon-center-live-units', accountId, motherId],
    queryFn: () => adminApi.getWialonCenterUnits(accountId, motherId),
    enabled: true,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const units = (data?.units || []) as Array<{
    id: number;
    name: string;
    status?: string;
    position?: { speed?: number };
    plate?: string;
  }>;

  const sendCommand = async (commandName: string) => {
    if (!selectedUnit) return;
    setSending(true);
    try {
      await adminApi.sendWialonCenterCommand(parseInt(selectedUnit, 10), commandName, accountId, motherId);
      notify.success('Command sent', commandName);
      refetch();
    } catch (e) {
      notify.error('Command failed', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Satellite className="h-4 w-4" />
                Live fleet
                {accountId && <Badge variant="outline">Account {accountId}</Badge>}
              </CardTitle>
              <CardDescription>
                Real-time units from Wialon{accountId ? ' for the selected account' : ' (mother scope)'}.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : !units.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No units visible.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Speed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.slice(0, 50).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.plate || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{u.status || '—'}</Badge></TableCell>
                    <TableCell>{u.position?.speed ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Send command</CardTitle>
          <CardDescription>Execute Wialon unit commands (block engine, locate, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[200px] flex-1">
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LoadingButton size="sm" variant="outline" loading={sending} disabled={!selectedUnit} onClick={() => sendCommand('request_position')}>
            <Send className="h-3 w-3 mr-1" /> Locate
          </LoadingButton>
          <LoadingButton size="sm" variant="outline" loading={sending} disabled={!selectedUnit} onClick={() => sendCommand('block_engine')}>
            Block engine
          </LoadingButton>
          <LoadingButton size="sm" variant="outline" loading={sending} disabled={!selectedUnit} onClick={() => sendCommand('unblock_engine')}>
            Unblock engine
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  );
}
