/**
 * Print / PDF export for live dashboard sections (Dashboard, Fuel, etc.).
 * Captures the on-screen DOM — including Recharts — into a multi-page PDF.
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
};

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'dashboard';
}

async function captureRoot(root: HTMLElement): Promise<HTMLCanvasElement> {
  // Prefer cloning-side hides so the live UI does not flicker.
  window.dispatchEvent(new Event('resize'));
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
  await new Promise((r) => setTimeout(r, 120));

  return await html2canvas(root, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: Math.max(root.scrollWidth, root.clientWidth),
    width: Math.max(root.scrollWidth, root.clientWidth),
    height: Math.max(root.scrollHeight, root.clientHeight),
    onclone: (_doc, clonedRoot) => {
      clonedRoot
        .querySelectorAll('[data-no-print], [role="tablist"]')
        .forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });
      clonedRoot.querySelectorAll('.recharts-tooltip-wrapper').forEach((el) => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
      // Drop interactive chrome inside the export only.
      clonedRoot.querySelectorAll('button').forEach((el) => {
        const host = el as HTMLElement;
        if (host.closest('[data-keep-print]')) return;
        host.style.display = 'none';
      });
    },
  });
}

function canvasToPdf(canvas: HTMLCanvasElement, landscape: boolean): jsPDF {
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return pdf;
}

/**
 * Capture a live page section (KPIs + charts) and download / print it.
 * Prefer landscape when the section is wider than it is tall.
 */
export async function printPageSection(opts: PrintSectionOpts): Promise<void> {
  const {
    root,
    title,
    filename: filenameOpt,
    mode = 'both',
    primaryColor = '#004225',
  } = opts;

  const canvas = await captureRoot(root);
  const landscape = root.scrollWidth > root.scrollHeight * 0.85;
  const filename = filenameOpt?.replace(/\.pdf$/i, '') || sanitizeFilename(title);

  if (mode === 'download' || mode === 'both') {
    const pdf = canvasToPdf(canvas, landscape);
    // Lightweight title stamp on first page metadata
    pdf.setProperties({ title, subject: `Exported ${new Date().toISOString()}` });
    void primaryColor;
    pdf.save(`${filename}.pdf`);
  }

  if (mode === 'print' || mode === 'both') {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
  @page { size: ${page}; margin: 8mm; }
  body { margin: 0; }
  img { width: 100%; height: auto; display: block; }
</style></head><body><img src="${dataUrl}" alt="${escapeHtml(title)}" /></body></html>`);
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
