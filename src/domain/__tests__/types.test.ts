import { describe, expect, it } from '@rstest/core';

import { createEmptySheet, formatDateKey, isValidDateKey } from '../types';

const NOW = 1762732800000;

describe('isValidDateKey', () => {
  it('接受合法的 YYYY-MM-DD', () => {
    expect(isValidDateKey('2026-11-23')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey(' 2026-11-23 ')).toBe(true);
  });

  it('拒绝不存在的日期与错误格式', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-00-10')).toBe(false);
    expect(isValidDateKey('2026-2-3')).toBe(false);
    expect(isValidDateKey('2026/11/23')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });
});

describe('createEmptySheet', () => {
  it('默认使用当天日期', () => {
    const sheet = createEmptySheet(NOW);

    expect(sheet.date).toBe(formatDateKey(NOW));
    expect(sheet.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('使用传入的活动日期', () => {
    const sheet = createEmptySheet(NOW, '2026-11-23');

    expect(sheet.date).toBe('2026-11-23');
  });

  it('传入非法日期时回退到当天', () => {
    const sheet = createEmptySheet(NOW, '2026-02-30');

    expect(sheet.date).toBe(formatDateKey(NOW));
  });
});
