import { runOnMainThread } from '@lynx-js/react';

import { encodeFile } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
import { followBaseUrl } from '../platform/followConfig';
import { desktopPickJson, desktopSaveJson } from './desktopBridge';
import {
  webBatteryLevel,
  webDownload,
  webLocationSnapshot,
  webPickJsonFile,
  webSetWakeLock,
} from './webBridge';

/** Android 壳（Sparkling）通过 NativeModules.ShunchangHost 暴露的能力子集。 */
interface AndroidHost {
  pickJson?: () => void;
  saveJson?: (filename: string, text: string) => void;
  shareJson?: (filename: string, text: string) => void;
  shareFile?: (filename: string, text: string, mime: string) => boolean;
  shareText?: (text: string) => void;
  printHtml?: (html: string, jobName: string) => void;
  keepScreenOn?: (keepOn: boolean) => void;
  getBatteryLevel?: () => number;
}

declare const NativeModules: any;

function readNativeModules(): any {
  try {
    if (typeof NativeModules !== 'undefined' && NativeModules) {
      return NativeModules;
    }
  } catch {
    // 裸全局在部分运行时不可见，继续尝试 globalThis。
  }
  try {
    return (globalThis as any).NativeModules ?? null;
  } catch {
    return null;
  }
}

function readAndroidHost(): AndroidHost | null {
  try {
    const host = readNativeModules()?.ShunchangHost;
    if (
      !host
      || typeof host.pickJson !== 'function'
      || typeof host.saveJson !== 'function'
    ) {
      return null;
    }
    return host as AndroidHost;
  } catch {
    return null;
  }
}

/** 运行在带文件/打印能力的 Android 壳里。 */
export function canUseAndroidHost(): boolean {
  return readAndroidHost() !== null;
}

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
  return canUseAndroidHost() || isWeb() || isDesktopRuntime();
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

/** 按负责人生成专属跟随链接：`?follow=1&o=<负责人>#d=<payload>`。 */
export function buildOwnerFollowUrl(payload: string, owner: string): string {
  const base = ensureFollowFlag(followBaseUrl());
  if (base.length === 0) {
    return '';
  }

  const name = typeof owner === 'string' ? owner.trim() : '';
  if (name.length === 0) {
    return `${base}#d=${payload}`;
  }

  const hashIndex = base.indexOf('#');
  const head = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
  const separator = head.indexOf('?') >= 0 ? '&' : '?';
  return `${head}${separator}o=${encodeURIComponent(name)}#d=${payload}`;
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

interface PendingSave {
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pendingPick: ((text: string) => void) | null = null;
let pendingSave: PendingSave | null = null;
let hostEventsInstalled = false;

function hostEventPayload(value: any): any {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === 'object' && first.data && typeof first.data === 'object') {
    return first.data;
  }
  return first;
}

function readLynxEngine(): any {
  try {
    if (typeof lynx !== 'undefined' && lynx) {
      return lynx;
    }
  } catch {
    // 继续尝试 globalThis。
  }
  try {
    return (globalThis as any).lynx ?? null;
  } catch {
    return null;
  }
}

/** 原生文件结果通过全局事件回传；只安装一次监听。 */
function installHostEvents(): boolean {
  if (hostEventsInstalled) {
    return true;
  }
  try {
    const engine: any = readLynxEngine();
    const emitter = engine && typeof engine.getJSModule === 'function'
      ? engine.getJSModule('GlobalEventEmitter')
      : null;
    if (!emitter || typeof emitter.addListener !== 'function') {
      return false;
    }
    hostEventsInstalled = true;

    emitter.addListener('shunchang:pickedJson', (value: any) => {
      const payload = hostEventPayload(value) ?? {};
      const callback = pendingPick;
      pendingPick = null;
      if (callback && typeof payload.text === 'string' && payload.text.length > 0) {
        callback(payload.text);
      }
    });

    emitter.addListener('shunchang:savedFile', (value: any) => {
      const payload = hostEventPayload(value) ?? {};
      const pending = pendingSave;
      pendingSave = null;
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(payload.ok === true);
      }
    });
    return true;
  } catch {
    return false;
  }
}

