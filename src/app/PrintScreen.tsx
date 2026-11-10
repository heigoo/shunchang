import './PrintScreen.css';

import { useState } from '@lynx-js/react';

import { encodePayload } from '../domain/codec';
import { getRuntime, getSheet } from '../store/repository';
import { Button } from '../ui';
import { QrCode } from './QrCode';
import { buildShareUrl, isWeb } from './share';
import {
  buildPrintRows,
  paginateRows,
  printSummary,
} from './printOps';
import type { PrintPage } from './printOps';

export interface PrintScreenProps {
  sheetId: string;
  onBack(): void;
}

const MAX_QR_ITEMS = 40;
const MAX_QR_URL = 2000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function stampText(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

export function PrintScreen(props: PrintScreenProps) {
  const { sheetId, onBack } = props;

  const [sheet] = useState(() => getSheet(sheetId));
  const [runtime] = useState(() => getRuntime(sheetId));
  const [printedAt] = useState(() => Date.now());

  if (!sheet) {
    return (
      <view className="PrintScreen">
        <view className="PrintMissing">
          <text className="PrintMissingTitle">手册不存在</text>
          <view className="PrintMissingAction">
            <Button label="返回手册列表" kind="tertiary" onTap={onBack} />
          </view>
        </view>
      </view>
    );
  }

  const rows = buildPrintRows(sheet, runtime);
  const pages = paginateRows(rows);
  const summary = printSummary(sheet, runtime);
  const url = buildShareUrl(encodePayload(sheet, runtime ?? undefined));
  const showQr = sheet.items.length <= MAX_QR_ITEMS && url.length <= MAX_QR_URL;
  const stamp = stampText(printedAt);

  const handlePrint = () => {
    if (isWeb() && typeof window !== 'undefined') {
      window.print();
    }
  };

  const renderPage = (page: PrintPage) => (
    <view
      key={`page-${page.pageNo}`}
      className={
        page.pageNo === page.pageTotal ? 'PrintPage PrintPage--last' : 'PrintPage'
      }
    >
      <view className="PrintHead">
        <view className="PrintHeadMain">
          <text className="PrintTitle">{summary.title}</text>
          <text className="PrintDate">{summary.date}</text>
        </view>
        <view className="PrintHeadAside">
          {showQr ? (
            <view className="PrintQrBox">
              <QrCode value={url} size={96} />
            </view>
          ) : (
            <view className="PrintQrFallback">
              <text className="PrintQrFallbackText">环节较多</text>
              <text className="PrintQrFallbackText">请用文件分发</text>
            </view>
          )}
          <text className="PrintSheetNo">
            {`SHEET ${page.pageNo} / ${page.pageTotal} · V${summary.version}`}
          </text>
        </view>
      </view>

      <view className="PrintMetaRow">
        <text className="PrintMetaText">
          {`${summary.offsetLabel} · ${summary.totalLabel} · 导出于 ${stamp}`}
        </text>
      </view>

      <view className="PrintTable">
        <view className="PrintTableHead">
          <view className="PrintColNo">
            <text className="PrintTh">NO.</text>
          </view>
          <view className="PrintColTime">
            <text className="PrintTh">TIME</text>
          </view>
          <view className="PrintColDur">
            <text className="PrintTh">DUR</text>
          </view>
          <view className="PrintColSeg">
            <text className="PrintTh">SEGMENT</text>
          </view>
          <view className="PrintColOwner">
            <text className="PrintTh">OWNER</text>
          </view>
          <view className="PrintColNote">
            <text className="PrintTh">NOTE</text>
          </view>
        </view>

        {page.rows.map((row, index) => {
          const classes =
            index % 2 === 1 ? 'PrintRow PrintRow--alt' : 'PrintRow';
          return (
            <view key={`${page.pageNo}-${row.no}`} className={classes}>
              <view className="PrintColNo">
                <text className="PrintCellMono">{row.no}</text>
              </view>
              <view className="PrintColTime">
                <text className="PrintCellTime">{row.time}</text>
                {row.lockLabel.length > 0 ? (
                  <text className="PrintCellLock">{row.lockLabel}</text>
                ) : null}
              </view>
              <view className="PrintColDur">
                <text className="PrintCellMono">{row.duration}</text>
              </view>
              <view className="PrintColSeg">
                <text className="PrintCellName">{row.name}</text>
              </view>
              <view className="PrintColOwner">
                <text className="PrintCellText">{row.owner}</text>
              </view>
              <view className="PrintColNote">
                <text className="PrintCellNote">{row.note}</text>
              </view>
            </view>
          );
        })}
      </view>

      <view className="PrintFoot">
        <text className="PrintFootText">{`PRINTED ${stamp} · 顺场`}</text>
        <text className="PrintFootText">{`PAGE ${page.pageNo} / ${page.pageTotal}`}</text>
      </view>
    </view>
  );

  return (
    <view className="PrintScreen">
      <view className="PrintPages">{pages.map(renderPage)}</view>

      <view className="PrintActions">
        <view className="PrintActionsBack">
          <Button label="← 返回" kind="tertiary" onTap={onBack} />
        </view>
        {isWeb() ? (
          <view className="PrintActionsPrint">
            <Button label="打印 / 保存为 PDF" onTap={handlePrint} />
          </view>
        ) : (
          <text className="PrintActionsHint">请在浏览器中打开以打印</text>
        )}
      </view>
    </view>
  );
}
