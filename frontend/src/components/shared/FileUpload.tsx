import { useRef, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  label?: string;
  accept?: string;
  previewUrl?: string;
  onUpload: (file: File, preview: string) => void | Promise<void>;
  className?: string;
}

export function FileUpload({ label = 'Upload image', accept = 'image/*', previewUrl, onUpload, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(previewUrl);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setUploading(true);
      try {
        await onUpload(file, dataUrl);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
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
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Choose file'}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPreview(undefined); if (inputRef.current) inputRef.current.value = ''; }}>
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG · Max 5MB</p>
        </div>
      </div>
    </div>
  );
}
