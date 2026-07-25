import type { FuelTransaction } from '@/types/entities';
import type { TransactionDisplayValues } from './FuelTransactionsTable/types';
export { getTransactionColumnValues as getTransactionDisplayValues } from '../fuelColumnMetrics';
import {
  getDefaultModuleDateRange,
  localDateIso,
  shiftLocalDays,
} from '@/lib/defaultDateRange';

/** Format currency for Uganda */
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
};

const TX_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Kampala',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatTransactionTime = (t: { timestamp?: number; time?: string }): string => {
  if (typeof t.timestamp === 'number' && t.timestamp > 0) {
    const hhmmss = TX_TIME_FORMATTER.format(new Date(t.timestamp * 1000));
    return hhmmss === '24:00:00' ? '00:00:00' : hhmmss;
  }
  return t.time ?? '';
};

/** Default Fuel window: last 7 days — same as Dashboard / Alerts inbox. */
export const getDefaultDateRange = () => getDefaultModuleDateRange();

export type FuelQuickRange = 'today' | '7' | '14' | '30';

export function getFuelRangeForPreset(preset: FuelQuickRange): { fromDate: string; toDate: string; todayStr: string } {
  const todayStr = localDateIso();
  if (preset === 'today') {
    return { fromDate: todayStr, toDate: todayStr, todayStr };
  }
  const days = Number(preset) - 1;
  return { fromDate: shiftLocalDays(todayStr, -days), toDate: todayStr, todayStr };
}
