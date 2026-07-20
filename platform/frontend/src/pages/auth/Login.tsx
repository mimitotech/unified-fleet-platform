import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { MamsLogo } from '@/components/shared/MamsLogo';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import { notify } from '@/lib/notify';
import { BRAND } from '@/lib/branding';
import { postLoginPath } from '@/lib/authRedirect';
import { MamsBrandName } from '@/components/shared/MamsBrandName';

const QUICK_ACCOUNTS = [
  { label: 'Super Admin', email: 'super@mimito.ug', password: 'super123' },
  { label: 'Platform Admin', email: 'admin@ufp.local', password: 'admin123' },
  { label: 'Demo Client', email: 'demo@mimito.ug', password: 'demo123' },
  { label: 'Nsamba Motors', email: 'nsambajunior190@gmail.com', password: 'client123' },
] as const;

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      localStorage.removeItem('ufp_tenant_slug');
      const user = await signIn(email.trim(), password);
      notify.success('Welcome back!', `Signed in as ${user.fullName || email}`);
      window.location.href = postLoginPath(user);
    } catch (err) {
      notify.error('Sign in failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fillAccount = (acct: (typeof QUICK_ACCOUNTS)[number]) => {
    setEmail(acct.email);
    setPassword(acct.password);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <img
          src={BRAND.landingGps}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        />
        <div className="absolute inset-0 bg-primary/85" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <MamsLogo variant="dark" size="lg" logoOnly={false} className="[&_img]:brightness-0 [&_img]:invert" />
          <div>
            <MamsBrandName size="lg" as="h2" className="!text-white mb-3" />
            <h2 className="text-2xl font-bold leading-tight mb-4 text-white/95">
              One login.<br />Every asset. Every system.
            </h2>
            <p className="text-white/80 max-w-md">
              Sign in with your email — your organization is resolved automatically.
            </p>
          </div>
          <p className="text-xs text-white/50">{BRAND.fullName}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-white relative">
        <div className="absolute inset-0 lg:hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-white to-primary/5" />
        </div>

        <div className="w-full max-w-md relative animate-scale-in">
          <div className="glass-panel rounded-2xl p-8 shadow-xl border border-primary/10 bg-white/95">
            <div className="flex flex-col items-center mb-6 lg:hidden">
              <MamsLogo size="lg" className="flex-col !gap-3 text-center [&>div]:text-center" />
            </div>
            <div className="hidden lg:flex flex-col items-center mb-6">
              <img src={BRAND.logo} alt={BRAND.name} className="h-16 w-auto object-contain mb-2" />
              <p className="text-muted-foreground text-sm">
                Sign in to <MamsBrandName size="sm" className="inline" />
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
                <PasswordInput
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <LoadingButton
                type="submit"
                className="w-full rounded-xl h-11 bg-primary hover:bg-primary-dark"
                loading={loading}
                loadingText="Signing in..."
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </LoadingButton>
            </form>

            <div className="mt-6 pt-5 border-t border-border/60">
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Quick sign-in (demo accounts)</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACCOUNTS.map((acct) => (
                  <Button
                    key={acct.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 px-2 flex flex-col items-start gap-0.5"
                    onClick={() => fillAccount(acct)}
                  >
                    <span className="font-medium">{acct.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate w-full">{acct.email}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
