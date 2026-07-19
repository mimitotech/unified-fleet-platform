import { useMemo } from 'react';
import type { WialonProbeResult } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';

type Account = WialonProbeResult['accounts'][number];

type TreeNode = Account & { children: TreeNode[]; depth: number };

function buildTree(accounts: Account[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const a of accounts) {
    byId.set(a.id, { ...a, children: [], depth: 0 });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parentAccountId;
    const parent = parentId != null ? byId.get(parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const setDepth = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      if (n.children.length) setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

type Props = {
  accounts: Account[];
  selectedAccountId?: string;
  onSelect: (accountId: string, accountName: string) => void;
  exceptTenantId?: string;
  className?: string;
};

export function WialonAccountTreePicker({
  accounts,
  selectedAccountId,
  onSelect,
  className,
}: Props) {
  const rows = useMemo(() => {
    const tree = buildTree(accounts);
    return flatten(tree);
  }, [accounts]);

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No accounts found under this mother token.</p>;
  }

  return (
    <div className={cn('max-h-72 overflow-auto rounded-lg border divide-y', className)}>
      {rows.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(String(a.id), a.name)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors',
            selectedAccountId === String(a.id) && 'bg-primary/10'
          )}
          style={{ paddingLeft: 12 + a.depth * 16 }}
        >
          {a.depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{a.name}</div>
            <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
              <span>{a.unitCount ?? '—'} active</span>
              <span>{a.userCount ?? '—'} users</span>
              <span>ID {a.id}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {(a.unitCount != null || a.userCount != null) && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {a.unitCount ?? 0}u · {a.userCount ?? 0}usr
              </Badge>
            )}
            {a.assignedTenant && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {a.assignedTenant.tenantName}
              </Badge>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
