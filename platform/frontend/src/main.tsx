import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { hydrateTenantThemeFromCache } from '@/lib/tenantBrandingCache';
import { applyDefaultDocumentBranding } from '@/lib/favicon';
import { syncTenantPreviewFromUrl } from '@/lib/adminTenantPreview';
import App from './App';
import './styles/globals.css';

// Admin "View Client" opens /app/dashboard?tenant=<slug> — bind slug before any API calls.
syncTenantPreviewFromUrl();
applyDefaultDocumentBranding();
hydrateTenantThemeFromCache();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 8_000,
      retry: 1,
      refetchIntervalInBackground: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Drop any leftover MAMS / legacy service workers so deploys always load live.
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if (typeof caches !== 'undefined') {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  });
}
