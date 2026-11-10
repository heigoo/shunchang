import { useEffect, useState } from '@lynx-js/react';

const FALLBACK_WIDTH = 1024;

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
  try {
    const win = (globalThis as any).window;
    if (win && typeof win.innerWidth === 'number' && win.innerWidth > 0) {
      return win.innerWidth;
    }
  } catch {
    // Accessing window may throw in restricted runtimes.
  }

  return readNativeWidth() ?? FALLBACK_WIDTH;
}

export function useIsWide(breakpoint = FALLBACK_WIDTH): boolean {
  const [width, setWidth] = useState<number>(() => getViewportWidth());

  useEffect(() => {
    try {
      const win = (globalThis as any).window;
      if (!win || typeof win.addEventListener !== 'function') {
        return undefined;
      }
      const handleResize = () => {
        setWidth(getViewportWidth());
      };
      win.addEventListener('resize', handleResize);
      return () => {
        if (typeof win.removeEventListener === 'function') {
          win.removeEventListener('resize', handleResize);
        }
      };
    } catch {
      return undefined;
    }
  }, []);

  return width >= breakpoint;
}
