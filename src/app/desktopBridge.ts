import { isDesktopRuntime } from '../platform/desktop';

export interface DesktopPickJsonResult {
  canceled?: boolean;
  text?: string;
  error?: string;
}

export interface DesktopSaveJsonResult {
  canceled?: boolean;
  path?: string;
  error?: string;
}

interface BridgeCaller {
  call(
    method: string,
    params: unknown,
    callback: (result: unknown) => void,
  ): void;
}

interface NativeModulesHost {
  bridge?: BridgeCaller;
}

declare const NativeModules: NativeModulesHost | undefined;

function readBridge(): BridgeCaller | null {
  try {
    if (typeof NativeModules === 'undefined' || !NativeModules) {
      return null;
    }
    const bridge = NativeModules.bridge;
    return bridge && typeof bridge.call === 'function' ? bridge : null;
  } catch {
    return null;
  }
}

/**
 * 调用桌面壳的 bridge 方法；超时、异常或宿主不支持时返回 null。
 * 宿主在页面启动后才注入 NativeModules，因此检测必须延迟到运行时。
 */
export function callDesktopBridge<T>(
  method: string,
  params: unknown,
  timeoutMs: number = 15000,
): Promise<T | null> {
  if (!isDesktopRuntime()) {
    return Promise.resolve(null);
  }
  const bridge = readBridge();
  if (!bridge) {
    return Promise.resolve(null);
  }

  return new Promise<T | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: T | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      resolve(value);
    };

    try {
      bridge.call(method, params, (result: unknown) => {
        finish(result === undefined || result === null ? null : (result as T));
      });
    } catch {
      finish(null);
      return;
    }

    if (settled) {
      return;
    }
    timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);
  });
}

export async function desktopPickJson(): Promise<string | null> {
  const result = await callDesktopBridge<DesktopPickJsonResult>(
    'shunchang.pickJsonFile',
    {},
  );
  if (!result || result.error || typeof result.text !== 'string') {
    return null;
  }
  return result.text;
}

export async function desktopSaveJson(
  filename: string,
  text: string,
): Promise<boolean> {
  const result = await callDesktopBridge<DesktopSaveJsonResult>(
    'shunchang.saveJsonFile',
    { filename, text },
  );
  return !!result && result.canceled === false && !result.error;
}
