/**
 * Login — full-bleed media slideshow with a centered sign-in card and an
 * optional “Trusted by” client-logo marquee (Admin → System → Login media).
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
  'h-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-primary/25 rounded-lg text-sm';

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
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-neutral-950">
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

      {/* Light center scrim only — enough for the card, media stays visible */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/25 via-black/15 to-black/30"
        aria-hidden
      />

      {/* Slide copy — text shadow instead of heavy overlay */}
      <div className="absolute inset-x-0 top-0 z-10 p-6 sm:p-10 pointer-events-none">
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
            'absolute left-1/2 z-10 flex -translate-x-1/2 gap-2',
            hasTrust ? 'bottom-24' : 'bottom-8',
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

      {/* Centered sign-in card */}
      <div className={cn('relative z-20 w-full max-w-[340px] px-4', hasTrust && 'mb-16')}>
        <div className="overflow-hidden rounded-2xl border-2 border-primary/70 bg-white shadow-[0_18px_50px_-16px_rgba(0,66,37,0.55)] ring-1 ring-primary/10">
          {/* Brand header — solid white so the logo reads clearly */}
          <div className="flex flex-col items-center border-b border-primary/12 bg-white px-5 pb-4 pt-5 text-center">
            <img
              src={BRAND.logo}
              alt={BRAND.name}
              className="h-14 w-auto object-contain"
            />
            <h1 className="mt-2 text-xl font-extrabold tracking-tight text-primary">{BRAND.name}</h1>
            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-primary/70">
              {view === 'login'
                ? BRAND.fullName
                : view === 'forgot-email'
                  ? 'Reset your password'
                  : 'Choose a new password'}
            </p>
          </div>

          <div className="p-5 sm:p-6">
          {view === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="login-email" className="text-xs font-bold text-primary">
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
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="login-password" className="text-xs font-bold text-primary">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-primary underline-offset-2 hover:underline"
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
                className="mt-1 h-10 w-full rounded-lg bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Signing In..."
              >
                <LogIn className="mr-1.5 h-4 w-4" />
                Sign In
              </LoadingButton>
            </form>
          )}

          {view === 'forgot-email' && (
            <form onSubmit={handleForgotEmail} className="space-y-3.5">
              <p className="text-xs font-medium leading-relaxed text-slate-600">
                Enter the email on your account. If it exists, you can set a new password.
              </p>
              <div className="space-y-1">
                <Label htmlFor="forgot-email" className="text-xs font-bold text-primary">
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
                className="h-10 w-full rounded-lg bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Checking..."
              >
                <KeyRound className="mr-1.5 h-4 w-4" />
                Continue
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </button>
            </form>
          )}

          {view === 'forgot-reset' && (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <p className="break-all text-xs font-medium text-slate-600">
                Resetting for <span className="font-bold text-primary">{email}</span>
              </p>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-primary">New password</Label>
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
              <div className="space-y-1">
                <Label className="text-xs font-bold text-primary">Confirm password</Label>
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
                className="h-10 w-full rounded-lg bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                loading={loading}
                loadingText="Saving..."
              >
                <KeyRound className="mr-1.5 h-4 w-4" />
                Save new password
              </LoadingButton>
              <button
                type="button"
                onClick={goLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </button>
            </form>
          )}

            <div className="mt-4 border-t border-primary/15 pt-3 text-center text-[11px]">
              <Link
                to="/terms-of-use"
                className="font-bold text-primary underline-offset-2 hover:underline"
              >
                Terms of Use
              </Link>
              <span className="mx-2 text-primary/40">·</span>
              <Link
                to="/privacy-policy"
                className="font-bold text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Trusted-by marquee — bottom strip, full-color logos */}
      {hasTrust ? (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/25 bg-white/92 backdrop-blur-md">
          <div className="flex items-center gap-4 px-3 py-2.5 sm:px-6">
            <p className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-primary sm:block">
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
                      className="max-h-8 max-w-[112px] object-contain sm:max-w-[124px]"
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
