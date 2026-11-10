import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet, SheetStatus } from '../../domain/types';
import { clearAllForTest, saveSheet } from '../../store/repository';
import { ListScreen } from '../ListScreen';

function makeSheet(
  id: string,
  name: string,
  status: SheetStatus = 'draft',
): Sheet {
  return {
    id,
    name,
    date: '2026-11-10',
    startMin: 480,
    items: [
      {
        id: `${id}-item`,
        name: '迎宾签到',
        durationMin: 30,
        owner: '督导',
        note: '',
        lockAt: null,
      },
    ],
    status,
    version: 1,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('renders saved sheet names', async () => {
  saveSheet(makeSheet('sheet-a', '中式婚礼流程'));
  saveSheet(makeSheet('sheet-b', '年会流程', 'published'));

  const { findByText } = render(
    <ListScreen onOpenSheet={() => {}} onOpenFollow={() => {}} />,
  );

  expect(await findByText('中式婚礼流程')).toBeInTheDocument();
  expect(await findByText('年会流程')).toBeInTheDocument();
});

test('shows the empty state when no sheets exist', async () => {
  const { findByText } = render(
    <ListScreen onOpenSheet={() => {}} onOpenFollow={() => {}} />,
  );

  expect(await findByText('还没有手册')).toBeInTheDocument();
});
