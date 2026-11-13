import pipe from 'sparkling-method';
import { getItem, setItem } from 'sparkling-storage';

import {
  webStorageRead,
  webStorageRemove,
  webStorageWrite,
} from '../app/webBridge';
import {
  getDesktopStorage,
  isDesktopRuntime,
  resetDesktopRuntimeForTest,
} from '../platform/desktop';

export interface KVStore {
  get(key: string): string | null;
  /** 返回是否真正落到持久化后端；仅内存兜底时返回 false。 */
  set(key: string, value: string): boolean;
  setAsync?(key: string, value: string): Promise<void>;
  remove(key: string): void;
  hydrate?(keys: string[]): Promise<void>;
}

type Backend =
  | 'web'
  | 'web-bridge'
  | 'desktop'
  | 'sparkling-storage'
  | 'lynx-sync'
  | 'lynx-async'
  | 'lynx-session'
  | 'memory';

declare const NativeModules: any;

const memory = new Map<string, string>();

function getWindow(): any {
  try {
    return (globalThis as any).window;
  } catch {
    return undefined;
  }
}

function getLynx(): any {
  try {
    return (globalThis as any).lynx;
  } catch {
    return undefined;
  }
}

function hasSparklingStorage(): boolean {
  // Sparkling 容器把 Method pipe 注入为 spkPipe；裸标识符访问，globalThis 上可能取不到。
  try {
    if (typeof NativeModules !== 'undefined' && NativeModules) {
      return !!NativeModules.spkPipe && typeof NativeModules.spkPipe.call === 'function';
    }
  } catch {
    // Ignore.
  }
  return false;
}

function detectBackend(): Backend {
  if (hasSparklingStorage()) {
    return 'sparkling-storage';
  }

  if (isDesktopRuntime()) {
    return 'desktop';
  }

  try {
    const win = getWindow();
    if (win && win.localStorage && typeof win.localStorage.getItem === 'function') {
      return 'web';
    }
  } catch {
    // Accessing localStorage may throw in privacy mode.
  }

  // 浏览器把 React 跑在 Worker 里，拿不到 window；通过主线程桥读写宿主 localStorage。
  try {
    const worker =
      typeof (globalThis as any).WorkerGlobalScope !== 'undefined' ||
      typeof (globalThis as any).importScripts === 'function';
    if (worker) {
      return 'web-bridge';
    }
  } catch {
    // Ignore broken globals.
  }

  try {
    const lynx = getLynx();
    if (
      lynx &&
      typeof lynx.getStorageSync === 'function' &&
      typeof lynx.setStorageSync === 'function'
    ) {
      return 'lynx-sync';
    }
    if (
      lynx &&
      typeof lynx.getStorage === 'function' &&
      typeof lynx.setStorage === 'function'
    ) {
      return 'lynx-async';
    }
    if (
      lynx &&
      typeof lynx.getSessionStorageItem === 'function' &&
      typeof lynx.setSessionStorageItem === 'function'
    ) {
      return 'lynx-session';
    }
  } catch {
    // Ignore broken global objects.
  }

  return 'memory';
}

const backend: Backend = detectBackend();

function getLocalStorage(): any {
  const win = getWindow();
  return win ? win.localStorage : null;
}

function nativeValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw && typeof (raw as any).data === 'string') {
    return (raw as any).data;
  }
  return null;
}

