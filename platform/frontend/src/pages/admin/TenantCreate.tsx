import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { WialonTenantLinkPanel } from '@/components/admin/WialonTenantLinkPanel';
import { adminApi } from '@/lib/api';
import { BRAND } from '@/lib/branding';
import { notify, withToast } from '@/lib/notify';
import { slugify } from '@/lib/slugify';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function TenantCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [wialonAccountId, setWialonAccountId] = useState(searchParams.get('wialonAccountId') || '');
  const [wialonAccountName, setWialonAccountName] = useState(searchParams.get('wialonAccountName') || '');
  const [wialonMotherAccountId, setWialonMotherAccountId] = useState(searchParams.get('wialonMotherAccountId') || '');
  const [wialonUserIds, setWialonUserIds] = useState<number[]>([]);
  const [testResult, setTestResult] = useState<{ unitCount: number; userCount: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManual) setSlug(slugify(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugManual(true);
    setSlug(value);
  };

  const finalSlug = slugify(slugManual ? slug : slug || name);

  const toggleUser = (id: number) => {
    setWialonUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const testAccount = async () => {
    if (!wialonAccountId) return;
    setTesting(true);
    try {
      const r = await adminApi.testWialonCenterAccount(
        wialonAccountId,
        undefined,
        wialonMotherAccountId || undefined
      );
      setTestResult({ unitCount: r.unitCount, userCount: r.userCount });
      notify.success('Account test passed', `${r.unitCount} units, ${r.userCount} users`);
    } catch (e) {
      notify.error('Test failed', (e as Error).message);
      setTestResult(null);
    } finally {
      setTesting(false);
    }
  };

  const create = useMutation({
    mutationFn: () =>
      withToast(
        adminApi.createTenant({
          name: name.trim(),
          slug: finalSlug,
          primaryColor: BRAND.primary,
          contactEmail: contactEmail || undefined,
          timezone: 'UTC',
          language: 'en',
          ...(wialonAccountId
            ? {
                wialonAccountId,
                wialonAccountName: wialonAccountName || undefined,
                wialonMotherAccountId: wialonMotherAccountId || undefined,
                wialonUserIds: wialonUserIds.length ? wialonUserIds : undefined,
              }
            : {}),
        }),
        { loading: 'Creating client...', success: 'Client created with Wialon account linked' }
      ),
    onSuccess: (data) => {
      const tenant = data as { id?: string };
      if (tenant?.id) navigate(`/admin/tenants/${tenant.id}`);
      else navigate('/admin/tenants');
    },
    onError: (err) => notify.error('Create failed', (err as Error).message),
  });

  useEffect(() => {
    const aid = searchParams.get('wialonAccountId');
    const aname = searchParams.get('wialonAccountName');
    const mid = searchParams.get('wialonMotherAccountId');
    if (aid) {
      setWialonAccountId(aid);
      if (aname) setWialonAccountName(aname);
      if (mid) setWialonMotherAccountId(mid);
      setStep(2);
    }
  }, [searchParams]);

  return (
    <AdminLayout title="New Client" subtitle="Create a branded MAMS client linked to a Wialon account">
      <Link to="/admin/tenants" className="text-sm text-primary mb-4 inline-block">← Back to Clients</Link>

      <div className="flex gap-2 mb-6 text-sm">
        {['Details', 'Wialon account', 'Review'].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i + 1)}
            className={`px-3 py-1 rounded-full border ${step === i + 1 ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Client details</CardTitle>
            <CardDescription>Name and login slug for this client&apos;s branded MAMS portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Client name</Label>
              <Input placeholder="NSAMBA Logistics" value={name} onChange={(e) => handleNameChange(e.target.value)} />
            </div>
            <div>
              <Label>Slug (login)</Label>
              <Input placeholder="nsamba-logistics" value={slug} onChange={(e) => handleSlugChange(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Login slug: <code>{finalSlug || '—'}</code></p>
            </div>
            <div>
              <Label>Contact email (optional)</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <Button onClick={() => setStep(2)} disabled={!name.trim() || !finalSlug}>Next: Wialon account</Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="max-w-2xl space-y-4">
          <WialonTenantLinkPanel
            selectedMotherAccountId={wialonMotherAccountId}
            onMotherAccountChange={setWialonMotherAccountId}
            selectedAccountId={wialonAccountId}
            selectedAccountName={wialonAccountName}
            selectedUserIds={wialonUserIds}
            onSelectAccount={(id, n) => {
              setWialonAccountId(id);
              setWialonAccountName(n);
              setWialonUserIds([]);
              setTestResult(null);
            }}
            onToggleUser={toggleUser}
            onSelectAllUsers={setWialonUserIds}
            onTestAccount={testAccount}
            testing={testing}
            testResult={testResult}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!wialonAccountId}>Next: Review</Button>
            <Button variant="ghost" onClick={() => setStep(3)}>Skip Wialon (link later)</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Review & create</CardTitle>
            <CardDescription>Client starts as draft. Activate when branding and modules are ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><strong>Name:</strong> {name}</p>
            <p><strong>Slug:</strong> {finalSlug}</p>
            <p>
              <strong>Wialon:</strong>{' '}
              {wialonAccountId
                ? `${wialonAccountName || wialonAccountId}${wialonMotherAccountId ? ` (mother ${wialonMotherAccountId.slice(0, 8)}…)` : ''} · ${wialonUserIds.length} users`
                : 'Not linked yet'}
            </p>
            {testResult && (
              <p className="text-primary text-xs">Tested: {testResult.unitCount} units, {testResult.userCount} users</p>
            )}
            <div className="flex gap-2 pt-2">
              <LoadingButton loading={create.isPending} onClick={() => create.mutate()} disabled={!name.trim()}>
                Create client
              </LoadingButton>
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AdminLayout>
  );
}
