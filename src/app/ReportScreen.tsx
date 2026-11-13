import './ReportScreen.css';

import { useState } from '@lynx-js/react';

import { formatDuration } from '../domain/timeline';
import type { SheetStatus } from '../domain/types';
import { segmentCountText, useT } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import { getRuntime, getSheet, saveSheet } from '../store/repository';
import { Badge, Button } from '../ui';
import { desktopOpenPrintHtml } from './desktopBridge';
import { buildReportHtml } from './reportHtml';
import {
  buildReport,
  buildReportText,
  clockRange,
  offsetText,
  reportFileName,
  reportLockText,
  reportResultLabel,
  signedDurationText,
} from './reportOps';
import type { ReportItemRow } from './reportOps';
import {
  canUseAndroidHost,
  copyText,
  isWeb,
  printHtmlNative,
  shareFollowLink,
  shareHtmlFile,
} from './share';
import { webPrint } from './webBridge';

export interface ReportScreenProps {
  sheetId: string;
  onBack(): void;
  onContinue?(sheetId: string): void;
  onArchive?(sheetId: string): void;
  safeTop?: number;
  safeBottom?: number;
}

const STATUS_LABEL: Record<SheetStatus, string> = {
  draft: '草稿',
  published: '已发布',
  running: '执行中',
  done: '已完成',
};

const REPORT_PRINT_CSS = `@page { size: A4 landscape; margin: 8mm; }
@media print {
  html, body { background: #fff !important; }
  .ReportHeader, .ReportActions, .ReportExportActions, .ReportToast { display: none !important; }
  .Report { height: auto !important; background: #fff !important; }
  .ReportScroll { display: block !important; overflow: visible !important; }
  .ReportBody { max-width: none !important; padding: 0 !important; }
}`;

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function actualText(row: ReportItemRow): string {
  if (row.actualStart === null || row.actualEnd === null) {
    return '—';
  }
  return clockRange(row.actualStart, row.actualEnd);
}

