/**
 * Login — full-bleed media with a solid sign-in panel and optional
 * “Trusted by” client-logo marquee (Admin → System → Login media).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type TrustLogo = {
  id: string;
  name: string;
  imageUrl: string;
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

const fieldClass =
  'h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-primary/25 rounded-lg';

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

  const { data: logosRemote } = useQuery({
    queryKey: ['publicLoginTrustLogos'],
    queryFn: () =>
      api<{
        logos: Array<{ id: string; name: string; imageUrl: string | null }>;
      }>('/api/public/login-trust-logos'),
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

  const trustLogos = useMemo((): TrustLogo[] => {
    return (logosRemote?.logos ?? [])
      .filter((l): l is { id: string; name: string; imageUrl: string } => Boolean(l.imageUrl))
      .map((l) => ({ id: l.id, name: l.name, imageUrl: l.imageUrl }));
  }, [logosRemote]);

  const marqueeLogos = useMemo(() => {
    if (trustLogos.length === 0) return [];
    // Duplicate so the CSS loop stays seamless; pad short lists further.
    const base = trustLogos.length < 4 ? [...trustLogos, ...trustLogos, ...trustLogos] : trustLogos;
    return [...base, ...base];
  }, [trustLogos]);

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
  const hasTrust = trustLogos.length > 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-950">
      {/* Media layer — keep images vivid; overlays stay light */}
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
            className="absolute inset-0 block h-full w-full max-w-none"
            style={{ objectFit: 'fill', objectPosition: 'center' }}
            draggable={false}
          />
        </div>
      ))}

      {/* Soft left vignette only (form readability) — no full-screen wash */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-full max-w-xl bg-gradient-to-r from-black/45 via-black/18 to-transparent lg:max-w-[48%]"
        aria-hidden
      />
      {/* Subtle bottom fade so the trust strip sits cleanly */}
      {hasTrust ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 bg-gradient-to-t from-black/35 to-transparent"
          aria-hidden
        />
      ) : null}

      {/* Slide copy — text shadow instead of heavy overlay */}
      <div className="absolute inset-x-0 top-0 z-10 p-6 sm:p-10 pointer-events-none lg:pr-[min(42%,28rem)]">
        <div className="max-w-lg">
          {active.eyebrow ? (
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.55)' }}
            >
              {active.eyebrow}
            </p>
          ) : null}
          <h2
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl"
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}
          >
            {active.title}
          </h2>
          {active.caption ? (
            <p
              className="mt-2.5 max-w-md text-sm leading-relaxed text-white/95 sm:text-base"
              style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}
            >
              {active.caption}
            </p>
          ) : null}
        </div>
      </div>

      {slides.length > 1 && (
        <div
          className={cn(
            'absolute left-6 z-10 flex gap-2 sm:left-10',
            hasTrust ? 'bottom-28' : 'bottom-8',
          )}
        >
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === slide ? 'w-7 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75',
              )}
            />
          ))}
        </div>
      )}

      {/* Sign-in panel */}
      <div
        className={cn(
          'absolute z-20 flex w-full justify-center px-4',
          'top-1/2 -translate-y-1/2',
          'lg:right-10 lg:top-1/2 lg:w-auto lg:translate-y-[-50%] lg:justify-end xl:right-16',
          hasTrust && 'max-lg:pb-24',
        )}
      >
        <div className="w-full max-w-[400px] rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <img src={BRAND.logo} alt="" className="h-9 w-9 object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{BRAND.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {view === 'login'
                ? BRAND.fullName
                : view === 'forgot-email'
                  ? 'Reset your password'
                  : 'Choose a new password'}
            </p>
          </div>

          {view === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="username"
                  autoFocus
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="login-password" className="text-slate-700">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:text-primary/80 underline-offset-2 hover:underline"
                    onClick={() => setView('forgot-email')}
                    disabled={loading}
                  >
                    Forgot password?
                  </button>
                </div>
                <PasswordInput
                  id="login-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  className={fieldClass}
                />
              </div>

              <LoadingButton
                type="submit"
                className="mt-1 h-11 w-full rounded-lg bg-primary text-base font-semibold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Signing In..."
              >
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </LoadingButton>
            </form>
          )}

          {view === 'forgot-email' && (
            <form onSubmit={handleForgotEmail} className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the email on your account. If it exists, you can set a new password.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-slate-700">
                  Email
                </Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="username"
                  autoFocus
                  className={fieldClass}
                />
              </div>
              <LoadingButton
                type="submit"
                className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Checking..."
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Continue
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            </form>
          )}

          {view === 'forgot-reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="break-all text-sm text-slate-600">
                Resetting password for <span className="font-semibold text-slate-900">{email}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-slate-700">New password</Label>
                <PasswordInput
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700">Confirm password</Label>
                <PasswordInput
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </div>
              <LoadingButton
                type="submit"
                className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Saving..."
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Save new password
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
            <Link
              to="/terms-of-use"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Terms of Use
            </Link>
            <span className="mx-2.5 text-slate-300">·</span>
            <Link
              to="/privacy-policy"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>

      {/* Trusted-by marquee — bottom strip, modest logos */}
      {hasTrust ? (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/25 bg-white/88 backdrop-blur-md">
          <div className="flex items-center gap-4 px-3 py-2.5 sm:px-6">
            <p className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">
              Trusted by
            </p>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="login-trust-marquee-track flex items-center gap-8 pr-8 sm:gap-10">
                {marqueeLogos.map((logo, idx) => (
                  <div
                    key={`${logo.id}-${idx}`}
                    className="flex h-9 shrink-0 items-center justify-center"
                    title={logo.name}
                  >
                    <img
                      src={logo.imageUrl}
                      alt={logo.name}
                      className="max-h-8 max-w-[108px] object-contain opacity-80 grayscale transition-[filter,opacity] duration-300 hover:opacity-100 hover:grayscale-0 sm:max-w-[120px]"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
