import { toast } from 'sonner';

export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string) => toast.info(message, { description }),
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string | number) => toast.dismiss(id),
  promise: toast.promise,
};

export async function withToast<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error?: string }
): Promise<T> {
  return toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: (err) => messages.error || (err as Error).message || 'Something went wrong',
  });
}
