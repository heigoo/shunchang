import './SyncPanel.css';

import { useState } from '@lynx-js/react';

import { encodePayload, encodeShortCode } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import { buildShareUrl, copyText, shareFollowLink } from './share';

export interface SyncPanelProps {
  sheet: Sheet;
  runtime: RuntimeState;
  closing?: boolean;
  onClose(): void;
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

function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function SyncPanel(props: SyncPanelProps) {
  const { sheet, runtime, closing = false, onClose } = props;
  const t = useT();

  const [linkNote, setLinkNote] = useState<string | null>(null);

  // 二维码用精简载荷，复制链接用完整载荷。
  const compactPayload = encodePayload(sheet, runtime, { compactNotes: true });
  const fullPayload = encodePayload(sheet, runtime);
  const qrUrl = buildShareUrl(compactPayload);
  const fullUrl = buildShareUrl(fullPayload);
  const hasLink = fullUrl.length > 0;
  const showQr =
    hasLink && sheet.items.length <= MAX_QR_ITEMS && qrUrl.length <= MAX_QR_URL;
  const code = encodeShortCode(sheet.id, runtime);

  const classes = closing ? 'SyncGlass GlassOut' : 'SyncGlass';

  const handleCopy = () => {
    void copyText(fullUrl).then((ok) => {
      setLinkNote(ok ? t('已复制完整链接') : t('复制失败，请用短码或文件'));
    });
  };

  const handleShare = () => {
    void shareFollowLink(fullUrl).then((outcome) => {
      setLinkNote(
        outcome === 'failed'
          ? t('分享不可用，请用短码或文件')
          : outcome === 'shared'
            ? t('已打开系统分享')
            : t('已复制完整链接'),
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
            {linkNote ? (
              <text className="SyncLinkHint">{linkNote}</text>
            ) : null}

            <view className="SyncCodeBlock">
              <text className="SyncCode">{formatCode(code)}</text>
            </view>
            <text className="SyncCodeHint">
              {t('可口述给已持有同一手册的人')}
            </text>

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
        </view>
      </view>
    </view>
  );
}
