/** Cleared on logout / login so map views never leak between accounts */

const KEY_PREFIX = 'ufp_map_viewport';

export function clearAllMapViewports(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* private mode */
  }
}
