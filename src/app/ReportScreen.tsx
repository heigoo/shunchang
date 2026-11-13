import './ReportScreen.css';

import { useState } from '@lynx-js/react';

import { buildExecutionSheet } from '../domain/execution';
import { computeTimeline, formatDuration } from '../domain/timeline';
import type { RuntimeState, SheetStatus } from '../domain/types';
import { useT } from '../i18n';
import { getRuntime, getSheet, saveSheet } from '../store/repository';
import { Badge, Button } from '../ui';

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

const MINUS = '\u2212';

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function actualDurationMin(
  actual: { start?: number; end?: number } | undefined,
): number {
  if (!actual || actual.start === undefined || actual.end === undefined) {
    return 0;
  }
  let duration = actual.end - actual.start;
  if (duration < 0) {
    duration += 1440;
  }
  return duration;
}

function diffText(value: number): string {
  if (value > 0) {
    return `+${formatDuration(value)}`;
  }
  if (value < 0) {
    return `${MINUS}${formatDuration(-value)}`;
  }
  return formatDuration(0);
}

export function ReportScreen(props: ReportScreenProps) {
  const { sheetId, onBack, onContinue, onArchive, safeTop = 0, safeBottom = 0 } = props;
  const tText = useT();

  const [sheet] = useState(() => getSheet(sheetId));
  const [runtime] = useState(() => getRuntime(sheetId));

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

  const execSheet = runtime ? buildExecutionSheet(sheet, runtime) : sheet;
  const timeline = computeTimeline(execSheet, runtime ? runtime.offsetMin : 0);

  let doneCount = 0;
  let skippedCount = 0;
  let actualTotalMin = 0;

  for (const item of execSheet.items) {
    const actual: RuntimeState['actuals'][string] | undefined = runtime
      ? runtime.actuals[item.id]
      : undefined;
    if (!actual || (actual.result !== 'done' && actual.result !== 'skipped')) {
      continue;
    }
    if (actual.result === 'skipped') {
      skippedCount += 1;
      continue;
    }
    doneCount += 1;
    actualTotalMin += actualDurationMin(actual);
  }

  const pendingCount = execSheet.items.length - doneCount - skippedCount;
  const allTerminal = pendingCount === 0;
  const pendingItems = execSheet.items.filter((item) => {
    const actual = runtime ? runtime.actuals[item.id] : undefined;
    return !actual || (actual.result !== 'done' && actual.result !== 'skipped');
  });
  const planTotalMin = timeline.totalPlanMin;
  const diffMin = actualTotalMin - planTotalMin;

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
                  kind="outline"
                  label={tText(STATUS_LABEL[sheet.status])}
                />
              </view>
              {!allTerminal ? (
                <view className="ReportStatusItem">
                  <Badge kind="amber" label={tText('未全部完成')} />
                </view>
              ) : null}
            </view>
            <text className="ReportDate">
              {`${sheet.date} · ${pad3(execSheet.items.length)} ${tText('环节')}`}
            </text>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('时长汇总')}</text>
            <view className="ReportStatRow">
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('计划总时长')}</text>
                <text className="ReportStatValue">
                  {formatDuration(planTotalMin)}
                </text>
              </view>
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('实际总时长')}</text>
                <text className="ReportStatValue">
                  {formatDuration(actualTotalMin)}
                </text>
              </view>
              <view className="ReportStat ReportStat--last">
                <text className="ReportStatLabel">{tText('差值')}</text>
                <text className="ReportStatValue ReportStatValue--accent">
                  {diffText(diffMin)}
                </text>
              </view>
            </view>
          </view>

          <view className="ReportSection">
            <text className="ReportSectionLabel">{tText('完成情况')}</text>
            <view className="ReportStatRow">
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('完成')}</text>
                <text className="ReportStatValue">{pad3(doneCount)}</text>
              </view>
              <view className="ReportStat">
                <text className="ReportStatLabel">{tText('跳过')}</text>
                <text className="ReportStatValue">{pad3(skippedCount)}</text>
              </view>
              <view className="ReportStat ReportStat--last">
                <text className="ReportStatLabel">{tText('未执行')}</text>
                <text className="ReportStatValue">{pad3(pendingCount)}</text>
              </view>
            </view>
          </view>

          {pendingItems.length > 0 ? (
            <view className="ReportSection">
              <text className="ReportSectionLabel">{tText('未执行清单')}</text>
              <view className="ReportPendingList">
                {pendingItems.map((item, index) => (
                  <view className="ReportPendingRow" key={item.id}>
                    <text className="ReportPendingNo">{pad3(index + 1)}</text>
                    <text className="ReportPendingName">
                      {item.name.length > 0 ? item.name : tText('未命名环节')}
                    </text>
                    <text className="ReportPendingMeta">
                      {formatDuration(item.durationMin)}
                    </text>
                  </view>
                ))}
              </view>
            </view>
          ) : null}

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
        </view>
      </scroll-view>
    </view>
  );
}
