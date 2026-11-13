import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { expect, test } from '@rstest/core';

import { App } from '../App';
import { clearAllForTest } from '../store/repository';

const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

function setLocation(search: string): void {
  Object.defineProperty(globalThis, 'location', {
    value: {
      origin: 'https://follow.example.com',
      pathname: '/follow.html',
      search,
      hash: '',
    },
    configurable: true,
  });
}

function restoreLocation(): void {
  if (originalLocation) {
    Object.defineProperty(globalThis, 'location', originalLocation);
    return;
  }
  delete (globalThis as any).location;
}

test('renders the shunchang shell', async () => {
  clearAllForTest();

  const view = render(<App />);
  // 原生端存储需要异步水合，首帧可能为空；等待一次水合完成。
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });

  expect(view.container.textContent).toContain('顺场');
  expect(view.container.textContent).toContain('还没有手册');
});

test('opens the read-only follow view when ?follow=1 is present', async () => {
  clearAllForTest();
  setLocation('?follow=1');

  try {
    const view = render(<App />);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });

    expect(view.container.textContent).toContain('跟随现场');
    expect(view.container.textContent).toContain('载入手册');
    expect(view.container.textContent).not.toContain('还没有手册');
    expect(view.container.textContent).not.toContain('新建手册');
    expect(view.container.textContent).not.toContain('退出跟随');
    expect(view.container.textContent).not.toContain('返回手册列表');
  } finally {
    restoreLocation();
  }
});
