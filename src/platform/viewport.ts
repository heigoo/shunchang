import { useEffect, useState } from '@lynx-js/react';

// 0 表示「尚未测量」，首帧按窄屏渲染，避免在手机上先闪一版宽屏布局。
const FALLBACK_WIDTH = 0;

// 折叠屏展开 / 平板竖屏起用宽屏排布；桌面与平板横屏用完整宽屏列。
export const BREAKPOINT_TABLET = 700;
export const BREAKPOINT_DESKTOP = 1024;
export const BREAKPOINT_PRINT_WIDE = 1170;

// Web 端运行在 Worker 中，读不到 window.innerWidth；由根节点 layoutchange 上报真实宽度。
let latestWidth = 0;
const widthListeners = new Set<(width: number) => void>();

export function reportViewportWidth(width: number): void {
  if (!(width > 0) || width === latestWidth) {
    return;
  }
  latestWidth = width;
  widthListeners.forEach((listener) => listener(width));
}

function readGlobalWidth(): number | null {
  try {
    const global = globalThis as any;
    const win = global.window;
    if (win && typeof win.innerWidth === 'number' && win.innerWidth > 0) {
      return win.innerWidth;
    }
    // Web Worker 没有 window；仅在有 WorkerGlobalScope 时使用全局 innerWidth。
    if (
      typeof global.WorkerGlobalScope !== 'undefined' &&
      typeof global.innerWidth === 'number' &&
      global.innerWidth > 0
    ) {
      return global.innerWidth;
    }
  } catch {
    // Accessing window may throw in restricted runtimes.
  }
  return null;
}

function readNativeWidth(): number | null {
  try {
    const lynx = (globalThis as any).lynx;
    if (!lynx || typeof lynx.getSystemInfoSync !== 'function') {
      return null;
    }
    const info = lynx.getSystemInfoSync();
    if (!info) {
      return null;
    }
    // pixelWidth 是物理像素，必须除以 pixelRatio 才能与 CSS 断点比较。
    if (
      typeof info.pixelWidth === 'number' &&
      info.pixelWidth > 0 &&
      typeof info.pixelRatio === 'number' &&
      info.pixelRatio > 0
    ) {
      return info.pixelWidth / info.pixelRatio;
    }
    if (typeof info.screenWidth === 'number' && info.screenWidth > 0) {
      return info.screenWidth;
    }
  } catch {
    // Platform API is best-effort only.
  }
  return null;
}

export function getViewportWidth(): number {
  const globalWidth = readGlobalWidth();
  if (globalWidth !== null) {
    return globalWidth;
  }

  const nativeWidth = readNativeWidth();
  if (nativeWidth !== null) {
    return nativeWidth;
  }

  return FALLBACK_WIDTH;
}

function measureRootWidth(onWidth: (width: number) => void): void {
  try {
    const lynx = (globalThis as any).lynx;
    if (!lynx || typeof lynx.createSelectorQuery !== 'function') {
      return;
    }
    lynx
      .createSelectorQuery()
      .selectRoot()
      .boundingClientRect((rect: { width?: number } | null) => {
        if (rect && typeof rect.width === 'number' && rect.width > 0) {
          onWidth(rect.width);
        }
      })
      .exec();
  } catch {
    // Layout measurement is best-effort only.
  }
}

export function useIsWide(breakpoint = 1024): boolean {
  const [width, setWidth] = useState<number>(() =>
    latestWidth > 0 ? latestWidth : getViewportWidth(),
  );

  useEffect(() => {
    let cancelled = false;
    const applyWidth = (next: number) => {
      if (!cancelled && next > 0) {
        setWidth(next);
      }
    };

    widthListeners.add(applyWidth);
    if (latestWidth > 0) {
      applyWidth(latestWidth);
    }

    // 首帧可能还没完成布局，Web 上 layoutchange 也不一定补发；
    // 这里做几次有界重测，拿到宽度就停止依赖计时器。
    const timers: ReturnType<typeof setTimeout>[] = [];
    const measure = () => measureRootWidth(applyWidth);
    measure();
    [80, 240, 800].forEach((delay) => {
      timers.push(setTimeout(measure, delay));
    });

    let removeResize: (() => void) | null = null;

    try {
      const win = (globalThis as any).window;
      if (win && typeof win.addEventListener === 'function') {
        const handleResize = () => {
          applyWidth(getViewportWidth());
        };
        win.addEventListener('resize', handleResize);
        removeResize = () => {
          if (typeof win.removeEventListener === 'function') {
            win.removeEventListener('resize', handleResize);
          }
        };
      }
    } catch {
      // Web Worker 或受限运行时没有 window，忽略即可。
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      widthListeners.delete(applyWidth);
      removeResize?.();
    };
  }, []);

  return width >= breakpoint;
}