function androidSaveFile(filename: string, text: string): Promise<boolean> {
  const host = readAndroidHost();
  if (!host || typeof host.saveJson !== 'function') {
    return Promise.resolve(false);
  }
  if (!installHostEvents()) {
    // 拿不到事件通道时退回系统分享，至少让文件离开应用。
    try {
      host.shareJson?.(filename, text);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  return new Promise<boolean>((resolve) => {
    // 同一时刻只跟踪最后一次保存；旧的请求按取消处理，避免悬挂。
    if (pendingSave) {
      clearTimeout(pendingSave.timer);
      pendingSave.resolve(false);
      pendingSave = null;
    }
    const timer = setTimeout(() => {
      if (pendingSave && pendingSave.resolve === resolve) {
        pendingSave = null;
        resolve(false);
      }
    }, 120000);
    pendingSave = { resolve, timer };
    try {
      host.saveJson?.(filename, text);
    } catch {
      pendingSave = null;
      clearTimeout(timer);
      resolve(false);
    }
  });
}

function nativeShareText(text: string): boolean {
  const host = readAndroidHost();
  try {
    if (host && typeof host.shareText === 'function') {
      host.shareText(text);
      return true;
    }
  } catch {
    // 宿主未提供分享能力时降级为复制。
  }
  return false;
}

/** 仅供测试：重置原生事件通道与等待中的回调。 */
export function resetNativeHostForTest(): void {
  pendingPick = null;
  if (pendingSave) {
    clearTimeout(pendingSave.timer);
    pendingSave = null;
  }
  hostEventsInstalled = false;
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
  if (canUseAndroidHost()) {
    return androidSaveFile(filename, text);
  }
  if (isDesktopRuntime()) {
    return desktopSaveJson(filename, text);
  }
  if (!isWeb()) {
    return false;
  }
  return webDownload(filename, text, mime);
}

/** Android：把 HTML 写到缓存并通过系统分享面板发送。 */
export function shareHtmlFile(filename: string, html: string): boolean {
  const host = readAndroidHost();
  if (!host || typeof host.shareFile !== 'function') {
    return false;
  }
  try {
    return host.shareFile(filename, html, 'text/html') === true;
  } catch {
    return false;
  }
}

/** Android：用 WebView + PrintManager 调起系统打印；壳内失败会自动回退为分享 HTML。 */
export function printHtmlNative(html: string, jobName: string): boolean {
  const host = readAndroidHost();
  if (!host || typeof host.printHtml !== 'function') {
    return false;
  }
  try {
    host.printHtml(html, jobName);
    return true;
  } catch {
    return false;
  }
}

/** 屏幕常亮：Android 走原生 Flag，Web 走 Wake Lock，其他环境静默忽略。 */
export function setScreenAwake(keepOn: boolean): void {
  const host = readAndroidHost();
  if (host && typeof host.keepScreenOn === 'function') {
    try {
      host.keepScreenOn(keepOn);
      return;
    } catch {
      // 落到 Wake Lock 分支。
    }
  }
  webSetWakeLock(keepOn);
}

/** 读取电量百分比；原生与 Web Battery API 都不支持时返回 null。 */
export function readBatteryLevel(): Promise<number | null> {
  const host = readAndroidHost();
  if (host && typeof host.getBatteryLevel === 'function') {
    try {
      const level = host.getBatteryLevel();
      if (typeof level === 'number' && level >= 0 && level <= 100) {
        return Promise.resolve(Math.round(level));
      }
    } catch {
      // 落到 Web Battery API。
    }
  }
  return webBatteryLevel();
}

export async function exportSheetFile(
  sheet: Sheet,
  runtime?: RuntimeState,
): Promise<boolean> {
  const filename = `${safeFileName(sheet.name)}_${t('流程表')}_${dateStamp(Date.now())}.json`;
  return downloadTextFile(filename, encodeFile(sheet, runtime));
}

export function pickJsonFile(onText: (text: string) => void): void {
  const host = readAndroidHost();
  if (host && typeof host.pickJson === 'function') {
    if (!installHostEvents()) {
      return;
    }
    pendingPick = onText;
    try {
      host.pickJson();
    } catch {
      pendingPick = null;
    }
    return;
  }
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
