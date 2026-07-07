import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ROLE_LABELS } from '@/lib/systemRoles';
import { ROLE_ACCESS, modulesApplyToRole } from '@/lib/userAccess';
import type { TenantModule } from '@/lib/api';

type Props = {
  role: string;
  onRoleChange: (role: string) => void;
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  modules: string[];
  onModulesChange: (modules: string[]) => void;
  tenantModules?: TenantModule[];
  showActive?: boolean;
};

export function UserAccessEditor({
  role,
  onRoleChange,
  isActive,
  onActiveChange,
  modules,
  onModulesChange,
  tenantModules = [],
  showActive = true,
}: Props) {
  const access = ROLE_ACCESS[role];
  const enabledTenantModules = tenantModules.filter((m) => m.isEnabled);
  const showModuleOverrides = modulesApplyToRole(role) && enabledTenantModules.length > 0;

  const toggleModule = (key: string, checked: boolean) => {
    onModulesChange(checked ? [...new Set([...modules, key])] : modules.filter((m) => m !== key));
  };

  const applyRoleDefaults = () => {
    const defaults = ROLE_ACCESS[role];
    if (defaults?.modules === '*') {
      onModulesChange([]);
      return;
    }
    const allowed = new Set(defaults?.modules || []);
    onModulesChange(enabledTenantModules.map((m) => m.moduleKey).filter((k) => allowed.has(k)));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Role & access level</Label>
        <Select value={role} onValueChange={onRoleChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(ROLE_ACCESS).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {access && (
          <p className="text-xs text-muted-foreground">{access.description}</p>
        )}
        {access && (
          <div className="flex flex-wrap gap-1 pt-1">
            {access.canWrite && <Badge variant="outline" className="text-[10px]">Can edit</Badge>}
            {access.canCommand && <Badge variant="outline" className="text-[10px]">Can send commands</Badge>}
            {!access.canWrite && <Badge variant="secondary" className="text-[10px]">Read-only</Badge>}
          </div>
        )}
      </div>

      {showActive && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Account active</Label>
            <p className="text-xs text-muted-foreground">Inactive users cannot sign in.</p>
          </div>
          <Switch checked={isActive} onCheckedChange={onActiveChange} />
        </div>
      )}

      {showModuleOverrides && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-sm">Module overrides</Label>
              <p className="text-xs text-muted-foreground">
                Optional per-user limits within this role. Leave empty to use role defaults.
              </p>
            </div>
            <button type="button" className="text-xs text-primary hover:underline shrink-0" onClick={applyRoleDefaults}>
              Apply role defaults
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
            {enabledTenantModules.map((m) => {
              const roleAllows =
                access?.modules === '*' ||
                (Array.isArray(access?.modules) && access.modules.includes(m.moduleKey));
              if (!roleAllows) return null;
              return (
                <div key={m.moduleKey} className="flex items-center gap-2">
                  <Checkbox
                    id={`mod-${m.moduleKey}`}
                    checked={modules.includes(m.moduleKey)}
                    onCheckedChange={(c) => toggleModule(m.moduleKey, Boolean(c))}
                  />
                  <Label htmlFor={`mod-${m.moduleKey}`} className="text-xs font-normal">
                    {m.label || m.moduleKey}
                  </Label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
