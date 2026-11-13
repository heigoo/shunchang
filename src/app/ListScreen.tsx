import './ListScreen.css';

import { useEffect, useRef, useState } from '@lynx-js/react';

import { filterSheets } from './listFilter';
import type { StatusFilter } from './listFilter';
import { registerBackHandler } from './backBus';
import { ImportPanel } from './ImportPanel';
import { ThemePanel } from './ThemePanel';
import { TEMPLATES, createSheetFromTemplate } from '../domain/templates';
import { formatDuration } from '../domain/timeline';
import type { Sheet, SheetStatus } from '../domain/types';
import { createEmptySheet } from '../domain/types';
import { t, getLang, useT } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import {
  BREAKPOINT_DESKTOP,
  BREAKPOINT_TABLET,
  useIsWide,
} from '../platform/viewport';
import {
  deleteSheet,
  duplicateSheet,
  getRuntime,
  listSheets,
  saveSheet,
} from '../store/repository';
import type { AppTheme } from '../store/repository';
import { Badge, Button, usePresence } from '../ui';
import { exportSheetFile } from './share';

export interface ListScreenProps {
  onOpenSheet(id: string): void;
  onOpenFollow(): void;
  onImported(sheetId: string): void;
  onCreate?(id: string): void;
  notice?: string;
  safeTop?: number;
  safeBottom?: number;
  theme?: AppTheme;
  onThemeChange?(theme: AppTheme): void;
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
  return sheet.name.length > 0 ? sheet.name : t('未命名手册');
}

function totalMinutes(sheet: Sheet): number {
  return sheet.items.reduce((sum, item) => sum + item.durationMin, 0);
}

function segmentCountText(count: number): string {
  if (getLang() === 'en') {
    return `${count} ${count === 1 ? 'segment' : 'segments'}`;
  }
  return t('{n} 环节', { n: count });
}

function createOptionMeta(count: number, minutes: number): string {
  return `${segmentCountText(count)} · ${formatDuration(minutes)}`;
}

