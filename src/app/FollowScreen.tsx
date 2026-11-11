import './FollowScreen.css';

import { useEffect, useState } from '@lynx-js/react';

import {
  computeTimeline,
  formatClockDisplay,
  formatDuration,
} from '../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../domain/types';
import { getRuntime, getSheet, setRole } from '../store/repository';
import { Badge, Button, usePresence } from '../ui';
import { registerBackHandler } from './backBus';
import { buildSyncTrail, itemState, ownerOptions } from './followOps';
import type { ItemState } from './followOps';
import { ImportPanel } from './ImportPanel';

export interface FollowScreenProps {
  sheetId?: string;
  onBack(): void;
}

const MINUS = '\u2212';
const CLOCK_TICK_MS = 30000;

const STATUS_LABEL: Record<ItemState, string> = {
  done: '已完成',
  active: '进行中',
  pending: '待执行',
  skipped: '已跳过',
};

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function offsetText(offsetMin: number): string {
  if (offsetMin === 0) {
    return '0';
  }
  return `${offsetMin > 0 ? '+' : MINUS}${Math.abs(offsetMin)}`;
}

function rowSubText(item: Item): string {
  const owner = item.owner.trim();
  const note = item.note.trim();
  if (owner.length > 0 && note.length > 0) {
    return `${owner} · ${note}`;
  }
  return owner.length > 0 ? owner : note;
}

