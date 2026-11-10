import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';

import { buildShareUrl, buildShortUrl, shareBaseUrl } from '../share';

const original = Object.getOwnPropertyDescriptor(globalThis, 'location');

beforeEach(() => {
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
