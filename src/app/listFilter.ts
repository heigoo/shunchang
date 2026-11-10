import type { Sheet, SheetStatus } from '../domain/types';

export type StatusFilter = 'all' | SheetStatus;

export function filterSheets(
  sheets: Sheet[],
  query: string,
  status: StatusFilter,
): Sheet[] {
  const keyword = query.trim().toLowerCase();

  return sheets.filter((sheet) => {
    if (status !== 'all' && sheet.status !== status) {
      return false;
    }
    if (keyword.length === 0) {
      return true;
    }
    return sheet.name.toLowerCase().indexOf(keyword) >= 0;
  });
}
