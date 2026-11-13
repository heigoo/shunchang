import { describe, expect, it } from '@rstest/core';

import { TEMPLATES, createSheetFromTemplate } from '../templates';
import type { WeddingTemplate } from '../templates';
import { formatDateKey } from '../types';

const NOW = 1762732800000;

const LOCKED_NAME: Record<WeddingTemplate['id'], string> = {
  chinese: '敬酒开席',
  western: '晚宴开席',
  annual: '晚宴',
};

describe('templates', () => {
  it('offers three templates with ten segments each', () => {
    expect(TEMPLATES).toHaveLength(3);
    TEMPLATES.forEach((template) => {
      expect(template.items).toHaveLength(10);
    });
  });

  it('locks the banquet segment at its planned start', () => {
    TEMPLATES.forEach((template) => {
      const lockedIndex = template.items.findIndex(
        (entry) => entry.locked === true,
      );
      expect(lockedIndex).toBeGreaterThanOrEqual(0);
      expect(template.items[lockedIndex].name).toBe(LOCKED_NAME[template.id]);

      const sheet = createSheetFromTemplate(template.id, NOW);
      expect(sheet).not.toBeNull();

      const lockedItem = sheet!.items[lockedIndex];
      expect(lockedItem.locked).toBe(true);

      const plannedStart =
        template.startMin +
        template.items
          .slice(0, lockedIndex)
          .reduce((sum, entry) => sum + entry.durationMin, 0);
      expect(lockedItem.lockAt).toBe(plannedStart);
    });
  });

  it('creates an independent draft sheet with fresh ids', () => {
    const sheet = createSheetFromTemplate('chinese', NOW);
    expect(sheet).not.toBeNull();

    const created = sheet!;
    expect(created.name).toBe('中式婚礼流程');
    expect(created.status).toBe('draft');
    expect(created.version).toBe(1);
    expect(created.startMin).toBe(480);
    expect(created.updatedAt).toBe(NOW);
    expect(created.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(created.items).toHaveLength(10);

    const ids = new Set(created.items.map((entry) => entry.id));
    expect(ids.size).toBe(10);

    const again = createSheetFromTemplate('chinese', NOW);
    expect(again).not.toBeNull();
    expect(again!.id).not.toBe(created.id);
    expect(again!.items[0].id).not.toBe(created.items[0].id);

    expect(created.items).not.toBe(TEMPLATES[0].items);
    expect(created.items[0]).not.toBe(TEMPLATES[0].items[0]);
  });

  it('uses the requested event date and falls back to today', () => {
    const dated = createSheetFromTemplate('chinese', NOW, '2026-11-23');

    expect(dated?.date).toBe('2026-11-23');

    const fallback = createSheetFromTemplate('chinese', NOW, '2026-02-30');

    expect(fallback?.date).toBe(formatDateKey(NOW));
  });

  it('returns null for an unknown template id', () => {
    expect(createSheetFromTemplate('unknown' as any, NOW)).toBeNull();
  });
});
