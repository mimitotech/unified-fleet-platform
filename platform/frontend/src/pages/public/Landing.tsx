import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MamsLogo, MamsLogoMark } from '@/components/shared/MamsLogo';
import { MamsBrandName } from '@/components/shared/MamsBrandName';
import { BRAND } from '@/lib/branding';
import { AnimatedSection } from '@/components/landing/AnimatedSection';
import { PlatformShowcase } from '@/components/landing/PlatformShowcase';
import { ArrowRight, MapPin, Bell, Shield } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: MapPin,
    title: 'See where your assets are',
    description: 'Live locations and movement history in one clear view.',
  },
  {
    icon: Bell,
    title: 'Stay informed',
    description: 'Get timely alerts so you can respond when it matters.',
  },
  {
    icon: Shield,
    title: 'Secure access',
    description: 'Your team signs in with roles that match their responsibilities.',
  },
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

      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.05] via-white to-primary/[0.04]" />
        <div className="relative max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3 mb-6">
              <MamsLogoMark size="md" />
              <MamsBrandName size="hero" as="h1" />
            </div>
            <p className="text-xl lg:text-2xl font-semibold text-foreground leading-snug mb-4 max-w-lg">
              Track and manage your assets with confidence.
            </p>
            <p className="text-muted-foreground mb-8 max-w-lg leading-relaxed">
              A simple platform to monitor vehicles and equipment, stay on top of alerts, and keep your operations running smoothly.
            </p>
            <Link to="/auth/login">
              <Button size="lg" className="bg-primary hover:bg-primary/90 h-11 px-7 shadow-lg shadow-primary/20">
                Sign in to <span className="font-black ml-1">{BRAND.name}</span>
              </Button>
            </Link>
          </div>

          <div id="platform-preview" className="relative animate-scale-in">
            <div className="absolute -inset-3 bg-gradient-to-br from-primary/20 to-accent/10 rounded-3xl blur-2xl opacity-40" />
            <PlatformShowcase />
          </div>
        </div>
      </section>

      <section className="border-y border-primary/10 bg-[#fafcfb]">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-16">
          <AnimatedSection className="text-center mb-10">
            <h2 className="text-2xl font-bold text-primary mb-2">Built for everyday operations</h2>
            <p className="text-muted-foreground">Clear tools. Reliable insight. Nothing you do not need.</p>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }, i) => (
              <AnimatedSection key={title} delay={i * 100}>
                <div className="text-center rounded-xl border border-primary/10 bg-white p-6 h-full">
                  <div className="inline-flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-primary mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent})` }}
        />
        <AnimatedSection className="relative max-w-3xl mx-auto px-6 py-16 text-center text-white">
          <MamsBrandName size="lg" as="p" className="!text-white mb-4" />
          <p className="text-white/85 mb-8">Sign in with your organisation credentials to open your dashboard.</p>
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
            © {new Date().getFullYear()} Mimito Technologies Limited · {BRAND.fullName}
          </p>
        </div>
      </footer>
    </div>
  );
}
