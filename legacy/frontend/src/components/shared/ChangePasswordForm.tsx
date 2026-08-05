import { useState } from 'react';
import { authApi } from '@/lib/api';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notify } from '@/lib/notify';

interface ChangePasswordFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function ChangePasswordForm({ className, onSuccess }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      notify.error('Password too short', 'Use at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      notify.error('Passwords do not match', 'Confirm password must match the new password');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      notify.success('Password updated', 'Your password has been changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (err) {
      notify.error('Could not update password', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Update your sign-in password. You will stay logged in after saving.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="md:col-span-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Repeat new password"
            />
          </div>
          <div className="md:col-span-2">
            <LoadingButton type="submit" loading={loading} loadingText="Updating...">
              Update password
            </LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
