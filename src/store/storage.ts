import pipe from 'sparkling-method';
import { getItem, setItem } from 'sparkling-storage';

export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  setAsync?(key: string, value: string): Promise<void>;
  remove(key: string): void;
  hydrate?(keys: string[]): Promise<void>;
}

type Backend =
  | 'web'
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

  try {
    const win = getWindow();
    if (win && win.localStorage && typeof win.localStorage.getItem === 'function') {
      return 'web';
    }
  } catch {
    // Accessing localStorage may throw in privacy mode.
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

function writeWeb(key: string, value: string): void {
  memory.set(key, value);
  try {
    const localStorage = getLocalStorage();
    if (!localStorage) {
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
  }
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

function writeSparkling(key: string, value: string): void {
  memory.set(key, value);
  try {
    setItem({ key, data: value }, () => undefined);
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
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

function writeLynxSync(key: string, value: string): void {
  memory.set(key, value);
  try {
    getLynx().setStorageSync(key, value);
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
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

function writeLynxAsync(key: string, value: string): void {
  memory.set(key, value);
  try {
    const lynx = getLynx();
    try {
      lynx.setStorage({ key, data: value, fail: () => undefined });
    } catch {
      lynx.setStorage(key, value);
    }
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
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

function writeLynxSession(key: string, value: string): void {
  memory.set(key, value);
  try {
    getLynx().setSessionStorageItem(key, value);
  } catch {
    // Keep the in-memory copy when persistence is unavailable.
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
      if (backend === 'sparkling-storage') {
        return readSparkling(key);
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

  set(key: string, value: string): void {
    try {
      const backend = currentBackend();
      if (backend === 'web') {
        writeWeb(key, value);
      } else if (backend === 'sparkling-storage') {
        writeSparkling(key, value);
      } else if (backend === 'lynx-sync') {
        writeLynxSync(key, value);
      } else if (backend === 'lynx-async') {
        writeLynxAsync(key, value);
      } else if (backend === 'lynx-session') {
        writeLynxSession(key, value);
      } else {
        memory.set(key, value);
      }
    } catch {
      memory.set(key, value);
    }
  },

  setAsync(key: string, value: string): Promise<void> {
    try {
      if (currentBackend() === 'sparkling-storage') {
        return writeSparklingAsync(key, value);
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
      } else if (backend === 'sparkling-storage') {
        removeSparkling(key);
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
    if (backend === 'sparkling-storage') {
      return hydrateSparkling(keys);
    }
    if (backend === 'lynx-session') {
      return hydrateLynxSession(keys);
    }
    return Promise.resolve();
  },
};
