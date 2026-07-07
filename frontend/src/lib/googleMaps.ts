/** Load Google Maps JavaScript API once (required for Leaflet.GoogleMutant). */

declare global {
  interface Window {
    google?: {
      maps?: unknown;
    };
  }
}

let loadPromise: Promise<void> | null = null;

export function getGoogleMapsKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim() || undefined;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(getGoogleMapsKey());
}

export function loadGoogleMapsApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  const key = getGoogleMapsKey();
  if (!key) return Promise.reject(new Error('VITE_GOOGLE_MAPS_KEY is not set'));

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed')));
      if (window.google?.maps) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsApi = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps API'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
