/** Build printable HTML and export as PDF or browser print. */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export type PrintReportMode = 'download' | 'print' | 'both';

export async function printReportDocument(opts: {
  root: HTMLElement;
  title: string;
  primaryColor?: string;
  secondaryColor?: string;
  mode?: PrintReportMode;
  /** Capture charts from this node (e.g. on-screen preview) instead of `root`. */
  chartSourceRoot?: HTMLElement | null;
  /** Download basename without extension — falls back to sanitized title. */
  filename?: string;
}): Promise<void> {
  const {
    root,
    title,
    primaryColor = '#004225',
    secondaryColor = '#0f172a',
    mode = 'both',
    chartSourceRoot,
    filename: filenameOpt,
  } = opts;

  // Snapshot charts from the live on-screen preview when provided so PDF matches exactly.
  const chartSnapshots = await captureChartCards(chartSourceRoot || root);

  const clone = root.cloneNode(true) as HTMLElement;
  applyChartSnapshots(clone, chartSnapshots);
  const { maxColumns, landscape } = preparePrintRoot(clone);
  await embedImages(clone);

  const html = buildReportHtml(clone, {
    title,
    primaryColor,
    secondaryColor,
    maxColumns,
    landscape,
  });
  const filename = filenameOpt?.replace(/\.pdf$/i, '') || sanitizeFilename(title);

  if (mode === 'download' || mode === 'both') {
    await downloadPdf(html, filename, landscape);
  }

  if (mode === 'print' || mode === 'both') {
    await printHtml(html);
  }
}

/** Rasterize each chart card with export-friendly sizing so titles/keys stay readable. */
async function captureChartCards(root: HTMLElement): Promise<string[]> {
  const cards = Array.from(root.querySelectorAll('[data-report-chart-card]')) as HTMLElement[];
  if (!cards.length) return [];

  // Hide tooltips / interactive chrome that should not appear in the snapshot.
  const hide = Array.from(
    root.querySelectorAll('.recharts-tooltip-wrapper, [data-no-print]'),
  ) as HTMLElement[];
  const prevHide = hide.map((el) => ({
    el,
    visibility: el.style.visibility,
    display: el.style.display,
  }));
  hide.forEach((el) => {
    if (el.matches('[data-no-print]')) el.style.display = 'none';
    else el.style.visibility = 'hidden';
  });

  const restoreLayout = boostChartCardsForExport(cards);

  try {
    // Let Recharts reflow at the larger export size.
    window.dispatchEvent(new Event('resize'));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await new Promise((r) => setTimeout(r, 220));

    const snaps: string[] = [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const width = Math.max(Math.ceil(rect.width), card.offsetWidth, 480);
      const height = Math.max(Math.ceil(rect.height), card.offsetHeight, 260);
      if (width < 8 || height < 8) {
        snaps.push('');
        continue;
      }
      const canvas = await html2canvas(card, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width,
        height,
        windowWidth: Math.max(document.documentElement.clientWidth, width + 80),
      });
      snaps.push(canvas.toDataURL('image/png'));
    }
    return snaps;
  } finally {
    restoreLayout();
    prevHide.forEach(({ el, visibility, display }) => {
      el.style.visibility = visibility;
      el.style.display = display;
    });
  }
}

/**
 * Temporarily enlarge chart chrome for capture: titles, legends, plot area.
 * Restores every mutated style afterwards so the on-screen preview is unchanged.
 */
