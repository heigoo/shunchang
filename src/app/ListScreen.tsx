import './ListScreen.css';

import { useEffect, useRef, useState } from '@lynx-js/react';

import { filterSheets } from './listFilter';
import type { StatusFilter } from './listFilter';
import { registerBackHandler } from './backBus';
import { ImportPanel } from './ImportPanel';
import { TEMPLATES, createSheetFromTemplate } from '../domain/templates';
import { formatDuration } from '../domain/timeline';
import type { Sheet, SheetStatus } from '../domain/types';
import { createEmptySheet } from '../domain/types';
import { useIsWide } from '../platform/viewport';
import {
  deleteSheet,
  duplicateSheet,
  listSheets,
  saveSheet,
} from '../store/repository';
import { Badge, Button, usePresence } from '../ui';

export interface ListScreenProps {
  onOpenSheet(id: string): void;
  onOpenFollow(): void;
  onImported(sheetId: string): void;
  onCreate?(id: string): void;
  notice?: string;
}

const STATUS_LABEL: Record<SheetStatus, string> = {
  draft: '草稿',
  published: '已发布',
  running: '执行中',
  done: '已完成',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'running', label: '执行中' },
  { value: 'done', label: '已完成' },
];

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function monthDay(date: string): string {
  return date.length >= 10 ? date.slice(5) : date;
}

function clockOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function displayName(sheet: Sheet): string {
  return sheet.name.length > 0 ? sheet.name : '未命名手册';
}

function totalMinutes(sheet: Sheet): number {
  return sheet.items.reduce((sum, item) => sum + item.durationMin, 0);
}

function createOptionMeta(count: number, minutes: number): string {
  return `${count} 环节 · ${formatDuration(minutes)}`;
}

