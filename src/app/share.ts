import { encodeFile } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function dateStamp(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function safeFileName(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.length > 0 ? trimmed : '未命名手册';
  return base.replace(/[\\/:*?"<>|]/g, '_');
}

export function isWeb(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function shareBaseUrl(): string {
  if (!isWeb()) {
    return '';
  }
  try {
    const location = window.location;
    return `${location.origin}${location.pathname}${location.search}`;
  } catch {
    return '';
  }
}

export function buildShareUrl(payload: string): string {
  const base = shareBaseUrl();
  return base.length > 0 ? `${base}#d=${payload}` : `SC1:${payload}`;
}

export function buildShortUrl(code: string): string {
  const base = shareBaseUrl();
  return base.length > 0 ? `${base}#s=${code}` : code;
}

export function downloadTextFile(
  filename: string,
  text: string,
  mime: string = 'application/json',
): boolean {
  if (!isWeb()) {
    return false;
  }
  if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return false;
  }

  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function exportSheetFile(sheet: Sheet, runtime?: RuntimeState): boolean {
  const filename = `${safeFileName(sheet.name)}_流程表_${dateStamp(Date.now())}.json`;
  return downloadTextFile(filename, encodeFile(sheet, runtime));
}

export function pickJsonFile(onText: (text: string) => void): void {
  if (!isWeb()) {
    return;
  }
  if (typeof FileReader === 'undefined') {
    return;
  }

  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const files = input.files;
      const file = files && files.length > 0 ? files[0] : null;
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        if (text.length > 0) {
          onText(text);
        }
      };
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  } catch {
    // Reading files is a web-only enhancement; stay silent elsewhere.
  }
}
