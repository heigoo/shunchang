import '@testing-library/jest-dom';
import { act, fireEvent, render } from '@lynx-js/react/testing-library';
import { describe, expect, rstest, test } from '@rstest/core';

import { MAX_INSERTED_ITEMS } from '../../domain/execution';
import type { InsertedItem, Item, RuntimeState, Sheet } from '../../domain/types';
import { RuntimeAdjustPanel } from '../RuntimeAdjustPanel';

function makeItem(
  id: string,
  name: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return { id, name, durationMin, owner: '', note: '', lockAt };
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-adjust-panel',
    name: '现场手册',
    date: '2026-11-10',
    startMin,
    items,
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

function makeRuntime(patch: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sheetId: 'sheet-adjust-panel',
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 1,
    lastSyncAt: 0,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
    ...patch,
  };
}

/** ReactLynx 的输入事件走 bindEvent:input，测试库默认 fireEvent 不接受原生 input 节点。 */
function typeInto(element: Element, value: string): void {
  const event = new Event('bindEvent:input', { bubbles: true });
  (event as any).detail = { value };
  act(() => {
    element.dispatchEvent(event);
  });
}

function insertedItems(count: number): InsertedItem[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: `insert-${index}`,
    afterId: 'a',
    createdAt: 0,
    item: makeItem(`extra-${index}`, `插入 ${index}`, 1),
  }));
}

describe('RuntimeAdjustPanel', () => {
  test('opens with insert and lock sections', async () => {
    const sheet = makeSheet([makeItem('a', '开场', 60), makeItem('b', '仪式', 30)]);
    const { findByText } = render(
      <RuntimeAdjustPanel
        sheet={sheet}
        runtime={makeRuntime()}
        onCancel={() => {}}
        onInsert={() => {}}
        onLockChange={() => {}}
      />,
    );

    expect(await findByText('现场调整')).toBeInTheDocument();
    expect(await findByText('插入环节')).toBeInTheDocument();
    expect(await findByText('调整锁定')).toBeInTheDocument();
    expect(await findByText('固定插入「开场」之后')).toBeInTheDocument();
  });

  test('submits an insert after the current item', async () => {
    const sheet = makeSheet([makeItem('a', '开场', 60), makeItem('b', '仪式', 30)]);
    const onInsert = rstest.fn();
    const { container, findByText } = render(
      <RuntimeAdjustPanel
        sheet={sheet}
        runtime={makeRuntime()}
        onCancel={() => {}}
        onInsert={onInsert}
        onLockChange={() => {}}
      />,
    );

    const nameInput = container.querySelector('.AdjustName');
    expect(nameInput).not.toBeNull();
    typeInto(nameInput!, '长辈致辞');

    fireEvent.tap(await findByText('确认插入'));

    expect(onInsert).toHaveBeenCalledWith({
      name: '长辈致辞',
      durationMin: 10,
      owner: '',
      note: '',
      lockAt: null,
    });
  });

  test('shows the insert limit and blocks submission at 20 items', async () => {
    const sheet = makeSheet([makeItem('a', '开场', 60), makeItem('b', '仪式', 30)]);
    const onInsert = rstest.fn();
    const { findByText } = render(
      <RuntimeAdjustPanel
        sheet={sheet}
        runtime={makeRuntime({ insertedItems: insertedItems(MAX_INSERTED_ITEMS) })}
        onCancel={() => {}}
        onInsert={onInsert}
        onLockChange={() => {}}
      />,
    );

    expect(await findByText('单场最多插入 20 个环节')).toBeInTheDocument();

    fireEvent.tap(await findByText('确认插入'));
    expect(onInsert).not.toHaveBeenCalled();
  });

  test('unlocks a future locked item', async () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 10),
      makeItem('b', '仪式', 30, 600),
    ]);
    const onLockChange = rstest.fn();
    const { container, findByText } = render(
      <RuntimeAdjustPanel
        sheet={sheet}
        runtime={makeRuntime()}
        onCancel={() => {}}
        onInsert={() => {}}
        onLockChange={onLockChange}
      />,
    );

    const rows = container.querySelectorAll('.AdjustLockRow');
    expect(rows.length).toBe(2);
    fireEvent.tap(rows[1]!);

    expect(await findByText('锁定 10∶00')).toBeInTheDocument();

    fireEvent.tap(await findByText('解除锁定'));
    expect(onLockChange).toHaveBeenCalledWith('b', null);
  });

  test('previews conflict and requires a second confirmation', async () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 10),
      makeItem('b', '仪式', 10),
    ]);
    const onLockChange = rstest.fn();
    const { container, findByText } = render(
      <RuntimeAdjustPanel
        sheet={sheet}
        runtime={makeRuntime()}
        onCancel={() => {}}
        onInsert={() => {}}
        onLockChange={onLockChange}
      />,
    );

    const rows = container.querySelectorAll('.AdjustLockRow');
    fireEvent.tap(rows[1]!);

    const lockInput = container.querySelector('.AdjustLockInput');
    expect(lockInput).not.toBeNull();
    typeInto(lockInput!, '06:40');

    expect(await findByText(/仍超出 90 分钟/)).toBeInTheDocument();

    fireEvent.tap(await findByText('应用锁定'));
    expect(onLockChange).not.toHaveBeenCalled();
    expect(await findByText('确认调整')).toBeInTheDocument();

    fireEvent.tap(await findByText('确认调整'));
    expect(onLockChange).toHaveBeenCalledWith('b', 400);
  });
});
