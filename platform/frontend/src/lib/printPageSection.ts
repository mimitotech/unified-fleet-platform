/**
 * Print / PDF export for live Dashboard and Fuel sections.
 * Captures the on-screen DOM (KPIs + Recharts) with a print-tuned layout:
 * equal narrow margins, no empty side gutters, no clipped titles, no overlap.
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

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'dashboard';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type StyleRestore = () => void;

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
): { restore: () => void; hideRestores: StyleRestore[] } {
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

  // Hide chrome that should not appear on the export.
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

  // Widget "Open" links only — keep other anchors if they carry content.
  root.querySelectorAll<HTMLElement>('section header a[href], section > header a[href]').forEach((el) => {
    hideRestores.push(patchStyle(el, { display: 'none' }));
  });
  root.querySelectorAll<HTMLElement>('a[href]').forEach((el) => {
    if (/^\s*Open\s*$/i.test(el.textContent || '')) {
      hideRestores.push(patchStyle(el, { display: 'none' }));
    }
  });

  // Kill motion that causes html2canvas to mis-place overlapping tiles.
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

  // Widget / card shells: stop clipping titles and chart labels.
  root
    .querySelectorAll<HTMLElement>(
      '[data-dashboard-widget], section, [class*="rounded-xl"], [class*="overflow-hidden"]',
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

  // Arrange grid cells — keep tiles packed, no stretch gaps on the right.
  root.querySelectorAll<HTMLElement>('[data-arrange-id]').forEach((el) => {
    restores.push(
      patchStyle(el, {
        minWidth: '0',
        maxWidth: '100%',
        overflow: 'visible',
      }),
    );
  });

  // Decorative blurs / glow orbs — hide so they don't wash out text.
  root.querySelectorAll<HTMLElement>('.blur-2xl, [class*="blur-"]').forEach((el) => {
    hideRestores.push(patchStyle(el, { display: 'none' }));
  });

  // Titles / subtitles must wrap fully — truncate cuts them in the PDF.
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

  // Recharts: force visible overflow and readable tick labels.
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

  // Chart axis / legend text — slightly larger for print legibility.
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

  // Grid gaps stay tight so tiles sit next to each other, not drifting.
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
    hideRestores,
  };
}

async function captureRoot(
  root: HTMLElement,
  captureWidth: number,
): Promise<HTMLCanvasElement> {
  const { restore } = prepareLiveRootForCapture(root, captureWidth);

  try {
    // Let Recharts reflow at the fixed print width.
    window.dispatchEvent(new Event('resize'));
    await delay(80);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    await delay(280);

    const width = Math.ceil(
      Math.max(root.scrollWidth, root.offsetWidth, captureWidth),
    );
    const height = Math.ceil(Math.max(root.scrollHeight, root.offsetHeight, 400));

    return await html2canvas(root, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width,
      height,
      windowWidth: width,
      windowHeight: height,
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
  } finally {
    restore();
    window.dispatchEvent(new Event('resize'));
  }
}

/**
 * Place the capture on A4 with equal narrow margins on every side.
 * Width-fitted so there is no empty gutter on the right.
 */
function canvasToPdf(canvas: HTMLCanvasElement, landscape: boolean): jsPDF {
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

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.93);

  let heightLeft = imgHeight;
  let offsetY = 0;

  while (heightLeft > 0) {
    if (offsetY > 0) pdf.addPage();

    // Draw the full image, shifted up so each page shows the next slice.
    pdf.addImage(imgData, 'JPEG', margin, margin - offsetY, imgWidth, imgHeight);

    // White masks so content never bleeds into the equal margins.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, margin, 'F');
    pdf.rect(0, pageHeight - margin, pageWidth, margin, 'F');
    pdf.rect(0, 0, margin, pageHeight, 'F');
    pdf.rect(pageWidth - margin, 0, margin, pageHeight, 'F');

    heightLeft -= contentHeight;
    offsetY += contentHeight;
  }

  return pdf;
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

  const canvas = await captureRoot(root, captureWidthPx);
  // Dashboards / fuel boards are wide — landscape keeps charts readable.
  const landscape = true;
  const filename = filenameOpt?.replace(/\.pdf$/i, '') || sanitizeFilename(title);

  if (mode === 'download' || mode === 'both') {
    const pdf = canvasToPdf(canvas, landscape);
    pdf.setProperties({
      title,
      subject: `Exported ${new Date().toISOString()}`,
      creator: 'MAMS',
    });
    void primaryColor;
    pdf.save(`${filename}.pdf`);
  }

  if (mode === 'print' || mode === 'both') {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
    await printCanvasImage(dataUrl, title, landscape);
  }
}

function printCanvasImage(
  dataUrl: string,
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
  .sheet {
    width: 100%;
    margin: 0;
    padding: 0;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    margin: 0;
    padding: 0;
  }
</style></head><body><div class="sheet"><img src="${dataUrl}" alt="${escapeHtml(title)}" /></div></body></html>`);
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

    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.onload = () => setTimeout(run, 200);
      img.onerror = () => setTimeout(run, 200);
    } else {
      setTimeout(run, 200);
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
