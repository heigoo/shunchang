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

test('falls back to the file hint for a 45-step sheet', async () => {
  const { container, findByText, queryByText } = render(
    <PublishPanel
      sheet={makeSheet(45)}
      onClose={() => {}}
      onStart={() => {}}
    />,
  );

  expect(await findByText('环节较多，请使用文件分发')).toBeInTheDocument();
  expect(queryByText(/扫码跟随/)).toBeNull();
  expect(container.querySelectorAll('svg, x-svg, img').length).toBe(0);
});

test('renders the QR code for a 10-step sheet', async () => {
  const { container, findByText } = render(
    <PublishPanel
      sheet={makeSheet(10)}
      onClose={() => {}}
      onStart={() => {}}
    />,
  );

  expect(await findByText(/扫码跟随/)).toBeInTheDocument();
  expect(container.querySelectorAll('svg, x-svg, img').length).toBeGreaterThan(0);
});
