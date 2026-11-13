import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { afterEach, beforeEach, expect, test } from '@rstest/core';

import { resetDesktopRuntimeForTest } from '../../platform/desktop';
import { ThemePanel } from '../ThemePanel';

function installDesktopBridge(): void {
  (globalThis as any).NativeModules = {
    nodejs: {
      exposed: {
        shunchangStorage: {
          getAll: async () => ({}),
          set: async () => undefined,
          remove: async () => undefined,
        },
      },
    },
  };
}

function clearNativeModules(): void {
  delete (globalThis as any).NativeModules;
}

function renderPanel() {
  return render(
    <ThemePanel theme="default" onSelect={() => {}} onClose={() => {}} />,
  );
}

beforeEach(() => {
  clearNativeModules();
  resetDesktopRuntimeForTest();
});

afterEach(() => {
  clearNativeModules();
  resetDesktopRuntimeForTest();
});

test('uses the no-restart copy on web', async () => {
  const { findByText, queryByText } = renderPanel();

  expect(
    await findByText('切换仅影响界面配色，应用不会重启'),
  ).toBeInTheDocument();
  expect(
    await findByText('桌面图标在安装包中固定，运行时不更换'),
  ).toBeInTheDocument();
  expect(queryByText('切换后自动重启并更换桌面图标')).toBeNull();
});

test('shows desktop copy when the lynxtron bridge exists', async () => {
  installDesktopBridge();
  resetDesktopRuntimeForTest();

  const { findByText, queryByText } = renderPanel();

  expect(
    await findByText('切换仅影响界面配色，应用不会重启'),
  ).toBeInTheDocument();
  expect(
    await findByText('桌面图标在安装包中固定，运行时不更换'),
  ).toBeInTheDocument();
  expect(queryByText('切换后自动重启并更换桌面图标')).toBeNull();
});
