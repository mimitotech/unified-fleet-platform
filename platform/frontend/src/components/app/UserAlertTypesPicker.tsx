import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useWialonNotifications } from '@/hooks/useWialon';
import { ROLE_LABELS } from '@/lib/systemRoles';

export type AlertTypeSelection = { key: string; name: string };

const ADMIN_ROLES = new Set(['tenant_admin', 'platform_admin', 'super_admin']);

export function roleBypassesAlertAcl(role?: string): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

type Props = {
  role: string;
  selected: AlertTypeSelection[];
  onChange: (next: AlertTypeSelection[]) => void;
  disabled?: boolean;
};

export function UserAlertTypesPicker({ role, selected, onChange, disabled }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useWialonNotifications(true);
  const notifications = data?.notifications ?? [];
  const selectedKeys = new Set(selected.map((s) => s.key));
  const bypass = roleBypassesAlertAcl(role);

  const toggle = (item: AlertTypeSelection, checked: boolean) => {
    if (checked) {
      if (selectedKeys.has(item.key)) return;
      onChange([...selected, item]);
      return;
    }
    onChange(selected.filter((s) => s.key !== item.key));
  };

  const selectAll = () => {
    onChange(
      notifications.map((n) => ({
        key: `${n.resourceId}:${n.id}`,
        name: n.name,
      })),
    );
  };

  if (bypass) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {ROLE_LABELS[role] || role} users can see all alert types for this client. No per-type
        restriction is applied.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Alert types this user can see</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tick only the Wialon notifications this user is allowed to view in Inbox and Alert types.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || isLoading || !notifications.length}
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || !selected.length}
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : isError ? (
        <div className="space-y-2 rounded-md border border-destructive/30 px-3 py-2">
          <p className="text-sm text-destructive">Could not load alert types from Wialon.</p>
          <Button type="button" size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : !notifications.length ? (
        <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">
          No alert types are configured for this client in Wialon yet. Connect the account and add
          notifications there first.
        </p>
      ) : (
        <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
          {notifications.map((n) => {
            const key = `${n.resourceId}:${n.id}`;
            const checked = selectedKeys.has(key);
            return (
              <label
                key={key}
                className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => toggle({ key, name: n.name }, v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="font-medium block truncate">{n.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {n.resourceName}
                    {n.active === false ? ' · inactive' : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {selected.length} selected
        {selected.length === 0 ? ' — this user will not see any alerts until you enable types.' : ''}
      </p>
    </div>
  );
}
