import { afterEach, beforeEach, describe, expect, it, rstest } from '@rstest/core';

import {
  isDesktopRuntime,
  resetDesktopRuntimeForTest,
} from '../../platform/desktop';
import { setFollowUrlForTest } from '../../platform/followConfig';
import { callDesktopBridge, desktopOpenPrintHtml } from '../desktopBridge';
import {
  buildFollowUrl,
  buildShareUrl,
  buildShortFollowUrl,
  buildShortUrl,
  canUseAndroidHost,
  canUseNativeFiles,
  downloadTextFile,
  isWeb,
  pickJsonFile,
  resetNativeHostForTest,
} from '../share';

type BridgeCall = (
  method: string,
  params: unknown,
  callback: (result: unknown) => void,
) => void;

function installDesktop(call: BridgeCall): void {
  (globalThis as any).NativeModules = {
    bridge: { call },
    nodejs: {
      exposed: {
        shunchangStorage: {
          getAll: async () => ({}),
          set: async () => undefined,
          remove: async () => undefined,
        },
      },
    },
  };
}

function clearDesktop(): void {
  delete (globalThis as any).NativeModules;
  resetDesktopRuntimeForTest();
}

interface FakeEmitter {
  addListener(name: string, listener: (value: unknown) => void): void;
  removeListener(name: string, listener: (value: unknown) => void): void;
  emit(name: string, value: unknown): void;
}

function makeEmitter(): FakeEmitter {
  const listeners = new Map<string, (value: unknown) => void>();
  return {
    addListener(name, listener) {
      listeners.set(name, listener);
    },
    removeListener(name) {
      listeners.delete(name);
    },
    emit(name, value) {
      const listener = listeners.get(name);
      if (listener) {
        listener(value);
      }
    },
  };
}

function installAndroidHost(
  host: Record<string, unknown>,
  emitter?: FakeEmitter,
): void {
  (globalThis as any).NativeModules = { ShunchangHost: host };
  if (emitter) {
    (globalThis as any).lynx = { getJSModule: () => emitter };
  }
}

function clearAndroidHost(): void {
  delete (globalThis as any).NativeModules;
  delete (globalThis as any).lynx;
  resetNativeHostForTest();
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'location');

beforeEach(() => {
  clearDesktop();
  clearAndroidHost();
  Object.defineProperty(globalThis, 'location', {
    value: {
      origin: 'https://example.com',
      pathname: '/app',
      search: '?x=1',
      hash: '',
    },
    configurable: true,
  });
});

afterEach(() => {
  clearDesktop();
  clearAndroidHost();
  if (original) {
    Object.defineProperty(globalThis, 'location', original);
    return;
  }
  delete (globalThis as any).location;
});

describe('share urls', () => {
  afterEach(() => {
    setFollowUrlForTest(null);
  });

  it('falls back to the current web page when no follow site is configured', () => {
    expect(buildFollowUrl('abc')).toBe('https://example.com/app#d=abc');
  });

  it('uses the configured follow page for links', () => {
    setFollowUrlForTest('https://follow.example.com/follow.html?follow=1');

    expect(buildShareUrl('abc')).toBe(
      'https://follow.example.com/follow.html?follow=1#d=abc',
    );
    expect(buildShortUrl('ABC-DEF')).toBe(
      'https://follow.example.com/follow.html?follow=1#s=ABC-DEF',
    );
  });

  it('forces read-only follow mode when the configured url is follow.html', () => {
    setFollowUrlForTest('https://follow.example.com/follow.html');

    expect(buildShortFollowUrl('ABC-DEF')).toBe(
      'https://follow.example.com/follow.html?follow=1#s=ABC-DEF',
    );
  });
});

