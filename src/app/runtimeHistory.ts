import type { RuntimeState, SheetStatus } from '../domain/types';
import {
  MAX_RUNTIME_SNAPSHOTS,
  getRuntimeSnapshots,
  saveRuntimeSnapshots,
} from '../store/repository';
import type { RuntimeSnapshot } from '../store/repository';

/**
 * 写操作前的运行时快照。快照按时间顺序保存，最多 10 步；
 * 时间与标签用于执行台的“操作记录”，runtime + sheetStatus 用于撤销与回退。
 */
export function pushSnapshot(
  sheetId: string,
  label: string,
  runtime: RuntimeState,
  sheetStatus: SheetStatus,
  at: number = Date.now(),
): RuntimeSnapshot[] {
  const snapshots = getRuntimeSnapshots(sheetId);
  const next = snapshots.concat({ at, label, runtime, sheetStatus });
  const trimmed = next.slice(-MAX_RUNTIME_SNAPSHOTS);
  saveRuntimeSnapshots(sheetId, trimmed);
  return trimmed;
}

/** 按时间升序返回快照（最后一个即最近一步操作之前的状态）。 */
export function listSnapshots(sheetId: string): RuntimeSnapshot[] {
  return getRuntimeSnapshots(sheetId);
}

/**
 * 恢复到第 index 个快照（该快照记录的是某次操作之前的状态），
 * 并丢弃该快照及其之后的所有记录。
 */
export function restoreSnapshot(
  sheetId: string,
  index: number,
): RuntimeSnapshot | null {
  const snapshots = getRuntimeSnapshots(sheetId);
  if (index < 0 || index >= snapshots.length) {
    return null;
  }
  const snapshot = snapshots[index];
  saveRuntimeSnapshots(sheetId, snapshots.slice(0, index));
  return snapshot;
}

export function clearSnapshots(sheetId: string): void {
  saveRuntimeSnapshots(sheetId, []);
}
