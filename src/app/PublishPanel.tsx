import './PublishPanel.css';

import { useState } from '@lynx-js/react';

import { encodePayload } from '../domain/codec';
import type { Sheet } from '../domain/types';
import { useT } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import {
  buildShareUrl,
  canUseNativeFiles,
  copyText,
  exportSheetFile,
  isWeb,
  shareFollowLink,
} from './share';

export interface PublishPanelProps {
  sheet: Sheet;
  closing?: boolean;
  onClose(): void;
  onStart(sheetId: string): void;
}

const MAX_QR_ITEMS = 40;
const MAX_QR_URL = 2000;

export function PublishPanel(props: PublishPanelProps) {
  const { sheet, closing = false, onClose, onStart } = props;
  const t = useT();

  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // 二维码用精简载荷，复制链接与文件用完整载荷。
  const compactPayload = encodePayload(sheet, undefined, { compactNotes: true });
  const fullPayload = encodePayload(sheet);
  const qrUrl = buildShareUrl(compactPayload);
  const fullUrl = buildShareUrl(fullPayload);
  const desktop = isDesktopRuntime();
  const hasLink = fullUrl.length > 0;
  const showQr =
    !desktop &&
    hasLink &&
    sheet.items.length <= MAX_QR_ITEMS &&
    qrUrl.length <= MAX_QR_URL;
  const web = isWeb();
  const canExportFile = canUseNativeFiles();

  const handleCopy = () => {
    void copyText(fullUrl).then((ok) => {
      setLinkNote(ok ? t('已复制完整链接') : t('复制失败，请手动选择链接'));
      if (!ok) {
        setLinkOpen(true);
      }
    });
  };

  const handleShare = () => {
    void shareFollowLink(fullUrl).then((outcome) => {
      if (outcome === 'failed') {
        setLinkNote(t('分享不可用，请手动复制链接'));
        setLinkOpen(true);
        return;
      }
      setLinkNote(outcome === 'shared' ? t('已打开系统分享') : t('已复制完整链接'));
    });
  };

  let subtitle = t('扫码即用 · 接收方打开后进入跟随视图');
  if (!hasLink) {
    subtitle = t('未配置在线跟随，请用文件分发');
  } else if (desktop) {
    subtitle = t('复制跟随链接，或在手机上扫码');
  }

  return (
    <view className={closing ? 'PublishOverlay OverlayOut' : 'PublishOverlay'}>
      <view
        className={closing ? 'PublishPanel PanelOut' : 'PublishPanel'}
        catchtap={() => {}}
      >
        <view className="PublishHead">
          <view className="PublishHeadTop">
            <text className="PublishKicker">{t('发布凭证')}</text>
            <text className="PublishVersion">{`V${sheet.version}`}</text>
          </view>
          <text className="PublishTitle">
            {t('已发布 · 第 {n} 版', { n: sheet.version })}
          </text>
          <text className="PublishSubtitle">{subtitle}</text>
        </view>

        <view className="PublishBody">
          {showQr ? (
            <view className="PublishQrWrap">
              <view className="PublishQrBox">
                <QrCode value={qrUrl} size={180} />
              </view>
              <text className="PublishQrCaption">
                {t('扫码跟随 · {n} 字节', { n: compactPayload.length })}
              </text>
            </view>
          ) : (
            <view className="PublishFallback">
              <text className="PublishFallbackText">
                {hasLink
                  ? t('环节较多，请用链接或文件分发')
                  : t('未配置在线跟随，请用文件或短码分发')}
              </text>
            </view>
          )}

          {hasLink ? (
            <view className="PublishLink">
              <view className="PublishLinkActions">
                <view className="PublishLinkAction">
                  <Button
                    label={t('复制完整链接')}
                    kind="secondary"
                    block
                    onTap={handleCopy}
                  />
                </view>
                <view className="PublishLinkAction">
                  <Button
                    label={t('系统分享')}
                    kind="tertiary"
                    block
                    onTap={handleShare}
                  />
                </view>
              </view>
              {linkNote ? (
                <text className="PublishLinkHint">{linkNote}</text>
              ) : null}
              {linkOpen ? (
                <scroll-view
                  className="PublishLinkBox"
                  scroll-orientation="vertical"
                >
                  <text className="PublishLinkText">{fullUrl}</text>
                </scroll-view>
              ) : null}
            </view>
          ) : null}

          <view className="PublishSection">
            <text className="PublishSectionLabel">{t('同步短码')}</text>
            <text className="PublishSectionText">
              {t('执行开始后提供，仅用于已持有同一手册的设备')}
            </text>
          </view>

          {canExportFile ? (
            <view className="PublishExport">
              <Button
                label={t('导出备份')}
                kind="secondary"
                block
                onTap={() => {
                  void exportSheetFile(sheet);
                }}
              />
              {web ? (
                <text className="PublishExportHint">
                  {t('文件含完整备注，适合环节较多或无法扫码时')}
                </text>
              ) : null}
            </view>
          ) : null}
        </view>

        <view className="PublishActions">
          <view className="PublishAction">
            <Button
              label={t('继续编辑')}
              kind="tertiary"
              block
              onTap={onClose}
            />
          </view>
          <view className="PublishAction PublishActionPrimary">
            <Button
              label={t('开始执行')}
              block
              onTap={() => {
                onStart(sheet.id);
              }}
            />
          </view>
        </view>
      </view>
    </view>
  );
}
