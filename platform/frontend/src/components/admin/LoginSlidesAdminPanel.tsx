import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notify } from '@/lib/notify';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminLoginSlide = {
  id: string;
  title: string;
  details: string | null;
  eyebrow: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isEnabled: boolean;
};

type FormState = {
  title: string;
  details: string;
  eyebrow: string;
  sortOrder: number;
  isEnabled: boolean;
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
  previewUrl?: string;
};

const emptyForm = (): FormState => ({
  title: '',
  details: '',
  eyebrow: '',
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
        mimeType: file.type || 'image/jpeg',
        dataBase64: dataUrl,
        previewUrl: dataUrl,
      });
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

export function LoginSlidesAdminPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['adminLoginSlides'],
    queryFn: () => adminApi.listLoginSlides(),
  });
  const slides = useMemo(() => data?.slides ?? [], [data]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['adminLoginSlides'] });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.createLoginSlide({
        title: form.title,
        details: form.details || null,
        eyebrow: form.eyebrow || null,
        sortOrder: form.sortOrder,
        isEnabled: form.isEnabled,
        fileName: form.fileName,
        mimeType: form.mimeType,
        dataBase64: form.dataBase64,
      }),
    onSuccess: () => {
      notify.success('Slide created');
      setShowForm(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => notify.error('Create failed', e.message),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      adminApi.updateLoginSlide(editingId!, {
        title: form.title,
        details: form.details || null,
        eyebrow: form.eyebrow || null,
        sortOrder: form.sortOrder,
        isEnabled: form.isEnabled,
        fileName: form.fileName,
        mimeType: form.mimeType,
        dataBase64: form.dataBase64,
      }),
    onSuccess: () => {
      notify.success('Slide updated');
      setEditingId(null);
      setShowForm(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => notify.error('Update failed', e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      adminApi.updateLoginSlide(id, { isEnabled }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => notify.error('Could not update status', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteLoginSlide(id),
    onSuccess: () => {
      notify.success('Slide deleted');
      invalidate();
    },
    onError: (e: Error) => notify.error('Delete failed', e.message),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), sortOrder: slides.length });
    setShowForm(true);
  };

  const startEdit = (s: AdminLoginSlide) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      details: s.details || '',
      eyebrow: s.eyebrow || '',
      sortOrder: s.sortOrder,
      isEnabled: s.isEnabled,
      previewUrl: s.imageUrl || undefined,
    });
    setShowForm(true);
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('Choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error('Image must be 5 MB or smaller');
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
          <CardTitle>Login slideshow</CardTitle>
          <CardDescription>
            Images, titles and details shown on the public login page. Disabled slides stay saved but hidden.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add slide
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3 max-w-2xl">
            <p className="text-sm font-semibold">{editingId ? 'Edit slide' : 'New slide'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="See every asset, live"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Eyebrow (optional)</Label>
                <Input
                  value={form.eyebrow}
                  onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))}
                  placeholder="Real-time GPS"
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
              <div className="sm:col-span-2">
                <Label>Details</Label>
                <Textarea
                  value={form.details}
                  onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  placeholder="Track vehicles, generators, and equipment on one map."
                  className="mt-1 min-h-[72px]"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Image</Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="mt-1"
                  onChange={(e) => void onPickImage(e.target.files?.[0] || null)}
                />
                {form.previewUrl && (
                  <div
                    className="mt-2 h-28 rounded-md bg-cover bg-center border border-border/50"
                    style={{ backgroundImage: `url('${form.previewUrl}')` }}
                  />
                )}
                {editingId && !form.dataBase64 && (
                  <p className="text-xs text-muted-foreground mt-1">Leave empty to keep the current image.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
                />
                <Label>Enabled on login page</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving || !form.title.trim() || (!editingId && !form.dataBase64)}
                onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Create slide'}
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
            Loading slides…
          </div>
        ) : slides.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No slides yet. Add media here, or the login page will use the built-in defaults.
          </p>
        ) : (
          <ul className="space-y-2">
            {slides.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-border/60 p-2.5',
                  !s.isEnabled && 'opacity-60',
                )}
              >
                <div className="h-14 w-24 shrink-0 rounded-md bg-neutral-900 border border-border/40 overflow-hidden flex items-center justify-center">
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{s.title}</p>
                  {s.eyebrow && <p className="text-[11px] text-muted-foreground truncate">{s.eyebrow}</p>}
                  {s.details && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.details}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">Order {s.sortOrder}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={s.isEnabled}
                    onCheckedChange={(v) => toggleMut.mutate({ id: s.id, isEnabled: v })}
                    aria-label="Enable slide"
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => startEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete “${s.title}”?`)) deleteMut.mutate(s.id);
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