export function FollowScreen(props: FollowScreenProps) {
  const { sheetId, onBack } = props;

  const [activeId, setActiveId] = useState<string | undefined>(sheetId);
  const [sheet, setSheet] = useState<Sheet | null>(() =>
    sheetId ? getSheet(sheetId) : null,
  );
  const [runtime, setRuntime] = useState<RuntimeState | null>(() =>
    sheetId ? getRuntime(sheetId) : null,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const importPresence = usePresence(importOpen);

  useEffect(() => {
    if (!importOpen) {
      return;
    }
    return registerBackHandler(() => {
      setImportOpen(false);
      return true;
    });
  }, [importOpen]);

  useEffect(() => {
    const loaded = activeId ? getSheet(activeId) : null;
    setSheet(loaded);
    setRuntime(loaded && activeId ? getRuntime(activeId) : null);
  }, [activeId, tick]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, CLOCK_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const openImport = () => {
    setImportOpen(true);
  };

  const closeImport = () => {
    setImportOpen(false);
  };

  const handleImported = (id: string) => {
    setImportOpen(false);
    setActiveId(id);
    setSheet(getSheet(id));
    setRuntime(getRuntime(id));
    setTick((value) => value + 1);
  };

  const exitFollow = () => {
    setRole('owner');
    onBack();
  };

  if (!sheet) {
    return (
      <view className="Follow theme-dark">
        <view className="FollowGuide">
          <text className="FollowGuideLabel">现场跟随</text>
          <text className="FollowGuideTitle">跟随现场</text>
          <text className="FollowGuideText">
            扫描督导的二维码，或输入六位短码载入手册
          </text>
          <view className="FollowGuideAction">
            <Button label="载入手册" block onTap={openImport} />
          </view>
          <view className="FollowGuideBack" bindtap={onBack}>
            <text className="FollowGuideBackText">返回手册列表</text>
          </view>
        </view>

        {importPresence.mounted ? (
          <ImportPanel
            closing={importPresence.closing}
            onClose={closeImport}
            onImported={handleImported}
          />
        ) : null}
      </view>
    );
  }

  const trail = buildSyncTrail(runtime, now);
  const offsetMin = runtime ? runtime.offsetMin : 0;
  const timeline = computeTimeline(sheet, offsetMin);
  const total = sheet.items.length;
  const inProgress =
    runtime !== null && runtime.currentIndex >= 0 && runtime.currentIndex < total;
  const currentIndex = inProgress && runtime ? runtime.currentIndex : -1;
  const currentItem = currentIndex >= 0 ? sheet.items[currentIndex] : null;
  const currentRow = currentIndex >= 0 ? timeline.rows[currentIndex] : null;
  const ended = runtime !== null && runtime.currentIndex >= total;

  const segLabel = `环节 ${
    currentIndex >= 0 ? pad3(currentIndex + 1) : '—'
  } / ${pad3(total)}`;

  const syncText = `${trail.absolute} · ${trail.versionLabel}${
    trail.relative.length > 0 ? ` · ${trail.relative}` : ''
  }`;

  let currentMeta = '';
  if (currentRow) {
    const range = `${formatClockDisplay(currentRow.displayStart)} — ${formatClockDisplay(
      currentRow.displayEnd,
    )}`;
    const owner = currentItem ? currentItem.owner.trim() : '';
    currentMeta = owner.length > 0 ? `${range} · ${owner}` : range;
  }

  const owners = ownerOptions(sheet);
  const allRows = sheet.items.map((item, index) => ({
    item,
    index,
    row: timeline.rows[index],
    state: itemState(runtime, index, item.id),
  }));

  let visibleRows =
    ownerFilter === 'all'
      ? allRows
      : allRows.filter((entry) => entry.item.owner.trim() === ownerFilter);

  if (
    currentIndex >= 0 &&
    !visibleRows.some((entry) => entry.index === currentIndex)
  ) {
    visibleRows = [allRows[currentIndex], ...visibleRows];
  }

  return (
    <view className="Follow theme-dark">
      <view className="FollowSync">
        <view className="FollowSyncRow">
          <text className="FollowSyncText">{syncText}</text>
          <view className="FollowSyncAction" bindtap={openImport}>
            <text className="FollowSyncActionText">更新</text>
          </view>
        </view>
        {trail.stale ? (
          <view className="FollowSyncHint">
            <text className="FollowSyncHintText">可能已过期，请向督导确认</text>
          </view>
        ) : null}
      </view>

      <view className="FollowHead">
        <view className="FollowHeadMain">
          <text className="FollowSheetName">
            {sheet.name.length > 0 ? sheet.name : '未命名手册'}
          </text>
          <text className="FollowSheetMeta">
            {`${sheet.date} · ${formatDuration(timeline.totalPlanMin)}`}
          </text>
        </view>
        <view className="FollowHeadBadges">
          <view className="FollowHeadBadge">
            <Badge kind="outline" label={offsetText(offsetMin)} />
          </view>
          {timeline.hasConflict ? (
            <view className="FollowHeadBadge">
              <Badge kind="outline" label="锁定冲突" />
            </view>
          ) : null}
        </view>
      </view>

      <view className="FollowCurrent" key={`current-${currentIndex}`}>
        <text className="FollowSeg">{segLabel}</text>

        {currentItem && currentRow ? (
          <view className="FollowCurrentBody">
            <text className="FollowCurrentName">
              {currentItem.name.length > 0 ? currentItem.name : '未命名环节'}
            </text>
            <text className="FollowCurrentMeta">{currentMeta}</text>
            {currentItem.lockAt !== null ? (
              <view className="FollowCurrentLock">
                <Badge
                  kind="stamp"
                  label={`锁定 ${formatClockDisplay(currentItem.lockAt)}`}
                />
              </view>
            ) : null}
          </view>
        ) : (
          <text className="FollowCurrentName">
            {ended ? '已全部结束' : '尚未开始'}
          </text>
        )}
      </view>

      <scroll-view className="FollowOwners" scroll-orientation="horizontal">
        <view className="FollowOwnerTrack">
          <view
            className={
              ownerFilter === 'all' ? 'FollowChip FollowChip--active' : 'FollowChip'
            }
            bindtap={() => {
              setOwnerFilter('all');
            }}
          >
            <text
              className={
                ownerFilter === 'all'
                  ? 'FollowChipText FollowChipText--active'
                  : 'FollowChipText'
              }
            >
              全部
            </text>
          </view>
          {owners.map((owner) => {
            const active = ownerFilter === owner;
            return (
              <view
                key={owner}
                className={active ? 'FollowChip FollowChip--active' : 'FollowChip'}
                bindtap={() => {
                  setOwnerFilter(owner);
                }}
              >
                <text
                  className={
                    active
                      ? 'FollowChipText FollowChipText--active'
                      : 'FollowChipText'
                  }
                >
                  {owner}
                </text>
              </view>
            );
          })}
        </view>
      </scroll-view>

      <scroll-view className="FollowScroll" scroll-orientation="vertical">
        {visibleRows.map((entry) => {
          const classes = ['FollowRow', 'RowIn'];
          if (entry.state === 'active') {
            classes.push('FollowRow--active');
          }
          const statusClasses = ['FollowRowStatus'];
          if (entry.state === 'done' || entry.state === 'skipped') {
            statusClasses.push('FollowRowStatus--dim');
          }
          return (
            <view
              key={entry.item.id}
              className={classes.join(' ')}
              style={{ animationDelay: `${Math.min(entry.index, 10) * 22}ms` }}
            >
              <text className="FollowRowNo">{pad3(entry.index + 1)}</text>
              <text className="FollowRowTime">
                {formatClockDisplay(entry.row.displayStart)}
              </text>
              <view className="FollowRowMain">
                <view className="FollowRowTitleLine">
                  <text className="FollowRowName">
                    {entry.item.name.length > 0 ? entry.item.name : '未命名环节'}
                  </text>
                  {entry.item.lockAt !== null ? (
                    <text className="FollowRowLock">
                      {`[锁定 ${formatClockDisplay(entry.item.lockAt)}]`}
                    </text>
                  ) : null}
                </view>
                <text className="FollowRowSub">{rowSubText(entry.item)}</text>
              </view>
              <text className={statusClasses.join(' ')}>
                {STATUS_LABEL[entry.state]}
              </text>
            </view>
          );
        })}
      </scroll-view>

      <view className="FollowFooter">
        <text className="FollowFooterNote">只读 · 不能推进环节</text>
        <view className="FollowFooterAction" bindtap={exitFollow}>
          <text className="FollowFooterActionText">退出跟随</text>
        </view>
      </view>

      {importPresence.mounted ? (
        <ImportPanel
          closing={importPresence.closing}
          onClose={closeImport}
          onImported={handleImported}
        />
      ) : null}
    </view>
  );
}
