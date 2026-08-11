/**
 * Printable workshop documents — inspection, maintenance (incl. monthly PM), breakdown.
 * Mimito ownership is always shown in the branded footer.
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
    <div className="space-y-4 mt-4">
      {sections.map((section) => (
        <div key={section.id} data-report-section>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">{section.title}</h3>
          <table className="w-full text-xs border-collapse" data-report-table>
            <thead>
              <tr>
                <th className="text-left p-2 border" style={brandedTableHeadStyle(primaryColor)}>
                  Item
                </th>
                <th className="text-left p-2 border w-28" style={brandedTableHeadStyle(primaryColor)}>
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

function SignOffBlock({
  title,
  name,
  date,
  signature,
}: {
  title: string;
  name?: string | null;
  date?: string | null;
  signature?: string | null;
}) {
  const sig = (signature || name || '').trim().toLowerCase();
  return (
    <div className="mt-8 pt-4 border-t border-slate-200 grid sm:grid-cols-3 gap-6" data-report-signoff>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{title}</p>
        <p className="text-sm font-medium text-slate-900">{name || '—'}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Date</p>
        <p className="text-sm text-slate-800">
          {date
            ? (() => {
                try {
                  return format(new Date(date), 'dd MMM yyyy');
                } catch {
                  return date;
                }
              })()
            : '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Signature</p>
        <p
          className="text-base text-slate-900 min-h-[2rem]"
          style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive,serif', fontStyle: 'italic' }}
        >
          {sig || '—'}
        </p>
      </div>
    </div>
  );
}

function MetaGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-xs" data-report-meta-grid>
      {rows.map(([k, v]) => (
        <div key={k} className="rounded border border-slate-200 px-3 py-2 bg-slate-50/80">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
          <p className="font-medium text-slate-900 mt-0.5 break-words">{v || '—'}</p>
        </div>
      ))}
    </div>
  );
}

function InspectionDoc({
  branding,
  row,
  reportRef,
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
  const title =
    category === 'generator' ? 'Daily Inspection Report' : 'Inspection Report';

  return (
    <BrandedReportDocument branding={branding} className="p-8 max-w-[900px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle={title}
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaGrid
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Inspection type', row.inspectionType],
          ['Status', statusLabel(row.overallStatus)],
          [
            category === 'vehicle' ? 'Odometer' : 'Engine hours',
            category === 'vehicle'
              ? `${row.odometerReading ?? '—'} km`
              : `${row.engineHours ?? '—'} h`,
          ],
          ['Operator', row.driverName || '—'],
          ['Inspection date', row.inspectionDate ? format(new Date(row.inspectionDate), 'dd MMM yyyy') : '—'],
        ]}
      />
      <ChecklistTable sections={sections} primaryColor={branding.primaryColor} />
      {row.notes ? (
        <div className="mt-4 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.notes}</p>
        </div>
      ) : null}
      <SignOffBlock
        title="Inspected by"
        name={row.inspectorName}
        date={row.inspectorDate || row.inspectionDate}
        signature={row.inspectorSignature}
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
    category === 'generator' && (row.checklistSections?.some((s) => s.id === 'monthly-pm') || row.maintenanceType === 'preventive')
      ? 'Monthly Preventive Maintenance Report'
      : 'Maintenance Report';

  return (
    <BrandedReportDocument branding={branding} className="p-8 max-w-[900px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle={title}
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaGrid
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Type', row.maintenanceType],
          ['Priority', row.priority],
          ['Status', row.status],
          ['Operator', row.driverName || '—'],
          ['Start', row.startDate ? format(new Date(row.startDate), 'dd MMM yyyy') : '—'],
          ['Labor hours', String(row.laborHours ?? '—')],
          ['Labor cost', String(row.laborCost ?? '—')],
          ['Parts cost', String(row.partsCost ?? '—')],
          ['Total cost', String(row.totalCost ?? '—')],
        ]}
      />
      <div className="mt-4 text-xs">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Work description</p>
        <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.description || '—'}</p>
      </div>
      {row.checklistSections?.length ? (
        <ChecklistTable sections={row.checklistSections} primaryColor={branding.primaryColor} />
      ) : null}
      {row.notes ? (
        <div className="mt-4 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.notes}</p>
        </div>
      ) : null}
      <SignOffBlock
        title="Maintained by / Technician"
        name={row.mechanicName}
        date={row.mechanicDate || row.startDate}
        signature={row.mechanicSignature}
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
  return (
    <BrandedReportDocument branding={branding} className="p-8 max-w-[900px]">
      <BrandedReportHeader
        branding={branding}
        reportTitle="Breakdown Report"
        moduleLabel="Workshop"
        objectLabel={row.vehicleName}
      />
      <MetaGrid
        rows={[
          ['Asset', row.vehicleName],
          ['Plate / ID', row.vehiclePlate || '—'],
          ['Category', category],
          ['Severity', row.severity],
          ['Failure system', row.failureSystem || '—'],
          ['Operator', row.driverName || '—'],
          [
            'Breakdown time',
            row.breakdownTime ? format(new Date(row.breakdownTime), 'dd MMM yyyy HH:mm') : '—',
          ],
          [
            'Location',
            row.location?.address ||
              (row.location?.lat != null
                ? `${row.location.lat.toFixed(5)}, ${row.location.lng.toFixed(5)}`
                : '—'),
          ],
          ['Downtime (h)', String(row.downtimeHours ?? '—')],
          ['Towing', String(row.towingCost ?? '—')],
          ['Repair', String(row.repairCost ?? '—')],
          ['Total cost', String(row.totalCost ?? '—')],
        ]}
      />
      <div className="mt-4 text-xs space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Description</p>
          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.description || '—'}</p>
        </div>
        {row.cause ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cause</p>
            <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.cause}</p>
          </div>
        ) : null}
        {row.resolution ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Resolution</p>
            <p className="mt-1 text-slate-800 whitespace-pre-wrap">{row.resolution}</p>
          </div>
        ) : null}
      </div>
      <SignOffBlock
        title="Reported by"
        name={row.reportedBy || row.driverName}
        date={row.reportedDate || row.breakdownTime}
        signature={row.reportedSignature}
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
  host.style.width = '900px';
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
