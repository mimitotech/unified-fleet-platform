/**
 * Print / PDF export for live Dashboard and Fuel sections.
 * Captures the on-screen DOM (KPIs + Recharts) with a print-tuned layout:
 * equal narrow margins, no empty side gutters, no clipped titles, and
 * page breaks that fall between charts — never through the middle of one.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PrintReportMode } from '@/lib/printReport';

export type PrintSectionOpts = {
  root: HTMLElement;
  title: string;
  filename?: string;
  mode?: PrintReportMode;
  primaryColor?: string;
  /** Capture width in CSS px — keeps charts dense and avoids empty right space. */
  captureWidthPx?: number;
};

const PRINT_MARGIN_MM = 6;
/** Dense capture width that maps cleanly to A4 landscape content width. */
const DEFAULT_CAPTURE_WIDTH = 1180;
/** Prefer not to leave a page less than this fraction full before a break. */
const MIN_PAGE_FILL = 0.18;

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'dashboard';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type StyleRestore = () => void;

type Band = { top: number; bottom: number };

function patchStyle(
  el: HTMLElement,
  next: Partial<CSSStyleDeclaration> & Record<string, string>,
): StyleRestore {
  const prev: Record<string, string> = {};
  for (const key of Object.keys(next)) {
    prev[key] = el.style.getPropertyValue(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value != null) el.style.setProperty(key, String(value));
  }
  return () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value) el.style.setProperty(key, value);
      else el.style.removeProperty(key);
    }
  };
}

/**
 * Temporarily reshape the live section so html2canvas sees a tight, readable
 * layout (titles not truncated, no hover transforms, charts not clipped).
 */
function prepareLiveRootForCapture(
  root: HTMLElement,
  captureWidth: number,
): { restore: () => void } {
  const restores: StyleRestore[] = [];
  const hideRestores: StyleRestore[] = [];

  restores.push(
    patchStyle(root, {
      width: `${captureWidth}px`,
      maxWidth: `${captureWidth}px`,
      minWidth: `${captureWidth}px`,
      margin: '0',
      padding: '10px',
      boxSizing: 'border-box',
      background: '#ffffff',
      overflow: 'visible',
      position: 'relative',
    }),
  );

  root
    .querySelectorAll(
      [
        '[data-no-print]',
        '[role="tablist"]',
        '.recharts-tooltip-wrapper',
        '[data-arrange-id] > .absolute',
        'button',
      ].join(','),
    )
    .forEach((node) => {
      const el = node as HTMLElement;
      if (el.closest('[data-keep-print]')) return;
      hideRestores.push(patchStyle(el, { display: 'none' }));
    });

  root.querySelectorAll<HTMLElement>('section header a[href], section > header a[href]').forEach((el) => {
    hideRestores.push(patchStyle(el, { display: 'none' }));
  });
  root.querySelectorAll<HTMLElement>('a[href]').forEach((el) => {
    if (/^\s*Open\s*$/i.test(el.textContent || '')) {
      hideRestores.push(patchStyle(el, { display: 'none' }));
    }
  });

  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const cs = el.style;
    if (
      cs.transform ||
      cs.animation ||
      cs.transition ||
      el.className?.toString().includes('animate-') ||
      el.className?.toString().includes('hover:-translate')
    ) {
      restores.push(
        patchStyle(el, {
          transform: 'none',
          animation: 'none',
          transition: 'none',
          translate: 'none',
        }),
      );
    }
  });

  root
    .querySelectorAll<HTMLElement>(
      '[data-dashboard-widget], [data-print-keep], section, [class*="rounded-xl"], [class*="overflow-hidden"]',
    )
    .forEach((el) => {
      restores.push(
        patchStyle(el, {
          overflow: 'visible',
          transform: 'none',
          boxShadow: '0 0 0 1px rgba(15,23,42,0.08)',
          minHeight: '0',
        }),
      );
    });

  root.querySelectorAll<HTMLElement>('[data-arrange-id]').forEach((el) => {
    restores.push(
      patchStyle(el, {
        minWidth: '0',
        maxWidth: '100%',
        overflow: 'visible',
      }),
    );
  });

  root.querySelectorAll<HTMLElement>('.blur-2xl, [class*="blur-"]').forEach((el) => {
    hideRestores.push(patchStyle(el, { display: 'none' }));
  });

  root
    .querySelectorAll<HTMLElement>(
      'h1, h2, h3, h4, p, span, [class*="truncate"], [class*="line-clamp"]',
    )
    .forEach((el) => {
      restores.push(
        patchStyle(el, {
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'normal',
          WebkitLineClamp: 'unset',
          display: el.tagName === 'SPAN' ? '' : el.style.display,
          maxHeight: 'none',
        }),
      );
    });

  root.querySelectorAll<HTMLElement>('.recharts-wrapper, .recharts-surface, [data-chart]').forEach((el) => {
    restores.push(
      patchStyle(el, {
        overflow: 'visible',
        width: '100%',
      }),
    );
  });

  root.querySelectorAll<HTMLElement>('.recharts-responsive-container').forEach((el) => {
    restores.push(
      patchStyle(el, {
        overflow: 'visible',
        width: '100%',
        minHeight: '200px',
      }),
    );
  });

  root.querySelectorAll('text').forEach((text) => {
    const el = text as SVGTextElement;
    const prevSize = el.getAttribute('font-size');
    const prevFill = el.getAttribute('fill');
    restores.push(() => {
      if (prevSize == null) el.removeAttribute('font-size');
      else el.setAttribute('font-size', prevSize);
      if (prevFill == null) el.removeAttribute('fill');
      else el.setAttribute('fill', prevFill);
    });
    const n = Number(prevSize || 10);
    if (n > 0 && n < 11) el.setAttribute('font-size', '11');
    if (!prevFill || prevFill === '#64748b' || prevFill === 'currentColor') {
      el.setAttribute('fill', '#334155');
    }
  });

  root.querySelectorAll<HTMLElement>('[class*="grid"]').forEach((el) => {
    restores.push(
      patchStyle(el, {
        width: '100%',
        maxWidth: '100%',
        gap: el.style.gap || '10px',
      }),
    );
  });

  return {
    restore: () => {
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
      for (let i = hideRestores.length - 1; i >= 0; i--) hideRestores[i]();
    },
  };
}

