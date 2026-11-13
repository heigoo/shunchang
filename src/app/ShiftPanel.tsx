import './ShiftPanel.css';

import { useState } from '@lynx-js/react';

import { formatClockDisplay } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Badge, Button } from '../ui';
import {
  buildShiftPreview,
  defaultShiftStart,
  nextPlanStartOf,
} from './shiftPreview';
import type { ShiftPreview } from './shiftPreview';

const MINUS = '\u2212';
const QUICK_MINUTES = [5, 10, 15, 30, 60];
const EXTEND_MINUTES = [5, 10, 15];
const MAX_DELAY_MIN = 600;

export interface ShiftPanelProps {
  sheet: Sheet;
  runtime: RuntimeState;
  nowMin: number;
  closing?: boolean;
  onCancel(): void;
  onConfirm(startMin: number): void;
  onClearManual?(): void;
  onExtend?(minutes: number): void;
}

function signedText(value: number): string {
  if (value === 0) {
    return '0';
  }
  return `${value > 0 ? '+' : MINUS}${Math.abs(value)}`;
}

function inputValue(event: any): string {
  const detail = event && event.detail ? event.detail : null;
  return detail && typeof detail.value === 'string' ? detail.value : '';
}

/** 解析“延后 N 分钟”的输入；只接受 1–600 的整数分钟。 */
export function parseDelayMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DELAY_MIN) {
    return null;
  }
  return value;
}

function LockBlock(props: { preview: ShiftPreview }) {
  const { preview } = props;
  const t = useT();
  if (preview.locks.length === 0) {
    return null;
  }

  return (
    <view className="ShiftLocks">
      {preview.hasConflict ? (
        <view className="ShiftLockBadge">
          <Badge kind="reverse" label={t('时间不足')} />
        </view>
      ) : null}
      {preview.locks.map((lock) => (
        <view className="ShiftLock" key={`lock-${lock.index}`}>
          {lock.state === 'conflict' ? (
            <text className="ShiftLockText">
              {t('{name} · 仍超出 {n} 分钟', {
                name: lock.name,
                n: lock.diffMin,
              })}
            </text>
          ) : null}
          {lock.state === 'absorb' ? (
            <view className="ShiftLockGroup">
              <text className="ShiftLockText">
                {t('已吸收 {n} 分钟', { n: lock.diffMin })}
              </text>
              {lock.compressed.map((entry) => (
                <text
                  className="ShiftLockSub"
                  key={`${lock.index}-${entry.name}-${entry.lostMin}`}
                >
                  {t('{name} · 压缩 {n} 分钟', {
                    name: entry.name,
                    n: entry.lostMin,
                  })}
                </text>
              ))}
            </view>
          ) : null}
          {lock.state === 'wait' ? (
            <text className="ShiftLockText">
              {t('等待 {n} 分钟', { n: lock.waitMin })}
            </text>
          ) : null}
        </view>
      ))}
    </view>
  );
}

