import './FollowScreen.css';

import { useEffect, useState } from '@lynx-js/react';

import { buildExecutionSheet } from '../domain/execution';
import {
  computeTimeline,
  formatClockDisplay,
  formatDuration,
} from '../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../domain/types';
import { getRuntime, getSheet, setRole } from '../store/repository';
import { t, useT } from '../i18n';
import { Badge, Button, usePresence } from '../ui';
import { registerBackHandler } from './backBus';
import { formatCountdown, secondsUntil } from './countdown';
import {
  buildSyncTrail,
  followCountdownTarget,
  itemState,
  ownerFromSearch,
  ownerOptions,
} from './followOps';
import type { ItemState } from './followOps';
import { ImportPanel } from './ImportPanel';
import { readOwnerNotice, takeOverOwner } from './importFlow';
import { canUseNativeFiles, webLocation } from './share';

export interface FollowScreenProps {
  sheetId?: string;
  onBack(): void;
  safeTop?: number;
  safeBottom?: number;
  /** 免安装跟随页（?follow=1）：隐藏退出与返回手册列表入口。 */
  followOnly?: boolean;
  /** 接管主控后回到主控执行台；未提供时退回列表。 */
  onTakeOver?(sheetId: string): void;
}

const MINUS = '\u2212';
const CLOCK_TICK_MS = 1000;

