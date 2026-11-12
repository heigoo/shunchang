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

export type ItemState = 'done' | 'active' | 'pending' | 'skipped';

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
