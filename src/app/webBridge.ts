import { runOnBackground, runOnMainThread } from '@lynx-js/react';

export interface WebLocationSnapshot {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
}

let cachedLocation: WebLocationSnapshot | null = null;
let pendingPick: ((text: string) => void) | null = null;

function handlePickedText(text: string): void {
  const callback = pendingPick;
  pendingPick = null;
  if (callback) {
    callback(text);
  }
}

export function installMainThreadBridge(): void {
  'main thread';
  try {
    const global: any = globalThis as any;
    if (global.__shunchangBridgeReady) {
      return;
    }
    const impl: any = global.lynxWorkletImpl;
    const context: any = typeof lynx !== 'undefined' && lynx.getJSContext
      ? lynx.getJSContext()
      : null;
    if (!impl || !context || typeof impl._runRunOnMainThreadTask !== 'function') {
      return;
    }
    global.__shunchangBridgeReady = true;
    context.addEventListener('Lynx.Worklet.runWorkletCtx', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        impl._runRunOnMainThreadTask(
          data.worklet,
          data.params,
          data.resolveId,
        );
      } catch {
        // Ignore malformed worklet payloads.
      }
    });
    context.addEventListener('Lynx.Worklet.releaseWorkletRef', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        const refImpl: any = impl._refImpl;
        if (refImpl && refImpl._workletRefMap) {
          delete refImpl._workletRefMap[data.id];
        }
      } catch {
        // Ignore malformed release payloads.
      }
    });
  } catch {
    // The bridge is a web-only enhancement.
  }
}

function readLocationMainThread(): WebLocationSnapshot | null {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    if (!view) {
      return null;
    }
    const host: any = view.parent && view.parent !== view ? view.parent : view;
    const location = host.location;
    if (!location) {
      return null;
    }
    return {
      origin: typeof location.origin === 'string' ? location.origin : '',
      pathname: typeof location.pathname === 'string' ? location.pathname : '',
      search: typeof location.search === 'string' ? location.search : '',
      hash: typeof location.hash === 'string' ? location.hash : '',
    };
  } catch {
    return null;
  }
}

function downloadMainThread(
  filename: string,
  text: string,
  mime: string,
): boolean {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const hostDoc: any = host && host.document ? host.document : doc;
    if (
      !hostDoc ||
      !hostDoc.body ||
      typeof globalThis.Blob === 'undefined' ||
      typeof globalThis.URL === 'undefined'
    ) {
      return false;
    }

    const blob = new globalThis.Blob([text], {
      type: `${mime};charset=utf-8`,
    });
    const url = globalThis.URL.createObjectURL(blob);
    const anchor = hostDoc.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    hostDoc.body.appendChild(anchor);
    anchor.click();
    hostDoc.body.removeChild(anchor);
    globalThis.setTimeout(() => {
      globalThis.URL.revokeObjectURL(url);
    }, 1000);
    return true;
  } catch {
    return false;
  }
}

function printMainThread(printCss: string): boolean {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const hostDoc: any = host && host.document ? host.document : doc;
    if (!hostDoc || !hostDoc.head) {
      return false;
    }

    let style = hostDoc.getElementById('shunchang-print-style');
    if (!style) {
      style = hostDoc.createElement('style');
      style.id = 'shunchang-print-style';
      hostDoc.head.appendChild(style);
    }
    style.textContent = printCss;
    if (host) {
      host.print();
    }
    return true;
  } catch {
    return false;
  }
}

function clearHashMainThread(): void {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    if (!host) {
      return;
    }
    host.history.replaceState(
      null,
      '',
      `${host.location.pathname}${host.location.search}`,
    );
  } catch {
    // Clearing the hash is best-effort.
  }
}

function readLanguageMainThread(): string | null {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const localStorage = host ? host.localStorage : null;
    if (!localStorage) {
      return null;
    }
    return localStorage.getItem('shunchang.lang');
  } catch {
    return null;
  }
}

function writeLanguageMainThread(lang: string): void {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const localStorage = host ? host.localStorage : null;
    if (localStorage) {
      localStorage.setItem('shunchang.lang', lang);
    }
  } catch {
    // 语言偏好写入失败时保留内存值即可。
  }
}

function pickJsonMainThread(): void {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const hostDoc: any = host && host.document ? host.document : doc;
    if (!hostDoc || !hostDoc.body) {
      return;
    }

    const input = hostDoc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    const cleanup = () => {
      try {
        hostDoc.body.removeChild(input);
      } catch {
        // The input may already be detached.
      }
    };

    input.onchange = () => {
      const files = input.files;
      const file = files && files.length > 0 ? files[0] : null;
      if (!file) {
        cleanup();
        return;
      }

      const reader = new globalThis.FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        cleanup();
        if (text.length > 0) {
          runOnBackground(handlePickedText)(text);
        }
      };
      reader.onerror = cleanup;
      reader.readAsText(file);
    };
    input.oncancel = cleanup;

    hostDoc.body.appendChild(input);
    input.click();
  } catch {
    // The picker is a web-only enhancement.
  }
}

