import { expect, test } from '@rstest/core';

import { formatCountdown, secondsUntil } from '../RuntimeScreen';

test('counts down against the local wall clock', () => {
  const now = new Date(2026, 10, 11, 9, 54, 0).getTime();

  // 09:00 已过 54 分钟，不能按 UTC 零点算成还有 7 小时。
  expect(secondsUntil(540, now)).toBe(-54 * 60);
  expect(secondsUntil(600, now)).toBe(6 * 60);
});

test('formats left and over countdowns', () => {
  expect(formatCountdown(-54 * 60)).toEqual({ sign: 'over', text: '54:00' });
  expect(formatCountdown(6 * 60)).toEqual({ sign: 'left', text: '06:00' });
  expect(formatCountdown(2 * 3600 + 3 * 60 + 4)).toEqual({
    sign: 'left',
    text: '02:03:04',
  });
});
