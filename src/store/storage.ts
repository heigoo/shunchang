export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

type Backend = 'web' | 'lynx-sync' | 'lynx-async' | 'memory';

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

function detectBackend(): Backend {
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

export const storage: KVStore = {
  get(key: string): string | null {
    try {
      if (backend === 'web') {
        return readWeb(key);
      }
      if (backend === 'lynx-sync') {
        return readLynxSync(key);
      }
      if (backend === 'lynx-async') {
        return readLynxAsync(key);
      }
      return memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },

  set(key: string, value: string): void {
    try {
      if (backend === 'web') {
        writeWeb(key, value);
      } else if (backend === 'lynx-sync') {
        writeLynxSync(key, value);
      } else if (backend === 'lynx-async') {
        writeLynxAsync(key, value);
      } else {
        memory.set(key, value);
      }
    } catch {
      memory.set(key, value);
    }
  },

  remove(key: string): void {
    try {
      if (backend === 'web') {
        memory.delete(key);
        const localStorage = getLocalStorage();
        if (localStorage) {
          localStorage.removeItem(key);
        }
      } else if (backend === 'lynx-sync') {
        memory.delete(key);
        const lynx = getLynx();
        if (typeof lynx.removeStorageSync === 'function') {
          lynx.removeStorageSync(key);
        }
      } else if (backend === 'lynx-async') {
        removeLynxAsync(key);
      } else {
        memory.delete(key);
      }
    } catch {
      memory.delete(key);
    }
  },
};