function boostChartCardsForExport(cards: HTMLElement[]): () => void {
  const restores: Array<() => void> = [];

  const patchStyle = (el: HTMLElement, next: Partial<CSSStyleDeclaration> & Record<string, string>) => {
    const prev: Record<string, string> = {};
    for (const key of Object.keys(next)) {
      prev[key] = el.style.getPropertyValue(key);
    }
    for (const [key, value] of Object.entries(next)) {
      if (value != null) el.style.setProperty(key, String(value));
    }
    restores.push(() => {
      for (const [key, value] of Object.entries(prev)) {
        if (value) el.style.setProperty(key, value);
        else el.style.removeProperty(key);
      }
    });
  };

  for (const card of cards) {
    patchStyle(card, {
      'box-sizing': 'border-box',
      padding: '16px',
      width: '520px',
      'max-width': '520px',
      'min-width': '520px',
      'min-height': '320px',
    });

    card.querySelectorAll<HTMLElement>('[data-report-chart-title] p').forEach((p, index) => {
      if (index === 0) {
        patchStyle(p, {
          'font-size': '13px',
          'line-height': '1.3',
          'font-weight': '650',
          color: '#0f172a',
          margin: '0',
        });
      } else {
        patchStyle(p, {
          'font-size': '11px',
          'line-height': '1.35',
          color: '#475569',
          'margin-top': '4px',
        });
      }
    });

    const body = card.querySelector<HTMLElement>('[data-report-chart-body]');
    if (body) {
      patchStyle(body, {
        'min-height': '0',
        height: 'auto',
        overflow: 'visible',
      });
    }

    card.querySelectorAll<HTMLElement>('[data-chart]').forEach((chart) => {
      patchStyle(chart, {
        height: '200px',
        'min-height': '200px',
        'max-height': '200px',
        width: '100%',
        'aspect-ratio': 'auto',
        overflow: 'visible',
      });
    });

    card.querySelectorAll<HTMLElement>('[data-report-chart-legend]').forEach((legend) => {
      patchStyle(legend, {
        display: 'flex',
        'flex-wrap': 'wrap',
        'justify-content': 'center',
        'align-items': 'center',
        gap: '8px 14px',
        'padding-top': '10px',
        'font-size': '11px',
        'line-height': '1.35',
        color: '#334155',
        width: '100%',
        height: 'auto',
        overflow: 'visible',
      });
      legend.querySelectorAll<HTMLElement>('span').forEach((span) => {
        if (span.getAttribute('aria-hidden') != null) return;
        patchStyle(span, {
          'font-size': '11px',
          color: '#334155',
          'white-space': 'nowrap',
        });
      });
    });

    card.querySelectorAll<HTMLElement>('.recharts-legend-wrapper').forEach((legend) => {
      patchStyle(legend, {
        'font-size': '11px',
        'line-height': '1.35',
        'padding-top': '8px',
        height: 'auto',
        position: 'relative',
        width: '100%',
      });
    });

    card.querySelectorAll<HTMLElement>('.recharts-legend-item-text, .recharts-default-legend').forEach((text) => {
      patchStyle(text, {
        'font-size': '11px',
        color: '#334155',
      });
    });

    card.querySelectorAll<HTMLElement>('[class*="text-[8px]"], [class*="text-[9px]"]').forEach((el) => {
      patchStyle(el, {
        'font-size': '11px',
        gap: '8px',
      });
    });

    card.querySelectorAll('text').forEach((text) => {
      const prevSize = text.getAttribute('font-size');
      const prevFill = text.getAttribute('fill');
      restores.push(() => {
        if (prevSize == null) text.removeAttribute('font-size');
        else text.setAttribute('font-size', prevSize);
        if (prevFill == null) text.removeAttribute('fill');
        else text.setAttribute('fill', prevFill);
      });
      const current = Number(prevSize || 8);
      if (current <= 9) {
        text.setAttribute('font-size', '11');
        if (!prevFill || prevFill === '#64748b' || prevFill === '#475569') {
          text.setAttribute('fill', '#475569');
        }
      }
    });
  }

  return () => {
    for (let i = restores.length - 1; i >= 0; i--) restores[i]();
  };
}

function applyChartSnapshots(clone: HTMLElement, snapshots: string[]): void {
  const cards = Array.from(clone.querySelectorAll('[data-report-chart-card]')) as HTMLElement[];
  cards.forEach((card, i) => {
    const src = snapshots[i];
    if (!src) return;
    card.innerHTML = '';
    card.style.minHeight = '250px';
    card.style.overflow = 'visible';
    card.style.padding = '10px';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('data-report-chart-img', '');
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.maxWidth = '100%';
    img.style.objectFit = 'contain';
    card.appendChild(img);
  });

  // Fallback for older markup that only marked chart bodies.
  if (!cards.length) {
    const bodies = Array.from(clone.querySelectorAll('[data-report-chart-body]')) as HTMLElement[];
    bodies.forEach((body, i) => {
      const src = snapshots[i];
      if (!src) return;
      body.innerHTML = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.setAttribute('data-report-chart-img', '');
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = 'auto';
      body.appendChild(img);
    });
  }
}

