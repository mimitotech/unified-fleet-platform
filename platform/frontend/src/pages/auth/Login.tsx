/**
 * Login — balanced media | form; slide copy on the form side; logos on white.
 * Layout stays flush (no gutters) across desktop / tablet / mobile.
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ExternalLink, KeyRound, LogIn } from 'lucide-react';
import { notify } from '@/lib/notify';
import { BRAND } from '@/lib/branding';
import { postLoginPath } from '@/lib/authRedirect';
import { cn } from '@/lib/utils';
import { api, authApi } from '@/lib/api';
import { resetToPlatformBranding } from '@/lib/tenantBrandingCache';
import { isStrongPassword } from '@/lib/passwordPolicy';
import { PasswordStrengthIndicator } from '@/components/shared/PasswordStrengthIndicator';

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

type AuthView = 'login' | 'forgot-email' | 'forgot-sent' | 'forgot-reset';

const WIALON_HOSTING_URL = 'https://hosting.wialon.com';

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

const SLIDES_CACHE_KEY = 'ufp_public_login_slides';
const LOGOS_CACHE_KEY = 'ufp_public_login_trust_logos';

function readCachedSlides(): Slide[] {
  try {
    const raw = localStorage.getItem(SLIDES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Slide[];
    return Array.isArray(parsed) ? parsed.filter((s) => s?.id && s?.src) : [];
  } catch {
    return [];
  }
}

function writeCachedSlides(slides: Slide[]) {
  try {
    localStorage.setItem(SLIDES_CACHE_KEY, JSON.stringify(slides));
  } catch {
    /* quota / private mode */
  }
}

