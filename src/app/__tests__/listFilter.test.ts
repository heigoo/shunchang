import { describe, expect, it } from '@rstest/core';

import type { Sheet, SheetStatus } from '../../domain/types';
import { filterSheets } from '../listFilter';

function makeSheet(id: string, name: string, status: SheetStatus = 'draft'): Sheet {
  return {
    id,
    name,
    date: '2026-11-10',
    startMin: 480,
    items: [],
    status,
    version: 1,
    updatedAt: 0,
  };
}

const SHEETS: Sheet[] = [
  makeSheet('a', '中式婚礼流程', 'draft'),
  makeSheet('b', 'Wedding Plan', 'published'),
  makeSheet('c', 'Annual Gala', 'running'),
  makeSheet('d', '年会流程', 'done'),
];

describe('filterSheets', () => {
  it('matches names case-insensitively', () => {
    expect(filterSheets(SHEETS, 'wedding', 'all').map((s) => s.id)).toEqual(['b']);
    expect(filterSheets(SHEETS, 'WEDDING', 'all').map((s) => s.id)).toEqual(['b']);
  });

  it('trims surrounding whitespace', () => {
    expect(filterSheets(SHEETS, '  年会  ', 'all').map((s) => s.id)).toEqual(['d']);
  });

  it('filters by status while keeping input order', () => {
    expect(filterSheets(SHEETS, '', 'draft').map((s) => s.id)).toEqual(['a']);
    expect(filterSheets(SHEETS, '', 'all').map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('combines query and status filters', () => {
    expect(filterSheets(SHEETS, 'annual', 'running').map((s) => s.id)).toEqual([
      'c',
    ]);
    expect(filterSheets(SHEETS, 'annual', 'done')).toEqual([]);
  });
});
