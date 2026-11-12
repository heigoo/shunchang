import './SyncPanel.css';

import { encodePayload, encodeShortCode } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { useT } from '../i18n';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import { buildShareUrl, isWeb } from './share';

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

  const payload = encodePayload(sheet, runtime);
  const url = buildShareUrl(payload);
  const showQr = sheet.items.length <= MAX_QR_ITEMS && url.length <= MAX_QR_URL;
  const code = encodeShortCode(sheet.id, runtime);

  const glassClasses = ['SyncGlass'];
  if (isWeb()) glassClasses.push('SyncGlass--web');
  if (closing) glassClasses.push('GlassOut');

  return (
    <view
      className={closing ? 'SyncOverlay OverlayOut' : 'SyncOverlay'}
      flatten={false}
      catchtap={onClose}
    >
      <view className="SyncStage" flatten={false} catchtap={() => {}}>
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
          <view className="SyncSheen" />
          <view className="SyncInner">
            <view className="SyncHead">
              <text className="SyncLabel">{t('同步凭据')}</text>
            </view>

            {showQr ? (
              <view className="SyncQrWrap">
                <view className="SyncQrBox">
                  <QrCode value={url} size={168} />
                </view>
              </view>
            ) : (
              <view className="SyncFallback">
                <text className="SyncFallbackText">
                  {t('环节较多，请让对方先导入文件，再用短码同步')}
                </text>
              </view>
            )}

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
        </blur-view>
      </view>
    </view>
  );
}