const STATUS_LABEL: Record<ItemState, string> = {
  done: '已完成',
  doneApprox: '已完成（约）',
  active: '进行中',
  pending: '待执行',
  skipped: '已跳过',
};

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function offsetLabel(offsetMin: number): string {
  if (offsetMin === 0) {
    return t('准点');
  }
  return offsetMin > 0
    ? t('晚 {n} 分', { n: offsetMin })
    : t('早 {n} 分', { n: Math.abs(offsetMin) });
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
  const {
    sheetId,
    onBack,
    safeTop = 0,
    safeBottom = 0,
    followOnly = false,
    onTakeOver,
  } = props;
  const t = useT();

  const [activeId, setActiveId] = useState<string | undefined>(sheetId);
  const [sheet, setSheet] = useState<Sheet | null>(() =>
    sheetId ? getSheet(sheetId) : null,
  );
  const [runtime, setRuntime] = useState<RuntimeState | null>(() =>
    sheetId ? getRuntime(sheetId) : null,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [ownerFilter, setOwnerFilter] = useState<string>(() => {
    const search = webLocation()?.search ?? '';
    const owner = ownerFromSearch(search);
    return owner.length > 0 ? owner : 'all';
  });
  const [importOpen, setImportOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const importPresence = usePresence(importOpen);
  const canPickFile = canUseNativeFiles();

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

  const handleTakeOver = (id: string) => {
    const next = takeOverOwner(id);
    setRuntime(next);
    setTakeoverOpen(false);
    if (onTakeOver) {
      onTakeOver(id);
      return;
    }
    onBack();
  };

  if (!sheet) {
    return (
      <view
      className="Follow theme-dark"
      style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
    >
        <view className="FollowGuide">
          <view className="FollowPass">
            <view className="FollowPassHead">
              <text className="FollowPassLabel">{t('现场跟随')}</text>
              <text className="FollowPassNo">{t('跟随凭证')}</text>
            </view>
            <text className="FollowPassTitle">{t('跟随现场')}</text>
            <text className="FollowPassText">
              {followOnly
                ? t('打开督导分享的跟随链接，载入后即可查看现场进度')
                : t('用手机相机扫描督导的二维码，或输入九位短码（需已载入手册）')}
            </text>
            <view className="FollowPassRule" />
            {followOnly ? null : (
              <>
                <view className="FollowStep" bindtap={openImport}>
                  <text className="FollowStepNo">01</text>
                  <text className="FollowStepText">{t('扫码')}</text>
                  <text className="FollowStepArrow">→</text>
                </view>
                <view className="FollowStep" bindtap={openImport}>
                  <text className="FollowStepNo">02</text>
                  <text className="FollowStepText">{t('短码')}</text>
                  <text className="FollowStepArrow">→</text>
                </view>
                {canPickFile ? (
                  <view className="FollowStep" bindtap={openImport}>
                    <text className="FollowStepNo">03</text>
                    <text className="FollowStepText">{t('文件')}</text>
                    <text className="FollowStepArrow">→</text>
                  </view>
                ) : null}
              </>
            )}
            <view className="FollowPassAction">
              <Button label={t('载入手册')} block onTap={openImport} />
            </view>
            <text className="FollowPassNote">{t('只读 · 不能推进环节')}</text>
          </view>
          {followOnly ? null : (
            <view className="FollowGuideBack" bindtap={exitFollow}>
              <text className="FollowGuideBackText">{t('返回手册列表')}</text>
            </view>
          )}
        </view>

        {importPresence.mounted ? (
          <ImportPanel
            closing={importPresence.closing}
            safeTop={safeTop}
            onClose={closeImport}
            onImported={handleImported}
          />
        ) : null}
      </view>
    );
  }

  const trail = buildSyncTrail(runtime, now);
  const shortSync = runtime !== null && runtime.lastSyncMode === 'short';
  const ownerNotice = readOwnerNotice(sheet.id);
  const offsetMin = runtime ? runtime.offsetMin : 0;
  const execSheet = runtime ? buildExecutionSheet(sheet, runtime) : sheet;
  const timeline = computeTimeline(execSheet, offsetMin);
  const total = execSheet.items.length;
  const inProgress =
    runtime !== null && runtime.currentIndex >= 0 && runtime.currentIndex < total;
  const currentIndex = inProgress && runtime ? runtime.currentIndex : -1;
  const currentItem = currentIndex >= 0 ? execSheet.items[currentIndex] : null;
  const currentRow = currentIndex >= 0 ? timeline.rows[currentIndex] : null;
  const ended = runtime !== null && runtime.currentIndex >= total;

  const segLabel = t('环节 {a} / {b}', {
    a: currentIndex >= 0 ? pad3(currentIndex + 1) : '—',
    b: pad3(total),
  });

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

  const owners = ownerOptions(execSheet);
  // 链接里的负责人不存在时退回全部，避免跟随者看到空列表。
  const effectiveOwner =
    ownerFilter !== 'all' && owners.indexOf(ownerFilter) < 0
      ? 'all'
      : ownerFilter;
  const allRows = execSheet.items.map((item, index) => ({
    item,
    index,
    row: timeline.rows[index],
    state: itemState(runtime, index, item.id),
  }));

  let visibleRows =
    effectiveOwner === 'all'
      ? allRows
      : allRows.filter((entry) => entry.item.owner.trim() === effectiveOwner);

  if (
    currentIndex >= 0 &&
    !visibleRows.some((entry) => entry.index === currentIndex)
  ) {
    visibleRows = [allRows[currentIndex], ...visibleRows];
  }

  const countdownTarget = followCountdownTarget(
    timeline.rows,
    currentIndex,
    total,
  );
  const countdown = countdownTarget
    ? formatCountdown(secondsUntil(countdownTarget.targetMin, now))
    : null;

  return (
    <view
      className="Follow theme-dark"
      style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
    >
      <view className="FollowSync">
        <view className="FollowSyncRow">
          <view className="FollowSyncMain">
            <text className="FollowSyncKicker">{t('现场跟随')}</text>
            <text className="FollowSyncText">{syncText}</text>
          </view>
          <view className="FollowSyncAction" bindtap={openImport}>
            <text className="FollowSyncActionText">{t('更新')}</text>
          </view>
        </view>
        {trail.stale ? (
          <view className="FollowSyncHint">
            <text className="FollowSyncHintText">
              {t('可能已过期，请向督导确认')}
            </text>
          </view>
        ) : null}
        {shortSync ? (
          <view className="FollowSyncHint">
            <text className="FollowSyncHintText">
              {t('短码同步不含逐项结果，已完成为推断')}
            </text>
          </view>
        ) : null}
        {ownerNotice ? (
          <view className="FollowSyncHint FollowSyncHint--owner">
            <text className="FollowSyncHintText">
              {t('主控已转移到另一台设备')}
            </text>
          </view>
        ) : null}
      </view>

      <view className="FollowHead">
        <view className="FollowHeadMain">
          <text className="FollowSheetName">
            {sheet.name.length > 0 ? sheet.name : t('未命名手册')}
          </text>
          <text className="FollowSheetMeta">
            {`${sheet.date} · ${formatDuration(timeline.totalPlanMin)}`}
          </text>
        </view>
        <view className="FollowHeadBadges">
          <view className="FollowHeadBadge">
            <Badge kind="amber" label={offsetLabel(offsetMin)} />
          </view>
          {timeline.hasConflict ? (
            <view className="FollowHeadBadge">
              <Badge kind="outline" label={t('锁定冲突')} />
            </view>
          ) : null}
        </view>
      </view>

      <view className="FollowCurrent" key={`current-${currentIndex}`}>
        <view className="FollowCurrentHead">
          <text className="FollowSeg">{segLabel}</text>
          <text className="FollowCurrentState">
            {ended
              ? t('已全部结束')
              : currentIndex >= 0
                ? t('当前环节')
                : t('尚未开始')}
          </text>
        </view>

        {currentItem && currentRow ? (
          <view className="FollowCurrentBody">
            <text className="FollowCurrentName">
              {currentItem.name.length > 0 ? currentItem.name : t('未命名环节')}
            </text>
            <text className="FollowCurrentMeta">{currentMeta}</text>
            {currentItem.lockAt !== null ? (
              <view className="FollowCurrentLock">
                <Badge
                  kind="stamp"
                  label={t('锁定 {time} · 到点开始', {
                    time: formatClockDisplay(currentItem.lockAt),
                  })}
                />
              </view>
            ) : null}
          </view>
        ) : (
          <text className="FollowCurrentName">
            {ended ? t('已全部结束') : t('尚未开始')}
          </text>
        )}

        {countdown && countdownTarget ? (
          <view className="FollowCountdown">
            <text className="FollowCountdownLabel">
              {countdownTarget.kind === 'next'
                ? t('距开始')
                : countdown.sign === 'over'
                  ? t('本环节已超时')
                  : t('本环节剩余')}
            </text>
            <text
              className={
                countdown.sign === 'over'
                  ? 'FollowCountdownValue FollowCountdownValue--over'
                  : 'FollowCountdownValue'
              }
            >
              {`${countdown.sign === 'over' ? MINUS : ''}${countdown.text}`}
            </text>
          </view>
        ) : null}

        <view className="FollowProgress">
          <view className="FollowProgressMeta">
            <text className="FollowProgressLabel">{t('完成度')}</text>
            <text className="FollowProgressCount">
              {`${pad3(Math.max(currentIndex, 0))} / ${pad3(total)}`}
            </text>
          </view>
          <view className="FollowProgressTrack">
            <view
              className="FollowProgressFill"
              style={{
                width: `${total > 0 ? Math.round((Math.max(currentIndex, 0) / total) * 100) : 0}%`,
              }}
            />
          </view>
        </view>
      </view>

      <scroll-view className="FollowOwners" scroll-orientation="horizontal">
        <view className="FollowOwnerTrack">
          <view
            className={
              effectiveOwner === 'all'
                ? 'FollowChip FollowChip--active'
                : 'FollowChip'
            }
            bindtap={() => {
              setOwnerFilter('all');
            }}
          >
            <text
              className={
                effectiveOwner === 'all'
                  ? 'FollowChipText FollowChipText--active'
                  : 'FollowChipText'
              }
            >
              {t('全部')}
            </text>
          </view>
          {owners.map((owner) => {
            const active = effectiveOwner === owner;
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
          if (
            entry.state === 'done' ||
            entry.state === 'doneApprox' ||
            entry.state === 'skipped'
          ) {
            statusClasses.push('FollowRowStatus--dim');
          }
          return (
            <view
              key={entry.item.id}
              className={classes.join(' ')}
              style={{ animationDelay: `${Math.min(entry.index, 10) * 22}ms` }}
            >
              <view className={`FollowRowDot FollowRowDot--${entry.state}`} />
              <text className="FollowRowNo">{pad3(entry.index + 1)}</text>
              <text className="FollowRowTime">
                {formatClockDisplay(entry.row.displayStart)}
              </text>
              <view className="FollowRowMain">
                <view className="FollowRowTitleLine">
                  <text className="FollowRowName">
                    {entry.item.name.length > 0
                      ? entry.item.name
                      : t('未命名环节')}
                  </text>
                  {entry.item.lockAt !== null ? (
                    <text className="FollowRowLock">
                      {t('锁定 {time}', {
                        time: formatClockDisplay(entry.item.lockAt),
                      })}
                    </text>
                  ) : null}
                </view>
                <text className="FollowRowSub">{rowSubText(entry.item)}</text>
              </view>
              <text className={statusClasses.join(' ')}>
                {t(STATUS_LABEL[entry.state])}
              </text>
            </view>
          );
        })}
      </scroll-view>

      <view className="FollowFooter">
        <text className="FollowFooterNote">{t('只读 · 不能推进环节')}</text>
        <view className="FollowFooterActions">
          {followOnly ? null : (
            <view
              className="FollowFooterAction"
              bindtap={() => {
                setTakeoverOpen(true);
              }}
            >
              <text className="FollowFooterActionText">{t('接管主控')}</text>
            </view>
          )}
          {followOnly ? null : (
            <view className="FollowFooterAction" bindtap={exitFollow}>
              <text className="FollowFooterActionText">{t('退出跟随')}</text>
            </view>
          )}
        </view>
      </view>

      {takeoverOpen ? (
        <view
          className="FollowConfirmOverlay"
          bindtap={() => {
            setTakeoverOpen(false);
          }}
        >
          <view
            className="FollowConfirm theme-dark"
            catchtap={() => {}}
          >
            <text className="FollowConfirmTitle">{t('接管主控？')}</text>
            <text className="FollowConfirmText">
              {t('接管后本机可推进环节，原主控设备会在下次同步时转为只读。')}
            </text>
            <view className="FollowConfirmActions">
              <view className="FollowConfirmAction">
                <Button
                  label={t('取消')}
                  kind="tertiary"
                  block
                  onTap={() => {
                    setTakeoverOpen(false);
                  }}
                />
              </view>
              <view className="FollowConfirmAction FollowConfirmAction--primary">
                <Button
                  label={t('确认接管')}
                  block
                  onTap={() => {
                    handleTakeOver(sheet.id);
                  }}
                />
              </view>
            </view>
          </view>
        </view>
      ) : null}

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
