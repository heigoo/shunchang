import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import { listCustomTemplates, saveSheetAsTemplate } from '../../domain/customTemplates';
import type { Sheet } from '../../domain/types';
import { clearAllForTest, getSheet, saveSheet } from '../../store/repository';
import { ListScreen } from '../ListScreen';

function makeSheet(id = 'sheet-1', name = '秋季婚礼流程'): Sheet {
  return {
    id,
    name,
    date: '2026-11-10',
    startMin: 480,
    items: [
      {
        id: `${id}-item-a`,
        name: '迎宾签到',
        durationMin: 30,
        owner: '督导',
        note: '门口立牌',
        lockAt: 510,
        locked: true,
      },
      {
        id: `${id}-item-b`,
        name: '仪式开始',
        durationMin: 20,
        owner: '司仪',
        note: '',
        lockAt: null,
      },
    ],
    status: 'published',
    version: 2,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('lists custom templates in the create panel and creates a draft from one', async () => {
  saveSheetAsTemplate(makeSheet(), '秋日模板');

  let createdId: string | null = null;
  const { findByText } = render(
    <ListScreen
      onOpenSheet={() => {}}
      onOpenFollow={() => {}}
      onImported={() => {}}
      onCreate={(id) => {
        createdId = id;
      }}
    />,
  );

  fireEvent.tap(await findByText('新建手册'));

  expect(await findByText('我的模板')).toBeInTheDocument();
  expect(await findByText('秋日模板')).toBeInTheDocument();

  fireEvent.tap(await findByText('秋日模板'));

  expect(createdId).not.toBeNull();
  const created = getSheet(createdId!);
  expect(created?.name).toBe('秋日模板');
  expect(created?.items.map((item) => item.name)).toEqual([
    '迎宾签到',
    '仪式开始',
  ]);
  expect(created?.items[0].locked).toBe(true);
  expect(created?.items[0].lockAt).toBeNull();
});

test('renames and deletes a custom template from the manage panel', async () => {
  saveSheetAsTemplate(makeSheet(), '秋日模板');

  const { container, findByText } = render(
    <ListScreen
      onOpenSheet={() => {}}
      onOpenFollow={() => {}}
      onImported={() => {}}
    />,
  );

  fireEvent.tap(await findByText('新建手册'));
  fireEvent.tap(await findByText('管理'));

  expect(await findByText('重命名或删除本地模板')).toBeInTheDocument();

  const dangerAction = container.querySelector('.TemplateManageAction--danger');
  expect(dangerAction).not.toBeNull();
  fireEvent.tap(dangerAction!);

  expect(await findByText('删除模板')).toBeInTheDocument();

  const actions = container.querySelectorAll('.PanelAction .Btn');
  fireEvent.tap(actions[actions.length - 1]!);

  expect(listCustomTemplates()).toEqual([]);
});

test('saves a sheet as a template from the sheet actions panel', async () => {
  saveSheet(makeSheet());

  const { container, findByText } = render(
    <ListScreen
      onOpenSheet={() => {}}
      onOpenFollow={() => {}}
      onImported={() => {}}
    />,
  );

  const more = container.querySelector('.RowAction');
  expect(more).not.toBeNull();
  // 行内“更多”用 catchtap 阻止冒泡，测试需按 catch 事件派发。
  fireEvent.tap(more!, { eventType: 'catchEvent' });

  fireEvent.tap(await findByText('另存为模板'));

  expect(await findByText('已保存为模板')).toBeInTheDocument();

  fireEvent.tap(await findByText('新建手册'));
  expect(await findByText('秋季婚礼流程 模板')).toBeInTheDocument();
});
