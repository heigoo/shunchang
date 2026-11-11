import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { expect, test } from '@rstest/core';

import { App } from '../App';
import { clearAllForTest } from '../store/repository';

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
