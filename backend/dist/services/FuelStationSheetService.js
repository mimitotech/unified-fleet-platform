import * as XLSX from 'xlsx';
import { query } from '../config/database.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
const HEADER_ALIASES = {
    registration: ['registration num.', 'registration num', 'registration', 'reg no', 'reg. no', 'plate', 'vehicle', 'number plate'],
    date: ['date', 'txn date', 'transaction date'],
    hour: ['hour', 'time', 'txn time'],
    quantity: ['quantity', 'qty', 'litres', 'liters', 'volume', 'qty (l)'],
    product: ['product', 'fuel type', 'fuel', 'product name'],
    unitPrice: ['unit price', 'price', 'price/l', 'unitprice'],
    amount: ['amount', 'total', 'value', 'cost'],
    cardNumber: ['card num.', 'card num', 'card number', 'card no'],
    cardName: ['card name', 'card holder'],
    receiptNumber: ['receipt num.', 'receipt num', 'receipt', 'receipt no'],
    driverCode: ['driver code', 'driver'],
    mileage: ['current mileage', 'mileage', 'odometer'],
    customerName: ['customer', 'customer name'],
};
const NON_FUEL_RE = /lubricant|oil|grease|filter|service|adblue|urea|additive/i;
export function normalizePlateKey(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}
function normHeader(h) {
    return String(h ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
function mapHeaders(headerRow) {
    const mapped = {};
    headerRow.forEach((cell, idx) => {
        const h = normHeader(cell);
        if (!h)
            return;
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
            if (aliases.includes(h) && mapped[field] == null)
                mapped[field] = idx;
        }
    });
    return mapped;
}
function excelSerialToDate(serial, hourFraction = 0) {
    const whole = Math.floor(serial);
    const frac = serial % 1 !== 0 ? serial % 1 : hourFraction;
    const ms = Date.UTC(1899, 11, 30) + whole * 86400000 + Math.round(frac * 86400000);
    return new Date(ms);
}
function cellNumber(v) {
    if (v == null || v === '')
        return null;
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}
function cellString(v) {
    if (v == null)
        return '';
    if (v instanceof Date)
        return v.toISOString();
    return String(v).trim();
}
function parseFilledAt(dateCell, hourCell) {
    if (dateCell instanceof Date && !Number.isNaN(dateCell.getTime())) {
        const hour = cellNumber(hourCell) ?? 0;
        if (hour > 0 && hour < 1) {
            const d = new Date(dateCell.getTime());
            const addMs = Math.round(hour * 86400000);
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + addMs);
        }
        return dateCell;
    }
    const dateNum = cellNumber(dateCell);
    if (dateNum != null && dateNum > 20000) {
        const hour = cellNumber(hourCell) ?? 0;
        return excelSerialToDate(dateNum, hour > 0 && hour < 1 ? hour : 0);
    }
    const s = cellString(dateCell);
    if (!s)
        return null;
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
/** Parse petrol-station transaction sheet into fill rows. */
export function parseStationSheetBuffer(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName)
        throw new Error('Excel file has no sheets');
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: true,
    });
    if (!matrix.length)
        throw new Error('Excel sheet is empty');
    let headerIdx = 0;
    let cols = mapHeaders(matrix[0] || []);
    if (cols.registration == null || cols.quantity == null || cols.date == null) {
        for (let i = 1; i < Math.min(matrix.length, 15); i++) {
            const tryCols = mapHeaders(matrix[i] || []);
            if (tryCols.registration != null && tryCols.quantity != null && tryCols.date != null) {
                headerIdx = i;
                cols = tryCols;
                break;
            }
        }
    }
    if (cols.registration == null || cols.quantity == null || cols.date == null) {
        throw new Error('Could not find required columns. Expected: Registration num., Date, Quantity (and ideally Product, Hour).');
    }
    const out = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const registration = cellString(row[cols.registration]);
        const quantity = cellNumber(row[cols.quantity]);
        const product = cols.product != null ? cellString(row[cols.product]) : '';
        if (quantity == null || quantity <= 0)
            continue;
        if (product && NON_FUEL_RE.test(product))
            continue;
        const filledAt = parseFilledAt(row[cols.date], cols.hour != null ? row[cols.hour] : undefined);
        if (!filledAt || Number.isNaN(filledAt.getTime()))
            continue;
        const raw = {};
        row.forEach((v, i) => {
            if (v !== '' && v != null)
                raw[`col_${i}`] = v instanceof Date ? v.toISOString() : v;
        });
        out.push({
            filledAt,
            registration,
            registrationKey: normalizePlateKey(registration),
            quantity,
            product,
            unitPrice: cols.unitPrice != null ? cellNumber(row[cols.unitPrice]) : null,
            amount: cols.amount != null ? cellNumber(row[cols.amount]) : null,
            cardNumber: cols.cardNumber != null ? cellString(row[cols.cardNumber]) : '',
            cardName: cols.cardName != null ? cellString(row[cols.cardName]) : '',
            receiptNumber: cols.receiptNumber != null ? cellString(row[cols.receiptNumber]) : '',
            driverCode: cols.driverCode != null ? cellString(row[cols.driverCode]) : '',
            mileage: cols.mileage != null ? cellNumber(row[cols.mileage]) : null,
            customerName: cols.customerName != null ? cellString(row[cols.customerName]) : '',
            raw,
        });
    }
    return out;
}
async function buildUnitMatchIndex(tenantId) {
    const map = new Map();
    try {
        const { assets } = await WialonFuelFleetService.listAssets(tenantId);
        for (const a of assets) {
            const keys = [normalizePlateKey(a.plate), normalizePlateKey(a.name)].filter(Boolean);
            for (const k of keys) {
                if (!map.has(k))
                    map.set(k, { unitId: String(a.unitId), unitName: a.name });
            }
        }
    }
    catch {
        /* matching optional */
    }
    return map;
}
export class FuelStationSheetService {
    static async listUploads(tenantId, limit = 50) {
        const { rows } = await query(`SELECT id, file_name, period_from, period_to, row_count, imported_count, skipped_count, created_at, notes
       FROM fuel_station_uploads
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [tenantId, limit]);
        return rows.map((r) => ({
            id: r.id,
            fileName: r.file_name,
            periodFrom: r.period_from ? String(r.period_from).slice(0, 10) : null,
            periodTo: r.period_to ? String(r.period_to).slice(0, 10) : null,
            rowCount: Number(r.row_count ?? 0),
            importedCount: Number(r.imported_count ?? 0),
            skippedCount: Number(r.skipped_count ?? 0),
            createdAt: r.created_at,
            notes: r.notes || null,
        }));
    }
    static async deleteUpload(tenantId, uploadId) {
        const { rowCount } = await query(`DELETE FROM fuel_station_uploads WHERE tenant_id = $1 AND id = $2`, [tenantId, uploadId]);
        return (rowCount ?? 0) > 0;
    }
    static async importSheet(tenantId, opts) {
        const parsed = parseStationSheetBuffer(opts.buffer);
        if (!parsed.length) {
            throw new Error('No fuel fill rows found. Check that Quantity / Registration / Date columns are present.');
        }
        const unitIndex = await buildUnitMatchIndex(tenantId);
        let matched = 0;
        const enriched = parsed.map((p) => {
            const hit = p.registrationKey ? unitIndex.get(p.registrationKey) : undefined;
            if (hit)
                matched += 1;
            return { ...p, unitId: hit?.unitId ?? null, unitName: hit?.unitName ?? null };
        });
        const times = enriched.map((e) => e.filledAt.getTime()).sort((a, b) => a - b);
        const periodFrom = new Date(times[0]).toISOString().slice(0, 10);
        const periodTo = new Date(times[times.length - 1]).toISOString().slice(0, 10);
        const { rows: uploadRows } = await query(`INSERT INTO fuel_station_uploads
         (tenant_id, file_name, period_from, period_to, row_count, imported_count, skipped_count, uploaded_by, notes)
       VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9)
       RETURNING id`, [
            tenantId,
            opts.fileName,
            periodFrom,
            periodTo,
            enriched.length,
            enriched.length,
            0,
            opts.uploadedBy ?? null,
            opts.notes ?? (matched ? `Matched ${matched}/${enriched.length} plates to fleet units` : null),
        ]);
        const uploadId = uploadRows[0].id;
        // Batch insert
        const chunk = 100;
        for (let i = 0; i < enriched.length; i += chunk) {
            const slice = enriched.slice(i, i + chunk);
            const values = [];
            const placeholders = [];
            slice.forEach((row, idx) => {
                const b = idx * 16;
                placeholders.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16}::jsonb)`);
                values.push(tenantId, uploadId, row.filledAt.toISOString(), row.registration, row.registrationKey, row.unitId, row.unitName, row.quantity, row.product, row.unitPrice, row.amount, row.cardNumber || null, row.cardName || null, row.receiptNumber || null, row.driverCode || null, JSON.stringify({
                    ...row.raw,
                    mileage: row.mileage,
                    customerName: row.customerName,
                }));
            });
            await query(`INSERT INTO fuel_station_fills (
           tenant_id, upload_id, filled_at, registration, registration_key,
           unit_id, unit_name, quantity, product, unit_price, amount,
           card_number, card_name, receipt_number, driver_code, raw
         ) VALUES ${placeholders.join(',')}`, values);
        }
        return {
            uploadId,
            fileName: opts.fileName,
            periodFrom,
            periodTo,
            rowCount: enriched.length,
            importedCount: enriched.length,
            skippedCount: 0,
        };
    }
}
