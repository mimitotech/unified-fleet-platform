/**
 * Printable workshop documents — inspection, maintenance (incl. monthly PM), breakdown.
 * Meta / notes / sign-off use compact horizontal layouts (print CSS + inline styles).
 */

import { createRoot } from 'react-dom/client';
import { format } from 'date-fns';
import {
  BrandedReportDocument,
  BrandedReportFooter,
  BrandedReportHeader,
  brandedTableHeadStyle,
  makeReportRef,
} from '@/components/reports/BrandedReportChrome';
import { BRAND } from '@/lib/branding';
import { importPrintReport } from '@/lib/importPrintReport';
import type { ResolvedTenantBranding } from '@/lib/tenantBranding';
import type {
  BreakdownReport,
  ChecklistSection,
  MaintenanceLog,
  VehicleInspection,
} from '@/types/workshop';
import { sectionsFromLegacy } from '@/lib/workshopChecklists';
import { sanitizeWorkshopAssetCategory } from '@/lib/workshopUnit';

export type WorkshopPrintKind = 'inspection' | 'maintenance' | 'breakdown';

function fmtDate(value?: string | null, withTime = false): string {
  if (!value) return '—';
  try {
    return format(new Date(value), withTime ? 'dd MMM yyyy HH:mm' : 'dd MMM yyyy');
  } catch {
    return value;
  }
}

function statusLabel(s?: string) {
  const v = String(s || '').toLowerCase();
  if (v === 'ok' || v === 'pass' || v === 'passed') return 'OK';
  if (v === 'issue' || v === 'fail' || v === 'failed') return 'Issue';
  if (v === 'na' || v === 'n/a') return 'N/A';
  if (v === 'needs-attention' || v === 'needs_attention') return 'Needs attention';
  return s || '—';
}

