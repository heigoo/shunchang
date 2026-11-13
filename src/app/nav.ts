import type { SheetStatus } from '../domain/types';

export type AppView =
  | 'list'
  | 'editor'
  | 'runtime'
  | 'follow'
  | 'print'
  | 'report';

/** 从列表打开手册时，按状态决定落到哪个页面。 */
export function viewForSheet(status: SheetStatus): AppView {
  if (status === 'running') {
    return 'runtime';
  }
  if (status === 'done') {
    return 'report';
  }
  return 'editor';
}
