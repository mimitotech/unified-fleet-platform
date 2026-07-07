import React from 'react';
import {
  Radio,
  Droplets,
  GaugeCircle,
  AlertTriangle,
  Calendar,
  Truck,
  MapPin,
  Tag,
  Fuel,
  ArrowLeftRight,
  Banknote,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fuelTh } from './fuelTableCells';

const headerIcon = 'w-3.5 h-3.5 shrink-0';

function HeaderLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="fuel-cell-inline inline-flex flex-col items-center justify-center gap-1 mx-auto">
      {icon}
      <span>{children}</span>
    </span>
  );
}

export function FuelTableColumnHeaders({ unitColumnLabel = 'Vehicle' }: { unitColumnLabel?: string }) {
  return (
    <thead className="sticky top-0 bg-card z-10 shadow-sm fuel-table-header">
      <tr className="border-b border-border">
        <th className={fuelTh}>
          <HeaderLabel icon={<Calendar className={cn(headerIcon, 'text-primary')} />}>Date</HeaderLabel>
        </th>
        <th className={fuelTh}>
          <HeaderLabel icon={<Truck className={cn(headerIcon, 'text-primary')} />}>{unitColumnLabel}</HeaderLabel>
        </th>
        <th className={fuelTh}>
          <HeaderLabel icon={<MapPin className={cn(headerIcon, 'text-muted-foreground')} />}>Location</HeaderLabel>
        </th>
        <th className={fuelTh} title="Filled Main Tank (FLS Sensor)">
          <HeaderLabel icon={<Radio className={cn(headerIcon, 'text-green-500')} />}>Filled(Main)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Filled Reserve Tank (FLS Sensor)">
          <HeaderLabel icon={<Radio className={cn(headerIcon, 'text-emerald-400')} />}>Filled(Reserve)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Filled at fuel station">
          <HeaderLabel icon={<Fuel className={cn(headerIcon, 'text-blue-500')} />}>Filled(Station)</HeaderLabel>
        </th>
        <th className={fuelTh} title="FLS vs station variance (L)">
          <HeaderLabel icon={<ArrowLeftRight className={cn(headerIcon, 'text-warning')} />}>Variance</HeaderLabel>
        </th>
        <th className={fuelTh} title="Fuel Used Main Tank">
          <HeaderLabel icon={<Droplets className={cn(headerIcon, 'text-orange-500')} />}>Used(Main)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Fuel Used Reserve Tank">
          <HeaderLabel icon={<Droplets className={cn(headerIcon, 'text-amber-400')} />}>Used(Reserve)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Main Tank Fuel Level">
          <HeaderLabel icon={<GaugeCircle className={cn(headerIcon, 'text-cyan-500')} />}>Level(Main)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Reserve Tank Fuel Level">
          <HeaderLabel icon={<GaugeCircle className={cn(headerIcon, 'text-teal-400')} />}>Level(Reserve)</HeaderLabel>
        </th>
        <th className={cn(fuelTh, 'bg-muted/30')} title="Total Fuel Level (Main + Reserve)">
          <HeaderLabel icon={<GaugeCircle className={cn(headerIcon, 'text-cyan-600')} />}>Total Level</HeaderLabel>
        </th>
        <th className={fuelTh} title="Sudden Fuel Drop Main Tank">
          <HeaderLabel icon={<AlertTriangle className={cn(headerIcon, 'text-destructive')} />}>Drop(Main)</HeaderLabel>
        </th>
        <th className={fuelTh} title="Sudden Fuel Drop Reserve Tank">
          <HeaderLabel icon={<AlertTriangle className={cn(headerIcon, 'text-red-400')} />}>Drop(Reserve)</HeaderLabel>
        </th>
        <th className={cn(fuelTh, 'bg-muted/30')} title="Total Fuel Drop">
          <HeaderLabel icon={<AlertTriangle className={cn(headerIcon, 'text-destructive')} />}>Total Drop</HeaderLabel>
        </th>
        <th className={cn(fuelTh, 'bg-muted/30')} title="Total Fuel Used">
          <HeaderLabel icon={<Droplets className={cn(headerIcon, 'text-orange-600')} />}>Total Used</HeaderLabel>
        </th>
        <th className={fuelTh}>
          <HeaderLabel icon={<Tag className={cn(headerIcon, 'text-muted-foreground')} />}>Type</HeaderLabel>
        </th>
        <th className={fuelTh} title="Transaction cost">
          <HeaderLabel icon={<Banknote className={cn(headerIcon, 'text-primary')} />}>Cost</HeaderLabel>
        </th>
        <th className={fuelTh} title="Fuel card number">
          <HeaderLabel icon={<CreditCard className={cn(headerIcon, 'text-muted-foreground')} />}>Card No</HeaderLabel>
        </th>
      </tr>
    </thead>
  );
}
