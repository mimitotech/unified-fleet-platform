/**
 * Login — classic MAMS full-bleed background with an interactive image slideshow.
 * Auth logic unchanged (email/password → postLoginPath).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Input } from '@/components/ui/input';
import { LogIn } from 'lucide-react';
import { notify } from '@/lib/notify';
import { BRAND } from '@/lib/branding';
import { postLoginPath } from '@/lib/authRedirect';
import { cn } from '@/lib/utils';

const SLIDES = [
  {
    src: BRAND.landingGps,
    eyebrow: 'Real-time GPS',
    title: 'See every asset, live',
    caption: 'Track vehicles, generators, and equipment on one map.',
  },
  {
    src: BRAND.landingMap,
    eyebrow: 'Operations hub',
    title: 'One dashboard for the fleet',
    caption: 'Fuel, alerts, routes, and workshop — unified for your team.',
  },
  {
    src: '/gp1.png',
    eyebrow: 'Fuel intelligence',
    title: 'Protect every litre',
    caption: 'Fills, consumption, and sudden drops with clear reporting.',
  },
] as const;

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

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

  const active = SLIDES[slide];

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
      {SLIDES.map((s, i) => (
        <div
          key={s.src}
          className={cn(
            'absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ease-in-out',
            i === slide ? 'opacity-100' : 'opacity-0'
          )}
          style={{ backgroundImage: `url('${s.src}')` }}
          aria-hidden={i !== slide}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-br from-black/55 via-black/45 to-primary/40" />

      <div className="absolute inset-x-0 top-0 z-10 p-6 sm:p-10 pointer-events-none">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-2">
            {active.eyebrow}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-md">{active.title}</h2>
          <p className="mt-2 text-sm sm:text-base text-white/85 max-w-md">{active.caption}</p>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => setSlide(i)}
            className={cn(
              'h-2 rounded-full transition-all',
              i === slide ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
            )}
          />
        ))}
      </div>

      <div className="relative w-full max-w-[90%] sm:max-w-sm md:max-w-md px-4 sm:px-0 z-20">
        <div className="rounded-3xl bg-white/30 backdrop-blur-md p-6 sm:p-8 shadow-2xl border border-white/20">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/80 flex items-center justify-center flex-shrink-0 shadow-lg mb-3">
              <img src={BRAND.logo} alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{BRAND.name}</h1>
            <p className="text-gray-900 text-xs sm:text-sm mt-1 text-center">{BRAND.fullName}</p>
          </div>

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
