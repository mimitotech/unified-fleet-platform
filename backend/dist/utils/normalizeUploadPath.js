/**
 * Normalize branding asset URLs to same-origin relative paths.
 * Always store `/uploads/...` — never localhost or absolute host URLs.
 */
export function normalizeUploadPath(value) {
    if (value == null)
        return null;
    const s = String(value).trim();
    if (!s)
        return null;
    const local = s.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
    if (local)
        return local[3];
    // Absolute production URL pointing at our uploads — keep only the path
    const absUpload = s.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i);
    if (absUpload)
        return absUpload[1];
    if (s.startsWith('/uploads/'))
        return s;
    // Bare tenants/... path from older bugs
    if (s.startsWith('tenants/'))
        return `/uploads/${s}`;
    // External https logo (pasted CDN) — keep as-is
    if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) {
        return s;
    }
    return s.startsWith('/') ? s : `/${s}`;
}
