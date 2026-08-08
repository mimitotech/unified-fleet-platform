import { describe, expect, it } from 'vitest';
import {
  filterActiveWialonUnits,
  isWialonUnitActive,
} from '../services/wialonLiveUtils.js';

describe('isWialonUnitActive', () => {
  it('keeps explicitly activated units even with stale dactt', () => {
    expect(isWialonUnitActive({ act: 1, dactt: 1_700_000_000, nm: 'A' })).toBe(true);
    expect(isWialonUnitActive({ act: true, dactt: 1_700_000_000, nm: 'A' })).toBe(true);
  });

  it('drops deactivated units', () => {
    expect(isWialonUnitActive({ act: 0, nm: 'B' })).toBe(false);
    expect(isWialonUnitActive({ act: false, nm: 'B' })).toBe(false);
  });

  it('drops units with only dactt when act is unknown', () => {
    expect(isWialonUnitActive({ dactt: 1_700_000_000, nm: 'C' })).toBe(false);
  });

  it('keeps units with no activation fields', () => {
    expect(isWialonUnitActive({ nm: 'D' })).toBe(true);
  });
});

describe('filterActiveWialonUnits', () => {
  it('filters mixed lists', () => {
    const items = [
      { id: 1, nm: 'on', act: 1 as const },
      { id: 2, nm: 'off', act: 0 as const },
      { id: 3, nm: 'unknown' },
    ];
    expect(filterActiveWialonUnits(items).map((u) => u.id)).toEqual([1, 3]);
  });
});
