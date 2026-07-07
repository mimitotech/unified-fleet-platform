import { Link } from 'react-router-dom';
import { Plug, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModuleAccess } from '@/hooks/useModules';
import { useWialonContext } from '@/hooks/useWialon';
import { cn } from '@/lib/utils';

type Props = {
  moduleKey: string;
  className?: string;
};

/** Shown when a module is enabled but its required integrations are not connected. */
export function ModuleIntegrationBanner({ moduleKey, className }: Props) {
  const { mod, integrationReady } = useModuleAccess(moduleKey);
  const { connected, configured } = useWialonContext();

  if (!mod || integrationReady) return null;

  const needsWialon = (mod.sources || []).includes('wialon');
  const wialonOk = !needsWialon || (configured && connected);

  if (wialonOk) return null;

  const sources = (mod.sources || []).filter(Boolean).join(', ') || 'integrations';

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Plug className="h-4 w-4 text-amber-600 shrink-0" />
        <span>
          <strong>{mod.label}</strong> needs a connected data source ({sources}).
          {configured && !connected ? ' Wialon is configured but not connected.' : ''}
        </span>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/app/settings?tab=wialon">
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Connect integrations
        </Link>
      </Button>
    </div>
  );
}
