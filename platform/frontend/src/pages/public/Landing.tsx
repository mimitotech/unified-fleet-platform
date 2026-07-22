/**
 * Landing page — matched to classic MAMS welcome structure and copy.
 * Vendor names omitted from client-facing marketing text.
 */

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import {
  Video,
  MapPin,
  Users,
  Route,
  Wrench,
  Fuel,
  Leaf,
  Gauge,
  CheckCircle,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/branding';
import { cn } from '@/lib/utils';
import { isSystemRole } from '@/lib/systemRoles';

export default function Landing() {
  const { user, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!isLoading && user) {
    const dest = isSystemRole(user.role) ? '/admin/dashboard' : '/app/dashboard';
    return <Navigate to={dest} replace />;
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <img src={BRAND.logo} alt="MAMS Logo" className="w-12 h-12 object-contain" />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{BRAND.name}</h1>
                <p className="text-sm text-gray-600 hidden sm:block truncate">{BRAND.fullName}</p>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link to="/auth/login">
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Sign In
                </Button>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full bg-primary hover:bg-primary/90">
                  Sign In
                </Button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      <HeroSection />
      <FeaturesSection />
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative bg-gradient-to-br from-primary/5 via-white to-gray-50 py-20 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, ${BRAND.primary} 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Integrated Fleet Management
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              Seamlessly combine AI-powered video surveillance with GPS tracking, driver management,
              smart route planning, and comprehensive workshop tools. Achieve over 20% cost savings
              with integrated fuel analysis and 360-degree fleet visibility.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => window.open('https://www.mimitotracking.co.ug', '_blank')}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all"
              >
                About Us
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Link to="/auth/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-primary/30 text-primary hover:bg-primary/5">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl shadow-2xl overflow-hidden border border-gray-200 bg-white aspect-[16/10]">
              <img
                src={BRAND.landingMap}
                alt="MAMS Dashboard"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
            </div>

            <div className="absolute -left-4 top-1/4 bg-white rounded-xl shadow-lg p-4 border border-gray-200 hidden lg:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Video className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Live Surveillance</div>
                  <div className="text-xs text-gray-600">AI-Powered</div>
                </div>
              </div>
            </div>

            <div className="absolute -right-4 bottom-1/4 bg-white rounded-xl shadow-lg p-4 border border-gray-200 hidden lg:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">GPS Tracking</div>
                  <div className="text-xs text-gray-600">Real-time</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Video,
      title: 'AI-Powered Video Surveillance',
      description: 'Live feeds, event detection, and driver behavior monitoring with video telematics.',
      color: 'from-purple-500 to-purple-600',
      benefits: ['Live streaming', 'Event detection', 'Driver behavior analysis'],
    },
    {
      icon: MapPin,
      title: 'Real-Time GPS Tracking',
      description: 'Track asset location, geofencing, route playback, and comprehensive trip analytics.',
      color: 'from-blue-500 to-blue-600',
      benefits: ['Real-time location', 'Geofencing', 'Route playback'],
    },
    {
      icon: Users,
      title: 'Driver Management',
      description: 'Driver identification, performance tracking, scheduling, and compliance monitoring.',
      color: 'from-green-500 to-green-600',
      benefits: ['Performance tracking', 'Scheduling', 'Compliance'],
    },
    {
      icon: Route,
      title: 'Smart Route Planning',
      description: 'Route optimization to reduce detours, fuel consumption, and delivery times.',
      color: 'from-orange-500 to-orange-600',
      benefits: ['Route optimization', 'Fuel savings', 'Time efficiency'],
    },
    {
      icon: Wrench,
      title: 'Workshop Management',
      description: 'Digital inspections, maintenance logs, breakdown analysis, and service alerts.',
      color: 'from-red-500 to-red-600',
      benefits: ['Digital checklists', 'Maintenance logs', 'Cost analysis'],
    },
    {
      icon: Fuel,
      title: 'Fuel Data Import',
      description: 'Import local fuel station data for complete fuel event analysis and theft detection.',
      color: 'from-yellow-500 to-yellow-600',
      benefits: ['CSV/Excel import', 'Theft detection', 'Cost tracking'],
    },
    {
      icon: Gauge,
      title: 'Fuel Monitoring',
      description: 'Real-time fuel level tracking, consumption analytics, and automated anomaly alerts.',
      color: 'from-cyan-500 to-cyan-600',
      benefits: ['Real-time fuel levels', 'Consumption analytics', 'Theft alerts'],
    },
    {
      icon: Leaf,
      title: 'Carbon Emissions Tracking',
      description: "Monitor your fleet's carbon footprint with emissions tracking and sustainability reporting.",
      color: 'from-emerald-500 to-emerald-600',
      benefits: ['CO₂ monitoring', 'Sustainability reports', 'Environmental compliance'],
    },
  ];

  return (
    <section id="features" className="py-20 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-4">
            Comprehensive Features
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Everything You Need in One Platform
          </h2>
          <p className="text-lg text-gray-600">
            Seamlessly integrate video surveillance, GPS tracking, and fleet management tools
            for complete operational control.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <CardHeader>
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4 shadow-lg',
                    feature.color
                  )}
                >
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
                <CardDescription className="text-gray-600">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {feature.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-primary text-white">
      <div className="w-full px-6 lg:px-8">
        <div className="border-t border-white/20 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-sm text-white/80 text-center sm:text-left">
              © {new Date().getFullYear()} Mimito Technologies Limited. All rights reserved.
            </p>
            <div className="flex items-center gap-8 text-sm">
              <Link to="/privacy-policy" className="hover:text-white/90 transition-colors duration-200">
                Privacy Policy
              </Link>
              <Link to="/terms-of-use" className="hover:text-white/90 transition-colors duration-200">
                Terms of Use
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
