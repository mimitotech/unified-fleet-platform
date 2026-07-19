import { AdminLayout } from '@/components/admin/AdminLayout';
import { ChangePasswordForm } from '@/components/shared/ChangePasswordForm';
import { useAuth } from '@/providers/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/lib/systemRoles';

export default function AdminAccountPage() {
  const { user } = useAuth();

  return (
    <AdminLayout title="My Account" subtitle="Profile and security">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Name:</span> {user?.fullName}</p>
            <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Role:</span>
              <Badge variant="outline">{ROLE_LABELS[user?.role || ''] || user?.role}</Badge>
            </p>
          </CardContent>
        </Card>

        <ChangePasswordForm />
      </div>
    </AdminLayout>
  );
}