/**
 * Collect vertical bands that must stay together (a chart, KPI strip, card).
 * Side-by-side tiles that share a row are merged into one band so we never
 * cut through a row of charts.
 */
function collectUnbreakableBands(root: HTMLElement): Band[] {
  const rootRect = root.getBoundingClientRect();
  const raw: Band[] = [];

  const selectors = [
    '[data-print-keep]',
    '[data-dashboard-widget]',
    '[data-arrange-id]',
    '.stat-strip',
    '.branded-panel',
    '.fleet-card',
  ];

  const seen = new Set<HTMLElement>();
  for (const sel of selectors) {
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (seen.has(el)) return;
      // Prefer outermost keep block — skip nested widgets inside an arrange cell
      // when the cell itself is already collected... still collect widgets.
      if (el.offsetParent === null && el.style.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < 8) return;
      const top = r.top - rootRect.top + root.scrollTop;
      const bottom = r.bottom - rootRect.top + root.scrollTop;
      if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return;
      seen.add(el);
      raw.push({ top, bottom });
    });
  }

  if (!raw.length) return [];

  raw.sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  // Merge overlapping / nearly-adjacent bands (same chart row).
  const merged: Band[] = [];
  const ROW_SLOP = 12;
  for (const band of raw) {
    const last = merged[merged.length - 1];
    if (last && band.top <= last.bottom + ROW_SLOP) {
      last.bottom = Math.max(last.bottom, band.bottom);
      last.top = Math.min(last.top, band.top);
    } else {
      merged.push({ ...band });
    }
  }
  return merged;
}

/**
 * Build page-start Y positions (CSS px) so cuts land in gaps between bands.
 */
