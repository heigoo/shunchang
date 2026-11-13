import { formatShortCode } from '../domain/codec';
import type { TimelineRow } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';

export interface SyncTrail {
  /** "同步于 12:41"；lastSyncAt=0 → "尚未同步" */
  absolute: string;
  /** "3 分钟前"；时钟异常/无同步 → '' */
  relative: string;
  /** 距上次同步 > 15 分钟；无同步也算 stale */
  stale: boolean;
  /** "第 3 版" */
  versionLabel: string;
}

export type ItemState = 'done' | 'doneApprox' | 'active' | 'pending' | 'skipped';

const STALE_MS = 15 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clockOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function buildSyncTrail(
  runtime: RuntimeState | null,
  now: number,
): SyncTrail {
  const versionLabel = t('第 {n} 版', {
    n: runtime ? runtime.execVersion : 1,
  });

  if (!runtime || runtime.lastSyncAt === 0) {
    return {
      absolute: t('尚未同步'),
      relative: '',
      stale: true,
      versionLabel,
    };
  }

  const lastSyncAt = runtime.lastSyncAt;
  const elapsed = now - lastSyncAt;
  const stale = elapsed > STALE_MS;

  let relative = '';
  if (elapsed >= 0) {
    relative =
      elapsed < MINUTE_MS
        ? t('刚刚')
        : t('{n} 分钟前', { n: Math.floor(elapsed / MINUTE_MS) });
  }

  return {
    absolute: t('同步于 {time}', { time: clockOf(lastSyncAt) }),
    relative,
    stale,
    versionLabel,
  };
}

export function itemState(
  runtime: RuntimeState | null,
  index: number,
  itemId: string,
): ItemState {
  const actual = runtime ? runtime.actuals[itemId] : undefined;
  if (actual && actual.result === 'done') {
    return 'done';
  }
  if (actual && actual.result === 'skipped') {
    return 'skipped';
  }
  if (runtime !== null && runtime.currentIndex === index) {
    return 'active';
  }
  // 短码不携带逐项结果：当前序号之前的环节按“已完成（约）”显示。
  if (
    runtime !== null &&
    runtime.lastSyncMode === 'short' &&
    runtime.currentIndex > index
  ) {
    return 'doneApprox';
  }
  return 'pending';
}

export function ownerOptions(sheet: Sheet): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const item of sheet.items) {
    const owner = item.owner.trim();
    if (owner.length === 0 || seen.has(owner)) {
      continue;
    }
    seen.add(owner);
    options.push(owner);
  }

  return options;
}

/** 从跟随链接的查询串读取 `o=<负责人>`，无值时返回空串。 */
export function ownerFromSearch(search: string): string {
  const query = typeof search === 'string' ? search.replace(/^\?/, '') : '';
  if (query.length === 0) {
    return '';
  }

  for (const part of query.split('&')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator) !== 'o') {
      continue;
    }
    const raw = part.slice(separator + 1).replace(/\+/g, ' ');
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  }

  return '';
}

export interface SyncCopyInput {
  sheetName: string;
  execVersion: number;
  now: number;
  /** 原始 9 位短码；空串表示当前版本超出短码范围。 */
  shortCode: string;
}

/** 可直接发到微信群的中文同步文案：手册名、版本、时间、短码。 */
export function buildSyncCopyText(input: SyncCopyInput): string {
  const name = input.sheetName.trim().length > 0 ? input.sheetName.trim() : t('未命名手册');
  const date = new Date(input.now);
  const time = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${clockOf(input.now)}`;
  const code = formatShortCode(input.shortCode);
  const codeLine =
    code.length > 0
      ? t('九位短码 {code}', { code })
      : t('当前版本无法用短码同步，请用二维码/链接');

  return [
    `【顺场】${name} · ${t('第 {n} 版', { n: input.execVersion })}`,
    t('同步时间 {time}', { time }),
    codeLine,
  ].join('\n');
}

export interface FollowCountdownTarget {
  kind: 'current' | 'next';
  targetMin: number;
}

/** 跟随视图：当前环节剩余时间；尚未开始时显示下一环节倒计时。 */
export function followCountdownTarget(
  rows: TimelineRow[],
  currentIndex: number,
  total: number,
): FollowCountdownTarget | null {
  if (currentIndex >= 0 && currentIndex < total && rows[currentIndex]) {
    return { kind: 'current', targetMin: rows[currentIndex].displayEnd };
  }
  if (currentIndex < 0 && total > 0 && rows[0]) {
    return { kind: 'next', targetMin: rows[0].displayStart };
  }
  return null;
}
