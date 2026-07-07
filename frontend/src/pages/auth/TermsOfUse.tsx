import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { MamsLogo } from '@/components/shared/MamsLogo';
import { MamsBrandName } from '@/components/shared/MamsBrandName';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { TERMS_OF_USE, TERMS_VERSION } from '@/lib/termsOfUse';
import { dashboardPathForRole } from '@/lib/authRedirect';
import { notify } from '@/lib/notify';
import { BRAND } from '@/lib/branding';
import { CheckCircle2 } from 'lucide-react';

export default function TermsOfUse() {
  const { user, isLoading, isAuthenticated, acceptTerms } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  const nextPath = params.get('next') || (user ? dashboardPathForRole(user.role) : '/app/dashboard');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafcfb]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (user?.termsAcceptedAt) {
    return <Navigate to={nextPath} replace />;
  }

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await acceptTerms();
      notify.success('Terms accepted', 'Welcome to MAMS');
      navigate(nextPath, { replace: true });
    } catch (err) {
      notify.error('Could not save acceptance', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/[0.04] to-white flex flex-col">
      <header className="border-b border-primary/10 bg-white/90 backdrop-blur px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <MamsLogo size="sm" />
          <p className="text-xs text-muted-foreground hidden sm:block">
            First-time access · {user?.fullName || user?.email}
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col">
        <div className="mb-6">
          <MamsBrandName size="lg" as="h1" className="mb-2" />
          <h2 className="text-xl font-semibold text-foreground">Terms of Use</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Please read the following terms before accessing {BRAND.fullName}. You must accept to continue.
          </p>
        </div>

        <div className="flex-1 rounded-2xl border border-primary/15 bg-white shadow-sm overflow-hidden flex flex-col min-h-[420px]">
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm leading-relaxed">
            {TERMS_OF_USE.map((term, index) => (
              <section key={term.title}>
                <h3 className="font-semibold text-primary flex items-start gap-2">
                  <span className="text-xs font-bold bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  {term.title}
                </h3>
                <p className="text-muted-foreground mt-2 pl-8">{term.body}</p>
              </section>
            ))}
          </div>

          <div className="border-t border-primary/10 bg-primary/[0.03] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              Version {TERMS_VERSION} · {BRAND.name} · Mimito
            </p>
            <LoadingButton
              type="button"
              className="w-full sm:w-auto min-w-[160px] bg-primary hover:bg-primary/90 h-11 rounded-xl"
              loading={submitting}
              loadingText="Saving..."
              onClick={handleAccept}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Accept
            </LoadingButton>
          </div>
        </div>
      </main>
    </div>
  );
}
