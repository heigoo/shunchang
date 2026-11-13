import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest } from '../../store/repository';
import { PublishPanel } from '../PublishPanel';

function makeSheet(itemCount: number): Sheet {
  return {
    id: `sheet-publish-${itemCount}`,
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: Array.from({ length: itemCount }, (_value, index) => ({
      id: `item-${index}`,
      name: `环节 ${index + 1}`,
      durationMin: 10,
      owner: '',
      note: '',
      lockAt: null,
    })),
    status: 'published',
    version: 2,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('falls back to the link and file hints for a 45-step sheet', async () => {
  const { container, findByText, queryByText } = render(
    <PublishPanel
      sheet={makeSheet(45)}
      onClose={() => {}}
      onStart={() => {}}
    />,
  );

  expect(await findByText('环节较多，请用链接或文件分发')).toBeInTheDocument();
  expect(await findByText('复制完整链接')).toBeInTheDocument();
  expect(await findByText('系统分享')).toBeInTheDocument();
  expect(queryByText(/扫码跟随/)).toBeNull();
  expect(container.querySelectorAll('svg, x-svg, img').length).toBe(0);
});

test('renders the QR code and the full link for a 10-step sheet', async () => {
  const { container, findByText } = render(
    <PublishPanel
      sheet={makeSheet(10)}
      onClose={() => {}}
      onStart={() => {}}
    />,
  );

  expect(await findByText(/扫码跟随/)).toBeInTheDocument();
  expect(await findByText('复制完整链接')).toBeInTheDocument();
  expect(container.querySelectorAll('svg, x-svg, img').length).toBeGreaterThan(0);
});

test('keeps the QR for a sheet with long notes', async () => {
  const sheet = makeSheet(10);
  sheet.items[0].note = '请与酒店确认灯光、音乐与上菜节奏，并提前五分钟提醒所有负责人'.repeat(4);

  const { findByText } = render(
    <PublishPanel
      sheet={sheet}
      onClose={() => {}}
      onStart={() => {}}
    />,
  );

  // 二维码用精简载荷，备注被截断；完整链接仍可用。
  expect(await findByText(/扫码跟随/)).toBeInTheDocument();
  expect(await findByText('复制完整链接')).toBeInTheDocument();
});
