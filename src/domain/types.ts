export type SheetStatus = 'draft' | 'published' | 'running' | 'done';

export interface Item {
  id: string;
  name: string;
  durationMin: number;
  owner: string;
  note: string;
  lockAt: number | null;
  /**
   * 是否为锁定环节。锁定但尚未填写时刻时 lockAt 为 null，
   * 发布校验据此给出补填提示。
   */
  locked?: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  date: string;
  startMin: number;
  items: Item[];
  status: SheetStatus;
  version: number;
  updatedAt: number;
  /**
   * 已发布手册存在未发布的修改。草稿不置该标记。
   */
  dirty?: boolean;
}

export interface RuntimeState {
  sheetId: string;
  currentIndex: number;
  actuals: Record<string, { start?: number; end?: number; result?: 'done' | 'skipped' }>;
  offsetMin: number;
  execVersion: number;
  lastSyncAt: number;
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function createEmptyItem(): Item {
  return {
    id: createId(),
    name: '新环节',
    durationMin: 30,
    owner: '',
    note: '',
    lockAt: null,
  };
}

export function createEmptySheet(now: number): Sheet {
  const date = new Date(now);
  return {
    id: createId(),
    name: '未命名手册',
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    startMin: date.getHours() * 60,
    items: [createEmptyItem()],
    status: 'draft',
    version: 1,
    updatedAt: now,
  };
}
