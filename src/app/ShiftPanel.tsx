import './ShiftPanel.css';

import { useState } from '@lynx-js/react';

import { formatClockDisplay } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Badge, Button } from '../ui';
import { buildShiftPreview } from './shiftPreview';
import type { ShiftPreview } from './shiftPreview';

const MINUS = '\u2212';

export interface ShiftPanelProps {
  sheet: Sheet;
  runtime: RuntimeState;
  nowMin: number;
  closing?: boolean;
  onCancel(): void;
  onConfirm(startMin: number): void;
}

function signedText(value: number): string {
  if (value === 0) {
    return '0';
  }
  return `${value > 0 ? '+' : MINUS}${Math.abs(value)}`;
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
  const { sheet, runtime, nowMin, closing = false, onCancel, onConfirm } = props;
  const t = useT();
  const [startMin, setStartMin] = useState(() => nowMin);

  const preview = buildShiftPreview(sheet, runtime, startMin, nowMin);

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

            <view
              className="ShiftNow"
              bindtap={() => {
                setStartMin(nowMin);
              }}
            >
              <text className="ShiftNowText">{t('当前时刻')}</text>
            </view>

            <text className="ShiftOffset">
              {t('整体顺延 {from} → {to} 分钟', {
                from: signedText(preview.baseOffsetMin),
                to: signedText(preview.nextOffsetMin),
              })}
            </text>

            <scroll-view className="ShiftBody" scroll-orientation="vertical">
              {preview.rows.length > 0 ? (
                <view className="ShiftRows">
                  {preview.rows.map((row) => (
                    <view className="ShiftRow" key={`row-${row.index}`}>
                      <text className="ShiftRowName">
                        {t('下一环节 · {name}', { name: row.name })}
                      </text>
                      <text className="ShiftRowTime">{row.time}</text>
                    </view>
                  ))}
                </view>
              ) : null}

              <LockBlock preview={preview} />
            </scroll-view>

            {preview.earlierThanNow ? (
              <text className="ShiftNote">{t('该时间早于当前时刻')}</text>
            ) : null}
            {preview.reason === 'last' ? (
              <text className="ShiftNote">{t('已是最后一个环节')}</text>
            ) : null}
            {preview.reason === 'locked' ? (
              <text className="ShiftNote">
                {t('下一环节为锁定时刻，不可顺延')}
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
