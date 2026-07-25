import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notify } from '@/lib/notify';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminLoginTrustLogo = {
  id: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isEnabled: boolean;
};

type FormState = {
  name: string;
  sortOrder: number;
  isEnabled: boolean;
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
  previewUrl?: string;
};

const emptyForm = (): FormState => ({
  name: '',
  sortOrder: 0,
  isEnabled: true,
});

function fileToBase64(file: File): Promise<{ fileName: string; mimeType: string; dataBase64: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        fileName: file.name,
        mimeType: file.type || 'image/png',
        dataBase64: dataUrl,
        previewUrl: dataUrl,
      });
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

export function LoginTrustLogosAdminPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['adminLoginTrustLogos'],
    queryFn: () => adminApi.listLoginTrustLogos(),
  });
  const logos = useMemo(() => data?.logos ?? [], [data]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['adminLoginTrustLogos'] });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.createLoginTrustLogo({
        name: form.name,
        sortOrder: form.sortOrder,
        isEnabled: form.isEnabled,
        fileName: form.fileName,
        mimeType: form.mimeType,
        dataBase64: form.dataBase64,
      }),
    onSuccess: () => {
      notify.success('Client logo added');
      setShowForm(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => notify.error('Create failed', e.message),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      adminApi.updateLoginTrustLogo(editingId!, {
        name: form.name,
        sortOrder: form.sortOrder,
        isEnabled: form.isEnabled,
        fileName: form.fileName,
        mimeType: form.mimeType,
        dataBase64: form.dataBase64,
      }),
    onSuccess: () => {
      notify.success('Logo updated');
      setEditingId(null);
      setShowForm(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => notify.error('Update failed', e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      adminApi.updateLoginTrustLogo(id, { isEnabled }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => notify.error('Could not update status', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteLoginTrustLogo(id),
    onSuccess: () => {
      notify.success('Logo deleted');
      invalidate();
    },
    onError: (e: Error) => notify.error('Delete failed', e.message),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), sortOrder: logos.length });
    setShowForm(true);
  };

  const startEdit = (logo: AdminLoginTrustLogo) => {
    setEditingId(logo.id);
    setForm({
      name: logo.name,
      sortOrder: logo.sortOrder,
      isEnabled: logo.isEnabled,
      previewUrl: logo.imageUrl || undefined,
    });
    setShowForm(true);
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg')) {
      notify.error('Choose an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify.error('Logo must be 2 MB or smaller');
      return;
    }
    try {
      const packed = await fileToBase64(file);
      setForm((f) => ({ ...f, ...packed }));
    } catch (e) {
      notify.error('Could not read image', (e as Error).message);
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Client trust logos</CardTitle>
          <CardDescription>
            Logos shown in the “Trusted by” strip on the login page. Prefer transparent PNG or SVG
            on a light / clear background, roughly square or wide — they display small and scroll
            continuously.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add logo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3 max-w-xl">
            <p className="text-sm font-semibold">{editingId ? 'Edit logo' : 'New client logo'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Client name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Acme Logistics"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2 self-end pb-1">
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
                />
                <Label>Enabled on login</Label>
              </div>
              <div className="sm:col-span-2">
                <Label>Logo image</Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
                  className="mt-1"
                  onChange={(e) => void onPickImage(e.target.files?.[0] || null)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  PNG/SVG preferred (max 2 MB). Logos display about 48–56px tall on the login strip.
                </p>
                {form.previewUrl && (
                  <div className="mt-2 flex h-16 w-40 items-center justify-center rounded-md border border-border/50 bg-white px-3">
                    <img src={form.previewUrl} alt="" className="max-h-10 max-w-full object-contain" />
                  </div>
                )}
                {editingId && !form.dataBase64 && (
                  <p className="text-xs text-muted-foreground mt-1">Leave empty to keep the current logo.</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving || !form.name.trim() || (!editingId && !form.dataBase64)}
                onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Add logo'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading logos…
          </div>
        ) : logos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No client logos yet. Add logos here to show a “Trusted by” strip on the login page.
          </p>
        ) : (
          <ul className="space-y-2">
            {logos.map((logo) => (
              <li
                key={logo.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-border/60 p-2.5',
                  !logo.isEnabled && 'opacity-60',
                )}
              >
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-border/40 bg-white px-2">
                  {logo.imageUrl ? (
                    <img src={logo.imageUrl} alt="" className="max-h-8 max-w-full object-contain" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{logo.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">Order {logo.sortOrder}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={logo.isEnabled}
                    onCheckedChange={(v) => toggleMut.mutate({ id: logo.id, isEnabled: v })}
                    aria-label="Enable logo"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => startEdit(logo)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete “${logo.name}”?`)) deleteMut.mutate(logo.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
