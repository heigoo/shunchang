declare const NativeModules: any;

/** 系统栏安全区（dp）。 */
export interface SafeInsets {
  top: number;
  bottom: number;
}

export const EMPTY_INSETS: SafeInsets = { top: 0, bottom: 0 };

/** 主动向宿主索取一次状态栏 / 导航栏高度。 */
export function requestSafeInsets(): void {
  try {
    NativeModules?.ShunchangHost?.requestInsets?.();
  } catch {
    // Web 或旧宿主没有该能力，保持 0。
  }
}

/** 切换状态栏 / 导航栏图标明暗；dark=true 表示暗色页面用浅色图标。 */
export function applyBarsStyle(dark: boolean): void {
  try {
    NativeModules?.ShunchangHost?.setBarsStyle?.(dark ? 'dark' : 'light');
  } catch {
    // Web 或旧宿主没有该能力。
  }
}

/** 兼容原生以数组或对象形式下发的事件参数。 */
export function readInsetsEvent(payload: any): SafeInsets | null {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const data =
    first && typeof first === 'object' && first.data ? first.data : first;
  if (!data || typeof data.top !== 'number') {
    return null;
  }
  return {
    top: Math.max(0, Math.round(data.top)),
    bottom: Math.max(0, Math.round(data.bottom ?? 0)),
  };
}
