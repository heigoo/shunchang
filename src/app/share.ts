import { encodeFile } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
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

export function shareBaseUrl(): string {
  const location = webLocation();
  if (!location) {
    return '';
  }
  return `${location.origin}${location.pathname}${location.search}`;
}

export function buildShareUrl(payload: string): string {
  const base = shareBaseUrl();
  return base.length > 0 ? `${base}#d=${payload}` : `SC1:${payload}`;
}

export function buildShortUrl(code: string): string {
  const base = shareBaseUrl();
  return base.length > 0 ? `${base}#s=${code}` : code;
}

export async function downloadTextFile(
  filename: string,
  text: string,
  mime: string = 'application/json',
): Promise<boolean> {
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
  if (!isWeb()) {
    return;
  }
  webPickJsonFile(onText);
}
