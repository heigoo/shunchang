export type SheetStatus = 'draft' | 'published' | 'running' | 'done';

import { t } from '../i18n';

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

export type SyncMode = 'full' | 'short';

/** 现场插入的环节：仅可插入到 afterId 对应环节之后。 */
export interface InsertedItem {
  id: string;
  afterId: string;
  createdAt: number;
  item: Item;
}

/** 现场操作记录，最多保留 100 条。 */
export interface AuditEntry {
  id: string;
  at: number;
  type: string;
  label: string;
  itemId?: string;
}

export interface RuntimeState {
  sheetId: string;
  currentIndex: number;
  actuals: Record<string, { start?: number; end?: number; result?: 'done' | 'skipped' }>;
  /** 展示用有效偏移；等于 autoOffsetMin + manualOffsetMin。 */
  offsetMin: number;
  /** 由最近完成环节的实际结束时间推导的自动偏移。 */
  autoOffsetMin: number;
  /** 督导手动顺延产生的附加偏移。 */
  manualOffsetMin: number;
  execVersion: number;
  lastSyncAt: number;
  /** 主控代次，接管主控时 +1。 */
  ownerEpoch: number;
  /** 当前主控设备短标识。 */
  ownerDeviceId: string;
  lastSyncMode: SyncMode;
  insertedItems: InsertedItem[];
  /** 环节 id → 覆盖后的锁定时刻；null 表示解除锁定。 */
  lockOverrides: Record<string, number | null>;
  audit: AuditEntry[];
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
    name: t('新环节'),
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
    name: t('未命名手册'),
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    startMin: date.getHours() * 60,
    items: [createEmptyItem()],
    status: 'draft',
    version: 1,
    updatedAt: now,
  };
}
