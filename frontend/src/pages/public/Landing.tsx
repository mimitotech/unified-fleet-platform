import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MamsLogo, MamsLogoMark } from '@/components/shared/MamsLogo';
import { MamsBrandName } from '@/components/shared/MamsBrandName';
import { BRAND } from '@/lib/branding';
import { AnimatedSection } from '@/components/landing/AnimatedSection';
import { PlatformShowcase } from '@/components/landing/PlatformShowcase';
import { ArrowRight, MapPin, Shield, Video, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: MapPin,
    title: 'Unified live map',
    description: 'All assets on one map — trucks, generators, and dashcams from any connected telematics source.',
  },
  {
    icon: Video,
    title: 'GPS & video',
    description: 'Location, fuel, sensors, and surveillance combined in a single tenant-branded dashboard.',
  },
  {
    icon: Shield,
    title: 'One client login',
    description: 'Clients sign in to MAMS only. Admins configure Wialon, LocoNav, and TrackSolid behind the scenes.',
  },
  {
    icon: Zap,
    title: 'Modular tenants',
    description: 'Enable monitoring, alerts, fuel, geofencing, and more per organization.',
  },
];

const STEPS = [
  { title: 'Connect', body: 'Add telematics credentials per tenant in admin.' },
  { title: 'Unify', body: 'MAMS normalizes GPS, alerts, and video into one view.' },
  { title: 'Operate', body: 'Clients manage their fleet from a branded dashboard.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div
          className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-25 blur-3xl"
          style={{ background: `radial-gradient(circle, ${BRAND.accent}55, transparent 70%)` }}
        />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-primary/10 px-6 h-16 flex items-center justify-between bg-white/90 backdrop-blur-md">
        <Link to="/">
          <MamsLogo size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/auth/login" className="text-sm font-medium text-primary hover:underline hidden sm:inline">
            Sign in
          </Link>
          <Link to="/auth/login">
            <Button className="bg-primary hover:bg-primary/90">
              Get Started <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.05] via-white to-primary/[0.04]" />
        <div className="relative max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <MamsLogoMark size="md" />
              <MamsBrandName size="hero" as="h1" />
            </div>
            <p className="text-sm font-medium text-primary/80 mb-3">{BRAND.fullName}</p>
            <p className="text-xl lg:text-2xl font-semibold text-foreground leading-snug mb-4 max-w-lg">
              One platform for every asset, every telematics source.
            </p>
            <p className="text-muted-foreground mb-8 max-w-lg leading-relaxed">
              Unify Wialon, LocoNav, and TrackSolid Pro into a white-label fleet control center.
            </p>
            <div className="flex flex-wrap gap-3 mb-6">
              <Link to="/auth/login">
                <Button size="lg" className="bg-primary hover:bg-primary/90 h-11 px-7 shadow-lg shadow-primary/20">
                  Sign in to <span className="font-black ml-1">{BRAND.name}</span>
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Wialon', 'LocoNav', 'TrackSolid Pro'].map((name) => (
                <span
                  key={name}
                  className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/5 border border-primary/15 text-primary"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div id="platform-preview" className="relative animate-scale-in">
            <div className="absolute -inset-3 bg-gradient-to-br from-primary/20 to-accent/10 rounded-3xl blur-2xl opacity-40" />
            <PlatformShowcase />
          </div>
        </div>
      </section>

      {/* How it works — compact */}
      <section className="border-y border-primary/10 bg-[#fafcfb]">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-16">
          <AnimatedSection className="text-center mb-10">
            <MamsBrandName size="md" as="h2" className="mb-2" />
            <p className="text-muted-foreground">Configure once · operate everywhere</p>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {STEPS.map(({ title, body }, i) => (
              <AnimatedSection key={title} delay={i * 100}>
                <div className="text-center rounded-xl border border-primary/10 bg-white p-6 h-full">
                  <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-3">
                    {i + 1}
                  </span>
                  <h3 className="font-bold text-primary mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features — single grid */}
      <section className="max-w-7xl mx-auto px-6 py-14 lg:py-18">
        <AnimatedSection className="text-center mb-10">
          <h2 className="text-2xl font-bold text-primary">What <MamsBrandName size="sm" className="inline" /> delivers</h2>
        </AnimatedSection>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <AnimatedSection key={title} delay={i * 70}>
              <div className="rounded-xl border border-primary/10 bg-white p-5 h-full hover:shadow-md hover:border-primary/25 transition-all">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-primary mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent})` }}
        />
        <AnimatedSection className="relative max-w-3xl mx-auto px-6 py-16 text-center text-white">
          <MamsBrandName size="lg" as="p" className="!text-white mb-4" />
          <p className="text-white/85 mb-8">Sign in with your organization credentials to access your fleet dashboard.</p>
          <Link to="/auth/login">
            <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90 h-11 px-9 font-semibold">
              Sign In
            </Button>
          </Link>
        </AnimatedSection>
      </section>

      <footer className="border-t border-primary/10 px-6 py-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <MamsLogo size="sm" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Mimito · {BRAND.fullName}
          </p>
        </div>
      </footer>
    </div>
  );
}
