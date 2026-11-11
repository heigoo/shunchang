import { useEffect, useRef, useState } from '@lynx-js/react';

export const EXIT_DURATION = 220;

export interface PresenceState {
  mounted: boolean;
  closing: boolean;
}

/**
 * 让条件渲染的浮层在关闭时先播放退场动画，再真正卸载。
 * `open` 变为 false 后，`mounted` 会保持 true 约 `duration` 毫秒，
 * 期间 `closing` 为 true，用于挂退场样式。
 */
export function usePresence(
  open: boolean,
  duration: number = EXIT_DURATION,
): PresenceState {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const mountedRef = useRef(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (open) {
      mountedRef.current = true;
      setMounted(true);
      setClosing(false);
      return;
    }

    if (!mountedRef.current) {
      return;
    }

    setClosing(true);
    timerRef.current = setTimeout(() => {
      mountedRef.current = false;
      setMounted(false);
      setClosing(false);
      timerRef.current = null;
    }, duration);
  }, [open, duration]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { mounted, closing };
}
