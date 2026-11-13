import './SyncBoard.css';

import {
  encodePayload,
  encodeShortCode,
  formatShortCode,
} from '../domain/codec';
import { buildExecutionSheet } from '../domain/execution';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import { buildShareUrl } from './share';

export interface SyncBoardProps {
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

function clockOf(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function stampOf(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${clockOf(ms)}`;
}

/** 全屏同步牌：会议桌/签到台举牌用的大二维码或大短码。 */
export function SyncBoard(props: SyncBoardProps) {
  const { sheet, runtime, closing = false, onClose } = props;
  const t = useT();

  const payload = encodePayload(sheet, runtime, { compactNotes: true });
  const url = buildShareUrl(payload);
  const hasLink = url.length > 0;
  const showQr =
    hasLink && sheet.items.length <= MAX_QR_ITEMS && url.length <= MAX_QR_URL;
  const code = formatShortCode(encodeShortCode(sheet.id, runtime));

  const execSheet = buildExecutionSheet(sheet, runtime);
  const currentIndex = runtime.currentIndex;
  const current =
    currentIndex >= 0 && currentIndex < execSheet.items.length
      ? execSheet.items[currentIndex]
      : null;
  const stage =
    current && current.name.trim().length > 0
      ? current.name.trim()
      : currentIndex >= execSheet.items.length
        ? t('已结束')
        : t('尚未开始');
  const lastSync =
    runtime.lastSyncAt > 0 ? stampOf(runtime.lastSyncAt) : t('尚未同步');

  return (
    <view className={closing ? 'SyncBoard SyncBoard--out' : 'SyncBoard'}>
      <view className="SyncBoardTop">
        <text className="SyncBoardKicker">{t('全屏同步牌')}</text>
        <view className="SyncBoardExit" bindtap={onClose}>
          <text className="SyncBoardExitText">{t('退出')}</text>
        </view>
      </view>

      <view className="SyncBoardBody">
        <text className="SyncBoardSheet">
          {sheet.name.length > 0 ? sheet.name : t('未命名手册')}
        </text>

        {showQr ? (
          <view className="SyncBoardQrBox">
            <QrCode value={url} size={248} />
          </view>
        ) : code.length > 0 ? (
          <text className="SyncBoardCode">{code}</text>
        ) : (
          <text className="SyncBoardFallback">
            {t('当前版本无法用短码同步，请用二维码/链接')}
          </text>
        )}

        {showQr ? (
          <text className="SyncBoardHint">{t('扫码打开跟随页')}</text>
        ) : code.length > 0 ? (
          <text className="SyncBoardHint">{t('可口述给已持有同一手册的人')}</text>
        ) : null}

        <view className="SyncBoardMeta">
          <view className="SyncBoardMetaRow">
            <text className="SyncBoardMetaLabel">{t('版本')}</text>
            <text className="SyncBoardMetaValue">
              {t('第 {n} 版', { n: runtime.execVersion })}
            </text>
          </view>
          <view className="SyncBoardMetaRow">
            <text className="SyncBoardMetaLabel">{t('当前环节')}</text>
            <text className="SyncBoardMetaValue">{stage}</text>
          </view>
          <view className="SyncBoardMetaRow SyncBoardMetaRow--last">
            <text className="SyncBoardMetaLabel">{t('最后同步')}</text>
            <text className="SyncBoardMetaValue">{lastSync}</text>
          </view>
        </view>
      </view>

      <view className="SyncBoardActions">
        <Button label={t('退出同步牌')} kind="tertiary" block onTap={onClose} />
      </view>
    </view>
  );
}
