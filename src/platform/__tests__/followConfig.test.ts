import { afterEach, describe, expect, it } from '@rstest/core';

import {
  followBaseUrl,
  resolveFollowBase,
  setFollowUrlForTest,
} from '../followConfig';

describe('follow config', () => {
  afterEach(() => {
    setFollowUrlForTest(null);
  });

  it('uses the build-time follow page url when configured', () => {
    setFollowUrlForTest('https://example.com/follow.html?follow=1');

    expect(followBaseUrl()).toBe('https://example.com/follow.html?follow=1');
  });

  it('returns an empty base on native without configuration', () => {
    expect(resolveFollowBase('', null)).toBe('');
  });

  it('falls back to the current page on web without configuration', () => {
    expect(
      resolveFollowBase('', { origin: 'https://example.com', pathname: '/app' }),
    ).toBe('https://example.com/app');
  });

  it('prefers the configured url over the current location', () => {
    expect(
      resolveFollowBase('https://follow.example.com/follow.html', {
        origin: 'https://example.com',
        pathname: '/app',
      }),
    ).toBe('https://follow.example.com/follow.html');
  });
});
