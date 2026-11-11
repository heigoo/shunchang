import { useEffect, useState } from '@lynx-js/react';

// 0 表示「尚未测量」，首帧按窄屏渲染，避免在手机上先闪一版宽屏布局。
const FALLBACK_WIDTH = 0;

function readGlobalWidth(): number | null {
  try {
    const global = globalThis as any;
    if (typeof global.innerWidth === 'number' && global.innerWidth > 0) {
      return global.innerWidth;
    }
    const win = global.window;
    if (win && typeof win.innerWidth === 'number' && win.innerWidth > 0) {
      return win.innerWidth;
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
    if (info && typeof info.screenWidth === 'number' && info.screenWidth > 0) {
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
  const [width, setWidth] = useState<number>(() => getViewportWidth());

  useEffect(() => {
    let cancelled = false;
    const applyWidth = (next: number) => {
      if (!cancelled && next > 0) {
        setWidth(next);
      }
    };

    measureRootWidth(applyWidth);

    try {
      const win = (globalThis as any).window;
      if (!win || typeof win.addEventListener !== 'function') {
        return undefined;
      }
      const handleResize = () => {
        applyWidth(getViewportWidth());
      };
      win.addEventListener('resize', handleResize);
      return () => {
        cancelled = true;
        if (typeof win.removeEventListener === 'function') {
          win.removeEventListener('resize', handleResize);
        }
      };
    } catch {
      return () => {
        cancelled = true;
      };
    }
  }, []);

  return width >= breakpoint;
}
