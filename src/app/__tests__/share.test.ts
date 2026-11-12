import { afterEach, beforeEach, describe, expect, it, rstest } from '@rstest/core';

import {
  isDesktopRuntime,
  resetDesktopRuntimeForTest,
} from '../../platform/desktop';
import { callDesktopBridge } from '../desktopBridge';
import {
  buildShareUrl,
  buildShortUrl,
  canUseNativeFiles,
  downloadTextFile,
  isWeb,
  pickJsonFile,
  shareBaseUrl,
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

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'location');

beforeEach(() => {
  clearDesktop();
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
  if (original) {
    Object.defineProperty(globalThis, 'location', original);
    return;
  }
  delete (globalThis as any).location;
});

describe('share urls', () => {
  it('builds the base url from the worker location', () => {
    expect(shareBaseUrl()).toBe('https://example.com/app?x=1');
  });

  it('appends the payload to the base url', () => {
    expect(buildShareUrl('abc')).toBe('https://example.com/app?x=1#d=abc');
  });

  it('appends the short code to the base url', () => {
    expect(buildShortUrl('ABC-DEF').endsWith('#s=ABC-DEF')).toBe(true);
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
