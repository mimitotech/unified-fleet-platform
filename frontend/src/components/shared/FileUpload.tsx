import { useEffect, useRef, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveAssetUrl } from '@/lib/assets';

interface FileUploadProps {
  label?: string;
  accept?: string;
  previewUrl?: string;
  onUpload: (file: File, preview: string) => void | Promise<void>;
  /** Clears preview and notifies parent so branding state/DB can drop the logo. */
  onClear?: () => void | Promise<void>;
  className?: string;
}

export function FileUpload({
  label = 'Upload image',
  accept = 'image/*',
  previewUrl,
  onUpload,
  onClear,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Keep the just-uploaded data URL so admin preview does not flash 404 while /uploads hydrates. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(
    resolveAssetUrl(previewUrl) || previewUrl || undefined
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localPreview) return;
    setPreview(resolveAssetUrl(previewUrl) || previewUrl || undefined);
  }, [previewUrl, localPreview]);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError('File exceeds 5MB limit');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setLocalPreview(dataUrl);
      setPreview(dataUrl);
      setUploading(true);
      try {
        await onUpload(file, dataUrl);
      } catch (e) {
        setError((e as Error)?.message || 'Upload failed');
        setLocalPreview(null);
        setPreview(resolveAssetUrl(previewUrl) || previewUrl || undefined);
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => setError('Could not read file');
    reader.readAsDataURL(file);
  };

  const handleClear = async () => {
    setPreview(undefined);
    setLocalPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    await onClear?.();
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Choose file'}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleClear()}>
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG, WebP, ICO · Max 5MB</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
