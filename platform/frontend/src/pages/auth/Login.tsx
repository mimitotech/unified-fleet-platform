/**
 * Login — full-bleed slideshow. Slides come from Admin → System → Login media
 * when configured; otherwise built-in defaults are used.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Input } from '@/components/ui/input';
import { ArrowLeft, KeyRound, LogIn } from 'lucide-react';
import { notify } from '@/lib/notify';
import { BRAND } from '@/lib/branding';
import { postLoginPath } from '@/lib/authRedirect';
import { cn } from '@/lib/utils';
import { api, authApi } from '@/lib/api';

type Slide = {
  id: string;
  src: string;
  eyebrow: string;
  title: string;
  caption: string;
};

type AuthView = 'login' | 'forgot-email' | 'forgot-reset';

const DEFAULT_SLIDES: Slide[] = [
  {
    id: 'default-1',
    src: BRAND.landingGps,
    eyebrow: 'Real-time GPS',
    title: 'See every asset, live',
    caption: 'Track vehicles, generators, and equipment on one map.',
  },
  {
    id: 'default-2',
    src: BRAND.landingMap,
    eyebrow: 'Operations hub',
    title: 'One dashboard for the fleet',
    caption: 'Fuel, alerts, routes, and workshop — unified for your team.',
  },
  {
    id: 'default-3',
    src: '/gp1.png',
    eyebrow: 'Fuel intelligence',
    title: 'Protect every litre',
    caption: 'Fills, consumption, and sudden drops with clear reporting.',
  },
];

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);

  const { data: remote } = useQuery({
    queryKey: ['publicLoginSlides'],
    queryFn: () =>
      api<{
        slides: Array<{
          id: string;
          title: string;
          details: string | null;
          eyebrow: string | null;
          imageUrl: string | null;
        }>;
      }>('/api/public/login-slides'),
    staleTime: 60_000,
    retry: 1,
  });

  const slides = useMemo(() => {
    const rows = remote?.slides?.filter((s) => s.imageUrl) ?? [];
    if (!rows.length) return DEFAULT_SLIDES;
    return rows.map((s) => ({
      id: s.id,
      src: s.imageUrl!,
      eyebrow: s.eyebrow || '',
      title: s.title,
      caption: s.details || '',
    }));
  }, [remote]);

  useEffect(() => {
    setSlide(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [slides.length]);

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

  const handleForgotEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setResetToken(result.resetToken);
      setEmail(result.email);
      setNewPassword('');
      setConfirmPassword('');
      setView('forgot-reset');
      notify.success('Account found', 'Choose a new password to continue.');
    } catch (err) {
      notify.error('Reset unavailable', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(resetToken, newPassword, confirmPassword);
      notify.success('Password updated', 'Sign in with your new password.');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setView('login');
    } catch (err) {
      notify.error('Could not reset password', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => {
    setView('login');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const active = slides[Math.min(slide, slides.length - 1)] ?? DEFAULT_SLIDES[0];

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-neutral-950">
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-in-out',
            i === slide ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden={i !== slide}
        >
          <img
            src={s.src}
            alt=""
            className="absolute inset-0 h-full w-full min-h-full min-w-full object-cover object-center"
            draggable={false}
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-br from-black/55 via-black/40 to-primary/35 pointer-events-none" />

      <div className="absolute inset-x-0 top-0 z-10 p-6 sm:p-10 pointer-events-none">
        <div className="max-w-xl">
          {active.eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-2">
              {active.eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-md">{active.title}</h2>
          {active.caption ? (
            <p className="mt-2 text-sm sm:text-base text-white/85 max-w-md">{active.caption}</p>
          ) : null}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              className={cn(
                'h-2 rounded-full transition-all',
                i === slide ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      )}

      <div className="relative w-full max-w-[90%] sm:max-w-sm md:max-w-md px-4 sm:px-0 z-20">
        <div className="rounded-3xl bg-white/30 backdrop-blur-md p-6 sm:p-8 shadow-2xl border border-white/20">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/80 flex items-center justify-center flex-shrink-0 shadow-lg mb-3">
              <img src={BRAND.logo} alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{BRAND.name}</h1>
            <p className="text-gray-900 text-xs sm:text-sm mt-1 text-center">
              {view === 'login'
                ? BRAND.fullName
                : view === 'forgot-email'
                  ? 'Reset your password'
                  : 'Choose a new password'}
            </p>
          </div>

          {view === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="username"
                autoFocus
                className="h-12 bg-white/70 border-white/50 text-gray-800 placeholder:text-gray-500 focus:border-primary focus:ring-primary/30 rounded-xl"
              />
              <PasswordInput
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                autoComplete="current-password"
                className="h-12 bg-white/70 border-white/50 text-gray-800 placeholder:text-gray-500 focus:border-primary focus:ring-primary/30 rounded-xl"
              />

              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  className="text-xs font-medium text-gray-800/90 hover:text-gray-950 underline underline-offset-2"
                  onClick={() => setView('forgot-email')}
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>

              <LoadingButton
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold text-base rounded-xl shadow-lg"
                loading={loading}
                loadingText="Signing In..."
              >
                <LogIn className="h-5 w-5 mr-2" />
                Sign In
              </LoadingButton>
            </form>
          )}

          {view === 'forgot-email' && (
            <form onSubmit={handleForgotEmail} className="space-y-4">
              <p className="text-sm text-gray-800/90 text-center -mt-2 mb-1">
                Enter the email on your account. If it exists, you can set a new password.
              </p>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="username"
                autoFocus
                className="h-12 bg-white/70 border-white/50 text-gray-800 placeholder:text-gray-500 focus:border-primary focus:ring-primary/30 rounded-xl"
              />
              <LoadingButton
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold text-base rounded-xl shadow-lg"
                loading={loading}
                loadingText="Checking..."
              >
                <KeyRound className="h-5 w-5 mr-2" />
                Continue
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-800/90 hover:text-gray-950"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            </form>
          )}

          {view === 'forgot-reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-sm text-gray-800/90 text-center -mt-2 mb-1 break-all">
                Resetting password for <span className="font-semibold">{email}</span>
              </p>
              <PasswordInput
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
                className="h-12 bg-white/70 border-white/50 text-gray-800 placeholder:text-gray-500 focus:border-primary focus:ring-primary/30 rounded-xl"
              />
              <PasswordInput
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                minLength={8}
                autoComplete="new-password"
                className="h-12 bg-white/70 border-white/50 text-gray-800 placeholder:text-gray-500 focus:border-primary focus:ring-primary/30 rounded-xl"
              />
              <LoadingButton
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold text-base rounded-xl shadow-lg"
                loading={loading}
                loadingText="Saving..."
              >
                <KeyRound className="h-5 w-5 mr-2" />
                Save new password
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-800/90 hover:text-gray-950"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-xs text-white/90 drop-shadow">
            <Link to="/terms-of-use" className="underline underline-offset-2 hover:text-white">
              Terms of Use
            </Link>
            <span className="mx-2">·</span>
            <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-white">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
