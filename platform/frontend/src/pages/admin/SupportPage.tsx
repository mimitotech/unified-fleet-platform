import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminSupportPage() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <AdminLayout title="Support" subtitle="Help and documentation">
      <div className="grid gap-4 max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Getting Started</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Create a client under Clients → New Client</p>
            <p>2. Configure Wialon, LocoNav, or TrackSolid under the client Integrations tab</p>
            <p>3. Enable modules and set branding</p>
            <p>4. Create client users and share login credentials</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Webhook URLs</CardTitle></CardHeader>
          <CardContent className="text-sm font-mono space-y-1 break-all">
            <p>LocoNav: POST {origin}/api/webhooks/loconav/:tenantSlug</p>
            <p>TrackSolid: POST {origin}/api/webhooks/tracksolid/:tenantSlug</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
