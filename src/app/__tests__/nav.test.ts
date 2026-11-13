import { describe, expect, it } from '@rstest/core';

import { viewForSheet } from '../nav';

describe('viewForSheet', () => {
  it('执行中的手册进入执行台', () => {
    expect(viewForSheet('running')).toBe('runtime');
  });

  it('已完成的手册进入报告', () => {
    expect(viewForSheet('done')).toBe('report');
  });

  it('草稿与已发布手册进入编辑页', () => {
    expect(viewForSheet('draft')).toBe('editor');
    expect(viewForSheet('published')).toBe('editor');
  });
});
