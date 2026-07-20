import { Toaster as Sonner, toast } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      theme="light"
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'animate-scale-in shadow-lg border border-border/60 backdrop-blur-sm',
          title: 'font-semibold',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}

export { toast };
