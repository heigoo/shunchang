import './EditorScreen.css';

import { useEffect, useState } from '@lynx-js/react';

import { computeTimeline, formatClock, formatDuration } from '../domain/timeline';
import type { Item, Sheet, SheetStatus } from '../domain/types';
import type { SheetError } from '../domain/validate';
import { findPlanConflicts } from '../domain/validate';
import { useIsWide } from '../platform/viewport';
import { getSheet, saveSheet } from '../store/repository';
import { Badge, Button } from '../ui';
import {
  MAX_ITEMS,
  addItem,
  moveItem,
  publishSheet,
  removeItem,
  setItemDuration,
  setItemLockAt,
  setSheetName,
  setStartTime,
  sortByPlanTime,
  toggleLock,
  updateItemField,
} from './editorOps';

export interface EditorScreenProps {
  sheetId: string;
  onBack(): void;
  onStartRuntime(sheetId: string): void;
}

const STATUS_LABEL: Record<SheetStatus, string> = {
  draft: '草稿',
  published: '已发布',
  running: '执行中',
  done: '已完成',
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function inputValue(event: any): string {
  const detail = event && event.detail ? event.detail : null;
  return detail && typeof detail.value === 'string' ? detail.value : '';
}

function currentMinuteOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function errorLine(error: SheetError): string {
  if (typeof error.index === 'number') {
    return `${pad3(error.index + 1)} ${error.message}`;
  }
  return error.message;
}

function durationText(item: Item): string {
  return String(item.durationMin);
}

function lockText(item: Item): string {
  return item.lockAt === null ? 'LOCK 待填' : `LOCK ${formatClock(item.lockAt)}`;
}

export function EditorScreen(props: EditorScreenProps) {
  const { sheetId, onBack, onStartRuntime } = props;

  const [sheet, setSheet] = useState<Sheet | null>(() => getSheet(sheetId));
  const [errors, setErrors] = useState<SheetError[] | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null,
  );
  const [startError, setStartError] = useState(false);
  const [inputRev, setInputRev] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lockEdit, setLockEdit] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    index: number;
    name: string;
  } | null>(null);
  const [published, setPublished] = useState<{ version: number } | null>(null);
  const [nowMin, setNowMin] = useState<number>(currentMinuteOfDay);
  const isWide = useIsWide();

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMin(currentMinuteOfDay());
    }, 60000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const revOf = (key: string): number => inputRev[key] ?? 0;
  const bump = (key: string) => {
    setInputRev((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
  };

  const apply = (next: Sheet | null) => {
    if (!next) {
      return;
    }
    if (sheet && next === sheet) {
      return;
    }
    const saved = saveSheet(next);
    setSheet(saved);
  };

  if (!sheet) {
    return (
      <view className="Editor theme-light">
        <view className="EditorMissing">
          <text className="EditorMissingTitle">手册不存在</text>
          <view className="EditorMissingAction">
            <Button label="返回手册列表" kind="tertiary" onTap={onBack} />
          </view>
        </view>
      </view>
    );
  }

  const timeline = computeTimeline(sheet, 0);
  const conflicts = findPlanConflicts(sheet);
  const atLimit = sheet.items.length >= MAX_ITEMS;

  let nowIndex = -1;
  if (sheet.date === todayKey()) {
    nowIndex = timeline.rows.findIndex((row) => {
      const item = sheet.items[row.index];
      return nowMin >= row.planStart && nowMin < row.planStart + item.durationMin;
    });
  }

  const handleName = (event: any) => {
    apply(setSheetName(sheet, inputValue(event)));
  };

  const handleStartBlur = (event: any) => {
    const next = setStartTime(sheet, inputValue(event));
    bump('start');
    if (!next) {
      setStartError(true);
      return;
    }
    setStartError(false);
    apply(next);
  };

  const handleField = (
    index: number,
    field: 'name' | 'owner' | 'note',
    event: any,
  ) => {
    const value = inputValue(event);
    const patch: Partial<Item> =
      field === 'name' ? { name: value } : field === 'owner' ? { owner: value } : { note: value };
    apply(updateItemField(sheet, index, patch));
  };

  const commitDuration = (index: number, item: Item, event: any) => {
    const next = setItemDuration(sheet, index, inputValue(event));
    bump(`dur-${item.id}`);
    if (!next) {
      setRowError({ id: item.id, message: '时长需为 1–600 的整数' });
      return;
    }
    setRowError(null);
    apply(next);
  };

  const commitLock = (index: number, item: Item, event: any) => {
    const next = setItemLockAt(sheet, index, inputValue(event));
    bump(`lock-${item.id}`);
    if (!next) {
      setRowError({ id: item.id, message: '时间格式应为 HH:MM' });
      return;
    }
    setRowError(null);
    apply(next);
  };

  const handleToggleLock = (index: number) => {
    apply(toggleLock(sheet, index));
  };

  const handleAdd = () => {
    const next = addItem(sheet);
    if (next === sheet) {
      return;
    }
    apply(next);
    setExpanded(next.items.length - 1);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const next = moveItem(sheet, index, direction);
    if (next === sheet) {
      return;
    }
    apply(next);
    setExpanded(index + direction);
  };

  const handleSort = () => {
    const next = sortByPlanTime(sheet);
    if (next === sheet) {
      return;
    }
    apply(next);
    setExpanded(null);
  };

  const handleDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const index = pendingDelete.index;
    apply(removeItem(sheet, index));
    setPendingDelete(null);
    setExpanded((previous) => {
      if (previous === null) return null;
      if (previous === index) return null;
      return previous > index ? previous - 1 : previous;
    });
  };

  const handlePublish = () => {
    const result = publishSheet(sheet);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const saved = saveSheet(result.sheet);
    setSheet(saved);
    setErrors(null);
    setPublished({ version: saved.version });
  };

  const renderLockCell = (item: Item, index: number, conflicted: boolean) => {
    if (item.locked !== true) {
      return (
        <view className="LockCell">
          <view
            className="LockBtn"
            bindtap={() => {
              handleToggleLock(index);
              setLockEdit(index);
            }}
          >
            <text className="LockBtnText">LOCK</text>
          </view>
          {conflicted ? <Badge kind="stamp" label="冲突" /> : null}
        </view>
      );
    }

    const editing = lockEdit === index;
    const key = `lock-${item.id}`;
    return (
      <view className="LockCell">
        <view
          className="LockStamp"
          bindtap={() => {
            setLockEdit(editing ? null : index);
          }}
        >
          <Badge kind="stamp" label={lockText(item)} />
        </view>
        {editing ? (
          <view className="LockEditRow">
            <input
              key={`${key}-${revOf(key)}`}
              className="LockInput"
              placeholder="HH:MM"
              maxlength={5}
              default-value={item.lockAt === null ? '' : formatClock(item.lockAt)}
              bindblur={(event) => {
                commitLock(index, item, event);
              }}
            />
            <view
              className="LockOff"
              bindtap={() => {
                setLockEdit(null);
                handleToggleLock(index);
              }}
            >
              <text className="LockOffText">解锁</text>
            </view>
          </view>
        ) : null}
        {conflicted ? <Badge kind="stamp" label="冲突" /> : null}
      </view>
    );
  };

  const renderRow = (item: Item, index: number) => {
    const row = timeline.rows[index];
    const conflicted = conflicts.indexOf(index) >= 0;
    const classes = ['RowWrap'];
    if (index % 2 === 1) classes.push('RowWrap--alt');
    if (index === nowIndex) classes.push('RowWrap--now');
    const durKey = `dur-${item.id}`;
    const error = rowError && rowError.id === item.id ? rowError.message : null;

    return (
      <view key={item.id} className={classes.join(' ')}>
        <view className="Row">
          <view className="ColNo">
            <text className="CellNo">{pad3(index + 1)}</text>
          </view>
          <view className="ColTime">
            <text className="CellTime">{formatClock(row.planStart)}</text>
          </view>
          <view className="ColSegName">
            <input
              className="CellInput"
              maxlength={20}
              placeholder="环节名称"
              default-value={item.name}
              bindinput={(event) => {
                handleField(index, 'name', event);
              }}
            />
          </view>
          <view className="ColDur">
            <input
              key={`${durKey}-${revOf(durKey)}`}
              className="CellInput CellInput--mono CellInput--right"
              type="number"
              maxlength={3}
              default-value={durationText(item)}
              bindblur={(event) => {
                commitDuration(index, item, event);
              }}
            />
          </view>
          <view className="ColOwner">
            <input
              className="CellInput"
              maxlength={20}
              placeholder="负责人"
              default-value={item.owner}
              bindinput={(event) => {
                handleField(index, 'owner', event);
              }}
            />
          </view>
          <view className="ColNote">
            <input
              className="CellInput"
              maxlength={200}
              placeholder="备注"
              default-value={item.note}
              bindinput={(event) => {
                handleField(index, 'note', event);
              }}
            />
          </view>
          <view className="ColLock">{renderLockCell(item, index, conflicted)}</view>
          <view className="ColAct">
            <view
              className={index === 0 ? 'ActBtn ActBtn--off' : 'ActBtn'}
              bindtap={() => {
                handleMove(index, -1);
              }}
            >
              <text className="ActBtnText">↑</text>
            </view>
            <view
              className={
                index === sheet.items.length - 1 ? 'ActBtn ActBtn--off' : 'ActBtn'
              }
              bindtap={() => {
                handleMove(index, 1);
              }}
            >
              <text className="ActBtnText">↓</text>
            </view>
            <view
              className="ActBtn"
              bindtap={() => {
                setPendingDelete({ index, name: item.name });
              }}
            >
              <text className="ActBtnText">×</text>
            </view>
          </view>
        </view>
        {error ? <text className="RowError">{error}</text> : null}
      </view>
    );
  };

  const renderCard = (item: Item, index: number) => {
    const row = timeline.rows[index];
    const open = expanded === index;
    const durKey = `dur-${item.id}`;
    const lockKey = `lock-${item.id}`;
    const error = rowError && rowError.id === item.id ? rowError.message : null;

    return (
      <view key={item.id} className="Card">
        <view
          className="CardHead"
          bindtap={() => {
            setExpanded(open ? null : index);
          }}
        >
          <text className="CardNo">{pad3(index + 1)}</text>
          <text className="CardName">
            {item.name.length > 0 ? item.name : '未命名环节'}
          </text>
          <text className="CardMeta">
            {`${item.durationMin} 分钟 · ${formatClock(row.planStart)}`}
          </text>
          <text className="CardToggle">{open ? '∧' : '∨'}</text>
        </view>

        {open ? (
          <view className="CardBody">
            <view className="Field">
              <text className="FieldLabel">名称</text>
              <input
                className="FieldInput"
                maxlength={20}
                placeholder="环节名称"
                default-value={item.name}
                bindinput={(event) => {
                  handleField(index, 'name', event);
                }}
              />
            </view>
            <view className="Field">
              <text className="FieldLabel">时长</text>
              <input
                key={`${durKey}-${revOf(durKey)}`}
                className="FieldInput FieldInput--mono"
                type="number"
                maxlength={3}
                default-value={durationText(item)}
                bindblur={(event) => {
                  commitDuration(index, item, event);
                }}
              />
              <text className="FieldUnit">分钟</text>
            </view>
            <view className="Field">
              <text className="FieldLabel">负责人</text>
              <input
                className="FieldInput"
                maxlength={20}
                placeholder="负责人"
                default-value={item.owner}
                bindinput={(event) => {
                  handleField(index, 'owner', event);
                }}
              />
            </view>
            <view className="Field">
              <text className="FieldLabel">备注</text>
              <input
                className="FieldInput"
                maxlength={200}
                placeholder="备注"
                default-value={item.note}
                bindinput={(event) => {
                  handleField(index, 'note', event);
                }}
              />
            </view>
            <view className="Field">
              <text className="FieldLabel">锁定</text>
              {item.locked === true ? (
                <view className="CardLockGroup">
                  <Badge kind="stamp" label={lockText(item)} />
                  <input
                    key={`${lockKey}-${revOf(lockKey)}`}
                    className="FieldInput FieldInput--lock"
                    placeholder="HH:MM"
                    maxlength={5}
                    default-value={item.lockAt === null ? '' : formatClock(item.lockAt)}
                    bindblur={(event) => {
                      commitLock(index, item, event);
                    }}
                  />
                  <view
                    className="LockOff"
                    bindtap={() => {
                      handleToggleLock(index);
                    }}
                  >
                    <text className="LockOffText">解除</text>
                  </view>
                </view>
              ) : (
                <view
                  className="LockBtn"
                  bindtap={() => {
                    handleToggleLock(index);
                  }}
                >
                  <text className="LockBtnText">LOCK</text>
                </view>
              )}
            </view>

            {error ? <text className="CardError">{error}</text> : null}

            <view className="CardActions">
              <view
                className={index === 0 ? 'CardAction CardAction--off' : 'CardAction'}
                bindtap={() => {
                  handleMove(index, -1);
                }}
              >
                <text className="CardActionText">上移</text>
              </view>
              <view
                className={
                  index === sheet.items.length - 1
                    ? 'CardAction CardAction--off'
                    : 'CardAction'
                }
                bindtap={() => {
                  handleMove(index, 1);
                }}
              >
                <text className="CardActionText">下移</text>
              </view>
              <view
                className="CardAction"
                bindtap={() => {
                  setPendingDelete({ index, name: item.name });
                }}
              >
                <text className="CardActionText">删除</text>
              </view>
            </view>
          </view>
        ) : null}
      </view>
    );
  };

  return (
    <view className="Editor theme-light">
      <view className="EditorHeader">
        <view className="EditorHeaderInner">
          <view className="EditorHeadRow">
            <view className="EditorBack" bindtap={onBack}>
              <text className="EditorBackText">← 手册</text>
            </view>
            <input
              className="EditorName"
              maxlength={40}
              placeholder="未命名手册"
              default-value={sheet.name}
              bindinput={handleName}
            />
            <view className="EditorPublish">
              <Button
                label="发布"
                className="EditorPublishBtn"
                onTap={handlePublish}
              />
            </view>
          </view>

          <view className="EditorMeta">
            <view className="MetaItem">
              <text className="MetaLabel">DATE</text>
              <text className="MetaValue">{sheet.date}</text>
            </view>
            <view className="MetaItem">
              <text className="MetaLabel">START</text>
              <input
                key={`start-${revOf('start')}`}
                className="StartInput"
                maxlength={5}
                placeholder="HH:MM"
                default-value={formatClock(sheet.startMin)}
                bindblur={handleStartBlur}
              />
            </view>
            <view className="MetaItem">
              <text className="MetaLabel">DUR</text>
              <text className="MetaValue">{formatDuration(timeline.totalPlanMin)}</text>
            </view>
            <view className="MetaItem">
              <text className="MetaLabel">SEG</text>
              <text className="MetaValue">{`${pad2(sheet.items.length)} / ${MAX_ITEMS}`}</text>
            </view>
            <view className="MetaItem">
              <text className="MetaValue">{`V${sheet.version}`}</text>
            </view>
            <view className="MetaBadge">
              <Badge kind="outline" label={STATUS_LABEL[sheet.status]} />
            </view>
            {sheet.dirty ? (
              <view className="MetaBadge">
                <Badge kind="reverse" label="有未发布的修改" />
              </view>
            ) : null}
            {conflicts.length > 0 ? (
              <view className="MetaBadge">
                <Badge kind="stamp" label={`锁定冲突 ${conflicts.length}`} />
              </view>
            ) : null}
          </view>

          {startError ? (
            <text className="EditorInlineError">时间格式应为 HH:MM</text>
          ) : null}

          <view className="EditorTools">
            <view className="EditorToolBtn">
              <Button
                label="按时排序"
                kind="tertiary"
                className="EditorSmallBtn"
                onTap={handleSort}
              />
            </view>
            <view className="EditorToolBtn">
              <Button
                label="添加环节"
                kind="tertiary"
                className="EditorSmallBtn"
                disabled={atLimit}
                onTap={handleAdd}
              />
            </view>
            <view className="EditorToolHint">
              <text className="EditorHintText">修改后自动保存</text>
            </view>
          </view>

          {errors && errors.length > 0 ? (
            <view className="ErrorBar">
              <view className="ErrorBarBody">
                {errors.slice(0, 3).map((error, position) => (
                  <text className="ErrorLine" key={`${error.field}-${position}`}>
                    {errorLine(error)}
                  </text>
                ))}
              </view>
              <view
                className="ErrorClose"
                bindtap={() => {
                  setErrors(null);
                }}
              >
                <text className="ErrorCloseText">关闭</text>
              </view>
            </view>
          ) : null}
        </view>
      </view>

      <view className={isWide ? 'EditorBody' : 'EditorBody EditorBody--narrow'}>
        {isWide ? (
          <view className="EditorTable">
            <view className="TableHead">
              <view className="ColNo">
                <text className="Th">NO.</text>
              </view>
              <view className="ColTime">
                <text className="Th">TIME</text>
              </view>
              <view className="ColSegName">
                <text className="Th">SEGMENT</text>
              </view>
              <view className="ColDur">
                <text className="Th">DUR</text>
              </view>
              <view className="ColOwner">
                <text className="Th">OWNER</text>
              </view>
              <view className="ColNote">
                <text className="Th">NOTE</text>
              </view>
              <view className="ColLock">
                <text className="Th">LOCK</text>
              </view>
              <view className="ColAct">
                <text className="Th">ACT</text>
              </view>
            </view>
            {sheet.items.map((item, index) => renderRow(item, index))}
          </view>
        ) : (
          <view className="Cards">
            {sheet.items.map((item, index) => renderCard(item, index))}
          </view>
        )}

        <view className="EditorFooter">
          <view
            className={atLimit ? 'EditorAdd EditorAdd--off' : 'EditorAdd'}
            bindtap={() => {
              if (atLimit) return;
              handleAdd();
            }}
          >
            <text className="EditorAddText">+ 添加环节</text>
          </view>
          {atLimit ? (
            <text className="EditorAddHint">已达单份手册上限 60 个环节</text>
          ) : null}
        </view>
      </view>

      {pendingDelete ? (
        <view
          className="EditorOverlay"
          bindtap={() => {
            setPendingDelete(null);
          }}
        >
          <view className="EditorPanel" catchtap={() => {}}>
            <view className="EditorPanelRule" />
            <text className="EditorPanelTitle">
              {`删除环节「${pendingDelete.name}」？`}
            </text>
            <text className="EditorPanelBody">删除后不可撤销。</text>
            <view className="EditorPanelActions">
              <view className="EditorPanelAction">
                <Button
                  label="取消"
                  kind="tertiary"
                  onTap={() => {
                    setPendingDelete(null);
                  }}
                />
              </view>
              <view className="EditorPanelAction">
                <Button label="删除" kind="secondary" onTap={handleDelete} />
              </view>
            </view>
          </view>
        </view>
      ) : null}

      {published ? (
        <view className="EditorOverlay">
          <view className="EditorPanel" catchtap={() => {}}>
            <view className="EditorPanelRule" />
            <text className="EditorPanelTitle">{`已发布 V${published.version}`}</text>
            <text className="EditorPanelBody">
              分发能力（二维码 / 文件 / 短码）即将接入
            </text>
            <view className="EditorPanelActions">
              <view className="EditorPanelAction">
                <Button
                  label="继续编辑"
                  kind="tertiary"
                  onTap={() => {
                    setPublished(null);
                  }}
                />
              </view>
              <view className="EditorPanelAction">
                <Button
                  label="开始执行"
                  onTap={() => {
                    onStartRuntime(sheet.id);
                  }}
                />
              </view>
            </view>
          </view>
        </view>
      ) : null}
    </view>
  );
}