export function ListScreen(props: ListScreenProps) {
  const { onOpenSheet, onOpenFollow, onImported, onCreate, notice } = props;

  const [sheets, setSheets] = useState<Sheet[]>(() => listSheets());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createPresence = usePresence(createOpen);
  const importPresence = usePresence(importOpen);
  const deletePresence = usePresence(deleteOpen);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWide = useIsWide();

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  // 退场动画结束后再清掉被删除项，避免面板内容提前消失。
  useEffect(() => {
    if (!deletePresence.mounted) {
      setPendingDelete(null);
    }
  }, [deletePresence.mounted]);

  // 返回键优先关闭当前打开的浮层。
  useEffect(() => {
    if (!createOpen && !importOpen && !deleteOpen) {
      return;
    }
    return registerBackHandler(() => {
      if (deleteOpen) {
        closeDelete();
        return true;
      }
      if (createOpen) {
        closeCreate();
        return true;
      }
      if (importOpen) {
        setImportOpen(false);
        return true;
      }
      return false;
    });
  }, [createOpen, importOpen, deleteOpen]);

  const reload = () => {
    setSheets(listSheets());
  };

  const visible = filterSheets(sheets, query, status);

  const handleInput = (event: any) => {
    const detail = event && event.detail ? event.detail : null;
    setQuery(detail && typeof detail.value === 'string' ? detail.value : '');
  };

  const openCreate = () => {
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const createFrom = (kind: 'blank' | (typeof TEMPLATES)[number]['id']) => {
    const now = Date.now();
    const sheet =
      kind === 'blank' ? createEmptySheet(now) : createSheetFromTemplate(kind, now);
    if (!sheet) {
      return;
    }
    saveSheet(sheet);
    setCreateOpen(false);
    reload();
    onCreate?.(sheet.id);
  };

  const handleDuplicate = (id: string) => {
    const copy = duplicateSheet(id);
    if (!copy) {
      return;
    }
    reload();
    setCopied(true);
    if (toastTimer.current !== null) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => {
      setCopied(false);
      toastTimer.current = null;
    }, 2000);
  };

  const openDelete = (sheet: Sheet) => {
    setDeleteError(null);
    setPendingDelete(sheet);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteError(null);
    setDeleteOpen(false);
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const result = deleteSheet(pendingDelete.id);
    if (!result.ok) {
      setDeleteError(result.reason ?? '删除失败');
      return;
    }
    setDeleteError(null);
    setDeleteOpen(false);
    reload();
  };

  const renderStatus = (sheet: Sheet) => (
    <Badge kind="outline" label={STATUS_LABEL[sheet.status]} />
  );

  const renderActions = (sheet: Sheet) => (
    <view className="RowActions">
      <view
        className="RowAction"
        catchtap={() => {
          handleDuplicate(sheet.id);
        }}
      >
        <text className="RowActionText">复制</text>
      </view>
      <view
        className="RowAction"
        catchtap={() => {
          openDelete(sheet);
        }}
      >
        <text className="RowActionText">删除</text>
      </view>
    </view>
  );

  const renderWideRow = (sheet: Sheet, index: number) => {
    const classes =
      index % 2 === 1 ? 'ListRow ListRow--alt RowIn' : 'ListRow RowIn';
    return (
      <view
        key={sheet.id}
        className={classes}
        style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
        bindtap={() => {
          onOpenSheet(sheet.id);
        }}
      >
        <view className="ColNo">
          <text className="CellNo">{pad3(index + 1)}</text>
        </view>
        <view className="ColDate">
          <text className="CellDate">{monthDay(sheet.date)}</text>
        </view>
        <view className="ColName">
          <text className="CellName">{displayName(sheet)}</text>
        </view>
        <view className="ColStatus">{renderStatus(sheet)}</view>
        <view className="ColSeg">
          <text className="CellSeg">{pad2(sheet.items.length)}</text>
        </view>
        <view className="ColUpdated">
          <text className="CellUpdated">{clockOf(sheet.updatedAt)}</text>
        </view>
        <view className="ColAction">{renderActions(sheet)}</view>
      </view>
    );
  };

  const renderNarrowRow = (sheet: Sheet, index: number) => {
    const classes =
      index % 2 === 1 ? 'NarrowRow NarrowRow--alt RowIn' : 'NarrowRow RowIn';
    return (
      <view
        key={sheet.id}
        className={classes}
        style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
        bindtap={() => {
          onOpenSheet(sheet.id);
        }}
      >
        <view className="NarrowMain">
          <view className="NarrowTop">
            <text className="NarrowName">{displayName(sheet)}</text>
            {renderStatus(sheet)}
          </view>
          <text className="NarrowMeta">
            {`${pad3(index + 1)} · ${monthDay(sheet.date)} · ${sheet.items.length} 环节`}
          </text>
        </view>
        {renderActions(sheet)}
      </view>
    );
  };

  const renderList = () => {
    if (sheets.length === 0) {
      return (
        <view className="EmptyBlock">
          <text className="EmptyTitle">还没有手册</text>
          <text className="EmptyHint">从模板开始，或建一份空白手册。</text>
          <view className="EmptyAction">
            <Button label="新建手册" onTap={openCreate} />
          </view>
        </view>
      );
    }

    if (visible.length === 0) {
      return (
        <view className="EmptyBlock">
          <text className="EmptyTitle">没有匹配的手册</text>
          <text className="EmptyHint">换个关键词或状态再试。</text>
        </view>
      );
    }

    if (!isWide) {
      return (
        <view className="NarrowList">
          {visible.map((sheet, index) => renderNarrowRow(sheet, index))}
        </view>
      );
    }

    return (
      <view className="Table">
        <view className="ListTableHead">
          <view className="ColNo">
            <text className="Th">No.</text>
          </view>
          <view className="ColDate">
            <text className="Th">DATE</text>
          </view>
          <view className="ColName">
            <text className="Th">NAME</text>
          </view>
          <view className="ColStatus">
            <text className="Th">STATUS</text>
          </view>
          <view className="ColSeg">
            <text className="Th">SEG</text>
          </view>
          <view className="ColUpdated">
            <text className="Th">UPDATED</text>
          </view>
          <view className="ColAction">
            <text className="Th">ACTION</text>
          </view>
        </view>
        {visible.map((sheet, index) => renderWideRow(sheet, index))}
      </view>
    );
  };

  return (
    <view className="ListScreen theme-light">
      {notice ? (
        <view className="ListNotice">
          <text className="ListNoticeText">{notice}</text>
        </view>
      ) : null}

      <view className="ListHeader">
        <text className="ListBrand">顺场</text>
        <view className="ListHeaderRight">
          <text className="ListMeta">SCHEDULE SHEET / 现场调度</text>
          <view
            className="ListLoad"
            bindtap={() => {
              setImportOpen(true);
            }}
          >
            <text className="ListLoadText">载入</text>
          </view>
          <view className="ListFollow" bindtap={onOpenFollow}>
            <text className="ListFollowText">跟随</text>
          </view>
        </view>
      </view>

      <view className="ListRule" />

      <view className="ListMain">
        <view className="ListTitleRow">
          <text className="ListTitle">现场手册</text>
          <view className="ListTitleRight">
            {copied ? <text className="ListToast">已复制为新手册</text> : null}
            <text className="ListCount">{`SHEET ${pad2(sheets.length)}`}</text>
          </view>
        </view>

        <view
          className={
            isWide ? 'ListToolbar' : 'ListToolbar ListToolbar--narrow'
          }
        >
          <input
            className="ListSearch"
            placeholder="搜索手册名称"
            bindinput={handleInput}
          />
          <view className="ListFilters">
            {STATUS_OPTIONS.map((option) => {
              const active = option.value === status;
              const classes = active
                ? 'FilterItem FilterItem--active'
                : 'FilterItem';
              return (
                <view
                  key={option.value}
                  className={classes}
                  bindtap={() => {
                    setStatus(option.value);
                  }}
                >
                  <text className="FilterText">{option.label}</text>
                </view>
              );
            })}
          </view>
          <Button label="新建手册" block={!isWide} onTap={openCreate} />
        </view>

        {renderList()}
      </view>

      <view className="ListFooter">
        <text className="ListFooterText">PAGE 1 / 1 · 数据保存在本设备</text>
      </view>

      {importPresence.mounted ? (
        <ImportPanel
          closing={importPresence.closing}
          onClose={() => {
            setImportOpen(false);
          }}
          onImported={(sheetId) => {
            reload();
            onImported(sheetId);
          }}
        />
      ) : null}

      {createPresence.mounted ? (
        <view
          className={createPresence.closing ? 'Overlay OverlayOut' : 'Overlay'}
          bindtap={closeCreate}
        >
          <view
            className={createPresence.closing ? 'Panel PanelOut' : 'Panel'}
            catchtap={() => {}}
          >
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">新建手册</text>
                <text className="PanelSubtitle">选择起点</text>
              </view>
              <view className="PanelClose" bindtap={closeCreate}>
                <text className="PanelCloseText">取消</text>
              </view>
            </view>

            <scroll-view
              className="PanelOptions"
              scroll-orientation="vertical"
            >
              <view
                className="PanelOption"
                bindtap={() => {
                  createFrom('blank');
                }}
              >
                <text className="PanelOptionName">空白手册</text>
                <view className="PanelOptionMeta">
                  <text className="PanelOptionMetaText">
                    {createOptionMeta(1, 30)}
                  </text>
                  <text className="PanelOptionArrow">→</text>
                </view>
              </view>

              {TEMPLATES.map((template) => {
                const minutes = template.items.reduce(
                  (sum, entry) => sum + entry.durationMin,
                  0,
                );
                return (
                  <view
                    key={template.id}
                    className="PanelOption"
                    bindtap={() => {
                      createFrom(template.id);
                    }}
                  >
                    <view className="PanelOptionLabel">
                      <text className="PanelOptionName">{template.name}</text>
                      <text className="PanelOptionTagline">{template.tagline}</text>
                    </view>
                    <view className="PanelOptionMeta">
                      <text className="PanelOptionMetaText">
                        {createOptionMeta(template.items.length, minutes)}
                      </text>
                      <text className="PanelOptionArrow">→</text>
                    </view>
                  </view>
                );
              })}
            </scroll-view>
          </view>
        </view>
      ) : null}

      {deletePresence.mounted && pendingDelete ? (
        <view
          className={deletePresence.closing ? 'Overlay OverlayOut' : 'Overlay'}
          bindtap={closeDelete}
        >
          <view
            className={
              deletePresence.closing
                ? 'Panel Panel--confirm PanelOut'
                : 'Panel Panel--confirm'
            }
            catchtap={() => {}}
          >
            <view className="PanelHeader">
              <text className="PanelTitle">删除手册</text>
            </view>
            <view className="PanelBody">
              <text className="PanelBodyText">
                {`「${displayName(pendingDelete)}」删除后不可恢复。`}
              </text>
              {deleteError ? (
                <text className="PanelError">{deleteError}</text>
              ) : null}
            </view>
            <view className="PanelActions">
              <view className="PanelAction">
                <Button label="取消" kind="tertiary" onTap={closeDelete} />
              </view>
              <view className="PanelAction">
                <Button label="删除" kind="secondary" onTap={confirmDelete} />
              </view>
            </view>
          </view>
        </view>
      ) : null}
    </view>
  );
}