function buildPageStarts(
  totalHeight: number,
  pageHeightCss: number,
  bands: Band[],
): number[] {
  if (totalHeight <= pageHeightCss) return [0];

  const starts: number[] = [0];
  let start = 0;

  while (start + pageHeightCss < totalHeight - 2) {
    const idealEnd = start + pageHeightCss;
    const minEnd = start + pageHeightCss * MIN_PAGE_FILL;

    // If idealEnd sits inside a band, cut before that band (keep chart whole).
    let cut = idealEnd;
    for (const b of bands) {
      if (b.top < idealEnd && b.bottom > idealEnd) {
        // Would split this band.
        if (b.top > minEnd) {
          cut = b.top;
        } else if (b.bottom - start <= pageHeightCss * 1.02 && b.bottom > start) {
          // Band almost fits on this page — end just after it.
          cut = Math.min(b.bottom + 6, totalHeight);
        } else {
          // Band taller than a page (or starts too early): unavoidable split —
          // keep the default idealEnd.
          cut = idealEnd;
        }
        break;
      }
    }

    // Prefer ending at the bottom of the last band that fully fits.
    let lastFittingBottom = 0;
    for (const b of bands) {
      if (b.bottom > start && b.bottom <= idealEnd + 4) {
        lastFittingBottom = Math.max(lastFittingBottom, b.bottom);
      }
    }
    if (lastFittingBottom > minEnd) {
      // If our tentative cut would leave a lonely partial band, snap to last full band.
      const splitsBand = bands.some((b) => b.top < cut && b.bottom > cut);
      if (splitsBand || idealEnd - lastFittingBottom < pageHeightCss * 0.35) {
        cut = Math.min(lastFittingBottom + 8, totalHeight);
      }
    }

    if (cut <= start + 4) cut = idealEnd;
    if (cut >= totalHeight - 2) break;

    starts.push(cut);
    start = cut;
  }

  return starts;
}

type CaptureResult = {
  canvas: HTMLCanvasElement;
  /** CSS px height of the captured root. */
  cssHeight: number;
  /** Y offsets (CSS px) where each PDF/print page should start. */
  pageStarts: number[];
};

async function captureRoot(
  root: HTMLElement,
  captureWidth: number,
  pageHeightCss: number,
): Promise<CaptureResult> {
  const { restore } = prepareLiveRootForCapture(root, captureWidth);

  try {
    window.dispatchEvent(new Event('resize'));
    await delay(80);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    await delay(280);

    const bands = collectUnbreakableBands(root);
    const width = Math.ceil(
      Math.max(root.scrollWidth, root.offsetWidth, captureWidth),
    );
    const cssHeight = Math.ceil(Math.max(root.scrollHeight, root.offsetHeight, 400));
    const pageStarts = buildPageStarts(cssHeight, pageHeightCss, bands);

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width,
      height: cssHeight,
      windowWidth: width,
      windowHeight: cssHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (_doc, clonedRoot) => {
        clonedRoot.style.width = `${captureWidth}px`;
        clonedRoot.style.maxWidth = `${captureWidth}px`;
        clonedRoot.style.overflow = 'visible';
        clonedRoot.style.background = '#ffffff';
        clonedRoot.querySelectorAll<HTMLElement>('*').forEach((el) => {
          el.style.transform = 'none';
          el.style.animation = 'none';
        });
        clonedRoot
          .querySelectorAll<HTMLElement>(
            '[data-no-print], [role="tablist"], .recharts-tooltip-wrapper, button, .blur-2xl',
          )
          .forEach((el) => {
            el.style.display = 'none';
          });
        clonedRoot
          .querySelectorAll<HTMLElement>('section, [class*="overflow-hidden"]')
          .forEach((el) => {
            el.style.overflow = 'visible';
          });
        clonedRoot
          .querySelectorAll<HTMLElement>('h3, h2, p, [class*="truncate"]')
          .forEach((el) => {
            el.style.overflow = 'visible';
            el.style.whiteSpace = 'normal';
            el.style.textOverflow = 'clip';
          });
      },
    });

    return { canvas, cssHeight, pageStarts };
  } finally {
    restore();
    window.dispatchEvent(new Event('resize'));
  }
}

/** Slice the master capture into one canvas per page (CSS y0 → y1). */
function sliceCanvas(
  canvas: HTMLCanvasElement,
  cssHeight: number,
  y0: number,
  y1: number,
): HTMLCanvasElement {
  const scale = canvas.height / Math.max(cssHeight, 1);
  const sy0 = Math.max(0, Math.floor(y0 * scale));
  const sy1 = Math.min(canvas.height, Math.ceil(y1 * scale));
  const h = Math.max(1, sy1 - sy0);

  const slice = document.createElement('canvas');
  slice.width = canvas.width;
  slice.height = h;
  const ctx = slice.getContext('2d');
  if (!ctx) return slice;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, slice.width, slice.height);
  ctx.drawImage(canvas, 0, sy0, canvas.width, h, 0, 0, canvas.width, h);
  return slice;
}