export function ReportScreen(props: ReportScreenProps) {
  const { sheetId, onBack, onContinue, onArchive, safeTop = 0, safeBottom = 0 } = props;
  const tText = useT();

  const [sheet] = useState(() => getSheet(sheetId));
  const [runtime] = useState(() => getRuntime(sheetId));
  const [printedAt] = useState(() => Date.now());
  const [status, setStatus] = useState('');

  if (!sheet) {
    return (
      <view
        className="Report theme-light"
        style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
      >
        <view className="ReportMissing">
          <text className="ReportMissingTitle">{tText('手册不存在')}</text>
          <view className="ReportMissingAction">
            <Button
              label={tText('返回手册列表')}
              kind="tertiary"
              onTap={onBack}
            />
          </view>
        </view>
      </view>
    );
  }

  const report = buildReport(sheet, runtime);
  const { summary, rows, audit } = report;
  const allTerminal = summary.allTerminal;
  const pendingRows = rows.filter((row) => row.result === 'pending');

  const handleContinue = () => {
    if (sheet.status !== 'running') {
      saveSheet({ ...sheet, status: 'running' });
    }
    onContinue?.(sheet.id);
  };

  const handleArchive = () => {
    if (sheet.status !== 'done') {
      saveSheet({ ...sheet, status: 'done' });
    }
    if (onArchive) {
      onArchive(sheet.id);
      return;
    }
    onBack();
  };

  const handlePrint = () => {
    const html = buildReportHtml(sheet, runtime, printedAt);
    const name = reportFileName(sheet);

    if (canUseAndroidHost()) {
      if (printHtmlNative(html, name)) {
        setStatus(tText('已打开打印预览'));
        return;
      }
      const shared = shareHtmlFile(`${name}.html`, html);
      setStatus(
        shared
          ? tText('已导出，请在系统面板中选择保存或发送')
          : tText('导出失败，请重试'),
      );
      return;
    }

    if (isDesktopRuntime()) {
      void desktopOpenPrintHtml(`${name}.html`, html).then((ok) => {
        setStatus(
          ok
            ? tText('已生成打印页，请在浏览器中打印')
            : tText('打印文件导出失败'),
        );
      });
      return;
    }

    if (isWeb()) {
      void webPrint(REPORT_PRINT_CSS).then((ok) => {
        setStatus(ok ? tText('已打开打印预览') : tText('打印失败，请重试'));
      });
      return;
    }

    setStatus(tText('当前环境不支持打印，请用浏览器打开'));
  };

  const handleCopy = () => {
    const text = buildReportText(report);
    void copyText(text).then(async (copied) => {
      if (copied) {
        setStatus(tText('已复制文字摘要'));
        return;
      }
      const outcome = await shareFollowLink(text);
      setStatus(
        outcome === 'failed'
          ? tText('复制失败，请重试')
          : tText('已打开系统分享'),
      );
    });
  };

  const renderRow = (row: ReportItemRow) => {
    const tags: string[] = [];
    if (row.compressedLostMin > 0) {
      tags.push(
        tText('压缩 {duration}', {
          duration: formatDuration(row.compressedLostMin),
        }),
      );
    }
    if (row.inserted) {
      tags.push(tText('现场插入'));
    }
    const lock = reportLockText(row);
    if (lock.length > 0) {
      tags.push(lock);
    }

    return (
      <view className="ReportRow" key={row.itemId}>
        <view className="ReportRowHead">
          <text className="ReportRowNo">{row.no}</text>
          <text className="ReportRowName">{row.name}</text>
          {row.owner.length > 0 ? (
            <text className="ReportRowOwner">{row.owner}</text>
          ) : null}
          <Badge
            kind={row.result === 'skipped' ? 'amber' : 'outline'}
            label={reportResultLabel(row.result)}
          />
        </view>
        <text className="ReportRowLine">
          {`${tText('计划')} ${clockRange(row.planStart, row.planEnd)} · ${tText(
            '顺延后',
          )} ${clockRange(row.displayStart, row.displayEnd)}`}
        </text>
        <text className="ReportRowLine">
          {`${tText('实际')} ${actualText(row)} · ${tText('偏差')} ${signedDurationText(
            row.deviationMin,
          )}`}
        </text>
        {tags.length > 0 ? (
          <view className="ReportRowTags">
            {tags.map((tag) => (
              <text className="ReportRowTag" key={tag}>
                {tag}
              </text>
            ))}
          </view>
        ) : null}
        {row.note.trim().length > 0 ? (
          <text className="ReportRowNote">{`${tText('备注')} · ${row.note}`}</text>
        ) : null}
      </view>
    );
  };

  return (
    <view
      className="Report theme-light"
      style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
    >
      <view className="ReportHeader">
        <view className="ReportBack" bindtap={onBack}>
          <text className="ReportBackText">{tText('← 手册')}</text>
        </view>
        <text className="ReportKicker">{tText('执行报告')}</text>
      </view>

      <scroll-view className="ReportScroll" scroll-orientation="vertical">
        <view className="ReportBody">
          <view className="ReportHead">
            <text className="ReportName">
              {sheet.name.length > 0 ? sheet.name : tText('未命名手册')}
            </text>
            <view className="ReportStatus">
              <view className="ReportStatusItem">
                <Badge
                  kind={allTerminal ? 'outline' : 'amber'}
                  label={
                    allTerminal
                      ? tText(STATUS_LABEL[sheet.status])
                      : tText('已归档 · 未全部完成')
                  }
                />
              </view>
            </view>
            <text className="ReportDate">
              {`${sheet.date} · ${segmentCountText(rows.length)}`}
            </text>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('时长汇总')}</text>
            <view className="ReportStatRow">
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('计划总时长')}</text>
                <text className="ReportStatValue">
                  {formatDuration(summary.planTotalMin)}
                </text>
              </view>
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('实际总时长')}</text>
                <text className="ReportStatValue">
                  {formatDuration(summary.actualTotalMin)}
                </text>
              </view>
              <view className="ReportStat ReportStat--last">
                <text className="ReportStatLabel">{tText('差值')}</text>
                <text className="ReportStatValue ReportStatValue--accent">
                  {signedDurationText(summary.diffMin)}
                </text>
              </view>
            </view>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('完成情况')}</text>
            <view className="ReportStatRow">
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('完成')}</text>
                <text className="ReportStatValue">{pad3(summary.doneCount)}</text>
              </view>
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('跳过')}</text>
                <text className="ReportStatValue">{pad3(summary.skippedCount)}</text>
              </view>
              <view className="ReportStat ReportStat--last">
                <text className="ReportStatLabel">{tText('未执行')}</text>
                <text className="ReportStatValue">{pad3(summary.pendingCount)}</text>
              </view>
            </view>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('执行汇总')}</text>
            <view className="ReportStatRow">
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('完成率')}</text>
                <text className="ReportStatValue">{`${summary.completionRate}%`}</text>
              </view>
              <view className="ReportStat ReportStat--last">
                <text className="ReportStatLabel">{tText('有效偏移')}</text>
                <text className="ReportStatValue">
                  {offsetText(summary.effectiveOffsetMin)}
                </text>
              </view>
            </view>
          </view>

          {pendingRows.length > 0 ? (
            <view className="ReportSection">
              <text className="ReportSectionLabel">{tText('未执行清单')}</text>
              <view className="ReportPendingList">
                {pendingRows.map((row) => (
                  <view className="ReportPendingRow" key={row.itemId}>
                    <text className="ReportPendingNo">{row.no}</text>
                    <text className="ReportPendingName">{row.name}</text>
                    <text className="ReportPendingMeta">
                      {formatDuration(row.planEnd - row.planStart)}
                    </text>
                  </view>
                ))}
              </view>
            </view>
          ) : null}

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('逐项复盘')}</text>
            <view className="ReportTable">{rows.map(renderRow)}</view>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('现场记录')}</text>
            {audit.length > 0 ? (
              <view className="ReportAuditList">
                {audit.map((entry) => (
                  <view className="ReportAuditRow" key={entry.id}>
                    <text className="ReportAuditTime">{entry.atText}</text>
                    <text className="ReportAuditLabel">{entry.label}</text>
                  </view>
                ))}
              </view>
            ) : (
              <text className="ReportEmpty">{tText('无现场变更记录')}</text>
            )}
          </view>

          <view className="ReportActions">
            {!allTerminal ? (
              <view className="ReportAction">
                <Button
                  label={tText('归档')}
                  kind="secondary"
                  block
                  onTap={handleArchive}
                />
              </view>
            ) : (
              <view className="ReportAction">
                <Button
                  label={tText('返回手册列表')}
                  kind="tertiary"
                  block
                  onTap={onBack}
                />
              </view>
            )}
            {!allTerminal && onContinue ? (
              <view className="ReportAction ReportActionPrimary">
                <Button
                  label={tText('继续执行')}
                  block
                  onTap={handleContinue}
                />
              </view>
            ) : null}
          </view>

          <view className="ReportExportActions">
            <view className="ReportAction">
              <Button
                label={tText('导出 / 打印')}
                kind="secondary"
                block
                onTap={handlePrint}
              />
            </view>
            <view className="ReportAction ReportActionPrimary">
              <Button
                label={tText('复制文字摘要')}
                kind="tertiary"
                block
                onTap={handleCopy}
              />
            </view>
          </view>

          {status.length > 0 ? (
            <text className="ReportToast">{status}</text>
          ) : null}
        </view>
      </scroll-view>
    </view>
  );
}
