export interface DesktopStorageBridge {
  getAll(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

declare const NativeModules: any;

// NativeModules 由桌面壳在页面启动后注入，检测必须延迟到运行时。
let cachedBridge: DesktopStorageBridge | null = null;

function readBridge(): DesktopStorageBridge | null {
  if (cachedBridge) {
    return cachedBridge;
  }

  try {
    if (typeof NativeModules === 'undefined' || !NativeModules) {
      return null;
    }
    const exposed = NativeModules.nodejs?.exposed;
    const bridge = exposed?.shunchangStorage;
    if (
      !bridge ||
      typeof bridge.getAll !== 'function' ||
      typeof bridge.set !== 'function' ||
      typeof bridge.remove !== 'function'
    ) {
      return null;
    }
    cachedBridge = bridge as DesktopStorageBridge;
    return cachedBridge;
  } catch {
    return null;
  }
}

export function isDesktopRuntime(): boolean {
  return getDesktopStorage() !== null;
}

export function getDesktopStorage(): DesktopStorageBridge | null {
  return readBridge();
}

/** 仅供测试：清除延迟检测缓存，便于模拟不同宿主环境。 */
export function resetDesktopRuntimeForTest(): void {
  cachedBridge = null;
}