function readWeb(key: string): string | null {
  try {
    const localStorage = getLocalStorage();
    if (!localStorage) {
      return memory.get(key) ?? null;
    }
    const value = localStorage.getItem(key);
    if (typeof value === 'string') {
      return value;
    }
    return memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeWeb(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    const localStorage = getLocalStorage();
    if (!localStorage) {
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

function readWebBridge(key: string): string | null {
  return memory.get(key) ?? null;
}

function writeWebBridge(key: string, value: string): boolean {
  memory.set(key, value);
  webStorageWrite(key, value);
  return true;
}

function removeWebBridge(key: string): void {
  memory.delete(key);
  webStorageRemove(key);
}

async function hydrateWebBridge(keys: string[]): Promise<void> {
  const values = await webStorageRead(keys);
  keys.forEach((key) => {
    const value = values[key];
    if (!memory.has(key) && typeof value === 'string') {
      memory.set(key, value);
    }
  });
}

function unwrapSparkling(response: unknown): string | null {
  const res = response as any;
  if (!res) {
    return null;
  }
  const payload =
    res.data && typeof res.data === 'object' && 'data' in res.data ? res.data.data : res.data;
  return nativeValue(payload);
}

function readSparkling(key: string): string | null {
  const cached = memory.get(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    getItem({ key }, (response) => {
      const text = unwrapSparkling(response);
      if (text !== null) {
        memory.set(key, text);
      }
    });
  } catch {
    // Asynchronous persistence is best-effort only.
  }

  return null;
}

function writeSparkling(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    setItem({ key, data: value }, () => undefined);
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

/** 等待原生落盘完成；切换桌面图标后应用会重启，需要保证新实例读到新值。 */
function writeSparklingAsync(key: string, value: string): Promise<void> {
  memory.set(key, value);
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, 600);

    try {
      setItem({ key, data: value }, () => {
        clearTimeout(timer);
        finish();
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function removeSparkling(key: string): void {
  memory.delete(key);
  try {
    // sparkling-storage 的 JS 包未导出 removeItem，直接调用同名原生方法。
    pipe.call('storage.removeItem', { key }, () => undefined);
  } catch {
    // Ignore.
  }
}

function hydrateSparkling(keys: string[]): Promise<void> {
  return Promise.all(
    keys.map(
      (key) =>
        new Promise<void>((resolve) => {
          if (memory.has(key)) {
            resolve();
            return;
          }

          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          const timer = setTimeout(finish, 800);

          try {
            getItem({ key }, (response) => {
              const text = unwrapSparkling(response);
              if (text !== null) {
                memory.set(key, text);
              }
              clearTimeout(timer);
              finish();
            });
          } catch {
            clearTimeout(timer);
            finish();
          }
        }),
    ),
  ).then(() => undefined);
}

function readDesktop(key: string): string | null {
  // 首屏数据由 hydrate 预载进内存；未水合前与 Sparkling 一致返回 null。
  return memory.get(key) ?? null;
}

function writeDesktop(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    const bridge = getDesktopStorage();
    if (!bridge) {
      return false;
    }
    bridge.set(key, value).catch(() => undefined);
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

/** 等待桌面桥落盘完成；超时或失败也 resolve，保持既有容错风格。 */
function writeDesktopAsync(key: string, value: string): Promise<void> {
  memory.set(key, value);
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, 600);

    try {
      const bridge = getDesktopStorage();
      if (!bridge) {
        clearTimeout(timer);
        finish();
        return;
      }
      bridge.set(key, value).then(
        () => {
          clearTimeout(timer);
          finish();
        },
        () => {
          clearTimeout(timer);
          finish();
        },
      );
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function removeDesktop(key: string): void {
  memory.delete(key);
  try {
    const bridge = getDesktopStorage();
    if (bridge) {
      bridge.remove(key).catch(() => undefined);
    }
  } catch {
    // Ignore.
  }
}

/** 桌面桥支持整表读取，一次性把所有键值载入内存。 */
function hydrateDesktop(): Promise<void> {
  const bridge = getDesktopStorage();
  if (!bridge) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, 2000);

    try {
      bridge.getAll().then(
        (all) => {
          if (all && typeof all === 'object') {
            Object.keys(all).forEach((key) => {
              const value = all[key];
              if (typeof value === 'string') {
                memory.set(key, value);
              }
            });
          }
          clearTimeout(timer);
          finish();
        },
        () => {
          clearTimeout(timer);
          finish();
        },
      );
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function readLynxSync(key: string): string | null {
  try {
    const value = nativeValue(getLynx().getStorageSync(key));
    if (value !== null) {
      return value;
    }
    return memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeLynxSync(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    getLynx().setStorageSync(key, value);
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

function readLynxAsync(key: string): string | null {
  const cached = memory.get(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const lynx = getLynx();
    const success = (result: unknown): void => {
      const value = nativeValue(result);
      if (value !== null) {
        memory.set(key, value);
      }
    };
    try {
      lynx.getStorage({ key, success, fail: () => undefined });
    } catch {
      lynx.getStorage(key, success);
    }
  } catch {
    // Asynchronous persistence is best-effort only.
  }

  return null;
}

function writeLynxAsync(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    const lynx = getLynx();
    try {
      lynx.setStorage({ key, data: value, fail: () => undefined });
    } catch {
      lynx.setStorage(key, value);
    }
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

function removeLynxAsync(key: string): void {
  memory.delete(key);
  try {
    const lynx = getLynx();
    try {
      lynx.removeStorage({ key, fail: () => undefined });
    } catch {
      lynx.removeStorage(key);
    }
  } catch {
    // Ignore.
  }
}

function readLynxSession(key: string): string | null {
  return memory.get(key) ?? null;
}

function writeLynxSession(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    getLynx().setSessionStorageItem(key, value);
    return true;
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
    return false;
  }
}

function removeLynxSession(key: string): void {
  memory.delete(key);
  try {
    // Session storage has no remove API; an empty value reads back as missing.
    getLynx().setSessionStorageItem(key, '');
  } catch {
    // Ignore.
  }
}

function hydrateLynxSession(keys: string[]): Promise<void> {
  const lynx = getLynx();
  if (!lynx || typeof lynx.getSessionStorageItem !== 'function') {
    return Promise.resolve();
  }

  return Promise.all(
    keys.map(
      (key) =>
        new Promise<void>((resolve) => {
          if (memory.has(key)) {
            resolve();
            return;
          }

          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          const timer = setTimeout(finish, 250);

          try {
            lynx.getSessionStorageItem(key, (value: unknown) => {
              const text = nativeValue(value);
              if (text !== null && text.length > 0) {
                memory.set(key, text);
              }
              clearTimeout(timer);
              finish();
            });
          } catch {
            clearTimeout(timer);
            finish();
          }
        }),
    ),
  ).then(() => undefined);
}

// NativeModules 由宿主在页面启动后才注入，检测延迟到首次读写时进行。
let cachedBackend: Backend | null = null;

function currentBackend(): Backend {
  if (cachedBackend === null) {
    cachedBackend = detectBackend();
  }
  return cachedBackend;
}

export const storage: KVStore = {
  get(key: string): string | null {
    try {
      const backend = currentBackend();
      if (backend === 'web') {
        return readWeb(key);
      }
      if (backend === 'web-bridge') {
        return readWebBridge(key);
      }
      if (backend === 'sparkling-storage') {
        return readSparkling(key);
      }
      if (backend === 'desktop') {
        return readDesktop(key);
      }
      if (backend === 'lynx-sync') {
        return readLynxSync(key);
      }
      if (backend === 'lynx-async') {
        return readLynxAsync(key);
      }
      if (backend === 'lynx-session') {
        return readLynxSession(key);
      }
      return memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },

  set(key: string, value: string): boolean {
    try {
      const backend = currentBackend();
      if (backend === 'web') {
        return writeWeb(key, value);
      }
      if (backend === 'web-bridge') {
        return writeWebBridge(key, value);
      }
      if (backend === 'sparkling-storage') {
        return writeSparkling(key, value);
      }
      if (backend === 'desktop') {
        return writeDesktop(key, value);
      }
      if (backend === 'lynx-sync') {
        return writeLynxSync(key, value);
      }
      if (backend === 'lynx-async') {
        return writeLynxAsync(key, value);
      }
      if (backend === 'lynx-session') {
        return writeLynxSession(key, value);
      }
      memory.set(key, value);
      return true;
    } catch {
      memory.set(key, value);
      return false;
    }
  },

  setAsync(key: string, value: string): Promise<void> {
    try {
      const backend = currentBackend();
      if (backend === 'sparkling-storage') {
        return writeSparklingAsync(key, value);
      }
      if (backend === 'desktop') {
        return writeDesktopAsync(key, value);
      }
    } catch {
      // Fall through to the synchronous path.
    }
    storage.set(key, value);
    return Promise.resolve();
  },

  remove(key: string): void {
    try {
      const backend = currentBackend();
      if (backend === 'web') {
        memory.delete(key);
        const localStorage = getLocalStorage();
        if (localStorage) {
          localStorage.removeItem(key);
        }
      } else if (backend === 'web-bridge') {
        removeWebBridge(key);
      } else if (backend === 'sparkling-storage') {
        removeSparkling(key);
      } else if (backend === 'desktop') {
        removeDesktop(key);
      } else if (backend === 'lynx-sync') {
        memory.delete(key);
        const lynx = getLynx();
        if (typeof lynx.removeStorageSync === 'function') {
          lynx.removeStorageSync(key);
        }
      } else if (backend === 'lynx-async') {
        removeLynxAsync(key);
      } else if (backend === 'lynx-session') {
        removeLynxSession(key);
      } else {
        memory.delete(key);
      }
    } catch {
      memory.delete(key);
    }
  },

  hydrate(keys: string[]): Promise<void> {
    const backend = currentBackend();
    if (backend === 'web-bridge') {
      return hydrateWebBridge(keys);
    }
    if (backend === 'sparkling-storage') {
      return hydrateSparkling(keys);
    }
    if (backend === 'desktop') {
      return hydrateDesktop();
    }
    if (backend === 'lynx-session') {
      return hydrateLynxSession(keys);
    }
    return Promise.resolve();
  },
};

/** 仅供测试：清空缓存后端与内存副本，避免用例之间互相污染。 */
export function resetStorageForTest(): void {
  cachedBackend = null;
  memory.clear();
  resetDesktopRuntimeForTest();
}
