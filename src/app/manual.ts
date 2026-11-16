import { runOnMainThread } from '@lynx-js/react';

import { isDesktopRuntime } from '../platform/desktop';
import { desktopOpenExternal } from './desktopBridge';
import { copyText, isWeb } from './share';

const BUILD_MANUAL_URL = (process.env.PUBLIC_MANUAL_URL ?? '').trim();

/** 在线使用说明书：官网与产品内共用同一个地址。 */
export const MANUAL_URL =
  BUILD_MANUAL_URL || 'https://37jgejb7nyniuhch9uk.traesite.cn/manual.html';

export type ManualOpenResult = 'opened' | 'copied' | 'failed';

declare const NativeModules: any;

function openUrlMainThread(url: string): boolean {
  'main thread';
  try {
    const win: any = (globalThis as any).window;
    if (!win || typeof win.open !== 'function') {
      return false;
    }
    return win.open(url, '_blank', 'noopener') !== null;
  } catch {
    return false;
  }
}

function readAndroidHost(): any {
  try {
    // Lynx 原生端把 NativeModules 挂在裸全局上，Web / 桌面壳则在 globalThis。
    if (typeof NativeModules !== 'undefined' && NativeModules) {
      return NativeModules.ShunchangHost ?? null;
    }
  } catch {
    // 继续尝试 globalThis。
  }
  try {
    const modules: any = (globalThis as any).NativeModules;
    return modules && modules.ShunchangHost ? modules.ShunchangHost : null;
  } catch {
    return null;
  }
}

/**
 * 打开在线使用说明书：Android 用系统浏览器，Windows 用默认浏览器，
 * Web 新开标签页；宿主不支持时退回复制链接。
 */
export async function openManual(): Promise<ManualOpenResult> {
  const host = readAndroidHost();
  if (host && typeof host.openUrl === 'function') {
    try {
      host.openUrl(MANUAL_URL);
      return 'opened';
    } catch {
      // 继续尝试其他平台能力。
    }
  }

  if (isDesktopRuntime()) {
    try {
      if (await desktopOpenExternal(MANUAL_URL)) {
        return 'opened';
      }
    } catch {
      // 继续尝试 Web 或复制。
    }
  }

  if (isWeb()) {
    try {
      const opened = await runOnMainThread(openUrlMainThread)(MANUAL_URL);
      if (opened) {
        return 'opened';
      }
    } catch {
      // 继续尝试复制。
    }
  }

  const copied = await copyText(MANUAL_URL);
  return copied ? 'copied' : 'failed';
}