export function ShiftPanel(props: ShiftPanelProps) {
  const {
    sheet,
    runtime,
    nowMin,
    closing = false,
    onCancel,
    onConfirm,
    onClearManual,
    onExtend,
  } = props;
  const t = useT();
  // 尚未到下一环节计划时刻时默认按计划时刻，避免一打开就提前。
  const [startMin, setStartMin] = useState(() =>
    defaultShiftStart(nowMin, nextPlanStartOf(sheet, runtime)),
  );
  const [delayText, setDelayText] = useState('');

  const preview = buildShiftPreview(sheet, runtime, startMin, nowMin);
  const delayMin = parseDelayMinutes(delayText);
  const extendEnabled = preview.ok && onExtend !== undefined;

  const classes = closing ? 'ShiftGlass GlassOut' : 'ShiftGlass';

  return (
    <view
      className={closing ? 'ShiftOverlay OverlayOut' : 'ShiftOverlay'}
      flatten={false}
      catchtap={onCancel}
    >
      <view className="ShiftStage" flatten={false} catchtap={() => {}}>
        <view
          className={classes}
          flatten={false}
          catchtap={() => {}}
        >
          <view className="ShiftInner">
            <view className="ShiftHead">
              <text className="ShiftLabel">{t('顺延至')}</text>
              <view className="ShiftCancel" bindtap={onCancel}>
                <text className="ShiftCancelText">{t('取消')}</text>
              </view>
            </view>

            <view className="ShiftTimeRow">
              <view
                className="ShiftStep"
                bindtap={() => {
                  setStartMin((value) => value - 1);
                }}
              >
                <text className="ShiftStepLabel">{`${MINUS}1`}</text>
              </view>
              <text className="ShiftClock">{formatClockDisplay(startMin)}</text>
              <view
                className="ShiftStep"
                bindtap={() => {
                  setStartMin((value) => value + 1);
                }}
              >
                <text className="ShiftStepLabel">+1</text>
              </view>
            </view>

            <view className="ShiftQuick">
              {QUICK_MINUTES.map((minutes) => (
                <view
                  className="ShiftQuickBtn"
                  key={`quick-${minutes}`}
                  bindtap={() => {
                    setStartMin((value) => value + minutes);
                  }}
                >
                  <text className="ShiftQuickLabel">{`+${minutes}`}</text>
                </view>
              ))}
            </view>

            <view className="ShiftDelay">
              <input
                className="ShiftDelayInput"
                placeholder={t('延后 N 分钟')}
                maxlength={3}
                bindinput={(event) => {
                  setDelayText(inputValue(event));
                }}
              />
              <view
                className={
                  delayMin === null ? 'ShiftDelayBtn ShiftDelayBtn--off' : 'ShiftDelayBtn'
                }
                bindtap={() => {
                  if (delayMin === null) {
                    return;
                  }
                  setStartMin((value) => value + delayMin);
                }}
              >
                <text className="ShiftDelayLabel">{t('延后')}</text>
              </view>
            </view>

            <view
              className="ShiftNow"
              bindtap={() => {
                setStartMin(nowMin);
              }}
            >
              <text className="ShiftNowText">{t('当前时刻')}</text>
            </view>

            <text className="ShiftOffset">
              {t('整体偏移 {from} → {to} 分钟', {
                from: signedText(preview.baseOffsetMin),
                to: signedText(preview.nextOffsetMin),
              })}
            </text>

            <scroll-view className="ShiftBody" scroll-orientation="vertical">
              {preview.rows.length > 0 ? (
                <view className="ShiftRows">
                  {preview.rows.map((row, position) => (
                    <view className="ShiftRow" key={`row-${row.index}`}>
                      <text className="ShiftRowName">
                        {position === 0
                          ? t('下一环节 · {name}', { name: row.name })
                          : t('后续环节 · {name}', { name: row.name })}
                      </text>
                      <text className="ShiftRowTime">{row.time}</text>
                    </view>
                  ))}
                </view>
              ) : null}

              <LockBlock preview={preview} />
            </scroll-view>

            <view className="ShiftExtend">
              <text className="ShiftExtendLabel">{t('延长当前环节')}</text>
              <view className="ShiftExtendRow">
                {EXTEND_MINUTES.map((minutes) => (
                  <view
                    className={
                      extendEnabled
                        ? 'ShiftExtendBtn'
                        : 'ShiftExtendBtn ShiftExtendBtn--off'
                    }
                    key={`extend-${minutes}`}
                    bindtap={() => {
                      if (!extendEnabled || !onExtend) {
                        return;
                      }
                      onExtend(minutes);
                    }}
                  >
                    <text className="ShiftExtendLabelText">{`延长 +${minutes}`}</text>
                  </view>
                ))}
              </view>
              {preview.reason === 'locked' ? (
                <text className="ShiftNote">{t('下一环节为锁定时刻，无法延长')}</text>
              ) : null}
              {preview.reason === 'last' ? (
                <text className="ShiftNote">{t('已是最后一个环节，无法延长')}</text>
              ) : null}
            </view>

            {runtime.manualOffsetMin !== 0 && onClearManual ? (
              <view className="ShiftManual" bindtap={onClearManual}>
                <text className="ShiftManualText">
                  {t('清除手动顺延（{n} 分钟）', {
                    n: signedText(runtime.manualOffsetMin),
                  })}
                </text>
              </view>
            ) : null}

            {preview.earlierThanNow ? (
              <text className="ShiftNote">{t('该时间早于当前时刻')}</text>
            ) : null}
            {preview.planEarlyMin > 0 ? (
              <text className="ShiftWarn">
                {t('将提前 {n} 分钟', { n: preview.planEarlyMin })}
              </text>
            ) : null}
            {preview.reason === 'last' ? (
              <text className="ShiftNote">{t('已是最后一个环节')}</text>
            ) : null}
            {preview.reason === 'locked' ? (
              <text className="ShiftNote">
                {t('下一环节为锁定时刻，不可顺延')}
              </text>
            ) : null}
            {preview.reason === 'blocked' ? (
              <text className="ShiftNote">
                {t('受锁定时刻限制，下一环节只能排在 {time}', {
                  time: preview.rows[0] ? preview.rows[0].time : '',
                })}
              </text>
            ) : null}

            <view className="ShiftActions">
              <view className="ShiftActionCancel">
                <Button
                  label={t('取消')}
                  kind="tertiary"
                  block
                  onTap={onCancel}
                />
              </view>
              <view className="ShiftActionConfirm">
                <Button
                  label={t('确认顺延')}
                  block
                  disabled={!preview.ok}
                  onTap={() => {
                    if (!preview.ok) {
                      return;
                    }
                    onConfirm(startMin);
                  }}
                />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  );
}
