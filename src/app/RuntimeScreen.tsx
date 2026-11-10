import './RuntimeScreen.css';

import { useEffect, useRef, useState } from '@lynx-js/react';

import { formatClockDisplay, formatDuration } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import {
  getRole,
  getRuntime,
  getSheet,
  saveRuntime,
  saveSheet,
} from '../store/repository';
import { Badge, Button, GlassPanel } from '../ui';
import {
  buildRuntimeView,
  completeCurrent,
  createRuntime,
  skipCurrent,
} from './runtimeOps';

export interface RuntimeScreenProps {
  sheetId: string;
  onBack(): void;
  onPrint?(sheetId: string): void;
}

const MINUS = '\u2212';
const HOLD_DONE_MS = 3000;
const DONE_GUARD_MS = 300;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function minuteOfDay(ms: number): number {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
}

function offsetText(offsetMin: number): string {
  if (offsetMin === 0) {
    return '0';
  }
  return `${offsetMin > 0 ? '+' : MINUS}${Math.abs(offsetMin)}`;
}

function secondsUntil(targetMin: number, nowMs: number): number {
  const nowSec = nowMs / 1000;
  const dayStart = Math.floor(nowSec / 86400) * 86400;
  let best: number | null = null;

  for (const shift of [-1, 0, 1]) {
    const targetSec = dayStart + shift * 86400 + targetMin * 60;
    const diff = targetSec - nowSec;
    if (best === null || Math.abs(diff) < Math.abs(best)) {
      best = diff;
    }
  }

  return Math.round(best ?? 0);
}

