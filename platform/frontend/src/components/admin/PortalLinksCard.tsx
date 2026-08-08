import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notify';
import { getAdminUrl, getClientLoginUrl, getClientPortalUrl } from '@/lib/portalUrl';
import { getToken, setAuth } from '@/lib/api';
import { Copy, ExternalLink } from 'lucide-react';

type Props = {
  slug?: string;
  className?: string;
};

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success('Copied', label);
  } catch {
    notify.error('Copy failed', 'Select and copy the link manually');
  }
}

function openClientApp(slug: string) {
  const trimmed = slug.trim();
  if (!trimmed) {
    notify.error('Missing slug', 'Save the client slug before opening the app');
    return;
  }
  const token = getToken();
  if (token) setAuth(token, trimmed);
  window.open(getClientPortalUrl(trimmed), '_blank', 'noopener,noreferrer');
}

export function PortalLinksCard({ slug, className }: Props) {
  const loginUrl = getClientLoginUrl();
  const adminUrl = getAdminUrl();
  const portalUrl = slug ? getClientPortalUrl(slug) : '';

  return (
    <div className={className}>
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Client login (share with users)</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={loginUrl} className="font-mono text-xs h-9" />
            <Button type="button" size="icon" variant="outline" className="shrink-0 h-9 w-9" onClick={() => copyText(loginUrl, 'Login URL')}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" variant="outline" className="shrink-0 h-9 w-9" asChild>
              <a href={loginUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        {slug && (
          <div>
            <Label className="text-xs text-muted-foreground">Client slug</Label>
            <p className="text-sm font-mono mt-1">{slug}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Used when platform staff open the client app via View Client.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {slug && (
            <Button size="sm" variant="secondary" type="button" onClick={() => openClientApp(slug)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open client app
            </Button>
          )}
          <a href={adminUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" type="button">
              Admin panel
            </Button>
          </a>
        </div>

        {portalUrl && (
          <p className="text-[10px] text-muted-foreground font-mono break-all">{portalUrl}</p>
        )}

        <p className="text-[10px] text-muted-foreground border-t pt-2">
          App: <code className="text-[10px]">{typeof window !== 'undefined' ? window.location.origin : '(browser)'}</code>
          {' · '}API:{' '}
          <code className="text-[10px]">
            {import.meta.env.VITE_API_URL ? String(import.meta.env.VITE_API_URL) : '(same origin)'}
          </code>
        </p>
      </div>
    </div>
  );
}