export function ListScreen(props: ListScreenProps) {
  const {
    onOpenSheet,
    onOpenFollow,
    onImported,
    onCreate,
    notice,
    safeTop = 0,
    safeBottom = 0,
    theme = 'default',
    onThemeChange,
  } = props;

  const [sheets, setSheets] = useState<Sheet[]>(() => listSheets());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSheet, setMoreSheet] = useState<Sheet | null>(null);
  const [renameText, setRenameText] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tText = useT();

  const createPresence = usePresence(createOpen);
  const importPresence = usePresence(importOpen);
  const deletePresence = usePresence(deleteOpen);
  const themePresence = usePresence(themeOpen);
  const morePresence = usePresence(moreOpen);
  const xishi = theme === 'xishi';

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameRef = useRef<any>(null);
  const isWide = useIsWide(BREAKPOINT_TABLET);
  const isDesktop = useIsWide(BREAKPOINT_DESKTOP);

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

  // 桌面端原生输入框不会绘制 default-value，打开面板后主动同步一次名称。
  useEffect(() => {
    if (!morePresence.mounted || !isDesktopRuntime()) {
      return;
    }
    renameRef.current
      ?.invoke({ method: 'setValue', params: { value: renameText } })
      .exec();
  }, [morePresence.mounted, moreSheet?.id]);

  // 返回键优先关闭当前打开的浮层。
  useEffect(() => {
    if (!createOpen && !importOpen && !deleteOpen && !themeOpen && !moreOpen) {
      return;
    }
    return registerBackHandler(() => {
      if (moreOpen) {
        setMoreOpen(false);
        return true;
      }
      if (themeOpen) {
        setThemeOpen(false);
        return true;
      }
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
  }, [createOpen, importOpen, deleteOpen, themeOpen, moreOpen]);

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

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current !== null) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 2000);
  };

  const handleDuplicate = (id: string) => {
    const copy = duplicateSheet(id);
    if (!copy) {
      return;
    }
    reload();
    showToast(tText('已复制为新手册'));
  };

  const openMore = (sheet: Sheet) => {
    setMoreSheet(sheet);
    setRenameText(displayName(sheet));
    setMoreOpen(true);
  };

  const closeMore = () => {
    setMoreOpen(false);
  };

  const handleRenameInput = (event: any) => {
    const detail = event && event.detail ? event.detail : null;
    setRenameText(detail && typeof detail.value === 'string' ? detail.value : '');
  };

  const saveRename = () => {
    if (!moreSheet) {
      return;
    }
    const name = renameText.trim();
    if (name.length === 0) {
      showToast(tText('手册名称不能为空'));
      return;
    }
    saveSheet({ ...moreSheet, name });
    setMoreOpen(false);
    reload();
    showToast(tText('已保存名称'));
  };

  const exportBackup = () => {
    if (!moreSheet) {
      return;
    }
    void exportSheetFile(moreSheet, getRuntime(moreSheet.id) ?? undefined).then(
      (ok) => {
        setMoreOpen(false);
        showToast(ok ? tText('已导出备份') : tText('请在 Web 端导出备份'));
      },
    );
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
      setDeleteError(result.reason ?? tText('删除失败'));
      return;
    }
    setDeleteError(null);
    setDeleteOpen(false);
    reload();
  };

  const renderStatus = (sheet: Sheet) => {
    const kind =
      sheet.status === 'running'
        ? 'reverse'
        : sheet.status === 'draft'
          ? 'stamp'
          : 'outline';
    return <Badge kind={kind} label={tText(STATUS_LABEL[sheet.status])} />;
  };

  const renderActions = (sheet: Sheet) => (
    <view className="RowActions">
      <view
        className="RowAction"
        catchtap={() => {
          openMore(sheet);
        }}
      >
        <text className="RowActionText">⋯</text>
      </view>
    </view>
  );

  const renderWideRow = (sheet: Sheet, index: number) => {
    const classes = ['ListRow', 'RowIn'];
    if (index % 2 === 1) classes.push('ListRow--alt');
    if (sheet.status === 'running') classes.push('ListRow--running');
    return (
      <view
        key={sheet.id}
        className={classes.join(' ')}
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
        {isDesktop ? (
          <view className="ColUpdated">
            <text className="CellUpdated">{clockOf(sheet.updatedAt)}</text>
          </view>
        ) : null}
        <view className="ColAction">{renderActions(sheet)}</view>
      </view>
    );
  };

  const renderNarrowRow = (sheet: Sheet, index: number) => {
    const classes = ['NarrowRow', 'RowIn'];
    if (index % 2 === 1) classes.push('NarrowRow--alt');
    if (sheet.status === 'running') classes.push('NarrowRow--running');
    return (
      <view
        key={sheet.id}
        className={classes.join(' ')}
        style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
        bindtap={() => {
          onOpenSheet(sheet.id);
        }}
      >
        <text className="NarrowNo">{pad3(index + 1)}</text>
        <view className="NarrowMain">
          <text className="NarrowName">{displayName(sheet)}</text>
          <text className="NarrowMeta">
            {`${monthDay(sheet.date)} · ${segmentCountText(
              sheet.items.length,
            )} · ${formatDuration(totalMinutes(sheet))}`}
          </text>
        </view>
        <view className="NarrowTail">
          {renderStatus(sheet)}
          <view
            className="NarrowMore"
            catchtap={() => {
              openMore(sheet);
            }}
          >
            <text className="NarrowMoreText">⋯</text>
          </view>
        </view>
      </view>
    );
  };

  const renderList = () => {
    if (sheets.length === 0) {
      return (
        <view className="EmptyBlock">
          <view className="EmptyHead">
            <text className="EmptyCode">FORM 01 · BLANK</text>
            <text className="EmptyStamp">{tText('草稿')}</text>
          </view>
          <text className="EmptyTitle">{tText('还没有手册')}</text>
          <text className="EmptyHint">
            {tText('从模板开始，或建一份空白手册。')}
          </text>
          <view className="EmptyFields">
            <view className="EmptyField">
              <text className="EmptyFieldLabel">{tText('日期')}</text>
              <text className="EmptyFieldValue">—</text>
            </view>
            <view className="EmptyField EmptyField--mid">
              <text className="EmptyFieldLabel">{tText('环节')}</text>
              <text className="EmptyFieldValue">—</text>
            </view>
            <view className="EmptyField EmptyField--mid">
              <text className="EmptyFieldLabel">{tText('总时长')}</text>
              <text className="EmptyFieldValue">—</text>
            </view>
          </view>
          <view className="EmptyAction">
            <Button
              label={tText('新建手册')}
              className={
                xishi
                  ? 'ListCreate EmptyActionBtn ListCreate--xishi'
                  : 'ListCreate EmptyActionBtn'
              }
              onTap={openCreate}
            />
          </view>
        </view>
      );
    }

    if (visible.length === 0) {
      return (
        <view className="EmptyBlock">
          <text className="EmptyTitle">{tText('没有匹配的手册')}</text>
          <text className="EmptyHint">{tText('换个关键词或状态再试。')}</text>
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
      <view className={isDesktop ? 'Table' : 'Table Table--medium'}>
        <view className="ListTableHead">
          <view className="ColNo">
            <text className="Th">{tText('序号')}</text>
          </view>
          <view className="ColDate">
            <text className="Th">{tText('日期')}</text>
          </view>
          <view className="ColName">
            <text className="Th">{tText('名称')}</text>
          </view>
          <view className="ColStatus">
            <text className="Th">{tText('状态')}</text>
          </view>
          <view className="ColSeg">
            <text className="Th">{tText('环节')}</text>
          </view>
          {isDesktop ? (
            <view className="ColUpdated">
              <text className="Th">{tText('更新时间')}</text>
            </view>
          ) : null}
          <view className="ColAction">
            <text className="Th">{tText('操作')}</text>
          </view>
        </view>
        {visible.map((sheet, index) => renderWideRow(sheet, index))}
      </view>
    );
  };

  return (
    <view
      className={
        isWide
          ? 'ListScreen theme-light'
          : 'ListScreen ListScreen--narrow theme-light'
      }
      style={{ paddingTop: safeTop, paddingBottom: safeBottom }}
    >
      {notice ? (
        <view className="ListNotice">
          <text className="ListNoticeText">{tText(notice)}</text>
        </view>
      ) : null}

      <view className="ListHeader">
        <view className="ListBrandRow">
          <text className="ListBrand">{tText('顺场')}</text>
          {/* 印章保留中文，英文界面下避免长单词挤压右侧操作 */}
          {xishi ? <text className="ListBrandSeal">喜事</text> : null}
        </view>
        <view className="ListHeaderRight">
          {isWide ? (
            <text className="ListMeta">
              {xishi
                ? tText('喜事现场 · 手册总览')
                : tText('现场调度 · 手册总览')}
            </text>
          ) : null}
          <view
            className="ListLoad"
            bindtap={() => {
              setImportOpen(true);
            }}
          >
            <text className="ListLoadText">{tText('载入')}</text>
          </view>
          <view className="ListFollow" bindtap={onOpenFollow}>
            <text className="ListFollowText">{tText('跟随')}</text>
          </view>
        </view>
      </view>

      <view className="ListRule" />

      <scroll-view className="ListScroll" scroll-orientation="vertical">
        <view className="ListMain">
          <view className="ListHero">
            <view className="ListHeroMain">
              <text className="ListKicker">
                {isWide ? 'SCHEDULE SHEETS · 调度手册' : 'SCHEDULE SHEETS'}
              </text>
              <text className="ListTitle">{tText('现场手册')}</text>
            </view>
            <view className="ListHeroAside">
              <view
                className="ListTheme"
                bindtap={() => {
                  setThemeOpen(true);
                }}
              >
                <view
                  className={
                    xishi ? 'ListThemeDot ListThemeDot--xishi' : 'ListThemeDot'
                  }
                />
                <text className="ListThemeText">
                  {xishi ? tText('喜事') : tText('墨金')}
                </text>
              </view>
              <view className="ListCountBlock">
                <text className="ListCountNumber">{pad2(sheets.length)}</text>
                <text className="ListCountLabel">{tText('份手册')}</text>
              </view>
            </view>
          </view>
          <view className="ListHeroRule" />

          <view
            className={
              isDesktop
                ? 'ListToolbar'
                : isWide
                  ? 'ListToolbar ListToolbar--medium'
                  : 'ListToolbar ListToolbar--narrow'
            }
          >
            <view className="ListSearchRow">
              <view className="ListSearchWrap">
                <text className="ListSearchIcon">⌕</text>
                <input
                  className="ListSearch"
                  placeholder={tText('搜索手册名称')}
                  bindinput={handleInput}
                />
              </view>
              {!isWide && sheets.length > 0 ? (
                <view className="ListToolbarAction ListToolbarAction--inline">
                  <Button
                    label={tText('新建')}
                    className={
                      xishi ? 'ListCreate ListCreate--xishi' : 'ListCreate'
                    }
                    onTap={openCreate}
                  />
                </view>
              ) : null}
            </view>
            <view className="ListToolbarMain">
              <scroll-view
                className="ListFiltersScroll"
                scroll-orientation="horizontal"
              >
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
                        <text className="FilterText">{tText(option.label)}</text>
                      </view>
                    );
                  })}
                </view>
              </scroll-view>
              {isWide && sheets.length > 0 ? (
                <view className="ListToolbarAction">
                  <Button
                    label={isDesktop ? tText('新建手册') : tText('新建')}
                    className={
                      xishi ? 'ListCreate ListCreate--xishi' : 'ListCreate'
                    }
                    onTap={openCreate}
                  />
                </view>
              ) : null}
            </view>
          </view>

          {renderList()}

          <view className="ListFooter">
            <text className="ListFooterText">
              {tText('共 {n} 份 · 数据保存在本设备', {
                n: pad2(sheets.length),
              })}
            </text>
            <text className="ListFooterText">{tText('顺场 · 现场调度')}</text>
          </view>
        </view>
      </scroll-view>

      {toast ? (
        <view className="ListToastLayer">
          <text className="ListToast">{toast}</text>
        </view>
      ) : null}

      {importPresence.mounted ? (
        <ImportPanel
          closing={importPresence.closing}
          safeTop={safeTop}
          onClose={() => {
            setImportOpen(false);
          }}
          onImported={(sheetId) => {
            reload();
            onImported(sheetId);
          }}
        />
      ) : null}

      {themePresence.mounted ? (
        <ThemePanel
          theme={theme}
          closing={themePresence.closing}
          onClose={() => {
            setThemeOpen(false);
          }}
          onSelect={(next) => {
            setThemeOpen(false);
            onThemeChange?.(next);
          }}
        />
      ) : null}

      {morePresence.mounted && moreSheet ? (
        <view
          className={morePresence.closing ? 'Overlay OverlayOut' : 'Overlay'}
          bindtap={closeMore}
        >
          <view
            className={
              morePresence.closing ? 'Panel SheetMore PanelOut' : 'Panel SheetMore'
            }
            catchtap={() => {}}
          >
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">{tText('手册操作')}</text>
                <text className="PanelSubtitle">{displayName(moreSheet)}</text>
              </view>
              <view className="PanelClose" bindtap={closeMore}>
                <text className="PanelCloseText">{tText('取消')}</text>
              </view>
            </view>

            <view className="SheetRename">
              <text className="SheetRenameLabel">{tText('重命名')}</text>
              <input
                ref={renameRef}
                className="SheetRenameInput"
                default-value={displayName(moreSheet)}
                placeholder={tText('输入手册名称')}
                bindinput={handleRenameInput}
              />
              <Button
                label={tText('保存名称')}
                kind="secondary"
                block
                onTap={saveRename}
              />
            </view>

            <view
              className="PanelOption"
              bindtap={() => {
                closeMore();
                handleDuplicate(moreSheet.id);
              }}
            >
              <text className="PanelOptionName">{tText('复制为新手册')}</text>
              <text className="PanelOptionArrow">→</text>
            </view>
            <view className="PanelOption" bindtap={exportBackup}>
              <text className="PanelOptionName">{tText('导出备份')}</text>
              <text className="PanelOptionArrow">→</text>
            </view>
            <view
              className="PanelOption PanelOption--danger"
              bindtap={() => {
                const target = moreSheet;
                closeMore();
                openDelete(target);
              }}
            >
              <text className="PanelOptionName">{tText('删除手册')}</text>
              <text className="PanelOptionArrow">→</text>
            </view>
          </view>
        </view>
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
                <text className="PanelTitle">{tText('新建手册')}</text>
                <text className="PanelSubtitle">{tText('选择起点')}</text>
              </view>
              <view className="PanelClose" bindtap={closeCreate}>
                <text className="PanelCloseText">{tText('取消')}</text>
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
                <text className="PanelOptionName">{tText('空白手册')}</text>
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
                    className={
                      isWide ? 'PanelOption' : 'PanelOption PanelOption--stacked'
                    }
                    bindtap={() => {
                      createFrom(template.id);
                    }}
                  >
                    <view className="PanelOptionLabel">
                      <text className="PanelOptionName">{tText(template.name)}</text>
                      <text className="PanelOptionTagline">
                        {tText(template.tagline)}
                      </text>
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
              <text className="PanelTitle">{tText('删除手册')}</text>
            </view>
            <view className="PanelBody">
              <text className="PanelBodyText">
                {tText('「{name}」删除后不可恢复。', {
                  name: displayName(pendingDelete),
                })}
              </text>
              {deleteError ? (
                <text className="PanelError">{tText(deleteError)}</text>
              ) : null}
            </view>
            <view className="PanelActions">
              <view className="PanelAction">
                <Button
                  label={tText('取消')}
                  kind="tertiary"
                  onTap={closeDelete}
                />
              </view>
              <view className="PanelAction">
                <Button
                  label={tText('删除')}
                  kind="secondary"
                  onTap={confirmDelete}
                />
              </view>
            </view>
          </view>
        </view>
      ) : null}
    </view>
  );
}
