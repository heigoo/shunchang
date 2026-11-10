import type { Item, Sheet } from './types';

export interface TemplateItem {
  name: string;
  durationMin: number;
  owner: string;
  note: string;
  locked?: boolean;
}

export interface WeddingTemplate {
  id: 'chinese' | 'western' | 'annual';
  name: string;
  tagline: string;
  startMin: number;
  items: TemplateItem[];
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function item(
  name: string,
  durationMin: number,
  owner: string,
  locked = false,
): TemplateItem {
  const templateItem: TemplateItem = { name, durationMin, owner, note: '' };
  if (locked) {
    templateItem.locked = true;
  }
  return templateItem;
}

function freezeTemplate(template: WeddingTemplate): WeddingTemplate {
  template.items.forEach((entry) => Object.freeze(entry));
  Object.freeze(template.items);
  return Object.freeze(template);
}

export const TEMPLATES: WeddingTemplate[] = [
  freezeTemplate({
    id: 'chinese',
    name: '中式婚礼',
    tagline: '敬茶改口，按刻推进',
    startMin: 480,
    items: [
      item('化妆造型', 60, '化妆师'),
      item('迎宾签到', 30, '督导'),
      item('仪式入场', 15, '司仪'),
      item('交换戒指', 10, '伴郎'),
      item('改口敬茶', 20, '父母'),
      item('长辈致辞', 20, '司仪'),
      item('敬酒开席', 40, '督导', true),
      item('换敬酒服', 20, '新娘助理'),
      item('逐桌敬酒', 60, '督导'),
      item('送客', 30, '督导'),
    ],
  }),
  freezeTemplate({
    id: 'western',
    name: '西式婚礼',
    tagline: '仪式与晚宴，一刻不差',
    startMin: 840,
    items: [
      item('场地布置确认', 30, '督导'),
      item('新人准备', 60, '化妆师'),
      item('宾客签到', 30, '迎宾'),
      item('仪式入场', 20, '司仪'),
      item('誓言与戒指', 15, '司仪'),
      item('合影留念', 20, '摄影'),
      item('鸡尾酒会', 40, '督导'),
      item('晚宴开席', 90, '督导', true),
      item('舞会', 60, '司仪'),
      item('送客', 30, '督导'),
    ],
  }),
  freezeTemplate({
    id: 'annual',
    name: '年会',
    tagline: '致辞颁奖，秩序优先',
    startMin: 1020,
    items: [
      item('场地与设备检查', 45, '场务'),
      item('签到入场', 30, '接待'),
      item('开场暖场', 15, '主持'),
      item('领导致辞', 20, '主持'),
      item('年度回顾', 15, '视频'),
      item('颁奖', 30, '主持'),
      item('节目演出', 60, '导演'),
      item('抽奖', 30, '主持'),
      item('晚宴', 90, '餐饮', true),
      item('散场', 30, '场务'),
    ],
  }),
];

export function createSheetFromTemplate(
  id: WeddingTemplate['id'],
  now: number,
): Sheet | null {
  const template = TEMPLATES.find((entry) => entry.id === id);
  if (!template) {
    return null;
  }

  const date = new Date(now);
  const items: Item[] = template.items.map((entry) => {
    const next: Item = {
      id: createId(),
      name: entry.name,
      durationMin: entry.durationMin,
      owner: entry.owner,
      note: entry.note,
      lockAt: null,
    };
    if (entry.locked === true) {
      next.locked = true;
    }
    return next;
  });

  return {
    id: createId(),
    name: `${template.name}流程`,
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    startMin: template.startMin,
    items,
    status: 'draft',
    version: 1,
    updatedAt: now,
  };
}
