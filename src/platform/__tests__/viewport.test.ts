import { afterEach, describe, expect, it } from '@rstest/core';

import { getViewportWidth } from '../viewport';

const globalAny = globalThis as any;

afterEach(() => {
  delete globalAny.lynx;
  globalAny.innerWidth = 0;
  globalAny.window = undefined;
});

function useNativeInfo(info: Record<string, unknown>): void {
  globalAny.innerWidth = 0;
  globalAny.window = undefined;
  globalAny.lynx = {
    getSystemInfoSync: () => info,
  };
}

describe('getViewportWidth', () => {
  it('把物理像素换算为逻辑宽度，忽略 siteWidth', () => {
    useNativeInfo({
      pixelWidth: 1440,
      pixelRatio: 4,
      screenWidth: 1440,
    });
    globalAny.lynx.__globalProps = { siteWidth: 1440 };

    expect(getViewportWidth()).toBe(360);
  });

  it('没有 pixelWidth 时回退到 screenWidth', () => {
    useNativeInfo({ screenWidth: 390 });

    expect(getViewportWidth()).toBe(390);
  });

  it('优先使用浏览器 window.innerWidth', () => {
    globalAny.window = { innerWidth: 1280 };
    globalAny.lynx = {
      getSystemInfoSync: () => ({ pixelWidth: 1440, pixelRatio: 4 }),
    };

    expect(getViewportWidth()).toBe(1280);
  });
});
