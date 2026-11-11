import './PublishPanel.css';

import { encodePayload } from '../domain/codec';
import type { Sheet } from '../domain/types';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import { buildShareUrl, exportSheetFile, isWeb } from './share';

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

  const payload = encodePayload(sheet);
  const url = buildShareUrl(payload);
  const showQr = sheet.items.length <= MAX_QR_ITEMS && url.length <= MAX_QR_URL;
  const web = isWeb();

  return (
    <view className={closing ? 'PublishOverlay OverlayOut' : 'PublishOverlay'}>
      <view
        className={closing ? 'PublishPanel PanelOut' : 'PublishPanel'}
        catchtap={() => {}}
      >
        <view className="PublishHead">
          <text className="PublishTitle">{`已发布 · 第 ${sheet.version} 版`}</text>
          <text className="PublishSubtitle">
            扫码即用 · 接收方打开后进入跟随视图
          </text>
        </view>

        <view className="PublishBody">
          {showQr ? (
            <view className="PublishQrWrap">
              <view className="PublishQrBox">
                <QrCode value={url} size={180} />
              </view>
              <text className="PublishQrCaption">
                {`扫码跟随 · ${payload.length} 字节`}
              </text>
            </view>
          ) : (
            <view className="PublishFallback">
              <text className="PublishFallbackText">环节较多，请使用文件分发</text>
            </view>
          )}

          <view className="PublishSection">
            <text className="PublishSectionLabel">六位短码</text>
            <text className="PublishSectionText">
              执行开始后提供，用于已持有手册的设备对齐状态
            </text>
          </view>

          {web ? (
            <view className="PublishExport">
              <Button
                label="导出文件"
                kind="secondary"
                block
                onTap={() => {
                  void exportSheetFile(sheet);
                }}
              />
              <text className="PublishExportHint">
                文件含完整备注，适合环节较多或无法扫码时
              </text>
            </view>
          ) : null}
        </view>

        <view className="PublishActions">
          <view className="PublishAction">
            <Button label="继续编辑" kind="tertiary" block onTap={onClose} />
          </view>
          <view className="PublishAction PublishActionPrimary">
            <Button
              label="开始执行"
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
