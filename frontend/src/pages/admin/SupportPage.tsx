import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminSupportPage() {
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
          <CardHeader><CardTitle>Demo Credentials</CardTitle></CardHeader>
          <CardContent className="text-sm font-mono space-y-1">
            <p>Platform Admin: admin@ufp.local / admin123</p>
            <p>Client Admin: demo@mimito.ug / demo123 (slug: demo)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Webhook URLs</CardTitle></CardHeader>
          <CardContent className="text-sm font-mono space-y-1">
            <p>LocoNav: POST /api/webhooks/loconav/:tenantSlug</p>
            <p>TrackSolid: POST /api/webhooks/tracksolid/:tenantSlug</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
