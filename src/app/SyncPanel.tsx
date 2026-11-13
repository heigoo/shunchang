import './SyncPanel.css';

import { useState } from '@lynx-js/react';

import {
  encodePayload,
  encodeShortCode,
  formatShortCode,
} from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Button } from '../ui';
import { buildSyncCopyText, ownerOptions } from './followOps';
import { QrCode } from './QrCode';
import {
  buildOwnerFollowUrl,
  buildShareUrl,
  copyText,
  shareFollowLink,
} from './share';

export interface SyncPanelProps {
  sheet: Sheet;
  runtime: RuntimeState;
  closing?: boolean;
  onClose(): void;
  /** 由执行台渲染全屏同步牌；未提供时不显示入口。 */
  onOpenBoard?(): void;
}

const MAX_QR_ITEMS = 40;
const MAX_QR_URL = 2000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clockOf(now: number): string {
  const date = new Date(now);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function SyncPanel(props: SyncPanelProps) {
  const { sheet, runtime, closing = false, onClose, onOpenBoard } = props;
  const t = useT();

  const [note, setNote] = useState<string | null>(null);

  // 二维码用精简载荷，复制链接用完整载荷。
  const compactPayload = encodePayload(sheet, runtime, { compactNotes: true });
  const fullPayload = encodePayload(sheet, runtime);
  const qrUrl = buildShareUrl(compactPayload);
  const fullUrl = buildShareUrl(fullPayload);
  const hasLink = fullUrl.length > 0;
  const showQr =
    hasLink && sheet.items.length <= MAX_QR_ITEMS && qrUrl.length <= MAX_QR_URL;
  const shortCode = encodeShortCode(sheet.id, runtime);
  const codeText = formatShortCode(shortCode);
  const owners = ownerOptions(sheet);
  const syncText = buildSyncCopyText({
    sheetName: sheet.name,
    execVersion: runtime.execVersion,
    now: Date.now(),
    shortCode,
  });

  const classes = closing ? 'SyncGlass GlassOut' : 'SyncGlass';

  const handleCopy = () => {
    void copyText(fullUrl).then((ok) => {
      setNote(ok ? t('已复制完整链接') : t('复制失败，请用短码或文件'));
    });
  };

  const handleShare = () => {
    void shareFollowLink(fullUrl).then((outcome) => {
      setNote(
        outcome === 'failed'
          ? t('分享不可用，请用短码或文件')
          : outcome === 'shared'
            ? t('已打开系统分享')
            : t('已复制完整链接'),
      );
    });
  };

  /** 复制同步文案；剪贴板不可用时退回系统分享。 */
  const handleCopySync = () => {
    void copyText(syncText).then((ok) => {
      if (ok) {
        setNote(t('已复制同步文案'));
        return;
      }
      void shareFollowLink(syncText).then((outcome) => {
        setNote(
          outcome === 'failed'
            ? t('复制失败，请用链接或短码')
            : t('已打开系统分享'),
        );
      });
    });
  };

  const handleOwner = (owner: string) => {
    const url = buildOwnerFollowUrl(fullPayload, owner);
    if (url.length === 0) {
      setNote(t('未配置在线跟随，请用短码或文件'));
      return;
    }
    void copyText(url).then((ok) => {
      setNote(
        ok
          ? t('已复制「{name}」专属链接', { name: owner })
          : t('复制失败，请用短码或文件'),
      );
    });
  };

  return (
    <view
      className={closing ? 'SyncOverlay OverlayOut' : 'SyncOverlay'}
      flatten={false}
      catchtap={onClose}
    >
      <view className="SyncStage" flatten={false} catchtap={() => {}}>
        <view
          className={classes}
          flatten={false}
          catchtap={() => {}}
        >
          <scroll-view className="SyncScroll" scroll-orientation="vertical">
            <view className="SyncInner">
              <view className="SyncHead">
                <text className="SyncLabel">{t('同步凭据')}</text>
              </view>

              {showQr ? (
                <view className="SyncQrWrap">
                  <view className="SyncQrBox">
                    <QrCode value={qrUrl} size={168} />
                  </view>
                </view>
              ) : (
                <view className="SyncFallback">
                  <text className="SyncFallbackText">
                    {hasLink
                      ? t('环节较多，请用链接或文件同步')
                      : t('未配置在线跟随，请用短码或文件同步')}
                  </text>
                </view>
              )}

              <view className="SyncOps">
                <view className="SyncOpsAction">
                  <Button
                    label={t('复制同步文案')}
                    kind="secondary"
                    block
                    onTap={handleCopySync}
                  />
                </view>
                {onOpenBoard ? (
                  <view className="SyncOpsAction">
                    <Button
                      label={t('全屏同步牌')}
                      kind="tertiary"
                      block
                      onTap={onOpenBoard}
                    />
                  </view>
                ) : null}
              </view>

              {hasLink ? (
                <view className="SyncLink">
                  <view className="SyncLinkAction">
                    <Button
                      label={t('复制完整链接')}
                      kind="secondary"
                      block
                      onTap={handleCopy}
                    />
                  </view>
                  <view className="SyncLinkAction">
                    <Button
                      label={t('系统分享')}
                      kind="tertiary"
                      block
                      onTap={handleShare}
                    />
                  </view>
                </view>
              ) : null}
              {note ? <text className="SyncLinkHint">{note}</text> : null}

              {owners.length > 0 ? (
                <view className="SyncOwners">
                  <text className="SyncOwnerLabel">{t('按负责人专属链接')}</text>
                  <scroll-view
                    className="SyncOwnerScroll"
                    scroll-orientation="horizontal"
                  >
                    <view className="SyncOwnerTrack">
                      {owners.map((owner) => (
                        <view
                          className="SyncOwnerChip"
                          key={owner}
                          bindtap={() => {
                            handleOwner(owner);
                          }}
                        >
                          <text className="SyncOwnerChipText">{owner}</text>
                        </view>
                      ))}
                    </view>
                  </scroll-view>
                  <text className="SyncOwnerHint">
                    {t('点击负责人，复制只看其环节的跟随链接')}
                  </text>
                </view>
              ) : null}

              {codeText.length > 0 ? (
                <view className="SyncCodeWrap">
                  <view className="SyncCodeBlock">
                    <text className="SyncCode">{codeText}</text>
                  </view>
                  <text className="SyncCodeHint">
                    {t('可口述给已持有同一手册的人')}
                  </text>
                </view>
              ) : (
                <text className="SyncCodeUnavailable">
                  {t('当前版本无法用短码同步，请用二维码/链接')}
                </text>
              )}

              <view className="SyncMeta">
                <text className="SyncMetaVersion">
                  {t('当前为第 {n} 版', { n: runtime.execVersion })}
                </text>
                <text className="SyncMetaTime">
                  {t('同步于 {time}', { time: clockOf(Date.now()) })}
                </text>
              </view>

              <view className="SyncActions">
                <Button
                  label={t('关闭')}
                  kind="tertiary"
                  block
                  onTap={onClose}
                />
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  );
}
