import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { describe, expect, rstest, test } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import { parseDelayMinutes, ShiftPanel } from '../ShiftPanel';

function makeItem(
  id: string,
  name: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return {
    id,
    name,
    durationMin,
    owner: '',
    note: '',
    lockAt,
  };
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-shift-panel',
    name: '顺延手册',
    date: '2026-11-10',
    startMin,
    items,
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

function makeRuntime(sheet: Sheet, manualOffsetMin = 0): RuntimeState {
  return {
    sheetId: sheet.id,
    currentIndex: 0,
    actuals: {},
    offsetMin: manualOffsetMin,
    autoOffsetMin: 0,
    manualOffsetMin,
    execVersion: 1,
    lastSyncAt: 0,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  };
}

describe('parseDelayMinutes', () => {
  test('accepts whole minutes within range', () => {
    expect(parseDelayMinutes('40')).toBe(40);
    expect(parseDelayMinutes(' 5 ')).toBe(5);
    expect(parseDelayMinutes('600')).toBe(600);
  });

  test('rejects empty, non-numeric and out-of-range input', () => {
    expect(parseDelayMinutes('')).toBeNull();
    expect(parseDelayMinutes('0')).toBeNull();
    expect(parseDelayMinutes('601')).toBeNull();
    expect(parseDelayMinutes('4.5')).toBeNull();
    expect(parseDelayMinutes('abc')).toBeNull();
  });
});

describe('ShiftPanel', () => {
  test('defaults to the next plan start and applies quick minutes', async () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '致辞', 30),
      makeItem('c', '仪式', 30),
    ]);
    const onConfirm = rstest.fn();
    const { findAllByText, findByText } = render(
      <ShiftPanel
        sheet={sheet}
        runtime={makeRuntime(sheet)}
        nowMin={530}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    // 下一环节计划 09:00，当前 08:50 → 默认计划时刻。
    expect((await findAllByText('09\u223600')).length).toBeGreaterThan(0);

    fireEvent.tap(await findByText('+30'));
    expect((await findAllByText('09\u223630')).length).toBeGreaterThan(0);

    fireEvent.tap(await findByText('+10'));
    expect((await findAllByText('09\u223640')).length).toBeGreaterThan(0);

    fireEvent.tap(await findByText('确认顺延'));
    expect(onConfirm).toHaveBeenCalledWith(580);
  });

  test('warns when the chosen time is earlier than the next plan', async () => {
    const sheet = makeSheet(
      [makeItem('a', '开场', 60), makeItem('b', '致辞', 30)],
      780,
    );
    const { findAllByText, findByText, queryByText } = render(
      <ShiftPanel
        sheet={sheet}
        runtime={makeRuntime(sheet)}
        nowMin={800}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect((await findAllByText('14\u223600')).length).toBeGreaterThan(0);
    expect(queryByText(/将提前/)).toBeNull();

    fireEvent.tap(await findByText('当前时刻'));

    expect((await findAllByText('13\u223620')).length).toBeGreaterThan(0);
    expect(await findByText('将提前 40 分钟')).toBeInTheDocument();
  });

  test('offers clearing the manual shift only when it is set', async () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '致辞', 30),
    ]);
    const onClearManual = rstest.fn();
    const { findByText, rerender, queryByText } = render(
      <ShiftPanel
        sheet={sheet}
        runtime={makeRuntime(sheet, 0)}
        nowMin={540}
        onCancel={() => {}}
        onConfirm={() => {}}
        onClearManual={onClearManual}
      />,
    );

    expect(queryByText(/清除手动顺延/)).toBeNull();

    rerender(
      <ShiftPanel
        sheet={sheet}
        runtime={makeRuntime(sheet, 30)}
        nowMin={540}
        onCancel={() => {}}
        onConfirm={() => {}}
        onClearManual={onClearManual}
      />,
    );

    fireEvent.tap(await findByText('清除手动顺延（+30 分钟）'));
    expect(onClearManual).toHaveBeenCalledTimes(1);
  });

  test('extends the current item and disables it when next is locked', async () => {
    const openSheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '致辞', 30),
    ]);
    const onExtend = rstest.fn();
    const first = render(
      <ShiftPanel
        sheet={openSheet}
        runtime={makeRuntime(openSheet)}
        nowMin={480}
        onCancel={() => {}}
        onConfirm={() => {}}
        onExtend={onExtend}
      />,
    );

    fireEvent.tap(await first.findByText('延长 +10'));
    expect(onExtend).toHaveBeenCalledWith(10);

    first.unmount();

    const lockedSheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '致辞', 30, 600),
    ]);
    const blocked = rstest.fn();
    const second = render(
      <ShiftPanel
        sheet={lockedSheet}
        runtime={makeRuntime(lockedSheet)}
        nowMin={480}
        onCancel={() => {}}
        onConfirm={() => {}}
        onExtend={blocked}
      />,
    );

    expect(
      await second.findByText('下一环节为锁定时刻，无法延长'),
    ).toBeInTheDocument();
    fireEvent.tap(await second.findByText('延长 +10'));
    expect(blocked).not.toHaveBeenCalled();
  });
});