export async function webDownload(
  filename: string,
  text: string,
  mime: string = 'application/json',
): Promise<boolean> {
  try {
    return (await runOnMainThread(downloadMainThread)(
      filename,
      text,
      mime,
    )) as boolean;
  } catch {
    return false;
  }
}

export async function webPrint(printCss: string): Promise<boolean> {
  try {
    return (await runOnMainThread(printMainThread)(printCss)) as boolean;
  } catch {
    return false;
  }
}

export function webPickJsonFile(onText: (text: string) => void): void {
  pendingPick = onText;
  try {
    void runOnMainThread(pickJsonMainThread)().catch(() => {
      pendingPick = null;
    });
  } catch {
    pendingPick = null;
  }
}

export async function webClearHash(): Promise<void> {
  try {
    await runOnMainThread(clearHashMainThread)();
  } catch {
    // The hash stays in place when the bridge is unavailable.
  }
}

export async function webSyncLocation(): Promise<WebLocationSnapshot | null> {
  try {
    const location = (await runOnMainThread(readLocationMainThread)()) as
      | WebLocationSnapshot
      | null;
    if (location && location.origin.length > 0) {
      cachedLocation = location;
    }
  } catch {
    // Fall back to whatever the runtime exposes.
  }
  return cachedLocation;
}

export function webLocationSnapshot(): WebLocationSnapshot | null {
  return cachedLocation;
}

export async function webReadLanguage(): Promise<string | null> {
  try {
    const value = await runOnMainThread(readLanguageMainThread)();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function webWriteLanguage(lang: string): void {
  try {
    void runOnMainThread(writeLanguageMainThread)(lang).catch(() => undefined);
  } catch {
    // The bridge is a web-only enhancement.
  }
}

// ---------- 屏幕常亮 / 电量（Web 降级） ----------

let batteryWaiters: Array<(level: number | null) => void> = [];

function resolveBattery(level: number | null): void {
  const waiters = batteryWaiters;
  batteryWaiters = [];
  waiters.forEach((waiter) => waiter(level));
}

function supportWakeLockMainThread(): boolean {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const navigator: any = host ? host.navigator : null;
    return !!navigator
      && !!navigator.wakeLock
      && typeof navigator.wakeLock.request === 'function';
  } catch {
    return false;
  }
}

function setWakeLockMainThread(keepOn: boolean): void {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const navigator: any = host ? host.navigator : null;
    if (!navigator || !navigator.wakeLock) {
      return;
    }
    const global: any = globalThis as any;
    if (!keepOn) {
      const lock = global.__shunchangWakeLock;
      global.__shunchangWakeLock = null;
      if (lock && typeof lock.release === 'function') {
        void lock.release();
      }
      return;
    }
    if (global.__shunchangWakeLock) {
      return;
    }
    navigator.wakeLock.request('screen').then((lock: any) => {
      global.__shunchangWakeLock = lock;
    }).catch(() => undefined);
  } catch {
    // Wake Lock 不可用时保持系统默认息屏。
  }
}

function readBatteryMainThread(): void {
  'main thread';
  try {
    const doc: any = typeof globalThis.document !== 'undefined'
      ? globalThis.document
      : null;
    const view: any = doc ? doc.defaultView : null;
    const host: any = view && view.parent && view.parent !== view
      ? view.parent
      : view;
    const navigator: any = host ? host.navigator : null;
    if (!navigator || typeof navigator.getBattery !== 'function') {
      runOnBackground(resolveBattery)(null);
      return;
    }
    navigator.getBattery().then((battery: any) => {
      const level = battery && typeof battery.level === 'number'
        ? Math.round(battery.level * 100)
        : null;
      runOnBackground(resolveBattery)(level);
    }).catch(() => {
      runOnBackground(resolveBattery)(null);
    });
  } catch {
    runOnBackground(resolveBattery)(null);
  }
}

export async function webWakeLockSupported(): Promise<boolean> {
  try {
    return (await runOnMainThread(supportWakeLockMainThread)()) === true;
  } catch {
    return false;
  }
}

export function webSetWakeLock(keepOn: boolean): void {
  try {
    void runOnMainThread(setWakeLockMainThread)(keepOn).catch(() => undefined);
  } catch {
    // 没有主线程桥时无法申请 Wake Lock。
  }
}

export function webBatteryLevel(): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let settled = false;
    const finish = (level: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(level);
    };
    const timer = setTimeout(() => {
      batteryWaiters = batteryWaiters.filter((waiter) => waiter !== finish);
      finish(null);
    }, 1200);
    batteryWaiters.push(finish);
    try {
      void runOnMainThread(readBatteryMainThread)().catch(() => finish(null));
    } catch {
      finish(null);
    }
  });
}