async function embedImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', dataUrl);
      } catch {
        /* keep original */
      }
    }),
  );
}

function buildReportHtml(
  clone: HTMLElement,
  opts: {
    title: string;
    primaryColor: string;
    secondaryColor: string;
    maxColumns: number;
    landscape: boolean;
  },
): string {
  const { title, primaryColor, secondaryColor, maxColumns, landscape } = opts;
  const tableFontPx = printTableFontPx(maxColumns);
  const pageSize = landscape ? 'A4 landscape' : 'A4 portrait';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${reportStyles({ primaryColor, secondaryColor, tableFontPx, maxColumns, pageSize })}</style>
</head>
<body>
  <div class="report-sheet">
${clone.outerHTML}
  </div>
</body>
</html>`;
}

function reportStyles(opts: {
  primaryColor: string;
  secondaryColor: string;
  tableFontPx: number;
  maxColumns: number;
  pageSize: string;
}): string {
  const { primaryColor, secondaryColor, tableFontPx, maxColumns, pageSize } = opts;
  const cellPad =
    maxColumns > 12 ? '2px 3px' : maxColumns > 8 ? '3px 4px' : '5px 6px';

  return `
    @page { size: ${pageSize}; margin: 8mm 6mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: ${secondaryColor};
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-sheet { max-width: 1100px; margin: 0 auto; padding: 8px 4px 16px; }
    [data-report-document] { position: relative; background: #fff; }
    [data-report-watermark] {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0; overflow: hidden;
    }
    [data-report-watermark-img] {
      width: 58% !important; max-width: 440px !important; max-height: none !important;
      height: auto !important; opacity: 0.07 !important; transform: rotate(-24deg);
      object-fit: contain !important;
    }
    [data-report-content] { position: relative; z-index: 1; }
    .print-table-wrap { width: 100%; overflow: visible; }
    table {
      width: 100% !important; min-width: 0 !important; max-width: 100% !important;
      border-collapse: collapse; font-size: ${tableFontPx}px; margin-top: 4px;
      table-layout: ${maxColumns >= 10 ? 'auto' : 'fixed'};
    }
    th, td {
      border: 1px solid #e2e8f0; padding: ${cellPad}; vertical-align: top;
      white-space: normal !important; word-break: break-word; overflow-wrap: break-word;
      hyphens: auto; line-height: 1.3; max-width: none;
    }
    th {
      background: ${primaryColor}; color: #fff; text-align: left; font-weight: 600;
      white-space: normal !important;
    }
    td { color: #000 !important; }
    tr:nth-child(even) td { background: #f8fafc; }
    [data-report-header] {
      border: 1px solid #e2e8f0; background: rgba(255,255,255,0.97);
      page-break-inside: avoid; margin-bottom: 8px;
    }
    [data-report-header-bar] { height: 6px; background: ${primaryColor}; }
    [data-report-header-body] {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 12px 28px; padding: 16px 22px;
    }
    [data-report-brand] { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
    [data-report-logo] {
      width: 64px !important; height: 64px !important; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      padding: 6px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
    }
    [data-report-logo] img {
      max-height: 58px !important; max-width: 160px !important;
      width: auto !important; height: auto !important; object-fit: contain !important;
    }
    [data-report-client-name] {
      font-size: 18px; font-weight: 600; line-height: 1.2;
      white-space: nowrap; color: ${primaryColor};
    }
    [data-report-divider] { width: 1px; height: 48px; background: #e2e8f0; flex-shrink: 0; }
    [data-report-title-block] {
      display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 160px;
    }
    [data-report-title-block] p { margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; }
    [data-report-title-block] p + p { font-size: 12px; font-weight: 400; color: #64748b; }
    [data-report-meta] {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 6px 18px; margin-left: auto; font-size: 11px;
    }
    [data-report-meta-item] span:first-child { color: #94a3b8; font-weight: 500; }
    [data-report-meta-item] span:last-child { color: #334155; }
    [data-report-footer] {
      border: 1px solid #e2e8f0; border-top: none; background: rgba(255,255,255,0.97);
      page-break-inside: avoid; margin-top: 8px; padding: 12px 24px;
    }
    [data-report-footer-top] {
      display: flex; flex-wrap: wrap; align-items: center;
      justify-content: space-between; gap: 12px;
    }
    [data-report-footer-note] { margin: 0; font-size: 10px; color: #475569; line-height: 1.4; }
    [data-report-footer-ref] { margin: 0; font-size: 10px; color: #94a3b8; }
    [data-report-footer-powered] {
      display: flex; align-items: center; gap: 8px; margin-top: 10px;
      padding-top: 10px; border-top: 1px solid #e2e8f0;
    }
    [data-report-footer-powered-label] {
      margin: 0; font-size: 10px; color: #64748b; white-space: nowrap;
    }
    [data-report-footer-powered-logo] {
      height: 22px !important; width: auto !important; max-width: 72px !important;
      object-fit: contain !important;
    }
    [data-report-footer-powered-name] {
      margin: 0; font-size: 10px; font-weight: 600; color: #004225; white-space: nowrap;
    }

    /* KPI strip — match on-screen preview sizes */
    [data-report-kpi-grid] {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 10px !important;
      width: 100% !important;
      margin: 0 0 10px !important;
      page-break-inside: avoid;
    }
    [data-report-kpi-grid][data-report-kpi-count="1"] { grid-template-columns: 1fr !important; }
    [data-report-kpi-grid][data-report-kpi-count="2"] { grid-template-columns: 1fr 1fr !important; }
    [data-report-kpi-grid][data-report-kpi-count="3"] { grid-template-columns: 1fr 1fr 1fr !important; }
    [data-report-kpi-card] {
      display: block !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 6px !important;
      background: #f8fafc !important;
      padding: 12px !important;
      min-width: 0 !important;
      page-break-inside: avoid;
    }
    [data-report-kpi-label] {
      display: block !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      color: #64748b !important;
      margin: 0 !important;
    }
    [data-report-kpi-value] {
      display: block !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      color: ${primaryColor} !important;
      margin: 4px 0 0 !important;
      font-variant-numeric: tabular-nums;
    }
    [data-report-kpi-hint] {
      display: block !important;
      font-size: 10px !important;
      color: #94a3b8 !important;
      margin: 2px 0 0 !important;
    }

    /* Charts — 2 per row; clear spacing from title / table */
    [data-report-chart-grid] {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 14px !important;
      width: 100% !important;
      margin: 24px 0 !important;
    }
    [data-report-chart-card] {
      display: flex !important;
      flex-direction: column !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      background: rgba(248, 250, 252, 0.55) !important;
      padding: 14px !important;
      min-height: 250px !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    [data-report-chart-card][data-report-chart-span="2"] {
      grid-column: 1 / -1 !important;
    }
    [data-report-chart-title] p {
      margin: 0 !important;
    }
    [data-report-chart-title] p:first-child {
      font-size: 12px !important;
      font-weight: 650 !important;
      color: #0f172a !important;
      line-height: 1.3 !important;
    }
    [data-report-chart-title] p + p {
      font-size: 10px !important;
      font-weight: 400 !important;
      color: #475569 !important;
      margin-top: 3px !important;
      line-height: 1.35 !important;
    }
    [data-report-chart-body] {
      flex: 0 0 auto !important;
      min-height: 0 !important;
      width: 100% !important;
      overflow: visible !important;
    }
    [data-report-chart-img] {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      object-fit: contain !important;
    }

    /* Heatmap leftover styles (usually replaced by chart snapshot) */
    [data-report-heatmap] { width: 100% !important; overflow: visible !important; }
    [data-report-heatmap] table {
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      font-size: 9px !important;
      margin: 0 !important;
    }
    [data-report-heatmap] th,
    [data-report-heatmap] td {
      border: none !important;
      background: transparent !important;
      padding: 2px !important;
      line-height: 1.2 !important;
      vertical-align: middle !important;
    }
    [data-report-heatmap] th {
      color: #64748b !important;
      font-weight: 500 !important;
      font-size: 8px !important;
      text-align: center !important;
    }
    [data-report-heatmap] th:first-child { text-align: left !important; }
    [data-report-heatmap] td {
      color: #334155 !important;
      font-size: 8px !important;
    }
    [data-report-heatmap] tr:nth-child(even) td { background: transparent !important; }

    button, [data-no-print] { display: none !important; }
    h1, h2, h3 { margin: 0; }
    @media print {
      html, body { width: 100%; height: auto; overflow: visible; }
      body { padding: 0; }
      .report-sheet { max-width: none; width: 100%; padding: 0; }
      .print-table-wrap { overflow: visible !important; max-height: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
    }
  `;
}

async function mountHtml(html: string): Promise<{
  iframe: HTMLIFrameElement;
  sheet: HTMLElement;
  cleanup: () => void;
}> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Report export');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1100px;height:10px;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not create export frame');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === 'complete') resolve();
    else iframe.onload = () => resolve();
  });
  // Wait for embedded chart snapshot images to decode before capture/print.
  const imgs = Array.from(doc.images || []);
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );
  await new Promise((r) => setTimeout(r, 150));

  const sheet = doc.querySelector('.report-sheet') as HTMLElement | null;
  if (!sheet) {
    iframe.remove();
    throw new Error('Report layout missing');
  }

  iframe.style.height = `${Math.max(sheet.scrollHeight + 40, 400)}px`;

  return {
    iframe,
    sheet,
    cleanup: () => iframe.remove(),
  };
}

async function downloadPdf(html: string, filename: string, landscape: boolean): Promise<void> {
  const { sheet, cleanup } = await mountHtml(html);
  try {
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: sheet.scrollWidth,
      width: sheet.scrollWidth,
      height: sheet.scrollHeight,
    });

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

    pdf.save(`${filename}.pdf`);
  } finally {
    cleanup();
  }
}

async function printHtml(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Print report');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const runPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  };

  const waitAndPrint = async () => {
    const imgs = Array.from(doc.images || []);
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
      ),
    );
    setTimeout(runPrint, 200);
  };

  if (iframe.contentDocument?.readyState === 'complete') {
    void waitAndPrint();
  } else {
    iframe.onload = () => {
      void waitAndPrint();
    };
  }
}

function preparePrintRoot(root: HTMLElement): { maxColumns: number; landscape: boolean } {
  let maxColumns = 0;

  root.querySelectorAll('div').forEach((el) => {
    const node = el as HTMLElement;
    const cls = node.className || '';
    const wrapsTable = node.querySelector(':scope > table') != null;
    const isScrollShell =
      wrapsTable &&
      (cls.includes('overflow-auto') || cls.includes('overflow-x-auto') || /\bmax-h-/.test(cls));
    if (!isScrollShell) return;
    node.style.overflow = 'visible';
    node.style.maxHeight = 'none';
    node.style.maxWidth = 'none';
  });

  // Force KPI strip to stay one horizontal row (Tailwind is absent in print HTML).
  root.querySelectorAll('[data-report-kpi-grid]').forEach((el) => {
    const node = el as HTMLElement;
    const count = Math.min(Number(node.getAttribute('data-report-kpi-count') || '4') || 4, 4);
    node.style.display = 'grid';
    node.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
    node.style.gap = '10px';
    node.style.width = '100%';
  });
  root.querySelectorAll('[data-report-kpi-card]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.display = 'block';
    node.style.minWidth = '0';
    node.style.border = '1px solid #e2e8f0';
    node.style.borderRadius = '6px';
    node.style.background = '#f8fafc';
    node.style.padding = '12px';
  });

  // Force chart cards two-per-row with clear vertical spacing.
  root.querySelectorAll('[data-report-chart-grid]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.display = 'grid';
    node.style.gridTemplateColumns = '1fr 1fr';
    node.style.gap = '14px';
    node.style.width = '100%';
    node.style.marginTop = '24px';
    node.style.marginBottom = '24px';
  });
  root.querySelectorAll('[data-report-chart-card]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.display = 'flex';
    node.style.flexDirection = 'column';
    node.style.minHeight = '250px';
    node.style.border = '1px solid #e2e8f0';
    node.style.borderRadius = '8px';
    node.style.background = 'rgba(248, 250, 252, 0.55)';
    node.style.padding = '14px';
    node.style.pageBreakInside = 'avoid';
    node.style.breakInside = 'avoid';
    if (node.getAttribute('data-report-chart-span') === '2') {
      node.style.gridColumn = '1 / -1';
    }
  });
  root.querySelectorAll('[data-report-chart-body]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.overflow = 'visible';
  });

  // Chart bodies are already preview images — strip any leftover live chart chrome.
  root.querySelectorAll('.recharts-tooltip-wrapper').forEach((el) => el.remove());
  root.querySelectorAll('[data-report-chart-img]').forEach((img) => {
    const el = img as HTMLImageElement;
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.height = 'auto';
    el.style.maxWidth = '100%';
    el.style.objectFit = 'contain';
  });

  root.querySelectorAll('[data-report-logo] img').forEach((img) => {
    const el = img as HTMLImageElement;
    el.style.maxHeight = '58px';
    el.style.maxWidth = '160px';
    el.style.width = 'auto';
    el.style.height = 'auto';
    el.style.objectFit = 'contain';
  });

  root.querySelectorAll('[data-report-watermark-img]').forEach((img) => {
    const el = img as HTMLImageElement;
    el.style.maxHeight = 'none';
    el.style.maxWidth = '440px';
    el.style.width = '58%';
    el.style.opacity = '0.07';
    el.style.transform = 'rotate(-24deg)';
    el.style.objectFit = 'contain';
  });

  root.querySelectorAll('table').forEach((table) => {
    const el = table as HTMLTableElement;
    // Heatmap matrices keep their own visual styling — not report data tables.
    if (el.closest('[data-report-heatmap]')) return;
    const parent = el.parentElement;
    if (parent && !parent.classList.contains('print-table-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'print-table-wrap';
      parent.insertBefore(wrap, el);
      wrap.appendChild(el);
    }

    el.removeAttribute('style');
    const headerCols = el.querySelectorAll('thead tr:first-child th').length;
    const bodyCols = el.querySelectorAll('tbody tr:first-child td').length;
    const cols = Math.max(headerCols, bodyCols, 1);
    maxColumns = Math.max(maxColumns, cols);
    const colWidth = cols >= 10 ? undefined : `${(100 / cols).toFixed(3)}%`;

    el.querySelectorAll('thead th').forEach((th) => {
      if (colWidth) (th as HTMLElement).style.width = colWidth;
      else (th as HTMLElement).style.width = 'auto';
      (th as HTMLElement).style.minWidth = cols >= 10 ? '64px' : '0';
    });

    el.querySelectorAll('th, td').forEach((cell) => {
      const c = cell as HTMLElement;
      c.style.whiteSpace = 'normal';
      c.style.wordBreak = 'break-word';
      c.style.overflowWrap = 'break-word';
      c.classList.remove('whitespace-nowrap');
    });
  });

  return { maxColumns, landscape: maxColumns >= 7 };
}

function printTableFontPx(maxColumns: number): number {
  // Match the on-screen preview (text-[13px]) as closely as possible; only
  // shrink when many columns would otherwise overflow the page.
  if (maxColumns >= 18) return 8;
  if (maxColumns >= 14) return 9;
  if (maxColumns >= 11) return 10;
  if (maxColumns >= 8) return 11;
  return 13;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'report';
}