function readCachedLogos(): TrustLogo[] {
  try {
    const raw = localStorage.getItem(LOGOS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrustLogo[];
    return Array.isArray(parsed) ? parsed.filter((l) => l?.id && l?.imageUrl) : [];
  } catch {
    return [];
  }
}

function writeCachedLogos(logos: TrustLogo[]) {
  try {
    localStorage.setItem(LOGOS_CACHE_KEY, JSON.stringify(logos));
  } catch {
    /* ignore */
  }
}

function LoginFleetBackdrop() {
  return (
    <div className="login-fleet-backdrop" aria-hidden>
      <div className="login-fleet-backdrop__base" />
      <div className="login-fleet-backdrop__grid" />
      <div className="login-fleet-backdrop__scan" />

      <div className="login-fleet-backdrop__radar">
        <div className="login-fleet-backdrop__radar-sweep" />
      </div>

      <svg className="login-fleet-backdrop__svg" viewBox="0 0 400 640" preserveAspectRatio="xMidYMid slice">
        <path
          className="login-fleet-backdrop__route-b"
          d="M40 520 C90 480, 70 400, 130 360 S220 300, 200 240 S140 160, 210 120 S320 90, 360 40"
        />
        <path
          className="login-fleet-backdrop__route-a"
          d="M20 580 C80 540, 110 470, 160 430 S250 390, 280 320 S260 240, 310 190 S370 140, 390 80"
        />
        <path
          className="login-fleet-backdrop__route-b"
          d="M60 80 C120 140, 90 200, 150 250 S260 280, 240 360 S180 430, 230 490 S320 540, 350 600"
        />
      </svg>

      <div className="login-fleet-backdrop__pin" style={{ left: '18%', top: '22%' }}>
        <span className="login-fleet-backdrop__pin-ring" />
        <span className="login-fleet-backdrop__pin-core" />
      </div>
      <div className="login-fleet-backdrop__pin" style={{ left: '72%', top: '38%', animationDelay: '0.6s' }}>
        <span className="login-fleet-backdrop__pin-ring" style={{ animationDelay: '0.6s' }} />
        <span className="login-fleet-backdrop__pin-core" style={{ animationDelay: '0.6s' }} />
      </div>
      <div className="login-fleet-backdrop__pin" style={{ left: '42%', top: '68%', animationDelay: '1.2s' }}>
        <span className="login-fleet-backdrop__pin-ring" style={{ animationDelay: '1.2s' }} />
        <span className="login-fleet-backdrop__pin-core" style={{ animationDelay: '1.2s' }} />
      </div>
      <div className="login-fleet-backdrop__pin" style={{ left: '78%', top: '78%', animationDelay: '1.8s' }}>
        <span className="login-fleet-backdrop__pin-ring" style={{ animationDelay: '1.8s' }} />
        <span className="login-fleet-backdrop__pin-core" style={{ animationDelay: '1.8s' }} />
      </div>

      <div className="login-fleet-backdrop__orbit" />
    </div>
  );
}

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

  // Login is always MAMS — never carry over a previous client's theme CSS vars.
  useLayoutEffect(() => {
    resetToPlatformBranding();
  }, []);

  const {
    data: remote,
    isPending: slidesPending,
    isFetched: slidesFetched,
    isError: slidesError,
    isSuccess: slidesSuccess,
  } = useQuery({
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
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const {
    data: logosRemote,
    isPending: logosPending,
    isFetched: logosFetched,
    isError: logosError,
    isSuccess: logosSuccess,
  } = useQuery({
    queryKey: ['publicLoginTrustLogos'],
    queryFn: () =>
      api<{
        logos: Array<{ id: string; name: string; imageUrl: string | null }>;
      }>('/api/public/login-trust-logos'),
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const slides = useMemo(() => {
    const rows = remote?.slides?.filter((s) => s.imageUrl) ?? [];
    if (rows.length) {
      return rows.map((s) => ({
        id: s.id,
        src: s.imageUrl!,
        eyebrow: s.eyebrow || '',
        title: s.title,
        caption: s.details || '',
      }));
    }
    if (slidesPending || !slidesFetched || slidesError) {
      return readCachedSlides();
    }
    if (slidesSuccess) return DEFAULT_SLIDES;
    return readCachedSlides();
  }, [remote, slidesPending, slidesFetched, slidesError, slidesSuccess]);

  useEffect(() => {
    if (!slidesSuccess) return;
    const rows = remote?.slides?.filter((s) => s.imageUrl) ?? [];
    if (rows.length) {
      writeCachedSlides(
        rows.map((s) => ({
          id: s.id,
          src: s.imageUrl!,
          eyebrow: s.eyebrow || '',
          title: s.title,
          caption: s.details || '',
        })),
      );
    } else {
      try {
        localStorage.removeItem(SLIDES_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [remote, slidesSuccess]);

  const trustLogos = useMemo((): TrustLogo[] => {
    const live = (logosRemote?.logos ?? [])
      .filter((l): l is { id: string; name: string; imageUrl: string } => Boolean(l.imageUrl))
      .map((l) => ({ id: l.id, name: l.name, imageUrl: l.imageUrl }));
    if (live.length) return live;
    if (logosPending || !logosFetched || logosError) return readCachedLogos();
    if (logosSuccess) return [];
    return readCachedLogos();
  }, [logosRemote, logosPending, logosFetched, logosError, logosSuccess]);

  useEffect(() => {
    if (!logosSuccess) return;
    const live = (logosRemote?.logos ?? [])
      .filter((l): l is { id: string; name: string; imageUrl: string } => Boolean(l.imageUrl))
      .map((l) => ({ id: l.id, name: l.name, imageUrl: l.imageUrl }));
    if (live.length) {
      writeCachedLogos(live);
    } else {
      try {
        localStorage.removeItem(LOGOS_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [logosRemote, logosSuccess]);

  const marqueeLogos = useMemo(() => {
    if (trustLogos.length === 0) return [];
    const base = trustLogos.length < 4 ? [...trustLogos, ...trustLogos, ...trustLogos] : trustLogos;
    return [...base, ...base];
  }, [trustLogos]);

  useEffect(() => {
    setSlide(0);
  }, [slides.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken') || params.get('token');
    if (token) {
      setResetToken(token);
      setView('forgot-reset');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
      setEmail(result.email);
      setNewPassword('');
      setConfirmPassword('');
      if (result.emailed) {
        setResetToken('');
        setView('forgot-sent');
        notify.success('Check your email', 'We sent a password reset link.');
      } else if (result.resetToken) {
        setResetToken(result.resetToken);
        setView('forgot-reset');
        notify.success(
          'Continue password reset',
          result.message || 'Choose a new password to continue.',
        );
      } else {
        notify.error('Reset unavailable', 'No reset method available. Contact support.');
      }
    } catch (err) {
      notify.error('Reset unavailable', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStrongPassword(newPassword)) {
      notify.error('Password too weak', 'Use at least 8 characters with uppercase, lowercase, number, and symbol.');
      return;
    }
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

  const hasTrust = trustLogos.length > 0;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#004225]">
      {/* Media | form — equal halves on lg+, stacked on small; no outer gutters */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Media: image slideshow only */}
        <section className="relative h-[36vh] min-h-[200px] max-h-[42vh] shrink-0 overflow-hidden bg-[#004225] md:h-auto md:max-h-none md:min-h-0 md:w-1/2 md:flex-none md:shrink">
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
                className="absolute inset-0 block h-full w-full object-contain object-center"
                draggable={false}
              />
            </div>
          ))}

          {slides.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 md:bottom-4 md:gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setSlide(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slide ? 'w-6 bg-white md:w-7' : 'w-1.5 bg-white/45 hover:bg-white/75',
                  )}
                />
              ))}
            </div>
          )}
        </section>

        <div className="hidden w-[3px] shrink-0 bg-[#00351e] md:block" aria-hidden />

        {/* Form column — animated fleet backdrop + form card */}
        <aside className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-y-auto border-t border-white/15 md:w-1/2 md:flex-none md:border-t-0">
          <LoginFleetBackdrop />
          <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-7">
            <div className="overflow-hidden rounded-2xl border-2 border-white/25 bg-white shadow-[0_18px_50px_-16px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col items-center border-b border-primary/12 bg-white px-5 pb-3.5 pt-4 text-center sm:pb-4 sm:pt-5">
                <img src={BRAND.logo} alt={BRAND.name} className="h-12 w-auto object-contain sm:h-14" />
                <h1 className="mt-1.5 text-lg font-extrabold tracking-tight text-primary sm:mt-2 sm:text-xl">
                  {BRAND.name}
                </h1>
                <p className="mt-0.5 text-[11px] font-semibold leading-snug text-primary/70">
                  {view === 'login'
                    ? BRAND.fullName
                    : view === 'forgot-email'
                      ? 'Reset your password'
                      : view === 'forgot-sent'
                        ? 'Check your inbox'
                        : 'Choose a new password'}
                </p>
              </div>

              <div className="p-4 sm:p-5 sm:pt-5">
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

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden>
                        <div className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          or
                        </span>
                      </div>
                    </div>

                    <a
                      href={WIALON_HOSTING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary/20 bg-primary/[0.04] text-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.08]"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      Open Wialon Hosting
                    </a>
                  </form>
                )}

                {view === 'forgot-email' && (
                  <form onSubmit={handleForgotEmail} className="space-y-3.5">
                    <p className="text-xs font-medium leading-relaxed text-slate-600">
                      Enter the email on your account. We will send a secure reset link to that address.
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
                      loadingText="Sending..."
                    >
                      <KeyRound className="mr-1.5 h-4 w-4" />
                      Send reset link
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

                {view === 'forgot-sent' && (
                  <div className="space-y-3.5">
                    <p className="text-xs font-medium leading-relaxed text-slate-600">
                      If an account exists for <span className="font-bold text-primary">{email}</span>, we
                      sent a password reset link from{' '}
                      <span className="font-semibold">mams@mimitotracking.com</span>. Open the email and
                      choose a new password within 15 minutes.
                    </p>
                    <button
                      type="button"
                      onClick={goLogin}
                      className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to sign in
                    </button>
                  </div>
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
                      <div className="mt-2">
                        <PasswordStrengthIndicator password={newPassword} />
                      </div>
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
                      disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword || !isStrongPassword(newPassword)}
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
        </aside>
      </div>

      {/* Trusted-by — solid white strip so logos never sit on green */}
      {hasTrust ? (
        <div className="relative z-20 shrink-0 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
            <p className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary sm:text-[11px]">
              Trusted by
            </p>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="login-trust-marquee-track flex items-center gap-10 pr-10 sm:gap-12">
                {marqueeLogos.map((logo, idx) => (
                  <div
                    key={`${logo.id}-${idx}`}
                    className="flex h-11 shrink-0 items-center justify-center bg-white sm:h-12"
                    title={logo.name}
                  >
                    <img
                      src={logo.imageUrl}
                      alt={logo.name}
                      className="max-h-10 max-w-[140px] bg-white object-contain sm:max-h-11 sm:max-w-[180px]"
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
