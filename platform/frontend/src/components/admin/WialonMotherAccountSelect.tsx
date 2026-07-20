import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const WIALON_POLL_MS = 60_000;

type Props = {
  value?: string;
  onChange: (motherId: string) => void;
  className?: string;
};

export function WialonMotherAccountSelect({ value, onChange, className }: Props) {
  const didAutoSelect = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['wialon-mother-accounts'],
    queryFn: () => adminApi.listWialonMotherAccounts(),
    staleTime: WIALON_POLL_MS,
    refetchInterval: WIALON_POLL_MS,
  });

  const mothers = data?.mothers || [];

  useEffect(() => {
    if (value || !mothers.length || didAutoSelect.current) return;
    didAutoSelect.current = true;
    onChange(mothers[0].id);
  }, [mothers, value, onChange]);

  if (isLoading) return <Skeleton className="h-9 w-full" />;

  if (!mothers.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No mother accounts yet.{' '}
        <Link to="/admin/wialon" className="text-primary hover:underline">
          Add one in Wialon Center
        </Link>
        .
      </p>
    );
  }

  const selected = value || mothers[0]?.id;

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">Mother account (token source)</Label>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select mother account" />
        </SelectTrigger>
        <SelectContent>
          {mothers.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className="flex items-center gap-2 flex-wrap">
                {m.name}
                {m.connected ? (
                  <Badge variant="outline" className="text-[10px] text-green-700">
                    OK
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-destructive">
                    Error
                  </Badge>
                )}
                {m.counts && (
                  <span className="text-muted-foreground text-[10px]">
                    {m.counts.units ?? '—'} units · {m.counts.accounts ?? '—'} accts
                  </span>
                )}
                <span className="text-muted-foreground text-[10px]">
                  {m.linkedTenantCount} tenant{m.linkedTenantCount === 1 ? '' : 's'}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
