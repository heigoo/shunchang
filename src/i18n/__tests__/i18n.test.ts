import { afterEach, beforeEach, expect, test } from '@rstest/core';

import { clearLangForTest, getLang, setLang, t } from '../index';

beforeEach(() => {
  clearLangForTest();
});

afterEach(() => {
  clearLangForTest();
});

test('translates with interpolated variables', () => {
  expect(t('新建手册')).toBe('新建手册');

  setLang('en');
  expect(getLang()).toBe('en');
  expect(t('新建手册')).toBe('New sheet');
  expect(t('共 {n} 份', { n: 3 })).toBe('3 sheets');
});

test('falls back to the source text for unknown keys', () => {
  setLang('en');
  expect(t('未收录文案')).toBe('未收录文案');
});