describe('desktop file bridge', () => {
  it('detects the desktop runtime lazily and enables native files', () => {
    expect(isDesktopRuntime()).toBe(false);
    expect(isWeb()).toBe(true);
    expect(canUseNativeFiles()).toBe(true);

    installDesktop(() => {});

    expect(isDesktopRuntime()).toBe(true);
    expect(canUseNativeFiles()).toBe(true);
  });

  it('saves exports through the desktop save bridge', async () => {
    const call = rstest.fn(
      (_method: string, _params: unknown, callback: (result: unknown) => void) => {
        callback({ canceled: false, path: 'C:/tmp/a.json' });
      },
    );
    installDesktop(call);

    await expect(downloadTextFile('a.json', '{"a":1}')).resolves.toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(
      'shunchang.saveJsonFile',
      { filename: 'a.json', text: '{"a":1}' },
      expect.any(Function),
    );
  });

  it('reports failure when saving is canceled or errors', async () => {
    installDesktop((_method, _params, callback) => {
      callback({ canceled: true });
    });
    await expect(downloadTextFile('a.json', '{}')).resolves.toBe(false);

    installDesktop((_method, _params, callback) => {
      callback({ canceled: false, error: 'write failed' });
    });
    await expect(downloadTextFile('a.json', '{}')).resolves.toBe(false);
  });

  it('picks JSON through the desktop pick bridge', async () => {
    const call = rstest.fn(
      (_method: string, _params: unknown, callback: (result: unknown) => void) => {
        callback({ canceled: false, text: '{"ok":true}' });
      },
    );
    installDesktop(call);
    const onText = rstest.fn();

    pickJsonFile(onText);
    await flush();

    expect(call).toHaveBeenCalledWith(
      'shunchang.pickJsonFile',
      {},
      expect.any(Function),
    );
    expect(onText).toHaveBeenCalledWith('{"ok":true}');
  });

  it('does not call back when picking is canceled or errors', async () => {
    installDesktop((_method, _params, callback) => {
      callback({ canceled: true });
    });
    const onCanceled = rstest.fn();
    pickJsonFile(onCanceled);
    await flush();
    expect(onCanceled).not.toHaveBeenCalled();

    installDesktop((_method, _params, callback) => {
      callback({ canceled: false, error: 'read failed' });
    });
    const onFailed = rstest.fn();
    pickJsonFile(onFailed);
    await flush();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('opens the print HTML through the desktop bridge', async () => {
    const call = rstest.fn(
      (_method: string, _params: unknown, callback: (result: unknown) => void) => {
        callback({ ok: true, path: 'C:/tmp/print.html' });
      },
    );
    installDesktop(call);

    await expect(
      desktopOpenPrintHtml('流程表.html', '<html></html>'),
    ).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith(
      'shunchang.openPrintHtml',
      { filename: '流程表.html', html: '<html></html>' },
      expect.any(Function),
    );
  });

  it('reports failure when opening the print HTML fails', async () => {
    installDesktop((_method, _params, callback) => {
      callback({ ok: false, error: 'open failed' });
    });
    await expect(
      desktopOpenPrintHtml('流程表.html', '<html></html>'),
    ).resolves.toBe(false);
  });

  it('returns null without a bridge or after a timeout', async () => {
    await expect(
      callDesktopBridge('shunchang.pickJsonFile', {}),
    ).resolves.toBeNull();

    installDesktop(() => {});
    await expect(
      callDesktopBridge('shunchang.pickJsonFile', {}, 5),
    ).resolves.toBeNull();
  });
});

describe('android host bridge', () => {
  it('detects the native host and enables native files', () => {
    expect(canUseAndroidHost()).toBe(false);
    installAndroidHost({ pickJson: () => {}, saveJson: () => {} });

    expect(canUseAndroidHost()).toBe(true);
    expect(canUseNativeFiles()).toBe(true);
  });

  it('does not treat a host without file methods as capable', () => {
    installAndroidHost({ shareText: () => {} });

    expect(canUseAndroidHost()).toBe(false);
    expect(canUseNativeFiles()).toBe(true);
  });

  it('saves exports through the native save bridge and waits for the result', async () => {
    const emitter = makeEmitter();
    const saveJson = rstest.fn();
    installAndroidHost({ pickJson: () => {}, saveJson }, emitter);

    const pending = downloadTextFile('a.json', '{"a":1}');
    await flush();

    expect(saveJson).toHaveBeenCalledWith('a.json', '{"a":1}');
    emitter.emit('shunchang:savedFile', [{ ok: true }]);
    await expect(pending).resolves.toBe(true);
  });

  it('reports a canceled native save', async () => {
    const emitter = makeEmitter();
    installAndroidHost({ pickJson: () => {}, saveJson: () => {} }, emitter);

    const pending = downloadTextFile('a.json', '{}');
    await flush();
    emitter.emit('shunchang:savedFile', [{ ok: false, canceled: true }]);

    await expect(pending).resolves.toBe(false);
  });

  it('picks JSON through the native picker and global event', () => {
    const emitter = makeEmitter();
    const pickJson = rstest.fn();
    installAndroidHost({ pickJson, saveJson: () => {} }, emitter);

    const onText = rstest.fn();
    pickJsonFile(onText);

    expect(pickJson).toHaveBeenCalledTimes(1);
    emitter.emit('shunchang:pickedJson', [{ text: '{"ok":true}' }]);
    expect(onText).toHaveBeenCalledWith('{"ok":true}');
  });

  it('ignores a canceled native pick', () => {
    const emitter = makeEmitter();
    installAndroidHost({ pickJson: () => {}, saveJson: () => {} }, emitter);

    const onText = rstest.fn();
    pickJsonFile(onText);
    emitter.emit('shunchang:pickedJson', [{ canceled: true }]);

    expect(onText).not.toHaveBeenCalled();
  });
});
