import './RuntimeAdjustPanel.css';

import { useState } from '@lynx-js/react';

import { MAX_INSERTED_ITEMS } from '../domain/execution';
import { formatClock, formatClockDisplay, parseClock } from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Badge, Button } from '../ui';
import {
  buildLockPreview,
  listLockCandidates,
} from './runtimeOps';
import type { InsertDraft, LockPreview } from './runtimeOps';

export interface RuntimeAdjustPanelProps {
  sheet: Sheet;
  runtime: RuntimeState;
  closing?: boolean;
  onCancel(): void;
  onInsert(draft: InsertDraft): void;
  onLockChange(itemId: string, lockAt: number | null): void;
}

function inputValue(event: any): string {
  const detail = event && event.detail ? event.detail : null;
  return detail && typeof detail.value === 'string' ? detail.value : '';
}

/** Lynx 输入框不声明 value；Web 用受控值，原生用 default-value 作为初始值。 */
function inputSync(text: string): { value: string; 'default-value': string } {
  return { value: text, 'default-value': text };
}

function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 1 || value > 600) {
    return null;
  }
  return value;
}

function lockLabel(lockAt: number | null, override: number | null | undefined, t: (text: string, vars?: Record<string, string | number>) => string): string {
  if (override === null) {
    return t('已解除锁定');
  }
  if (lockAt === null) {
    return t('未锁定');
  }
  return t('锁定 {time}', { time: formatClockDisplay(lockAt) });
}

function LockPreviewBlock(props: { preview: LockPreview | null }) {
  const { preview } = props;
  const t = useT();

  if (!preview) {
    return null;
  }

  if (!preview.ok) {
    return preview.reason === 'finished' ? (
      <text className="AdjustNote">{t('已完成的环节不能修改锁定')}</text>
    ) : null;
  }

  return (
    <view className="AdjustPreview">
      {preview.state === 'wait' ? (
        <text className="AdjustPreviewText">
          {t('将等待 {n} 分钟，{name} 到点开始', {
            n: preview.waitMin,
            name: preview.itemName,
          })}
        </text>
      ) : null}
      {preview.state === 'absorb' ? (
        <view className="AdjustPreviewGroup">
          <text className="AdjustPreviewText">
            {t('已吸收 {n} 分钟', { n: preview.diffMin })}
          </text>
          {preview.compressed.map((entry) => (
            <text
              className="AdjustPreviewSub"
              key={`compressed-${entry.itemId}`}
            >
              {t('{name} · 压缩 {n} 分钟', {
                name: entry.name,
                n: entry.lostMin,
              })}
            </text>
          ))}
        </view>
      ) : null}
      {preview.state === 'conflict' ? (
        <view className="AdjustPreviewGroup">
          <view className="AdjustPreviewBadge">
            <Badge kind="reverse" label={t('时间不足')} />
          </view>
          <text className="AdjustPreviewText">
            {t('{name} 仍超出 {n} 分钟，需要压缩后续环节', {
              name: preview.itemName,
              n: preview.diffMin,
            })}
          </text>
        </view>
      ) : null}
      {preview.state === 'unlocked' ? (
        <text className="AdjustPreviewText">
          {t('将解除锁定，{name} 按顺延后的时间开始', {
            name: preview.itemName,
          })}
        </text>
      ) : null}
    </view>
  );
}

