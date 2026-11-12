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

test('translates the desktop theme copy', () => {
  setLang('en');
  expect(t('切换仅影响界面配色，应用不会重启')).toBe(
    'Only the app colors change; the app will not restart',
  );
  expect(t('桌面图标在安装包中固定，运行时不更换')).toBe(
    'The launcher icon is fixed in the installer and does not change at runtime',
  );
});
