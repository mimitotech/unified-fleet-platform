import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** License status types */
export type LicenseStatusType = 'valid' | 'soon-expiring' | 'expired';

export interface LicenseStatusInfo {
  status: LicenseStatusType;
  label: string;
  color: string;
  bg: string;
  daysUntilExpiry: number;
}

/**
 * Calculate license status based on expiry date
 * - Valid: More than 30 days until expiry
 * - Soon Expiring: 30 days or less until expiry
 * - Expired: Past expiry date
 */
export function getLicenseStatus(expiryDate: string): LicenseStatusInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) {
    return {
      status: 'expired',
      label: 'Expired',
      color: 'text-destructive',
      bg: 'bg-destructive/15',
      daysUntilExpiry,
    };
  }

  if (daysUntilExpiry <= 30) {
    return {
      status: 'soon-expiring',
      label: 'Expiring Soon',
      color: 'text-warning',
      bg: 'bg-warning/15',
      daysUntilExpiry,
    };
  }

  return {
    status: 'valid',
    label: 'Valid',
    color: 'text-success',
    bg: 'bg-success/15',
    daysUntilExpiry,
  };
}

/**
 * Normalize vehicle plate number for matching
 * Removes spaces, dashes, and converts to uppercase
 * Used to match driver assignments to vehicles across systems
 */
export function normalizeVehiclePlate(plate: string): string {
  if (!plate) return '';
  return plate.toUpperCase().replace(/[\s\-]+/g, '');
}
