import { afterEach, beforeEach, describe, expect, it, rstest } from '@rstest/core';

import {
  getDesktopStorage,
  isDesktopRuntime,
  resetDesktopRuntimeForTest,
} from '../../platform/desktop';
import { resetStorageForTest, storage } from '../storage';

interface MockBridge {
  getAll: ReturnType<typeof rstest.fn>;
  set: ReturnType<typeof rstest.fn>;
  remove: ReturnType<typeof rstest.fn>;
}

function installBridge(overrides: Partial<MockBridge> = {}): MockBridge {
  const bridge: MockBridge = {
    getAll: rstest.fn(async () => ({ 'from-disk': 'stored' })),
    set: rstest.fn(async () => undefined),
    remove: rstest.fn(async () => undefined),
    ...overrides,
  };
  (globalThis as any).NativeModules = {
    nodejs: { exposed: { shunchangStorage: bridge } },
  };
  return bridge;
}

function clearNativeModules(): void {
  delete (globalThis as any).NativeModules;
}

beforeEach(() => {
  clearNativeModules();
  resetStorageForTest();
});

afterEach(() => {
  rstest.useRealTimers();
  clearNativeModules();
  resetDesktopRuntimeForTest();
  resetStorageForTest();
});

describe('desktop backend', () => {
  it('detects the lynxtron bridge lazily', () => {
    expect(isDesktopRuntime()).toBe(false);
    expect(getDesktopStorage()).toBeNull();

    installBridge();

    expect(isDesktopRuntime()).toBe(true);
    expect(getDesktopStorage()).not.toBeNull();
  });

  it('hydrates every key from the bridge and serves them synchronously', async () => {
    const bridge = installBridge();

    await expect(storage.hydrate!(['shunchang.theme'])).resolves.toBeUndefined();

    expect(bridge.getAll).toHaveBeenCalledTimes(1);
    expect(storage.get('from-disk')).toBe('stored');
    expect(storage.get('missing')).toBeNull();
  });

  it('returns null before hydration without reading the bridge', () => {
    const bridge = installBridge();

    expect(storage.get('from-disk')).toBeNull();
    expect(bridge.getAll).not.toHaveBeenCalled();
  });

  it('writes memory first and forwards writes to the bridge', () => {
    const bridge = installBridge();

    storage.set('key', 'value');

    expect(storage.get('key')).toBe('value');
    expect(bridge.set).toHaveBeenCalledWith('key', 'value');
  });

  it('awaits the bridge on setAsync', async () => {
    const bridge = installBridge();

    await expect(storage.setAsync!('key', 'value')).resolves.toBeUndefined();

    expect(bridge.set).toHaveBeenCalledWith('key', 'value');
    expect(storage.get('key')).toBe('value');
  });

  it('keeps the in-memory value when the bridge write fails', async () => {
    const bridge = installBridge({
      set: rstest.fn(() => Promise.reject(new Error('disk full'))),
    });

    storage.set('key', 'value');
    await expect(storage.setAsync!('key', 'value')).resolves.toBeUndefined();

    expect(bridge.set).toHaveBeenCalledTimes(2);
    expect(storage.get('key')).toBe('value');
  });

  it('removes from memory and forwards the removal to the bridge', () => {
    const bridge = installBridge();
    storage.set('key', 'value');

    storage.remove('key');

    expect(storage.get('key')).toBeNull();
    expect(bridge.remove).toHaveBeenCalledWith('key');
  });

  it('resolves hydration when the bridge rejects', async () => {
    installBridge({
      getAll: rstest.fn(() => Promise.reject(new Error('unavailable'))),
    });

    await expect(storage.hydrate!(['key'])).resolves.toBeUndefined();

    expect(storage.get('key')).toBeNull();
  });

  it('resolves hydration after the timeout when the bridge hangs', async () => {
    rstest.useFakeTimers();
    installBridge({
      getAll: rstest.fn(() => new Promise<Record<string, string>>(() => undefined)),
    });

    const pending = storage.hydrate!(['key']);
    await rstest.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBeUndefined();
  });

  it('falls back to the in-memory backend when no bridge exists', async () => {
    await expect(storage.hydrate!(['key'])).resolves.toBeUndefined();
    expect(storage.get('key')).toBeNull();

    storage.set('key', 'value');
    expect(storage.get('key')).toBe('value');
  });
});