export function RuntimeAdjustPanel(props: RuntimeAdjustPanelProps) {
  const { sheet, runtime, closing = false, onCancel, onInsert, onLockChange } = props;
  const t = useT();

  const [name, setName] = useState('');
  const [durationText, setDurationText] = useState('10');
  const [owner, setOwner] = useState('');
  const [note, setNote] = useState('');
  const [insertLockText, setInsertLockText] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lockText, setLockText] = useState('');
  const [confirming, setConfirming] = useState(false);

  const atLimit = runtime.insertedItems.length >= MAX_INSERTED_ITEMS;
  const durationMin = parseDuration(durationText);
  const insertLockAt =
    insertLockText.trim().length === 0 ? null : parseClock(insertLockText);
  const insertLockValid =
    insertLockText.trim().length === 0 || insertLockAt !== null;
  const canInsert =
    !atLimit &&
    name.trim().length > 0 &&
    durationMin !== null &&
    insertLockValid;

  const candidates = listLockCandidates(sheet, runtime);
  const currentName =
    candidates.find((candidate) => candidate.isCurrent)?.name ?? '';
  const selected =
    selectedId === null
      ? null
      : candidates.find((candidate) => candidate.itemId === selectedId) ?? null;
  const lockAt = lockText.trim().length === 0 ? null : parseClock(lockText);
  const lockValid = lockText.trim().length === 0 || lockAt !== null;
  const preview =
    selected && lockAt !== null && lockValid
      ? buildLockPreview(sheet, runtime, selected.itemId, lockAt)
      : null;

  const selectCandidate = (itemId: string, currentLockAt: number | null) => {
    setSelectedId(itemId);
    setLockText(currentLockAt === null ? '' : formatClock(currentLockAt));
    setConfirming(false);
  };

  const submitInsert = () => {
    if (!canInsert || durationMin === null) {
      return;
    }
    onInsert({
      name: name.trim(),
      durationMin,
      owner: owner.trim(),
      note: note.trim(),
      lockAt: insertLockAt,
    });
  };

  const requestLock = () => {
    if (!selected || lockAt === null || !lockValid) {
      return;
    }
    if (preview && preview.hasConflict) {
      setConfirming(true);
      return;
    }
    onLockChange(selected.itemId, lockAt);
  };

  const confirmLock = () => {
    if (!selected || lockAt === null) {
      return;
    }
    setConfirming(false);
    onLockChange(selected.itemId, lockAt);
  };

  const classes = closing ? 'AdjustSheet GlassOut' : 'AdjustSheet';

  return (
    <view
      className={closing ? 'AdjustOverlay OverlayOut' : 'AdjustOverlay'}
      flatten={false}
      catchtap={onCancel}
    >
      <view className="AdjustStage" flatten={false} catchtap={() => {}}>
        <view className={classes} flatten={false} catchtap={() => {}}>
          <view className="AdjustHead">
            <text className="AdjustTitle">{t('现场调整')}</text>
            <view className="AdjustClose" bindtap={onCancel}>
              <text className="AdjustCloseText">{t('关闭')}</text>
            </view>
          </view>

          <scroll-view className="AdjustScroll" scroll-orientation="vertical">
            <view className="AdjustSection">
              <text className="AdjustSectionLabel">{t('插入环节')}</text>
              <text className="AdjustSectionHint">
                {currentName.length > 0
                  ? t('固定插入「{name}」之后', { name: currentName })
                  : t('固定插入当前环节之后')}
              </text>

              <view className="AdjustField">
                <text className="AdjustFieldLabel">{t('名称')}</text>
                <input
                  {...inputSync(name)}
                  className="AdjustInput AdjustName"
                  placeholder={t('环节名称')}
                  maxlength={20}
                  bindinput={(event) => {
                    setName(inputValue(event));
                  }}
                />
              </view>

              <view className="AdjustField">
                <text className="AdjustFieldLabel">{t('时长')}</text>
                <input
                  {...inputSync(durationText)}
                  className="AdjustInput AdjustDuration"
                  placeholder={t('分钟 1–600')}
                  maxlength={3}
                  bindinput={(event) => {
                    setDurationText(inputValue(event));
                  }}
                />
                {durationMin === null ? (
                  <text className="AdjustFieldError">{t('时长应为 1–600 分钟')}</text>
                ) : null}
              </view>

              <view className="AdjustField">
                <text className="AdjustFieldLabel">{t('负责人')}</text>
                <input
                  {...inputSync(owner)}
                  className="AdjustInput"
                  placeholder={t('可留空')}
                  maxlength={12}
                  bindinput={(event) => {
                    setOwner(inputValue(event));
                  }}
                />
              </view>

              <view className="AdjustField">
                <text className="AdjustFieldLabel">{t('备注')}</text>
                <input
                  {...inputSync(note)}
                  className="AdjustInput"
                  placeholder={t('可留空')}
                  maxlength={40}
                  bindinput={(event) => {
                    setNote(inputValue(event));
                  }}
                />
              </view>

              <view className="AdjustField">
                <text className="AdjustFieldLabel">{t('锁定时刻')}</text>
                <input
                  {...inputSync(insertLockText)}
                  className="AdjustInput"
                  placeholder={t('HH:MM（可选）')}
                  maxlength={5}
                  bindinput={(event) => {
                    setInsertLockText(inputValue(event));
                  }}
                />
                {!insertLockValid ? (
                  <text className="AdjustFieldError">
                    {t('时刻格式应为 HH:MM')}
                  </text>
                ) : null}
              </view>

              {atLimit ? (
                <text className="AdjustLimit">
                  {t('单场最多插入 20 个环节')}
                </text>
              ) : null}

              <view className="AdjustInsertAction">
                <Button
                  label={t('确认插入')}
                  block
                  disabled={!canInsert}
                  onTap={submitInsert}
                />
              </view>
            </view>

            <view className="AdjustSection AdjustSection--lock">
              <text className="AdjustSectionLabel">{t('调整锁定')}</text>
              <text className="AdjustSectionHint">
                {t('只列出当前及之后未完成的环节')}
              </text>

              {candidates.length === 0 ? (
                <text className="AdjustNote">{t('暂无未完成环节')}</text>
              ) : (
                <view className="AdjustLockList">
                  {candidates.map((candidate) => (
                    <view
                      className={
                        candidate.itemId === selectedId
                          ? 'AdjustLockRow AdjustLockRow--active'
                          : 'AdjustLockRow'
                      }
                      key={`lock-row-${candidate.itemId}`}
                      bindtap={() => {
                        selectCandidate(candidate.itemId, candidate.lockAt);
                      }}
                    >
                      <view className="AdjustLockMain">
                        <text className="AdjustLockName">
                          {candidate.name}
                        </text>
                        {candidate.owner.length > 0 ? (
                          <text className="AdjustLockOwner">
                            {candidate.owner}
                          </text>
                        ) : null}
                      </view>
                      <text className="AdjustLockValue">
                        {lockLabel(candidate.lockAt, candidate.override, t)}
                      </text>
                    </view>
                  ))}
                </view>
              )}

              {selected ? (
                <view className="AdjustLockEditor">
                  <text className="AdjustSelectedName">
                    {t('调整「{name}」', { name: selected.name })}
                  </text>
                  <view className="AdjustField">
                    <text className="AdjustFieldLabel">{t('新锁定时刻')}</text>
                    <input
                      {...inputSync(lockText)}
                      key={selected.itemId}
                      className="AdjustInput AdjustLockInput"
                      placeholder="HH:MM"
                      maxlength={5}
                      bindinput={(event) => {
                        setLockText(inputValue(event));
                        setConfirming(false);
                      }}
                    />
                    {!lockValid ? (
                      <text className="AdjustFieldError">
                        {t('时刻格式应为 HH:MM')}
                      </text>
                    ) : null}
                  </view>

                  <LockPreviewBlock preview={preview} />

                  {confirming ? (
                    <view className="AdjustConfirm">
                      <text className="AdjustConfirmText">
                        {t('调整后时间仍不足，确认写入？')}
                      </text>
                      <view className="AdjustConfirmActions">
                        <view className="AdjustConfirmAction">
                          <Button
                            label={t('取消')}
                            kind="tertiary"
                            block
                            onTap={() => {
                              setConfirming(false);
                            }}
                          />
                        </view>
                        <view className="AdjustConfirmAction">
                          <Button
                            label={t('确认调整')}
                            kind="secondary"
                            block
                            onTap={confirmLock}
                          />
                        </view>
                      </view>
                    </view>
                  ) : (
                    <view className="AdjustLockActions">
                      <view className="AdjustLockAction">
                        <Button
                          label={t('应用锁定')}
                          kind="secondary"
                          block
                          disabled={lockAt === null}
                          onTap={requestLock}
                        />
                      </view>
                      {selected.lockAt !== null ? (
                        <view className="AdjustLockAction">
                          <Button
                            label={t('解除锁定')}
                            kind="tertiary"
                            block
                            onTap={() => {
                              onLockChange(selected.itemId, null);
                            }}
                          />
                        </view>
                      ) : null}
                    </view>
                  )}
                </view>
              ) : null}
            </view>
          </scroll-view>

          <view className="AdjustFooter">
            <Button
              label={t('完成')}
              kind="tertiary"
              block
              onTap={onCancel}
            />
          </view>
        </view>
      </view>
    </view>
  );
}