/**
 * Place each page slice on A4 with equal narrow margins.
 * Slices are chosen so charts are not cut mid-widget.
 */
function slicesToPdf(slices: HTMLCanvasElement[], landscape: boolean): jsPDF {
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = PRINT_MARGIN_MM;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  slices.forEach((slice, i) => {
    if (i > 0) pdf.addPage();

    const imgWidth = contentWidth;
    let imgHeight = (slice.height * imgWidth) / slice.width;
    // Never exceed the printable area — rare oversize bands scale down.
    if (imgHeight > contentHeight) {
      const scale = contentHeight / imgHeight;
      imgHeight = contentHeight;
      const fittedWidth = imgWidth * scale;
      const x = margin + (contentWidth - fittedWidth) / 2;
      const imgData = slice.toDataURL('image/jpeg', 0.93);
      pdf.addImage(imgData, 'JPEG', x, margin, fittedWidth, imgHeight);
    } else {
      const imgData = slice.toDataURL('image/jpeg', 0.93);
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    }
  });

  return pdf;
}

function pageHeightCssForLandscape(captureWidth: number): number {
  // A4 landscape printable area ≈ 285 × 198 mm. Map capture width to that.
  const contentWmm = 297 - PRINT_MARGIN_MM * 2;
  const contentHmm = 210 - PRINT_MARGIN_MM * 2;
  return (captureWidth * contentHmm) / contentWmm;
}

/**
 * Capture a live page section (KPIs + charts) and download / print it.
 */
export async function printPageSection(opts: PrintSectionOpts): Promise<void> {
  const {
    root,
    title,
    filename: filenameOpt,
    mode = 'both',
    primaryColor = '#004225',
    captureWidthPx = DEFAULT_CAPTURE_WIDTH,
  } = opts;

  const landscape = true;
  const pageHeightCss = pageHeightCssForLandscape(captureWidthPx);
  const { canvas, cssHeight, pageStarts } = await captureRoot(
    root,
    captureWidthPx,
    pageHeightCss,
  );

  const ends = [...pageStarts.slice(1), cssHeight];
  const slices = pageStarts.map((y0, i) =>
    sliceCanvas(canvas, cssHeight, y0, ends[i]),
  );

  const filename = filenameOpt?.replace(/\.pdf$/i, '') || sanitizeFilename(title);

  if (mode === 'download' || mode === 'both') {
    const pdf = slicesToPdf(slices, landscape);
    pdf.setProperties({
      title,
      subject: `Exported ${new Date().toISOString()}`,
      creator: 'MAMS',
    });
    void primaryColor;
    pdf.save(`${filename}.pdf`);
  }

  if (mode === 'print' || mode === 'both') {
    await printCanvasSlices(slices, title, landscape);
  }
}

function printCanvasSlices(
  slices: HTMLCanvasElement[],
  title: string,
  landscape: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Print dashboard');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      resolve();
      return;
    }
    const page = landscape ? 'A4 landscape' : 'A4 portrait';
    const imgs = slices
      .map(
        (s, i) =>
          `<div class="page${i === slices.length - 1 ? ' last' : ''}"><img src="${s.toDataURL('image/jpeg', 0.93)}" alt="${escapeHtml(title)} page ${i + 1}" /></div>`,
      )
      .join('\n');

    doc.open();
    doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${page}; margin: ${PRINT_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 100%;
    margin: 0;
    padding: 0;
    page-break-after: always;
    break-after: page;
  }
  .page.last {
    page-break-after: auto;
    break-after: auto;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    margin: 0;
    padding: 0;
  }
</style></head><body>${imgs}</body></html>`);
    doc.close();

    const run = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 1500);
        resolve();
      }
    };

    const waitImgs = Array.from(doc.images || []);
    Promise.all(
      waitImgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((r) => {
                img.onload = () => r();
                img.onerror = () => r();
              }),
      ),
    ).then(() => setTimeout(run, 200));
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
