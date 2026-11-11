import './RuntimeScreen.css';

import { runOnBackground, runOnMainThread, useEffect, useRef, useState } from '@lynx-js/react';

import { formatClockDisplay, formatDuration } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { useIsWide } from '../platform/viewport';
import {
  getRole,
  getRuntime,
  getSheet,
  saveRuntime,
  saveSheet,
} from '../store/repository';
import { Badge, Button, usePresence } from '../ui';
import { registerBackHandler } from './backBus';
import {
  applyShift,
  buildRuntimeView,
  completeCurrent,
  createRuntime,
  skipCurrent,
} from './runtimeOps';
import { ShiftPanel } from './ShiftPanel';
import { SyncPanel } from './SyncPanel';

export interface RuntimeScreenProps {
  sheetId: string;
  onBack(): void;
  onPrint?(sheetId: string): void;
  safeTop?: number;
  safeBottom?: number;
}

const MINUS = '\u2212';
const HOLD_DONE_MS = 3000;
const DONE_GUARD_MS = 300;
const NARROW_ACTIONS_WIDTH = 700;

let viewportWidthListener: ((width: number) => void) | null = null;

function notifyViewportWidth(width: number): void {
  const listener = viewportWidthListener;
  if (listener) {
    listener(width);
  }
}

// 浏览器预览里 React 跑在 Worker 中，拿不到 window；从主线程读取并回传视口宽度。
function watchViewportWidthMainThread(): number {
  'main thread';
  try {
    const win: any = (globalThis as any).window;
    if (!win) {
      return 0;
    }
    const host: any = win.parent && win.parent !== win ? win.parent : win;
    const global: any = globalThis as any;
    if (!global.__shunchangViewportWatch && typeof host.addEventListener === 'function') {
      global.__shunchangViewportWatch = true;
      host.addEventListener('resize', () => {
        void runOnBackground(notifyViewportWidth)(host.innerWidth);
      });
    }
    return typeof host.innerWidth === 'number' ? host.innerWidth : 0;
  } catch {
    // 主线程视口读取仅作为 Web 预览的降级手段。
    return 0;
  }
}

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

export function secondsUntil(targetMin: number, nowMs: number): number {
  const now = new Date(nowMs);
  const nowSec = Math.floor(nowMs / 1000);
  // 计划时间是本地墙钟分钟，日界线必须用本地零点而不是 UTC 零点。
  const dayStart = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000,
  );
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

