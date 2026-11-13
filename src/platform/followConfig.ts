import { webLocationSnapshot } from '../app/webBridge';

/**
 * 构建期由 Rspeedy `source.define` 注入的完整跟随页地址，
 * 例如 `https://example.com/follow.html`。
 */
const BUILD_FOLLOW_URL = (process.env.PUBLIC_FOLLOW_URL ?? '').trim();

let testFollowUrl: string | null = null;

export interface FollowLocation {
  origin: string;
  pathname: string;
}

function readLocation(): FollowLocation | null {
  const snapshot = webLocationSnapshot();
  if (snapshot) {
    return { origin: snapshot.origin, pathname: snapshot.pathname };
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
    };
  } catch {
    return null;
  }
}

/**
 * 已配置时直接用配置地址；未配置时仅在 Web 端回退到当前页，
 * 原生端返回空串，调用方据此不生成二维码。
 */
export function resolveFollowBase(
  configured: string,
  location: FollowLocation | null,
): string {
  const url = (configured ?? '').trim();
  if (url.length > 0) {
    return url;
  }
  if (!location || location.origin.length === 0) {
    return '';
  }
  return `${location.origin}${location.pathname}`;
}

export function configuredFollowUrl(): string {
  return testFollowUrl ?? BUILD_FOLLOW_URL;
}

export function followBaseUrl(): string {
  return resolveFollowBase(configuredFollowUrl(), readLocation());
}

/** 仅供测试：模拟构建期注入的 PUBLIC_FOLLOW_URL。 */
export function setFollowUrlForTest(url: string | null): void {
  testFollowUrl = url;
}
