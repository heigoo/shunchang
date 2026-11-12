import { useEffect, useState } from '@lynx-js/react';

import { webReadLanguage, webWriteLanguage } from '../app/webBridge';
import { storage } from '../store/storage';
import { EN } from './strings';

export type Lang = 'zh' | 'en';
export type Vars = Record<string, string | number>;

const LANG_KEY = 'shunchang.lang';

let current: Lang = 'zh';
const listeners = new Set<(lang: Lang) => void>();

function notify(): void {
  listeners.forEach((listener) => listener(current));
}

function isWebRuntime(): boolean {
  try {
    return typeof (globalThis as any).window !== 'undefined'
      || typeof (globalThis as any).WorkerGlobalScope !== 'undefined'
      || typeof (globalThis as any).importScripts === 'function';
  } catch {
    return false;
  }
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function translateFor(lang: Lang, zh: string, vars?: Vars): string {
  const text = lang === 'en' ? EN[zh] ?? zh : zh;
  return interpolate(text, vars);
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  const next: Lang = lang === 'en' ? 'en' : 'zh';
  if (next === current) {
    return;
  }
  current = next;
  try {
    storage.set(LANG_KEY, next);
  } catch {
    // 语言偏好持久化失败时仍保留本次会话内的切换。
  }
  if (isWebRuntime()) {
    webWriteLanguage(next);
  }
  notify();
}

/** 水合完成后调用；语言偏好存在本地，默认中文。 */
export async function hydrateLang(): Promise<void> {
  let next: Lang = 'zh';
  try {
    next = storage.get(LANG_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    next = 'zh';
  }

  if (isWebRuntime()) {
    let webLang = await webReadLanguage();
    if (webLang === null) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 60);
      });
      webLang = await webReadLanguage();
    }
    if (webLang === 'en' || webLang === 'zh') {
      next = webLang;
    }
  }

  if (next !== current) {
    current = next;
    notify();
  }
}

export function t(zh: string, vars?: Vars): string {
  return translateFor(current, zh, vars);
}

/** 组件内使用；语言变化时触发重渲染。 */
export function useT(): (zh: string, vars?: Vars) => string {
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    const listener = (next: Lang) => {
      setLangState(next);
    };
    listeners.add(listener);
    setLangState(current);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (zh: string, vars?: Vars) => translateFor(lang, zh, vars);
}

export function clearLangForTest(): void {
  current = 'zh';
  listeners.clear();
  try {
    storage.remove(LANG_KEY);
  } catch {
    // Ignore.
  }
}