export function formatCountdown(seconds: number): {
  sign: 'left' | 'over';
  text: string;
} {
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
  const { sheetId, onBack, onPrint, safeTop = 0, safeBottom = 0 } = props;

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
  const [syncOpen, setSyncOpen] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const isWideActions = useIsWide(NARROW_ACTIONS_WIDTH);
  const [mainWidth, setMainWidth] = useState<number | null>(null);

  const shiftPresence = usePresence(shiftOpen);
  const syncPresence = usePresence(syncOpen);

  useEffect(() => {
    if (!shiftOpen && !syncOpen) {
      return;
    }
    return registerBackHandler(() => {
      if (shiftOpen) {
        setShiftOpen(false);
        return true;
      }
      if (syncOpen) {
        setSyncOpen(false);
        return true;
      }
      return false;
    });
  }, [shiftOpen, syncOpen]);

  useEffect(() => {
    viewportWidthListener = (width: number) => {
      if (width > 0) {
        setMainWidth(width);
      }
    };
    try {
      void runOnMainThread(watchViewportWidthMainThread)()
        .then((width) => {
          if (typeof width === 'number' && width > 0) {
            setMainWidth(width);
          }
        })
        .catch(() => {});
    } catch {
      // 没有主线程桥时保持 useIsWide 的结果。
    }
    return () => {
      viewportWidthListener = null;
    };
  }, []);

  const wideActions =
    mainWidth !== null ? mainWidth >= NARROW_ACTIONS_WIDTH : isWideActions;

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
      <view
        className="Runtime theme-dark"
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
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
      <view className="RuntimeViewport">
        <view
        className="Runtime theme-dark"
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
          <view className="DoneBody">
            <text className="DoneLabel">流程完成</text>
            <text className="DoneTitle">已完成</text>
            <text className="DoneName">
              {sheet.name.length > 0 ? sheet.name : '未命名手册'}
            </text>

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
  const compactCountdown = !wideActions && countdown !== null && countdown.text.length > 5;
  const overMin = secondsLeft !== null && secondsLeft < 0 ? Math.ceil(-secondsLeft / 60) : 0;

  let caption = '剩余';
  if (overMin > 0) {
    caption = view.countdownIsLock ? `已超出 · 需压缩 ${overMin} 分钟` : '已超出';
  } else if (view.countdownIsLock) {
    caption = '距锁定时刻';
  }

  const owner = currentItem && currentItem.owner.length > 0 ? currentItem.owner : '';
  const metaText = owner.length > 0 ? `${view.planRangeText} · ${owner}` : view.planRangeText;

  return (
    <view className="RuntimeViewport" id="runtime-capture" flatten={false}>
      <view
        className="Runtime theme-dark"
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
        <view className="RuntimeCapture">
          <view className="RuntimeTop">
            <view className="RuntimeTopLeft">
              <view className="RuntimeBack" bindtap={onBack}>
                <text className="RuntimeBackText">←</text>
              </view>
              <text className="RuntimeTopName">
                {sheet.name.length > 0 ? sheet.name : '未命名手册'}
              </text>
            </view>
            <view className="RuntimeTopBadges">
            {view.hasConflict ? (
              <view className="RuntimeTopBadge">
                <Badge kind="reverse" label="无法吸收" />
              </view>
            ) : null}
            <Badge kind="outline" label={offsetText(runtime.offsetMin)} />
          </view>
        </view>

        <view className="RuntimeBody" key={currentItem ? currentItem.id : 'end'}>
          <text className="RuntimeSeg">
            {`环节 ${pad3(view.segmentNo)} / ${pad3(view.segmentTotal)}`}
          </text>
          <text className="RuntimeTitle">
            {currentItem && currentItem.name.length > 0 ? currentItem.name : '未命名环节'}
          </text>
          <text className="RuntimeMeta">{metaText}</text>

          {currentRow && currentRow.lockAt !== null ? (
            <view className="RuntimeLockRow">
              <Badge kind="stamp" label={`锁定 ${formatClockDisplay(currentRow.lockAt)}`} />
            </view>
          ) : null}

          {countdown ? (
            <view className="RuntimeCountBlock">
              <view className="RuntimeCountRow">
                <text
                  className={compactCountdown ? 'RuntimeCount RuntimeCount--compact' : 'RuntimeCount'}
                >
                  {`${countdown.sign === 'over' ? MINUS : ''}${countdown.text}`}
                </text>
                <text className="RuntimeUnit">
                  {countdown.sign === 'over' ? '已超时' : '剩余'}
                </text>
              </view>
              <text className="RuntimeCaption">{caption}</text>
              {overMin > 0 ? (
                <view className="RuntimeDelay">
                  <Badge kind="reverse" label={`超时 ${overMin} 分`} />
                </view>
              ) : null}
            </view>
          ) : null}

          <view className="RuntimeNext">
            {nextItem && nextRow ? (
              <view className="RuntimeNextRows">
                <view className="RuntimeNextRow">
                  <text className="RuntimeNextLabel">下一环节</text>
                  <text className="RuntimeNextValue">
                    {nextItem.name.length > 0 ? nextItem.name : '未命名环节'}
                  </text>
                </view>
                <view className="RuntimeNextRow">
                  <text className="RuntimeNextLabel">计划</text>
                  <text className="RuntimeNextTime">
                    {formatClockDisplay(nextRow.displayStart)}
                  </text>
                </view>
              </view>
            ) : (
              <view className="RuntimeNextRow">
                <text className="RuntimeNextLabel">结束</text>
                <text className="RuntimeNextValue">最后环节</text>
              </view>
            )}
          </view>
        </view>

        {shiftOpen ? null : (
          <view className="RuntimeSyncBar">
            <Badge kind="outline" label={`第 ${runtime.execVersion} 版`} />
            <view
              className="RuntimeSyncBtn"
              bindtap={() => {
                setSyncOpen(true);
              }}
            >
              <text className="RuntimeSyncBtnText">同步码</text>
            </view>
          </view>
        )}

        {shiftOpen ? null : (
          <view className="RuntimeActions">
            {role === 'follower' ? (
              <text className="RuntimeReadonly">本设备为跟随角色，不能推进环节</text>
            ) : (
              <view className="RuntimeActionsInner">
                <view className="RuntimeActionRow">
                  <Button
                    label={wideActions ? '完成本环节' : '完成'}
                    className="RuntimeDone"
                    onTap={doDone}
                  />
                  <Button
                    label={wideActions ? '顺延下一环节' : '顺延'}
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
                  <text className="RuntimeHoldText">长按 3 秒 · 跳过</text>
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
        )}

        {shiftPresence.mounted ? (
          <ShiftPanel
            sheet={sheet}
            runtime={runtime}
            nowMin={minuteOfDay(nowMs)}
            closing={shiftPresence.closing}
            onCancel={() => {
              setShiftOpen(false);
            }}
            onConfirm={(startMin) => {
              const next = applyShift(sheet, runtime, startMin);
              if (next === runtime) {
                return;
              }
              saveRuntime(next);
              setRuntime(next);
              setShiftOpen(false);
            }}
          />
        ) : null}

        {syncPresence.mounted ? (
          <SyncPanel
            sheet={sheet}
            runtime={runtime}
            closing={syncPresence.closing}
            onClose={() => {
              setSyncOpen(false);
            }}
          />
        ) : null}
        </view>
      </view>
    </view>
  );
}