function ChecklistTable({
  sections,
  primaryColor,
}: {
  sections: ChecklistSection[];
  primaryColor: string;
}) {
  if (!sections.length) return null;
  return (
    <div data-report-checklist style={{ marginTop: 12 }}>
      {sections.map((section) => (
        <div key={section.id} data-report-section style={{ marginBottom: 12 }}>
          <h3
            data-report-section-title
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              borderLeft: `3px solid ${primaryColor}`,
              paddingLeft: 8,
            }}
          >
            {section.title}
          </h3>
          <table className="w-full text-xs border-collapse" data-report-table>
            <thead>
              <tr>
                <th className="text-left p-2 border" style={brandedTableHeadStyle(primaryColor)}>
                  Item
                </th>
                <th
                  className="text-left p-2 border"
                  style={{ ...brandedTableHeadStyle(primaryColor), width: '18%' }}
                >
                  Result
                </th>
                <th className="text-left p-2 border" style={brandedTableHeadStyle(primaryColor)}>
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item) => (
                <tr key={item.id}>
                  <td className="p-2 border border-slate-200 text-slate-800">{item.name}</td>
                  <td className="p-2 border border-slate-200 font-medium">{statusLabel(item.status)}</td>
                  <td className="p-2 border border-slate-200 text-slate-600">{item.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Compact 4-column fact strip — labels left, values right in each cell. */
function MetaStrip({
  rows,
  columns = 4,
}: {
  rows: Array<[string, string]>;
  columns?: 3 | 4;
}) {
  return (
    <div
      data-report-meta-grid
      data-report-meta-cols={String(columns)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 0,
        marginTop: 10,
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {rows.map(([k, v], i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const totalRows = Math.ceil(rows.length / columns);
        return (
          <div
            key={`${k}-${i}`}
            data-report-meta-cell
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
              padding: '7px 10px',
              borderRight: col === columns - 1 ? 'none' : '1px solid #e2e8f0',
              borderBottom: row === totalRows - 1 ? 'none' : '1px solid #e2e8f0',
              minWidth: 0,
              background: row % 2 === 0 ? '#f8fafc' : '#fff',
            }}
          >
            <span
              data-report-meta-label
              style={{
                flex: '0 0 auto',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#64748b',
                whiteSpace: 'nowrap',
              }}
            >
              {k}
            </span>
            <span
              data-report-meta-value
              style={{
                flex: '1 1 auto',
                fontSize: 11,
                fontWeight: 600,
                color: '#0f172a',
                textAlign: 'right',
                wordBreak: 'break-word',
                lineHeight: 1.3,
              }}
            >
              {v || '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NarrativePanel({
  title,
  body,
  primaryColor,
}: {
  title: string;
  body: string;
  primaryColor: string;
}) {
  return (
    <div
      data-report-narrative
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        background: '#f8fafc',
        padding: '8px 12px',
        minWidth: 0,
      }}
    >
      <p
        data-report-narrative-title
        style={{
          margin: 0,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: primaryColor,
        }}
      >
        {title}
      </p>
      <p
        data-report-narrative-body
        style={{
          margin: '4px 0 0',
          fontSize: 11,
          color: '#1e293b',
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      >
        {body}
      </p>
    </div>
  );
}

function NarrativeRow({
  items,
  primaryColor,
}: {
  items: Array<{ title: string; body: string }>;
  primaryColor: string;
}) {
  const usable = items.filter((i) => i.body?.trim());
  if (!usable.length) return null;
  const cols = Math.min(usable.length, 2);
  return (
    <div
      data-report-narrative-grid
      data-report-narrative-cols={String(cols)}
      style={{
        display: 'grid',
        gridTemplateColumns: cols === 1 ? '1fr' : '1fr 1fr',
        gap: 8,
        marginTop: 10,
      }}
    >
      {usable.map((item) => (
        <NarrativePanel
          key={item.title}
          title={item.title}
          body={item.body}
          primaryColor={primaryColor}
        />
      ))}
    </div>
  );
}

function SignOffBlock({
  title,
  name,
  date,
  signature,
  primaryColor,
}: {
  title: string;
  name?: string | null;
  date?: string | null;
  signature?: string | null;
  primaryColor: string;
}) {
  const sig = (signature || name || '').trim().toLowerCase();
  return (
    <div
      data-report-signoff
      style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.9fr 1.4fr',
        gap: 0,
        marginTop: 14,
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        overflow: 'hidden',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        data-report-signoff-cell
        style={{
          padding: '10px 12px',
          borderRight: '1px solid #e2e8f0',
          background: '#fff',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: primaryColor,
          }}
        >
          {title}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          {name || '—'}
        </p>
      </div>
      <div
        data-report-signoff-cell
        style={{
          padding: '10px 12px',
          borderRight: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          Date
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          {fmtDate(date)}
        </p>
      </div>
      <div data-report-signoff-cell style={{ padding: '10px 12px', background: '#fff' }}>
        <p
          style={{
            margin: 0,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          Signature
        </p>
        <p
          data-report-signature
          style={{
            margin: '2px 0 0',
            minHeight: 28,
            fontSize: 18,
            color: '#0f172a',
            fontFamily: '"Segoe Script","Brush Script MT",cursive,serif',
            fontStyle: 'italic',
            lineHeight: 1.2,
          }}
        >
          {sig || '—'}
        </p>
      </div>
    </div>
  );
}

function CostStrip({
  items,
  primaryColor,
}: {
  items: Array<[string, string]>;
  primaryColor: string;
}) {
  if (!items.length) return null;
  return (
    <div
      data-report-cost-strip
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        gap: 0,
        marginTop: 10,
        border: `1px solid ${primaryColor}33`,
        borderRadius: 6,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {items.map(([k, v], i) => (
        <div
          key={k}
          data-report-cost-cell
          style={{
            flex: '1 1 0',
            padding: '8px 10px',
            borderRight: i === items.length - 1 ? 'none' : '1px solid #e2e8f0',
            textAlign: 'center',
            background: i === items.length - 1 ? `${primaryColor}0d` : '#fff',
            minWidth: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            {k}
          </p>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 13,
              fontWeight: 700,
              color: i === items.length - 1 ? primaryColor : '#0f172a',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {v || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function InspectionDoc({
  branding,
  row,
}: {
  branding: ResolvedTenantBranding;
  row: VehicleInspection;
  reportRef: string;
}) {
  const category = sanitizeWorkshopAssetCategory(row.assetCategory);
  const sections =
    row.checklistSections && row.checklistSections.length
      ? row.checklistSections
      : sectionsFromLegacy(row.truckHeadChecklist, row.trailerChecklist, category);
  const title = category === 'generator' ? 'Daily Inspection Report' : 'Inspection Report';
  const pc = branding.primaryColor;

  return (
    <BrandedReportDocument branding={branding} className="p-6 max-w-[960px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle={title}
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaStrip
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Type', row.inspectionType],
          ['Status', statusLabel(row.overallStatus)],
          [
            category === 'vehicle' ? 'Odometer' : 'Engine hours',
            category === 'vehicle'
              ? `${row.odometerReading ?? '—'} km`
              : `${row.engineHours ?? '—'} h`,
          ],
          ['Operator', row.driverName || '—'],
          ['Date', fmtDate(row.inspectionDate)],
        ]}
      />
      <ChecklistTable sections={sections} primaryColor={pc} />
      <NarrativeRow
        primaryColor={pc}
        items={row.notes ? [{ title: 'Notes', body: row.notes }] : []}
      />
      <SignOffBlock
        title="Inspected by"
        name={row.inspectorName}
        date={row.inspectorDate || row.inspectionDate}
        signature={row.inspectorSignature}
        primaryColor={pc}
      />
      <BrandedReportFooter
        branding={branding}
        note={`Workshop inspection for ${branding.name}. Document issued via ${BRAND.fullName}.`}
      />
    </BrandedReportDocument>
  );
}

function MaintenanceDoc({
  branding,
  row,
  reportRef,
}: {
  branding: ResolvedTenantBranding;
  row: MaintenanceLog;
  reportRef: string;
}) {
  const category = sanitizeWorkshopAssetCategory(row.assetCategory);
  const title =
    category === 'generator' &&
    (row.checklistSections?.some((s) => s.id === 'monthly-pm') || row.maintenanceType === 'preventive')
      ? 'Monthly Preventive Maintenance Report'
      : 'Maintenance Report';
  const pc = branding.primaryColor;

  return (
    <BrandedReportDocument branding={branding} className="p-6 max-w-[960px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle={title}
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaStrip
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Type', row.maintenanceType],
          ['Priority', row.priority],
          ['Status', row.status],
          ['Operator', row.driverName || '—'],
          ['Start', fmtDate(row.startDate)],
        ]}
      />
      <CostStrip
        primaryColor={pc}
        items={[
          ['Labor hours', String(row.laborHours ?? '—')],
          ['Labor cost', String(row.laborCost ?? '—')],
          ['Parts cost', String(row.partsCost ?? '—')],
          ['Total cost', String(row.totalCost ?? '—')],
        ]}
      />
      <NarrativeRow
        primaryColor={pc}
        items={[
          { title: 'Work description', body: row.description || '—' },
          ...(row.notes ? [{ title: 'Notes', body: row.notes }] : []),
        ]}
      />
      {row.checklistSections?.length ? (
        <ChecklistTable sections={row.checklistSections} primaryColor={pc} />
      ) : null}
      <SignOffBlock
        title="Maintained by / Technician"
        name={row.mechanicName}
        date={row.mechanicDate || row.startDate}
        signature={row.mechanicSignature}
        primaryColor={pc}
      />
      <BrandedReportFooter
        branding={branding}
        note={`Workshop maintenance for ${branding.name}. Document issued via ${BRAND.fullName}. Ref ${reportRef}.`}
      />
    </BrandedReportDocument>
  );
}

function BreakdownDoc({
  branding,
  row,
  reportRef,
}: {
  branding: ResolvedTenantBranding;
  row: BreakdownReport;
  reportRef: string;
}) {
  const category = sanitizeWorkshopAssetCategory(row.assetCategory);
  const pc = branding.primaryColor;
  const location =
    row.location?.address ||
    (row.location?.lat != null
      ? `${row.location.lat.toFixed(5)}, ${row.location.lng.toFixed(5)}`
      : '—');

  return (
    <BrandedReportDocument branding={branding} className="p-6 max-w-[960px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle="Breakdown Report"
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaStrip
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Severity', row.severity],
          ['Failure system', row.failureSystem || '—'],
          ['Operator', row.driverName || '—'],
          ['Breakdown time', fmtDate(row.breakdownTime, true)],
          ['Location', location],
        ]}
      />
      <CostStrip
        primaryColor={pc}
        items={[
          ['Downtime (h)', String(row.downtimeHours ?? '—')],
          ['Towing', String(row.towingCost ?? '—')],
          ['Repair', String(row.repairCost ?? '—')],
          ['Total cost', String(row.totalCost ?? '—')],
        ]}
      />
      <NarrativeRow
        primaryColor={pc}
        items={[
          { title: 'Description', body: row.description || '—' },
          ...(row.cause ? [{ title: 'Cause', body: row.cause }] : []),
        ]}
      />
      {row.resolution ? (
        <NarrativeRow
          primaryColor={pc}
          items={[{ title: 'Resolution', body: row.resolution }]}
        />
      ) : null}
      <SignOffBlock
        title="Reported by"
        name={row.reportedBy || row.driverName}
        date={row.reportedDate || row.breakdownTime}
        signature={row.reportedSignature}
        primaryColor={pc}
      />
      <BrandedReportFooter
        branding={branding}
        note={`Workshop breakdown for ${branding.name}. Document issued via ${BRAND.fullName}. Ref ${reportRef}.`}
      />
    </BrandedReportDocument>
  );
}

export async function printWorkshopReport(opts: {
  kind: WorkshopPrintKind;
  branding: ResolvedTenantBranding;
  inspection?: VehicleInspection;
  maintenance?: MaintenanceLog;
  breakdown?: BreakdownReport;
  mode?: 'print' | 'download' | 'both';
}): Promise<void> {
  const reportRef = makeReportRef();
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '960px';
  host.style.background = '#fff';
  document.body.appendChild(host);
  const root = createRoot(host);

  const title =
    opts.kind === 'inspection'
      ? 'Inspection Report'
      : opts.kind === 'maintenance'
        ? 'Maintenance Report'
        : 'Breakdown Report';

  await new Promise<void>((resolve) => {
    root.render(
      opts.kind === 'inspection' && opts.inspection ? (
        <InspectionDoc branding={opts.branding} row={opts.inspection} reportRef={reportRef} />
      ) : opts.kind === 'maintenance' && opts.maintenance ? (
        <MaintenanceDoc branding={opts.branding} row={opts.maintenance} reportRef={reportRef} />
      ) : opts.kind === 'breakdown' && opts.breakdown ? (
        <BreakdownDoc branding={opts.branding} row={opts.breakdown} reportRef={reportRef} />
      ) : (
        <div />
      ),
    );
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    const { printReportDocument } = await importPrintReport();
    const doc = host.querySelector('[data-report-document]') as HTMLElement | null;
    if (!doc) throw new Error('Print document failed to render');
    await printReportDocument({
      root: doc,
      title: `${opts.branding.name || 'Client'} - ${title}`,
      primaryColor: opts.branding.primaryColor,
      secondaryColor: opts.branding.secondaryColor,
      mode: opts.mode || 'both',
      filename: `${opts.branding.name || 'Workshop'}_${opts.kind}_${reportRef}`,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
