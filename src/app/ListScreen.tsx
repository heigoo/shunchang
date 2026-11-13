import './ListScreen.css';

import { useEffect, useRef, useState } from '@lynx-js/react';

import { filterSheets } from './listFilter';
import type { StatusFilter } from './listFilter';
import { registerBackHandler } from './backBus';
import { ImportPanel } from './ImportPanel';
import { ThemePanel } from './ThemePanel';
import type { CustomTemplate } from '../domain/customTemplates';
import {
  createSheetFromCustomTemplate,
  deleteCustomTemplate,
  listCustomTemplates,
  renameCustomTemplate,
  saveSheetAsTemplate,
} from '../domain/customTemplates';
import { TEMPLATES, createSheetFromTemplate } from '../domain/templates';
import { formatDuration } from '../domain/timeline';
import type { Sheet, SheetStatus } from '../domain/types';
import { createEmptySheet, formatDateKey } from '../domain/types';
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
  consumeWriteError,
} from '../store/repository';
import type { AppTheme } from '../store/repository';
import { Badge, Button, usePresence } from '../ui';
import type { BackupPayload, BackupPreview } from './backupOps';
import {
  applyBackup,
  backupErrorMessage,
  backupFileName,
  encodeBackup,
  parseBackup,
  previewBackup,
} from './backupOps';
import { downloadTextFile, exportSheetFile, pickJsonFile } from './share';

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
  const [createDate, setCreateDate] = useState(() => formatDateKey(Date.now()));
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSheet, setMoreSheet] = useState<Sheet | null>(null);
  const [renameText, setRenameText] = useState('');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>(() =>
    listCustomTemplates(),
  );
  const [manageTemplates, setManageTemplates] = useState(false);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>(
    {},
  );
  const [pendingTemplateDelete, setPendingTemplateDelete] =
    useState<CustomTemplate | null>(null);
  const [templateDeleteOpen, setTemplateDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Sheet | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupPreview, setBackupPreview] = useState<{
    backup: BackupPayload;
    preview: BackupPreview;
  } | null>(null);
  const [writeError, setWriteError] = useState(false);
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
    if (
      !createOpen &&
      !importOpen &&
      !deleteOpen &&
      !themeOpen &&
      !moreOpen &&
      !manageTemplates &&
      !templateDeleteOpen &&
      !backupOpen &&
      !backupPreview
    ) {
      return;
    }
    return registerBackHandler(() => {
      if (backupPreview) {
        setBackupPreview(null);
        return true;
      }
      if (backupOpen) {
        setBackupOpen(false);
        return true;
      }
      if (templateDeleteOpen) {
        closeTemplateDelete();
        return true;
      }
      if (manageTemplates) {
        setManageTemplates(false);
        return true;
      }
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
  }, [
    createOpen,
    importOpen,
    deleteOpen,
    themeOpen,
    moreOpen,
    manageTemplates,
    templateDeleteOpen,
    backupOpen,
    backupPreview,
  ]);

  const reload = () => {
    setSheets(listSheets());
    if (consumeWriteError()) {
      setWriteError(true);
    }
  };

  const visible = filterSheets(sheets, query, status);

  const handleInput = (event: any) => {
    const detail = event && event.detail ? event.detail : null;
    setQuery(detail && typeof detail.value === 'string' ? detail.value : '');
  };

  const openCreate = () => {
    setCreateDate(formatDateKey(Date.now()));
    setCustomTemplates(listCustomTemplates());
    setManageTemplates(false);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const handleCreateDateInput = (event: any) => {
    const detail = event && event.detail ? event.detail : null;
    setCreateDate(detail && typeof detail.value === 'string' ? detail.value : '');
  };

  const createFrom = (kind: 'blank' | (typeof TEMPLATES)[number]['id']) => {
    const now = Date.now();
    const sheet =
      kind === 'blank'
        ? createEmptySheet(now, createDate)
        : createSheetFromTemplate(kind, now, createDate);
    if (!sheet) {
      return;
    }
    saveSheet(sheet);
    setCreateOpen(false);
    reload();
    onCreate?.(sheet.id);
  };

  const createFromCustom = (template: CustomTemplate) => {
    const now = Date.now();
    const sheet = createSheetFromCustomTemplate(template, now, createDate);
    saveSheet(sheet);
    setCreateOpen(false);
    reload();
    onCreate?.(sheet.id);
  };

  const openTemplateManage = () => {
    const templates = listCustomTemplates();
    const names: Record<string, string> = {};
    templates.forEach((template) => {
      names[template.id] = template.name;
    });
    setCustomTemplates(templates);
    setTemplateNames(names);
    setManageTemplates(true);
  };

  const handleTemplateNameInput = (id: string, event: any) => {
    const detail = event && event.detail ? event.detail : null;
    const value = detail && typeof detail.value === 'string' ? detail.value : '';
    setTemplateNames((previous) => ({ ...previous, [id]: value }));
  };

  const saveTemplateRename = (template: CustomTemplate) => {
    const name = (templateNames[template.id] ?? '').trim();
    if (name.length === 0) {
      showToast(tText('模板名称不能为空'));
      return;
    }
    const updated = renameCustomTemplate(template.id, name);
    if (!updated) {
      return;
    }
    setCustomTemplates(listCustomTemplates());
    setTemplateNames((previous) => ({ ...previous, [template.id]: updated.name }));
    showToast(tText('已保存名称'));
  };

  const openTemplateDelete = (template: CustomTemplate) => {
    setPendingTemplateDelete(template);
    setTemplateDeleteOpen(true);
  };

  const closeTemplateDelete = () => {
    setTemplateDeleteOpen(false);
    setPendingTemplateDelete(null);
  };

  const confirmTemplateDelete = () => {
    if (!pendingTemplateDelete) {
      return;
    }
    deleteCustomTemplate(pendingTemplateDelete.id);
    closeTemplateDelete();
    setCustomTemplates(listCustomTemplates());
  };

  const saveAsTemplate = () => {
    if (!moreSheet) {
      return;
    }
    saveSheetAsTemplate(moreSheet, `${displayName(moreSheet)} 模板`);
    setCustomTemplates(listCustomTemplates());
    setMoreOpen(false);
    showToast(tText('已保存为模板'));
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

  const exportAllBackup = () => {
    void downloadTextFile(backupFileName(), encodeBackup()).then((ok) => {
      showToast(ok ? tText('已导出全量备份') : tText('当前环境无法导出文件'));
    });
  };

  const openBackup = () => {
    setBackupError(null);
    setBackupOpen(true);
  };

  const closeBackup = () => {
    setBackupError(null);
    setBackupOpen(false);
  };

  const handleBackupFile = () => {
    pickJsonFile((text) => {
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        setBackupError(backupErrorMessage(parsed.error));
        return;
      }
      setBackupError(null);
      setBackupPreview({
        backup: parsed.backup,
        preview: previewBackup(parsed.backup),
      });
    });
  };

  const confirmBackup = () => {
    if (!backupPreview) {
      return;
    }
    const result = applyBackup(backupPreview.backup, {
      confirmConflicts: true,
    });
    if (!result.ok) {
      setBackupError(tText('运行中手册存在冲突，请确认后再导入'));
      return;
    }
    setBackupPreview(null);
    setBackupOpen(false);
    if (result.writeFailed) {
      setWriteError(true);
    }
    reload();
    showToast(tText('已导入备份'));
  };

  const handleDuplicate = (id: string) => {
    const copy = duplicateSheet(id);
    if (!copy) {
      return;
    }
    reload();
    showToast(tText('已复制，请确认活动日期'));
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
        ? 'amber'
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
            <text className="EmptyCode">{tText('空白手册')}</text>
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

      {writeError ? (
        <view className="WriteErrorBar">
          <view className="WriteErrorBody">
            <text className="WriteErrorTitle">
              {tText('保存失败，请立即导出备份')}
            </text>
            <text className="WriteErrorHint">
              {tText('本地存储写入失败，当前内容仍在内存中；导出后可换设备恢复。')}
            </text>
          </view>
          <view className="WriteErrorAction" bindtap={exportAllBackup}>
            <text className="WriteErrorActionText">
              {tText('导出全量备份')}
            </text>
          </view>
          <view
            className="WriteErrorClose"
            bindtap={() => {
              setWriteError(false);
            }}
          >
            <text className="WriteErrorCloseText">{tText('关闭')}</text>
          </view>
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
            className="ListGuide"
            bindtap={() => {
              setGuideOpen(true);
            }}
          >
            <text className="ListGuideText">{tText('说明')}</text>
          </view>
          <view className="ListBackup" bindtap={openBackup}>
            <text className="ListBackupText">{tText('备份')}</text>
          </view>
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
                {isWide ? tText('调度手册') : tText('调度')}
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

      {guideOpen ? (
        <view
          className="Overlay"
          bindtap={() => {
            setGuideOpen(false);
          }}
        >
          <view className="Panel GuidePanel" catchtap={() => {}}>
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">{tText('三步用顺场')}</text>
                <text className="PanelSubtitle">
                  {tText('现场调度 · 快速说明')}
                </text>
              </view>
              <view
                className="PanelClose"
                bindtap={() => {
                  setGuideOpen(false);
                }}
              >
                <text className="PanelCloseText">{tText('关闭')}</text>
              </view>
            </view>

            <view className="GuideBody">
              <view className="GuideStep">
                <text className="GuideNo">01</text>
                <view className="GuideText">
                  <text className="GuideStepTitle">{tText('编排')}</text>
                  <text className="GuideStepBody">
                    {tText('把环节按时间排好；锁定表示到点开始，不会提前。')}
                  </text>
                </view>
              </view>
              <view className="GuideStep">
                <text className="GuideNo">02</text>
                <view className="GuideText">
                  <text className="GuideStepTitle">{tText('执行')}</text>
                  <text className="GuideStepBody">
                    {tText('只看当前环节，完成后自动推进；晚点就顺延。')}
                  </text>
                </view>
              </view>
              <view className="GuideStep GuideStep--last">
                <text className="GuideNo">03</text>
                <view className="GuideText">
                  <text className="GuideStepTitle">{tText('跟随')}</text>
                  <text className="GuideStepBody">
                    {tText('把同步码给现场，所有人看到同一版。')}
                  </text>
                </view>
              </view>
            </view>

            <view className="GuideFooter">
              <Button
                label={tText('知道了')}
                block
                onTap={() => {
                  setGuideOpen(false);
                }}
              />
            </view>
          </view>
        </view>
      ) : null}

      {backupOpen ? (
        <view className="Overlay" bindtap={closeBackup}>
          <view className="Panel Panel--confirm BackupPanel" catchtap={() => {}}>
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">{tText('全量备份 / 恢复')}</text>
                <text className="PanelSubtitle">
                  {tText('手册 · 执行记录 · 自定义模板')}
                </text>
              </view>
              <view className="PanelClose" bindtap={closeBackup}>
                <text className="PanelCloseText">{tText('取消')}</text>
              </view>
            </view>

            <view className="BackupBody">
              <text className="BackupHint">
                {tText(
                  '导出包含全部手册、执行记录与自定义模板，不含主题等本机偏好。导入时按更新时间合并。',
                )}
              </text>
              <view className="BackupAction">
                <Button
                  label={tText('导出全量备份')}
                  block
                  onTap={exportAllBackup}
                />
              </view>
              <view className="BackupAction">
                <Button
                  label={tText('选择备份文件导入')}
                  kind="secondary"
                  block
                  onTap={handleBackupFile}
                />
              </view>
              {backupError ? (
                <text className="BackupError">{backupError}</text>
              ) : null}
            </view>
          </view>
        </view>
      ) : null}

      {backupPreview ? (
        <view
          className="Overlay"
          bindtap={() => {
            setBackupPreview(null);
          }}
        >
          <view className="Panel Panel--confirm BackupPanel" catchtap={() => {}}>
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">{tText('导入预览')}</text>
                <text className="PanelSubtitle">
                  {tText('确认后写入本机')}
                </text>
              </view>
            </view>

            <view className="PanelBody">
              <view className="BackupStats">
                <view className="BackupStatRow">
                  <text className="BackupStatLabel">{tText('新增')}</text>
                  <text className="BackupStatValue">
                    {backupPreview.preview.added}
                  </text>
                </view>
                <view className="BackupStatRow">
                  <text className="BackupStatLabel">{tText('覆盖')}</text>
                  <text className="BackupStatValue">
                    {backupPreview.preview.overwritten}
                  </text>
                </view>
                <view className="BackupStatRow">
                  <text className="BackupStatLabel">{tText('跳过')}</text>
                  <text className="BackupStatValue">
                    {backupPreview.preview.skipped}
                  </text>
                </view>
                <view className="BackupStatRow">
                  <text className="BackupStatLabel">{tText('冲突')}</text>
                  <text className="BackupStatValue">
                    {backupPreview.preview.conflicts}
                  </text>
                </view>
              </view>

              {backupPreview.preview.conflicts > 0 ? (
                <view className="BackupConflict">
                  <text className="BackupConflictTitle">
                    {tText('以下运行中手册将被覆盖')}
                  </text>
                  {backupPreview.preview.conflictNames.map((name) => (
                    <text key={name} className="BackupConflictName">
                      {name}
                    </text>
                  ))}
                  <text className="BackupConflictHint">
                    {tText('确认后会连同执行记录一起替换，不可撤销。')}
                  </text>
                </view>
              ) : null}

              {backupError ? (
                <text className="PanelError">{backupError}</text>
              ) : null}
            </view>

            <view className="PanelActions">
              <view className="PanelAction">
                <Button
                  label={tText('取消')}
                  kind="tertiary"
                  onTap={() => {
                    setBackupPreview(null);
                  }}
                />
              </view>
              <view className="PanelAction">
                <Button
                  label={
                    backupPreview.preview.conflicts > 0
                      ? tText('确认覆盖并导入')
                      : tText('确认导入')
                  }
                  kind="secondary"
                  onTap={confirmBackup}
                />
              </view>
            </view>
          </view>
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
            <view className="PanelOption" bindtap={saveAsTemplate}>
              <text className="PanelOptionName">{tText('另存为模板')}</text>
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

            <view className="SheetRename">
              <text className="SheetRenameLabel">{tText('活动日期')}</text>
              <input
                className="SheetRenameInput"
                default-value={createDate}
                placeholder="YYYY-MM-DD"
                maxlength={10}
                bindinput={handleCreateDateInput}
              />
            </view>

            <scroll-view className="PanelOptions" scroll-orientation="vertical">
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
                      <text className="PanelOptionName">
                        {tText(template.name)}
                      </text>
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

              <view className="TemplateSection">
                <view className="TemplateSectionHead">
                  <text className="TemplateSectionTitle">
                    {tText('我的模板')}
                  </text>
                  {customTemplates.length > 0 ? (
                    <view
                      className="TemplateManageLink"
                      bindtap={openTemplateManage}
                    >
                      <text className="TemplateManageLinkText">
                        {tText('管理')}
                      </text>
                    </view>
                  ) : null}
                </view>
                {customTemplates.length === 0 ? (
                  <text className="TemplateEmptyText">
                    {tText('把手册另存为模板后会显示在这里。')}
                  </text>
                ) : (
                  customTemplates.map((template) => {
                    const minutes = template.items.reduce(
                      (sum, entry) => sum + entry.durationMin,
                      0,
                    );
                    return (
                      <view
                        key={template.id}
                        className={
                          isWide
                            ? 'PanelOption'
                            : 'PanelOption PanelOption--stacked'
                        }
                        bindtap={() => {
                          createFromCustom(template);
                        }}
                      >
                        <view className="PanelOptionLabel">
                          <text className="PanelOptionName">
                            {template.name}
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
                  })
                )}
              </view>
            </scroll-view>
          </view>
        </view>
      ) : null}

      {manageTemplates ? (
        <view
          className="Overlay"
          bindtap={() => {
            setManageTemplates(false);
          }}
        >
          <view className="Panel" catchtap={() => {}}>
            <view className="PanelHeader">
              <view className="PanelHeaderText">
                <text className="PanelTitle">{tText('我的模板')}</text>
                <text className="PanelSubtitle">
                  {tText('重命名或删除本地模板')}
                </text>
              </view>
              <view
                className="PanelClose"
                bindtap={() => {
                  setManageTemplates(false);
                }}
              >
                <text className="PanelCloseText">{tText('关闭')}</text>
              </view>
            </view>

            <scroll-view className="PanelOptions" scroll-orientation="vertical">
              {customTemplates.length === 0 ? (
                <view className="TemplateEmpty">
                  <text className="TemplateEmptyText">
                    {tText('还没有自定义模板')}
                  </text>
                </view>
              ) : (
                customTemplates.map((template) => (
                  <view key={template.id} className="TemplateManageRow">
                    <text className="TemplateManageName">{template.name}</text>
                    <input
                      className="SheetRenameInput TemplateManageInput"
                      default-value={templateNames[template.id] ?? template.name}
                      placeholder={tText('模板名称')}
                      bindinput={(event) => {
                        handleTemplateNameInput(template.id, event);
                      }}
                    />
                    <view className="TemplateManageActions">
                      <view
                        className="TemplateManageAction"
                        bindtap={() => {
                          saveTemplateRename(template);
                        }}
                      >
                        <text className="TemplateManageActionText">
                          {tText('保存名称')}
                        </text>
                      </view>
                      <view
                        className="TemplateManageAction TemplateManageAction--danger"
                        bindtap={() => {
                          openTemplateDelete(template);
                        }}
                      >
                        <text className="TemplateManageActionText">
                          {tText('删除')}
                        </text>
                      </view>
                    </view>
                  </view>
                ))
              )}
            </scroll-view>
          </view>
        </view>
      ) : null}

      {templateDeleteOpen && pendingTemplateDelete ? (
        <view className="Overlay" bindtap={closeTemplateDelete}>
          <view className="Panel Panel--confirm" catchtap={() => {}}>
            <view className="PanelHeader">
              <text className="PanelTitle">{tText('删除模板')}</text>
            </view>
            <view className="PanelBody">
              <text className="PanelBodyText">
                {tText('「{name}」删除后不可恢复。', {
                  name: pendingTemplateDelete.name,
                })}
              </text>
            </view>
            <view className="PanelActions">
              <view className="PanelAction">
                <Button
                  label={tText('取消')}
                  kind="tertiary"
                  onTap={closeTemplateDelete}
                />
              </view>
              <view className="PanelAction">
                <Button
                  label={tText('删除')}
                  kind="secondary"
                  onTap={confirmTemplateDelete}
                />
              </view>
            </view>
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
