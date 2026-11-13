import './RuntimeScreen.css';

import { runOnBackground, runOnMainThread, useEffect, useRef, useState } from '@lynx-js/react';

import { buildExecutionSheet } from '../domain/execution';
import { computeTimeline, formatClockDisplay, formatDuration } from '../domain/timeline';
import { encodeShortCode } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { useIsWide } from '../platform/viewport';
import { t, useT } from '../i18n';
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

function offsetLabel(offsetMin: number): string {
  if (offsetMin === 0) {
    return t('准点');
  }
  return offsetMin > 0
    ? t('晚 {n} 分', { n: offsetMin })
    : t('早 {n} 分', { n: Math.abs(offsetMin) });
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
  return t('0 分钟');
}

export function RuntimeScreen(props: RuntimeScreenProps) {
  const { sheetId, onBack, onPrint, safeTop = 0, safeBottom = 0 } = props;
  const tText = useT();

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
  const [endOpen, setEndOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [shiftToast, setShiftToast] = useState<string | null>(null);
  const isWideActions = useIsWide(NARROW_ACTIONS_WIDTH);
  const [mainWidth, setMainWidth] = useState<number | null>(null);

  const shiftPresence = usePresence(shiftOpen);
  const syncPresence = usePresence(syncOpen);
  const endPresence = usePresence(endOpen);
  const skipPresence = usePresence(skipOpen);

  useEffect(() => {
    if (!shiftOpen && !syncOpen && !endOpen && !skipOpen) {
      return;
    }
    return registerBackHandler(() => {
      if (skipOpen) {
        setSkipOpen(false);
        return true;
      }
      if (endOpen) {
        setEndOpen(false);
        return true;
      }
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
  }, [shiftOpen, syncOpen, endOpen, skipOpen]);

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
  const runtimeClass = wideActions
    ? 'Runtime Runtime--wide theme-dark'
    : 'Runtime theme-dark';

  const shiftToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDoneAt = useRef(0);

  useEffect(() => {
    return () => {
      if (shiftToastTimer.current !== null) {
        clearTimeout(shiftToastTimer.current);
      }
    };
  }, []);

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
    };
  }, []);

  if (!sheet || !runtime) {
    return (
      <view
        className={runtimeClass}
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
        <view className="RuntimeMissing">
          <text className="RuntimeMissingTitle">{tText('手册不存在')}</text>
          <view className="RuntimeMissingAction">
            <Button
              label={tText('返回手册列表')}
              kind="tertiary"
              onTap={onBack}
            />
          </view>
        </view>
      </view>
    );
  }

  const view = buildRuntimeView(sheet, runtime);
  const execSheet = buildExecutionSheet(sheet, runtime);
  const finished = view.finished;
  const timeline = computeTimeline(execSheet, runtime.offsetMin);
  const total = execSheet.items.length;
  const doneCount = Math.min(Math.max(runtime.currentIndex, 0), total);

  const commit = (next: RuntimeState) => {
    saveRuntime(next);
    setRuntime(next);
    if (next.currentIndex >= execSheet.items.length) {
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

  const endExecution = () => {
    saveSheet({ ...sheet, status: 'done' });
    setEndOpen(false);
    onBack();
  };

  const showShiftToast = (text: string) => {
    setShiftToast(text);
    if (shiftToastTimer.current !== null) {
      clearTimeout(shiftToastTimer.current);
    }
    shiftToastTimer.current = setTimeout(() => {
      setShiftToast(null);
      shiftToastTimer.current = null;
    }, 2400);
  };

  const syncCode = encodeShortCode(sheet.id, runtime);
  const syncCodeText =
    syncCode.length === 6 ? `${syncCode.slice(0, 3)}-${syncCode.slice(3)}` : syncCode;

  if (finished) {
    const completedCount = execSheet.items.filter(
      (item) => runtime.actuals[item.id]?.result === 'done',
    ).length;
    const skippedCount = execSheet.items.filter(
      (item) => runtime.actuals[item.id]?.result === 'skipped',
    ).length;

    return (
      <view className="RuntimeViewport">
        <view
        className={runtimeClass}
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
          <view className="DoneBody">
            <view className="DoneHead">
              <text className="DoneLabel">RUN COMPLETE · 执行回执</text>
              <text className="DoneStamp">{tText('完成')}</text>
            </view>
            <text className="DoneTitle">{tText('已完成')}</text>
            <text className="DoneName">
              {sheet.name.length > 0 ? sheet.name : tText('未命名手册')}
            </text>

            <view className="DoneRule" />

            <view className="DoneStat">
              <text className="DoneStatLabel">{tText('环节完成')}</text>
              <text className="DoneStatValue">{`${pad3(completedCount)} / ${pad3(
                total,
              )}`}</text>
            </view>
            {skippedCount > 0 ? (
              <view className="DoneStat">
                <text className="DoneStatLabel">{tText('跳过')}</text>
                <text className="DoneStatValue">{pad3(skippedCount)}</text>
              </view>
            ) : null}
            <view className="DoneStat">
              <text className="DoneStatLabel">{tText('计划总时长')}</text>
              <text className="DoneStatValue">{formatDuration(view.planTotalMin)}</text>
            </view>
            <view className="DoneStat">
              <text className="DoneStatLabel">{tText('实际总时长')}</text>
              <text className="DoneStatValue">{formatDuration(view.actualTotalMin)}</text>
            </view>
            <view className="DoneStat DoneStat--last">
              <text className="DoneStatLabel">{tText('差值')}</text>
              <text className="DoneStatValue DoneStatValue--accent">
                {diffText(view.diffMin)}
              </text>
            </view>

            <text className="DoneNote">{tText('顺场 · 现场调度')}</text>
          </view>

          <view className="DoneActions">
            <Button label={tText('返回手册列表')} block onTap={onBack} />
            {onPrint ? (
              <view className="DonePrint">
                <Button
                  label={tText('导出打印')}
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

  const secondsLeft =
    view.countdownTargetMin === null
      ? null
      : secondsUntil(view.countdownTargetMin, nowMs);
  const countdown = secondsLeft === null ? null : formatCountdown(secondsLeft);
  const compactCountdown = !wideActions && countdown !== null && countdown.text.length > 5;
  const overMin = secondsLeft !== null && secondsLeft < 0 ? Math.ceil(-secondsLeft / 60) : 0;

  let caption = tText('剩余');
  if (overMin > 0) {
    caption = view.countdownIsLock
      ? tText('已超出 · 需压缩 {n} 分钟', { n: overMin })
      : tText('已超出');
  } else if (view.countdownIsLock) {
    caption = tText('距锁定时刻');
  }

  const owner = currentItem && currentItem.owner.length > 0 ? currentItem.owner : '';
  const metaText = owner.length > 0 ? `${view.planRangeText} · ${owner}` : view.planRangeText;

  return (
    <view className="RuntimeViewport" id="runtime-capture" flatten={false}>
      <view
        className={runtimeClass}
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
        <view className="RuntimeCapture">
          <view className="RuntimeTop">
            <view className="RuntimeTopLeft">
              <view className="RuntimeBack" bindtap={onBack}>
                <text className="RuntimeBackText">←</text>
              </view>
              <view className="RuntimeTopNameWrap">
                <text className="RuntimeTopKicker">{tText('执行台')}</text>
                <text className="RuntimeTopName">
                  {sheet.name.length > 0 ? sheet.name : tText('未命名手册')}
                </text>
              </view>
            </view>
            <view className="RuntimeTopBadges">
            {view.hasConflict ? (
              <view className="RuntimeTopBadge">
                <Badge kind="reverse" label={tText('时间不足')} />
              </view>
            ) : null}
            <Badge
              kind="amber"
              label={offsetLabel(runtime.offsetMin)}
            />
            <view
              className="RuntimeEndBtn"
              bindtap={() => {
                setEndOpen(true);
              }}
            >
              <text className="RuntimeEndText">{tText('结束')}</text>
            </view>
          </view>
        </view>

        <view className="RuntimeBody" key={currentItem ? currentItem.id : 'end'}>
          <text className="RuntimeSeg">
            {tText('环节 {a} / {b}', {
              a: pad3(view.segmentNo),
              b: pad3(view.segmentTotal),
            })}
          </text>
          <text className="RuntimeTitle">
            {currentItem && currentItem.name.length > 0
              ? currentItem.name
              : tText('未命名环节')}
          </text>
          <text className="RuntimeMeta">{metaText}</text>

          {currentRow && currentRow.lockAt !== null ? (
            <view className="RuntimeLockRow">
              <Badge
                kind="stamp"
                label={tText('不早于 {time}', {
                  time: formatClockDisplay(currentRow.lockAt),
                })}
              />
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
                  {countdown.sign === 'over' ? tText('已超时') : tText('剩余')}
                </text>
              </view>
              {view.countdownIsLock ? (
                <text className="RuntimeCaption">{caption}</text>
              ) : null}
              {overMin > 0 ? (
                <view className="RuntimeDelay">
                  <Badge
                    kind="reverse"
                    label={tText('超时 {n} 分', { n: overMin })}
                  />
                </view>
              ) : null}
            </view>
          ) : null}

          <view className="RuntimeRail">
            <view className="RuntimeRailHead">
              <text className="RuntimeRailLabel">{tText('环节轨道')}</text>
              <text className="RuntimeRailCount">
                {`${pad3(doneCount)} / ${pad3(total)}`}
              </text>
            </view>
            <scroll-view
              className="RuntimeRailScroll"
              scroll-orientation="vertical"
            >
              {timeline.rows.map((row, index) => {
                const item = execSheet.items[row.index];
                const state =
                  index < runtime.currentIndex
                    ? 'done'
                    : index === runtime.currentIndex
                      ? 'active'
                      : 'next';
                const owner = item.owner.trim();
                return (
                  <view
                    className={`RailRow RailRow--${state}`}
                    key={`rail-${item.id}`}
                  >
                    <view className="RailDot" />
                    <text className="RailNo">{pad3(index + 1)}</text>
                    <text className="RailTime">
                      {formatClockDisplay(row.displayStart)}
                    </text>
                    <view className="RailMain">
                      <text className="RailName">
                        {item.name.length > 0
                          ? item.name
                          : tText('未命名环节')}
                      </text>
                      {owner.length > 0 ? (
                        <text className="RailOwner">{owner}</text>
                      ) : null}
                    </view>
                    <text className="RailState">
                      {state === 'done'
                        ? tText('已完成')
                        : state === 'active'
                          ? tText('进行中')
                          : tText('待执行')}
                    </text>
                  </view>
                );
              })}
            </scroll-view>
          </view>
        </view>

        {shiftToast ? (
          <view className="RuntimeShiftToast">
            <text className="RuntimeShiftToastText">{shiftToast}</text>
          </view>
        ) : null}

        {shiftOpen ? null : (
          <view className="RuntimeSyncBar">
            <Badge
              kind="outline"
              label={tText('第 {n} 版', { n: runtime.execVersion })}
            />
            <view
              className="RuntimeSyncBtn"
              bindtap={() => {
                setSyncOpen(true);
              }}
            >
              <text className="RuntimeSyncLabel">{tText('同步码')}</text>
              <text className="RuntimeSyncCode">{syncCodeText}</text>
              <text className="RuntimeSyncChevron">›</text>
            </view>
          </view>
        )}

        {shiftOpen ? null : (
          <view className="RuntimeActions">
            <view className="RuntimeActionsHead">
              <text className="RuntimeActionsLabel">
                {tText('本环节操作')}
              </text>
              {currentRow ? (
                <text className="RuntimeActionsTime">
                  {`${formatClockDisplay(currentRow.displayStart)} — ${formatClockDisplay(
                    currentRow.displayEnd,
                  )}`}
                </text>
              ) : null}
            </view>
            {role === 'follower' ? (
              <text className="RuntimeReadonly">
                {tText('本设备为跟随角色，不能推进环节')}
              </text>
            ) : (
              <view className="RuntimeActionsInner">
                <view className="RuntimeActionRow">
                  <Button
                    label={wideActions ? tText('完成本环节') : tText('完成')}
                    className="RuntimeDone"
                    onTap={doDone}
                  />
                  <Button
                    label={wideActions ? tText('顺延下一环节') : tText('顺延')}
                    kind="secondary"
                    className="RuntimeShift"
                    disabled={nextItem === null}
                    onTap={() => {
                      setShiftOpen(true);
                    }}
                  />
                </view>

                <view
                  className="RuntimeSkip"
                  bindtap={() => {
                    setSkipOpen(true);
                  }}
                >
                  <text className="RuntimeSkipText">
                    {tText('跳过本环节')}
                  </text>
                </view>
              </view>
            )}
          </view>
        )}

        {endPresence.mounted ? (
          <view
            className={endPresence.closing ? 'Overlay OverlayOut' : 'Overlay'}
            bindtap={() => {
              setEndOpen(false);
            }}
          >
            <view
              className={
                endPresence.closing
                  ? 'Panel Panel--confirm PanelOut theme-light'
                  : 'Panel Panel--confirm theme-light'
              }
              catchtap={() => {}}
            >
              <view className="PanelHeader">
                <text className="PanelTitle">{tText('结束执行')}</text>
              </view>
              <view className="PanelBody">
                <text className="PanelBodyText">
                  {tText('结束后本场流程将标记为已完成，可在手册列表中查看或删除。')}
                </text>
              </view>
              <view className="PanelActions">
                <view className="PanelAction">
                  <Button
                    label={tText('继续执行')}
                    kind="tertiary"
                    onTap={() => {
                      setEndOpen(false);
                    }}
                  />
                </view>
                <view className="PanelAction">
                  <Button
                    label={tText('结束执行')}
                    kind="secondary"
                    onTap={endExecution}
                  />
                </view>
              </view>
            </view>
          </view>
        ) : null}

        {skipPresence.mounted ? (
          <view
            className={skipPresence.closing ? 'Overlay OverlayOut' : 'Overlay'}
            bindtap={() => {
              setSkipOpen(false);
            }}
          >
            <view
              className={
                skipPresence.closing
                  ? 'Panel Panel--confirm PanelOut theme-light'
                  : 'Panel Panel--confirm theme-light'
              }
              catchtap={() => {}}
            >
              <view className="PanelHeader">
                <text className="PanelTitle">{tText('确认跳过？')}</text>
              </view>
              <view className="PanelBody">
                <text className="PanelBodyText">
                  {tText('跳过后不会推进偏移，记录会标注为跳过。')}
                </text>
              </view>
              <view className="PanelActions">
                <view className="PanelAction">
                  <Button
                    label={tText('取消')}
                    kind="tertiary"
                    onTap={() => {
                      setSkipOpen(false);
                    }}
                  />
                </view>
                <view className="PanelAction">
                  <Button
                    label={tText('确认跳过')}
                    kind="secondary"
                    onTap={() => {
                      setSkipOpen(false);
                      doSkip();
                    }}
                  />
                </view>
              </view>
            </view>
          </view>
        ) : null}

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
              const delta = next.offsetMin - runtime.offsetMin;
              saveRuntime(next);
              setRuntime(next);
              setShiftOpen(false);
              if (delta !== 0) {
                showShiftToast(
                  tText('已顺延 {n} 分钟，后续环节已重排', {
                    n: Math.abs(delta),
                  }),
                );
              }
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