function formatCountdown(seconds: number): { sign: 'left' | 'over'; text: string } {
  const over = seconds < 0;
  const total = Math.abs(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const text =
    total >= 6000
      ? `${pad2(hours)}:${pad2(minutes)}:${pad2(rest)}`
      : `${pad2(minutes)}:${pad2(rest)}`;
  return { sign: over ? 'over' : 'left', text };
}

function diffText(value: number): string {
  if (value > 0) {
    return `+${formatDuration(value)}`;
  }
  if (value < 0) {
    return `${MINUS}${formatDuration(-value)}`;
  }
  return '0 分钟';
}

export function RuntimeScreen(props: RuntimeScreenProps) {
  const { sheetId, onBack, onPrint } = props;

  const [sheet, setSheet] = useState<Sheet | null>(() => getSheet(sheetId));
  const [runtime, setRuntime] = useState<RuntimeState | null>(() => {
    const loaded = getSheet(sheetId);
    if (!loaded) {
      return null;
    }
    return getRuntime(sheetId) ?? createRuntime(loaded, minuteOfDay(Date.now()));
  });
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [role] = useState<'owner' | 'follower'>(() => getRole());
  const [shiftOpen, setShiftOpen] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDoneAt = useRef(0);

  useEffect(() => {
    if (runtime) {
      saveRuntime(runtime);
    }
    const loaded = getSheet(sheetId);
    if (loaded && (loaded.status === 'published' || loaded.status === 'draft')) {
      setSheet(saveSheet({ ...loaded, status: 'running' }));
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
      if (holdTimer.current !== null) {
        clearInterval(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, []);

  if (!sheet || !runtime) {
    return (
      <view className="Runtime theme-dark">
        <view className="RuntimeMissing">
          <text className="RuntimeMissingTitle">手册不存在</text>
          <view className="RuntimeMissingAction">
            <Button label="返回手册列表" kind="tertiary" onTap={onBack} />
          </view>
        </view>
      </view>
    );
  }

  const view = buildRuntimeView(sheet, runtime);
  const finished = view.finished;

  const commit = (next: RuntimeState) => {
    saveRuntime(next);
    setRuntime(next);
    if (next.currentIndex >= sheet.items.length) {
      setSheet(saveSheet({ ...sheet, status: 'done' }));
    }
  };

  const doDone = () => {
    const stamp = Date.now();
    if (stamp - lastDoneAt.current < DONE_GUARD_MS) {
      return;
    }
    lastDoneAt.current = stamp;
    commit(completeCurrent(sheet, runtime, minuteOfDay(stamp)));
  };

  const doSkip = () => {
    commit(skipCurrent(sheet, runtime, minuteOfDay(Date.now())));
  };

  const stopHold = () => {
    if (holdTimer.current !== null) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    setHoldProgress(0);
  };

  const startHold = () => {
    if (holdTimer.current !== null) {
      return;
    }
    const startedAt = Date.now();
    setHoldProgress(0.001);
    holdTimer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= HOLD_DONE_MS) {
        stopHold();
        doSkip();
        return;
      }
      setHoldProgress(elapsed / HOLD_DONE_MS);
    }, 100);
  };

  if (finished) {
    return (
      <view className="Runtime theme-dark">
        <view className="DoneBody">
          <text className="DoneLabel">COMPLETE</text>
          <text className="DoneTitle">已完成</text>
          <text className="DoneName">{sheet.name.length > 0 ? sheet.name : '未命名手册'}</text>

          <view className="DoneRule" />

          <view className="DoneStat">
            <text className="DoneStatLabel">计划总时长</text>
            <text className="DoneStatValue">{formatDuration(view.planTotalMin)}</text>
          </view>
          <view className="DoneStat">
            <text className="DoneStatLabel">实际总时长</text>
            <text className="DoneStatValue">{formatDuration(view.actualTotalMin)}</text>
          </view>
          <view className="DoneStat">
            <text className="DoneStatLabel">差值</text>
            <text className="DoneStatValue">{diffText(view.diffMin)}</text>
          </view>
        </view>

        <view className="DoneActions">
          <Button label="返回手册列表" block onTap={onBack} />
          {onPrint ? (
            <view className="DonePrint">
              <Button
                label="导出打印"
                kind="secondary"
                block
                onTap={() => {
                  onPrint(sheet.id);
                }}
              />
            </view>
          ) : null}
        </view>
      </view>
    );
  }

  const currentItem = view.currentItem;
  const currentRow = view.currentRow;
  const nextItem = view.nextItem;
  const nextRow = view.nextRow;

  const secondsLeft =
    view.countdownTargetMin === null
      ? null
      : secondsUntil(view.countdownTargetMin, nowMs);
  const countdown = secondsLeft === null ? null : formatCountdown(secondsLeft);
  const overMin = secondsLeft !== null && secondsLeft < 0 ? Math.ceil(-secondsLeft / 60) : 0;

  let caption = '剩余';
  if (view.countdownIsLock) {
    caption = overMin > 0 ? `已超出 · 需压缩 ${overMin} 分钟` : '距锁定时刻';
  }

  const owner = currentItem && currentItem.owner.length > 0 ? currentItem.owner : '';
  const metaText = owner.length > 0 ? `${view.planRangeText} · ${owner}` : view.planRangeText;

  return (
    <view className="Runtime theme-dark">
      <view className="RuntimeTop">
        <text className="RuntimeTopName">
          {sheet.name.length > 0 ? sheet.name : '未命名手册'}
        </text>
        <view className="RuntimeTopBadges">
          {view.hasConflict ? (
            <view className="RuntimeTopBadge">
              <Badge kind="reverse" label="无法吸收" />
            </view>
          ) : null}
          <Badge kind="outline" label={offsetText(runtime.offsetMin)} />
        </view>
      </view>

      <view className="RuntimeBody">
        <text className="RuntimeSeg">
          {`SEG ${pad3(view.segmentNo)} / ${pad3(view.segmentTotal)}`}
        </text>
        <text className="RuntimeTitle">
          {currentItem && currentItem.name.length > 0 ? currentItem.name : '未命名环节'}
        </text>
        <text className="RuntimeMeta">{metaText}</text>

        {currentRow && currentRow.lockAt !== null ? (
          <view className="RuntimeLockRow">
            <Badge kind="stamp" label={`LOCK ${formatClockDisplay(currentRow.lockAt)}`} />
          </view>
        ) : null}

        {countdown ? (
          <view className="RuntimeCountBlock">
            <view className="RuntimeCountRow">
              <text className="RuntimeCount">
                {`${countdown.sign === 'over' ? MINUS : ''}${countdown.text}`}
              </text>
              <text className="RuntimeUnit">
                {countdown.sign === 'over' ? 'OVER' : 'LEFT'}
              </text>
            </view>
            <text className="RuntimeCaption">{caption}</text>
            {overMin > 0 ? (
              <view className="RuntimeDelay">
                <Badge kind="reverse" label={`DELAYED ${overMin}`} />
              </view>
            ) : null}
          </view>
        ) : null}

        <view className="RuntimeNext">
          {nextItem && nextRow ? (
            <view className="RuntimeNextRows">
              <view className="RuntimeNextRow">
                <text className="RuntimeNextLabel">NEXT</text>
                <text className="RuntimeNextValue">
                  {nextItem.name.length > 0 ? nextItem.name : '未命名环节'}
                </text>
              </view>
              <view className="RuntimeNextRow">
                <text className="RuntimeNextLabel">AT</text>
                <text className="RuntimeNextTime">
                  {formatClockDisplay(nextRow.displayStart)}
                </text>
              </view>
            </view>
          ) : (
            <view className="RuntimeNextRow">
              <text className="RuntimeNextLabel">END</text>
              <text className="RuntimeNextValue">最后一段</text>
            </view>
          )}
        </view>
      </view>

      <view className="RuntimeActions">
        {role === 'follower' ? (
          <text className="RuntimeReadonly">本设备为跟随角色，不能推进环节</text>
        ) : (
          <view className="RuntimeActionsInner">
            <view className="RuntimeActionRow">
              <Button label="DONE · 完成" className="RuntimeDone" onTap={doDone} />
              <Button
                label="SHIFT · 顺延"
                kind="secondary"
                className="RuntimeShift"
                disabled={nextItem === null}
                onTap={() => {
                  setShiftOpen(true);
                }}
              />
            </view>

            <view
              className="RuntimeHold"
              bindtouchstart={startHold}
              bindtouchend={stopHold}
              bindtouchcancel={stopHold}
            >
              <text className="RuntimeHoldText">HOLD 3S · 跳过</text>
              <view className="RuntimeHoldTrack">
                <view
                  className="RuntimeHoldFill"
                  style={{ width: `${Math.round(holdProgress * 100)}%` }}
                />
              </view>
            </view>
          </view>
        )}
      </view>

      {shiftOpen ? (
        <view
          className="RuntimeOverlay"
          bindtap={() => {
            setShiftOpen(false);
          }}
        >
          <view className="RuntimePanel" catchtap={() => {}}>
            <GlassPanel>
              <text className="ShiftTitle">SHIFT · 顺延</text>
              <text className="ShiftBody">顺延面板将在下一步接入</text>
              <view className="ShiftActions">
                <Button
                  label="关闭"
                  kind="tertiary"
                  onTap={() => {
                    setShiftOpen(false);
                  }}
                />
              </view>
            </GlassPanel>
          </view>
        </view>
      ) : null}
    </view>
  );
}
