import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 h-16 flex items-center justify-between">
        <span className="font-bold text-xl">Unified Fleet Platform</span>
        <Link to="/auth/login">
          <Button>Sign In</Button>
        </Link>
      </nav>
      <section className="max-w-4xl mx-auto py-24 px-6 text-center">
        <h1 className="text-4xl font-bold mb-4">One platform. Three telematics sources.</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Unify Wialon, LocoNav, and TrackSolid Pro into a single multi-tenant fleet dashboard.
        </p>
        <Link to="/auth/login">
          <Button size="lg">Get Started</Button>
        </Link>
      </section>
    </div>
  );
}
