import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogIn } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      localStorage.setItem('ufp_tenant_slug', tenantSlug);
      const user = JSON.parse(atob(localStorage.getItem('ufp_token')!.split('.')[1]));
      navigate(user.role === 'platform_admin' ? '/admin' : '/app/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <div className="w-full max-w-md fleet-card p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Unified Fleet Platform</h1>
        <p className="text-muted-foreground text-center text-sm mb-6">Sign in to your tenant</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Tenant slug" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
