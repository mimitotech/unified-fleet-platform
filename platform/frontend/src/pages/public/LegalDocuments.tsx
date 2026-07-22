/**
 * Public legal document pages (readable without login).
 * First-login acceptance remains at /auth/terms.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND } from '@/lib/branding';
import { LEGAL_DOCUMENTS, type LegalDocument } from '@/lib/termsOfUse';

function LegalPageShell({ doc }: { doc: LegalDocument }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc.id]);

  const Icon = doc.id === 'privacy' ? Shield : FileText;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <img src={BRAND.logo} alt="MAMS Logo" className="w-10 h-10 object-contain" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900">{BRAND.name}</h1>
                <p className="text-xs text-gray-600 truncate">{BRAND.fullName}</p>
              </div>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="shadow-lg">
          <CardContent className="p-8 sm:p-12">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{doc.title}</h1>
                <p className="text-sm text-gray-500 mt-1">Last updated: {doc.lastUpdated}</p>
              </div>
            </div>

            <div className="space-y-6 text-gray-700 leading-relaxed">
              {doc.intro.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}

              {doc.sections.map((section) => (
                <section key={`${section.number}-${section.title}`} className="space-y-3">
                  <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-2">
                    {section.number ? `${section.number}. ` : ''}
                    {section.title}
                  </h2>
                  {section.paragraphs?.map((p) => (
                    <p key={p.slice(0, 48)}>{p}</p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="list-disc pl-6 space-y-1">
                      {section.bullets.map((b) => (
                        <li key={b.slice(0, 48)}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.note ? (
                    <p className="text-sm text-gray-600 border-l-4 border-primary/30 pl-4 italic">{section.note}</p>
                  ) : null}
                </section>
              ))}
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200 flex flex-wrap gap-4 text-sm">
              <Link to="/terms-of-use" className="text-primary hover:underline">
                Terms of Use
              </Link>
              <Link to="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              <Link to="/auth/login" className="text-primary hover:underline ml-auto">
                Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function PublicTermsOfUse() {
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === 'terms')!;
  return <LegalPageShell doc={doc} />;
}

export function PublicPrivacyPolicy() {
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === 'privacy')!;
  return <LegalPageShell doc={doc} />;
}
