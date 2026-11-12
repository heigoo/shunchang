import './PrintScreen.css';

import { useState } from '@lynx-js/react';

import { encodePayload } from '../domain/codec';
import { useT } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import {
  BREAKPOINT_PRINT_WIDE,
  BREAKPOINT_TABLET,
  useIsWide,
} from '../platform/viewport';
import { getRuntime, getSheet } from '../store/repository';
import { Button } from '../ui';
import { desktopOpenPrintHtml } from './desktopBridge';
import { QrCode } from './QrCode';
import { buildShareUrl, isWeb } from './share';
import { buildPrintHtml } from './printHtml';
import {
  buildPrintRows,
  paginateRows,
  printFileName,
  printSummary,
} from './printOps';
import type { PrintPage } from './printOps';
import { webPrint } from './webBridge';

export interface PrintScreenProps {
  sheetId: string;
  onBack(): void;
  safeTop?: number;
  safeBottom?: number;
}

const MAX_QR_ITEMS = 40;
const MAX_QR_URL = 2000;

const PRINT_STYLE_TEXT = `@page { size: A4 landscape; margin: 8mm; }
@media print {
  html, body { background: #fff !important; }
  .PrintActions { display: none !important; }
  .PrintActionsHint { display: none !important; }
  .PrintScreen { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
  .PrintPages { display: block !important; padding: 0 !important; gap: 0 !important; }
  .PrintPage { width: auto !important; min-height: 0 !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; page-break-after: always; break-after: page; }
  .PrintPage--last { page-break-after: auto !important; break-after: auto !important; }
}`;

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
  const { sheetId, onBack, safeTop = 0, safeBottom = 0 } = props;
  const t = useT();

  const [sheet] = useState(() => getSheet(sheetId));
  const [runtime] = useState(() => getRuntime(sheetId));
  const [printedAt] = useState(() => Date.now());
  const [printStatus, setPrintStatus] = useState<'idle' | 'done' | 'failed'>(
    'idle',
  );
  const compact = !useIsWide(BREAKPOINT_TABLET);
  const widePage = useIsWide(BREAKPOINT_PRINT_WIDE);
  const desktop = isDesktopRuntime();

  if (!sheet) {
    return (
      <view
      className="PrintScreen"
      style={{ paddingTop: safeTop, paddingBottom: 88 + safeBottom }}
    >
        <view className="PrintMissing">
          <text className="PrintMissingTitle">{t('手册不存在')}</text>
          <view className="PrintMissingAction">
            <Button
              label={t('返回手册列表')}
              kind="tertiary"
              onTap={onBack}
            />
          </view>
        </view>
      </view>
    );
  }

  const rows = buildPrintRows(sheet, runtime);
  const pages = paginateRows(rows);
  const summary = printSummary(sheet, runtime);
  const url = buildShareUrl(encodePayload(sheet, runtime ?? undefined));
  const showQr =
    !desktop && sheet.items.length <= MAX_QR_ITEMS && url.length <= MAX_QR_URL;
  const stamp = stampText(printedAt);

  const handlePrint = () => {
    if (isWeb()) {
      void webPrint(PRINT_STYLE_TEXT);
    }
  };

  const handleDesktopPrint = () => {
    const html = buildPrintHtml(sheet, runtime, printedAt);
    void desktopOpenPrintHtml(`${printFileName(sheet)}.html`, html).then(
      (ok) => {
        setPrintStatus(ok ? 'done' : 'failed');
      },
    );
  };

  const renderPage = (page: PrintPage) => (
    <view
      key={`page-${page.pageNo}`}
      className={
        page.pageNo === page.pageTotal
          ? 'PrintPage PrintPage--last RowIn'
          : 'PrintPage RowIn'
      }
      style={{ animationDelay: `${Math.min(page.pageNo - 1, 5) * 40}ms` }}
    >
      <view className="PrintHead">
        <view className="PrintHeadMain">
          <text className="PrintTitle">{summary.title}</text>
          <text className="PrintDate">{summary.date}</text>
        </view>
        <view className="PrintHeadAside">
          {desktop ? null : showQr ? (
            <view className="PrintQrBox">
              <QrCode value={url} size={compact ? 56 : 96} />
            </view>
          ) : (
            <view className="PrintQrFallback">
              <text className="PrintQrFallbackText">{t('环节较多')}</text>
              <text className="PrintQrFallbackText">{t('请用文件分发')}</text>
            </view>
          )}
          <text className="PrintSheetNo">
            {t('第 {a} / {b} 张 · 第 {v} 版', {
              a: page.pageNo,
              b: page.pageTotal,
              v: summary.version,
            })}
          </text>
        </view>
      </view>

      <view className="PrintMetaRow">
        <text className="PrintMetaText">
          {t('{offset} · {total} · 导出于 {time}', {
            offset: summary.offsetLabel,
            total: summary.totalLabel,
            time: stamp,
          })}
        </text>
      </view>

      <view className="PrintTable">
        <view className="PrintTableHead">
          <view className="PrintColNo">
            <text className="PrintTh">{t('序号')}</text>
          </view>
          <view className="PrintColTime">
            <text className="PrintTh">{t('时间')}</text>
          </view>
          <view className="PrintColDur">
            <text className="PrintTh">{t('时长')}</text>
          </view>
          <view className="PrintColSeg">
            <text className="PrintTh">{t('环节')}</text>
          </view>
          <view className="PrintColOwner">
            <text className="PrintTh">{t('负责人')}</text>
          </view>
          <view className="PrintColNote">
            <text className="PrintTh">{t('备注')}</text>
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
        <text className="PrintFootText">
          {t('打印于 {time} · 顺场', { time: stamp })}
        </text>
        <text className="PrintFootText">
          {t('第 {a} / {b} 页', { a: page.pageNo, b: page.pageTotal })}
        </text>
      </view>
    </view>
  );

  return (
    <view
      className={
        compact
          ? 'PrintScreen PrintScreen--compact'
          : widePage
            ? 'PrintScreen'
            : 'PrintScreen PrintScreen--medium'
      }
      style={{ paddingTop: safeTop, paddingBottom: 88 + safeBottom }}
    >
      <view className="PrintPages">{pages.map(renderPage)}</view>

      <view className="PrintActions">
        <view className="PrintActionsBack">
          <Button label={t('← 返回')} kind="tertiary" onTap={onBack} />
        </view>
        {printStatus === 'idle' ? null : (
          <text className="PrintActionsStatus">
            {printStatus === 'done'
              ? t('已生成打印页，请在浏览器中打印')
              : t('打印文件导出失败')}
          </text>
        )}
        {isWeb() ? (
          <view className="PrintActionsPrint">
            <Button label={t('打印')} onTap={handlePrint} />
          </view>
        ) : desktop ? (
          <view className="PrintActionsPrint">
            <Button label={t('导出并打印')} onTap={handleDesktopPrint} />
          </view>
        ) : (
          <text className="PrintActionsHint">
            {compact
              ? t('横屏查看更清晰 · 打印请在浏览器打开')
              : t('请在浏览器中打开以打印')}
          </text>
        )}
      </view>
    </view>
  );
}
