import './ShiftPanel.css';

import { useState } from '@lynx-js/react';

import { formatClockDisplay } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { Badge, Button } from '../ui';
import { buildShiftPreview } from './shiftPreview';
import type { ShiftPreview } from './shiftPreview';

const MINUS = '\u2212';
const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';

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
  if (preview.locks.length === 0) {
    return null;
  }

  return (
    <view className="ShiftLocks">
      {preview.hasConflict ? (
        <view className="ShiftLockBadge">
          <Badge kind="reverse" label="无法吸收" />
        </view>
      ) : null}
      {preview.locks.map((lock) => (
        <view className="ShiftLock" key={`lock-${lock.index}`}>
          {lock.state === 'conflict' ? (
            <text className="ShiftLockText">{`${lock.name} · 仍超出 ${lock.diffMin} 分钟`}</text>
          ) : null}
          {lock.state === 'absorb' ? (
            <view className="ShiftLockGroup">
              <text className="ShiftLockText">{`已吸收 ${lock.diffMin} 分钟`}</text>
              {lock.compressed.map((entry) => (
                <text
                  className="ShiftLockSub"
                  key={`${lock.index}-${entry.name}-${entry.lostMin}`}
                >
                  {`${entry.name} · 压缩 ${entry.lostMin} 分钟`}
                </text>
              ))}
            </view>
          ) : null}
          {lock.state === 'wait' ? (
            <text className="ShiftLockText">{`等待 ${lock.waitMin} 分钟`}</text>
          ) : null}
        </view>
      ))}
    </view>
  );
}

export function ShiftPanel(props: ShiftPanelProps) {
  const { sheet, runtime, nowMin, closing = false, onCancel, onConfirm } = props;
  const [startMin, setStartMin] = useState(() => nowMin);

  const preview = buildShiftPreview(sheet, runtime, startMin, nowMin);

  const glassClasses = ['ShiftGlass'];
  if (isWeb) glassClasses.push('ShiftGlass--web');
  if (closing) glassClasses.push('GlassOut');

  return (
    <view
      className={closing ? 'ShiftOverlay OverlayOut' : 'ShiftOverlay'}
      flatten={false}
      catchtap={onCancel}
    >
      <view className="ShiftStage" flatten={false} catchtap={() => {}}>
        <blur-view
          className={glassClasses.join(' ')}
          android-capture-target="runtime-capture"
          blur-radius="40"
          blur-sampling={4}
          enable-auto-blur={true}
          experimental-update-blur-radius={true}
          flatten={false}
          catchtap={() => {}}
        >
          <view className="ShiftSheen" />
          <view className="ShiftInner">
            <view className="ShiftHead">
              <text className="ShiftLabel">SHIFT · 顺延至</text>
              <view className="ShiftCancel" catchtap={onCancel}>
                <text className="ShiftCancelText">取消</text>
              </view>
            </view>

            <view className="ShiftTimeRow">
              <view
                className="ShiftStep"
                catchtap={() => {
                  setStartMin((value) => value - 1);
                }}
              >
                <text className="ShiftStepLabel">{`${MINUS}1`}</text>
              </view>
              <text className="ShiftClock">{formatClockDisplay(startMin)}</text>
              <view
                className="ShiftStep"
                catchtap={() => {
                  setStartMin((value) => value + 1);
                }}
              >
                <text className="ShiftStepLabel">+1</text>
              </view>
            </view>

            <view
              className="ShiftNow"
              catchtap={() => {
                setStartMin(nowMin);
              }}
            >
              <text className="ShiftNowText">当前时刻</text>
            </view>

            <text className="ShiftOffset">
              {`整体偏移 ${signedText(preview.baseOffsetMin)} → ${signedText(preview.nextOffsetMin)}`}
            </text>

            <scroll-view className="ShiftBody" scroll-orientation="vertical">
              {preview.rows.length > 0 ? (
                <view className="ShiftRows">
                  {preview.rows.map((row) => (
                    <view className="ShiftRow" key={`row-${row.index}`}>
                      <text className="ShiftRowName">{`NEXT ${row.name}`}</text>
                      <text className="ShiftRowTime">{row.time}</text>
                    </view>
                  ))}
                </view>
              ) : null}

              <LockBlock preview={preview} />
            </scroll-view>

            {preview.earlierThanNow ? (
              <text className="ShiftNote">该时间早于当前时刻</text>
            ) : null}
            {preview.reason === 'last' ? (
              <text className="ShiftNote">已是最后一个环节</text>
            ) : null}
            {preview.reason === 'locked' ? (
              <text className="ShiftNote">下一环节为锁定时刻，不可顺延</text>
            ) : null}

            <view className="ShiftActions">
              <view className="ShiftActionCancel">
                <Button label="取消" kind="tertiary" block onTap={onCancel} />
              </view>
              <view className="ShiftActionConfirm">
                <Button
                  label="确认顺延"
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
        </blur-view>
      </view>
    </view>
  );
}
