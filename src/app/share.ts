import { runOnMainThread } from '@lynx-js/react';

import { encodeFile } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import { followBaseUrl } from '../platform/followConfig';
import { desktopPickJson, desktopSaveJson } from './desktopBridge';
import { webDownload, webLocationSnapshot, webPickJsonFile } from './webBridge';

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function dateStamp(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function safeFileName(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.length > 0 ? trimmed : t('未命名手册');
  return base.replace(/[\\/:*?"<>|]/g, '_');
}

export function isWeb(): boolean {
  try {
    return typeof window !== 'undefined'
      || typeof (globalThis as any).WorkerGlobalScope !== 'undefined'
      || typeof (globalThis as any).importScripts === 'function';
  } catch {
    return false;
  }
}

export function canUseNativeFiles(): boolean {
  return isWeb() || isDesktopRuntime();
}

export function webLocation(): {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
} | null {
  const snapshot = webLocationSnapshot();
  if (snapshot) {
    return snapshot;
  }

  try {
    const location = (globalThis as any).location
      ?? (typeof window !== 'undefined' ? window.location : null);
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

/** 跟随页只读：配置地址是 follow.html 时补上 follow=1。 */
function ensureFollowFlag(base: string): string {
  if (base.indexOf('follow=1') >= 0 || base.indexOf('follow.html') < 0) {
    return base;
  }
  const hashIndex = base.indexOf('#');
  const head = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
  const tail = hashIndex >= 0 ? base.slice(hashIndex) : '';
  const separator = head.indexOf('?') >= 0 ? '&' : '?';
  return `${head}${separator}follow=1${tail}`;
}

/** 免安装跟随页地址；未配置跟随站点且不在 Web 端时为空。 */
export function buildFollowUrl(payload: string): string {
  const base = ensureFollowFlag(followBaseUrl());
  return base.length > 0 ? `${base}#d=${payload}` : '';
}

export function buildShortFollowUrl(code: string): string {
  const base = ensureFollowFlag(followBaseUrl());
  return base.length > 0 ? `${base}#s=${code}` : '';
}

/** 兼容旧调用名：分享链接现在始终指向跟随页。 */
export function buildShareUrl(payload: string): string {
  return buildFollowUrl(payload);
}

export function buildShortUrl(code: string): string {
  return buildShortFollowUrl(code);
}

function copyTextMainThread(text: string): boolean {
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
      return false;
    }

    const navigator: any = host ? host.navigator : null;
    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text);
      return true;
    }

    const area = hostDoc.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    hostDoc.body.appendChild(area);
    area.select();
    const ok = typeof hostDoc.execCommand === 'function'
      && hostDoc.execCommand('copy');
    hostDoc.body.removeChild(area);
    return !!ok;
  } catch {
    return false;
  }
}

function shareTextMainThread(text: string): boolean {
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
    if (!navigator || typeof navigator.share !== 'function') {
      return false;
    }
    void navigator.share({ title: '顺场 · 现场跟随', text, url: text });
    return true;
  } catch {
    return false;
  }
}

/** 尽力复制到系统剪贴板；失败时返回 false，由调用方展示链接兜底。 */
export async function copyText(text: string): Promise<boolean> {
  const value = typeof text === 'string' ? text : '';
  if (value.length === 0) {
    return false;
  }
  try {
    return (await runOnMainThread(copyTextMainThread)(value)) as boolean;
  } catch {
    return false;
  }
}

function nativeShareText(text: string): boolean {
  try {
    const host = (globalThis as any).NativeModules?.ShunchangHost;
    if (host && typeof host.shareText === 'function') {
      host.shareText(text);
      return true;
    }
  } catch {
    // 宿主未提供分享能力时降级为复制。
  }
  return false;
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** 系统分享；不可用时回退到复制，仍然失败则由调用方展示链接。 */
export async function shareFollowLink(text: string): Promise<ShareOutcome> {
  const value = typeof text === 'string' ? text : '';
  if (value.length === 0) {
    return 'failed';
  }
  if (nativeShareText(value)) {
    return 'shared';
  }
  try {
    const shared = (await runOnMainThread(shareTextMainThread)(value)) as boolean;
    if (shared) {
      return 'shared';
    }
  } catch {
    // 继续降级到复制。
  }
  return (await copyText(value)) ? 'copied' : 'failed';
}

export async function downloadTextFile(
  filename: string,
  text: string,
  mime: string = 'application/json',
): Promise<boolean> {
  if (isDesktopRuntime()) {
    return desktopSaveJson(filename, text);
  }
  if (!isWeb()) {
    return false;
  }
  return webDownload(filename, text, mime);
}

export async function exportSheetFile(
  sheet: Sheet,
  runtime?: RuntimeState,
): Promise<boolean> {
  const filename = `${safeFileName(sheet.name)}_${t('流程表')}_${dateStamp(Date.now())}.json`;
  return downloadTextFile(filename, encodeFile(sheet, runtime));
}

export function pickJsonFile(onText: (text: string) => void): void {
  if (isDesktopRuntime()) {
    void desktopPickJson().then((text) => {
      if (typeof text === 'string') {
        onText(text);
      }
    });
    return;
  }
  if (!isWeb()) {
    return;
  }
  webPickJsonFile(onText);
}
