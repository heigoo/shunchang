export type Lang = 'zh' | 'en';

export type BoardState = 'done' | 'now' | 'shift' | 'next';

export interface BoardRow {
  time: string;
  title: string;
  owner: string;
  tag: string;
  state: BoardState;
  orig?: string;
}

export interface Copy {
  nav: { product: string; board: string; brand: string; start: string };
  hero: {
    eyebrow: string;
    title: string[];
    lead: string;
    primary: string;
    secondary: string;
    standard: string;
    festive: string;
  };
  stats: { value: string; label: string }[];
  problem: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: { no: string; title: string; body: string }[];
    pull: string;
  };
  product: {
    eyebrow: string;
    title: string;
    lead: string;
    features: { no: string; title: string; body: string }[];
  };
  board: {
    eyebrow: string;
    title: string[];
    body: string;
    day: string;
    meta: string;
    rows: BoardRow[];
    stat: string;
    progress: string;
    note: string;
    tryHint: string;
    allDone: string;
  };
  brand: {
    eyebrow: string;
    title: string;
    paras: string[];
    spec: string;
  };
  quote: { eyebrow: string; title: string; body: string; hint: string };
  cta: {
    eyebrow: string;
    title: string;
    body: string;
    button: string;
    note: string;
    done: string;
    posterCaption: string;
  };
  footer: { tagline: string; copyright: string; marquee: string };
}

const ZH: Copy = {
  nav: { product: '产品', board: '执行台', brand: '品牌', start: '开始' },
  hero: {
    eyebrow: '婚礼现场执行 · 2026',
    title: ['让今天，', '按顺序发生。'],
    lead:
      '婚礼不是没有计划，是计划从来不在同一个地方。顺场把一天写成一张表：改一处，所有人看到同一版。',
    primary: '开始编排',
    secondary: '看执行台',
    standard: '标准版',
    festive: '喜事版',
  },
  stats: [
    { value: '12', label: '小时 · 从出门到散场' },
    { value: '38', label: '环节 · 一件接一件' },
    { value: '9', label: '人 · 同一张表' },
    { value: '1', label: '版 · 此刻的版本' },
  ],
  problem: {
    eyebrow: '01 · 问题',
    title: '计划死在纸上',
    lead:
      '婚礼通常有三个版本的计划：表格里一份，微信群里一份，督导的脑子里一份。改了一个环节，另外两份不会自己变。',
    cards: [
      {
        no: '01',
        title: '纸上',
        body: '打印、标注、夹进文件夹。第一次改时间，它就失效了。',
      },
      {
        no: '02',
        title: '群里',
        body: '发了一遍新版，总有人还在看旧的。',
      },
      {
        no: '03',
        title: '脑子里',
        body: '督导记得住，但他不可能同时在三个地方。',
      },
    ],
    pull: '计划可以慢，版本不能旧。',
  },
  product: {
    eyebrow: '02 · 产品',
    title: '一张表，一个码，一次顺延。',
    lead: '产品只做三件事，顺序也按现场来。',
    features: [
      {
        no: '01 编排台',
        title: '把一天排成一张表',
        body: '时间、地点、负责人。拖一遍就排好，改一处全表同步。',
      },
      {
        no: '02 发布',
        title: '一个码，给所有人',
        body: '扫码即看最新版。不用拉群，不用重发文件，版本自己更新。',
      },
      {
        no: '03 执行台',
        title: '只看此刻这一步',
        body: '现场只显示当前与下一个。上一环晚了，后面自动顺延。',
      },
    ],
  },
  board: {
    eyebrow: '03 · 执行台',
    title: ['现场只看两件事：', '此刻，和下一步。'],
    body:
      '当前行琥珀高亮；顺延行保留原时间，并标出 +8′。底部是今天走到哪一步。',
    day: '周六 · 10.02',
    meta: '婚礼当天 · 38 个环节 · 9 人',
    rows: [
      { time: '08:20', title: '迎亲游戏', owner: '伴娘 · 小满', tag: '已完成', state: 'done' },
      { time: '09:10', title: '敬茶', owner: '双方家长 · 主厅', tag: '进行中', state: 'now' },
      {
        time: '09:48',
        title: '外景拍摄',
        owner: '摄影 · 哲',
        tag: '顺延 +8′',
        state: 'shift',
        orig: '原 09:40',
      },
      { time: '10:28', title: '迎宾', owner: '签到 · 可欣', tag: '待开始', state: 'next' },
      { time: '11:18', title: '仪式', owner: '全体 · 宴会厅', tag: '待开始', state: 'next' },
    ],
    stat: '4 / 38 已完成',
    progress: '第 4 项进行中',
    note: '当前行琥珀高亮，顺延行保留原时间。',
    tryHint: '点任意行 · 试着推进现场',
    allDone: '全场完成 · 顺场收官',
  },
  brand: {
    eyebrow: '04 · 标记',
    title: '两块牌，一道缝。',
    paras: [
      '图标是两块错开的牌，中间留一道 28 的缝。',
      '不是装饰。那道缝就是现场的空隙：下一条要挪进来，上一环要退出去。',
      '缝在，顺延才成立。',
    ],
    spec: '错位 196 · 缝 28 · 牌厚 14',
  },
  quote: {
    eyebrow: '05 · 名字',
    title: '顺，不是控。',
    body: '控场是把人按住，顺场是让事接上。',
    hint: '点一下 · 再放一次',
  },
  cta: {
    eyebrow: '06 · 开始',
    title: '把今天，排成一张表。',
    body: '扫码或点开始编排，给现场所有人同一版。改一处，所有人的表跟着变。',
    button: '开始编排',
    note: '官网演示 · 内测中',
    done: '已记录 · 我们会联系你',
    posterCaption: '标准版 · 纸底墨字',
  },
  footer: {
    tagline: '有顺序，也能顺延',
    copyright: '© 2026 顺场 · Cue',
    marquee: '有顺序，也能顺延 · 让今天，按顺序发生 · 顺场 · CUE · ',
  },
};

const EN: Copy = {
  nav: { product: 'Product', board: 'Live board', brand: 'Brand', start: 'Start' },
  hero: {
    eyebrow: 'WEDDING DAY · LIVE',
    title: ['Let today happen', 'in order.'],
    lead:
      'A wedding always has a plan. It just never lives in one place. Cue puts the day on one sheet — change one cell, and everyone sees the same version.',
    primary: 'Start the sheet',
    secondary: 'See the live board',
    standard: 'Standard',
    festive: 'Wedding',
  },
  stats: [
    { value: '12', label: 'hours · door to last dance' },
    { value: '38', label: 'moments · one after another' },
    { value: '9', label: 'crew · one shared sheet' },
    { value: '1', label: 'version · the one that is true' },
  ],
  problem: {
    eyebrow: '01 · THE PROBLEM',
    title: 'Plans die on paper',
    lead:
      'A wedding usually has three versions of its plan: one in a spreadsheet, one in the group chat, one in the coordinator’s head. Change one moment, and the other two do not change with it.',
    cards: [
      {
        no: '01',
        title: 'On paper',
        body: 'Printed, highlighted, clipped into a folder. The first time change makes it useless.',
      },
      {
        no: '02',
        title: 'In the chat',
        body: 'Send a new version, and someone is still reading the old one.',
      },
      {
        no: '03',
        title: 'In one head',
        body: 'The coordinator remembers. But she cannot be in three places at once.',
      },
    ],
    pull: 'The plan can be slow. The version can’t be old.',
  },
  product: {
    eyebrow: '02 · THE PRODUCT',
    title: 'One sheet, one code, one shift.',
    lead: 'Three things, in the order the room needs them.',
    features: [
      {
        no: '01 BUILDER',
        title: 'Turn the day into one sheet',
        body: 'Time, place, owner. Drag once and it is set; change one cell and the whole sheet follows.',
      },
      {
        no: '02 PUBLISH',
        title: 'One code for everyone',
        body: 'Scan for the latest version. No group chats, no re-sending files. The version updates itself.',
      },
      {
        no: '03 LIVE BOARD',
        title: 'Only this moment, only the next',
        body: 'The room shows what is now and what is next. If one moment runs late, the rest shift with it.',
      },
    ],
  },
  board: {
    eyebrow: '03 · LIVE BOARD',
    title: ['The room needs', 'only two things:', 'now, and next.'],
    body:
      'The current row is amber. The shifted row keeps its original time and marks +8′. At the bottom, where the day stands.',
    day: 'SAT · 10.02',
    meta: 'WEDDING DAY · 38 ITEMS · 9 CREW',
    rows: [
      { time: '08:20', title: 'Door games', owner: 'Bridesmaids · Xiaoman', tag: 'DONE', state: 'done' },
      { time: '09:10', title: 'Tea ceremony', owner: 'Both families · Main hall', tag: 'LIVE', state: 'now' },
      {
        time: '09:48',
        title: 'Portraits',
        owner: 'Photo · Zhe',
        tag: '+8′ SHIFT',
        state: 'shift',
        orig: 'was 09:40',
      },
      { time: '10:28', title: 'Guest welcome', owner: 'Check-in · Kexin', tag: 'NEXT', state: 'next' },
      { time: '11:18', title: 'Ceremony', owner: 'All · Ballroom', tag: 'NEXT', state: 'next' },
    ],
    stat: '4 / 38 COMPLETE',
    progress: 'ITEM 4 IN PROGRESS',
    note: 'Amber marks now; a shifted row keeps its original time.',
    tryHint: 'TAP ANY ROW · MOVE THE DAY',
    allDone: 'ALL DONE · THE DAY LANDED',
  },
  brand: {
    eyebrow: '04 · THE MARK',
    title: 'Two bars, one seam.',
    paras: [
      'The mark is two offset cards with a gap of 28 between them.',
      'Not decoration. That gap is the room left in the day: the next moment moves in, the last one moves out.',
      'With the gap, a shift is possible.',
    ],
    spec: 'Offset 196 · Gap 28 · Thickness 14',
  },
  quote: {
    eyebrow: '05 · THE NAME',
    title: 'Shift, not control.',
    body: 'Control pins people down. Cue keeps things connected.',
    hint: 'TAP · PLAY IT AGAIN',
  },
  cta: {
    eyebrow: '06 · START',
    title: 'Put the day on one sheet.',
    body: 'Scan or start the sheet. One version for everyone in the room. Change one cell, and every sheet follows.',
    button: 'Start the sheet',
    note: 'Demo site · In private beta',
    done: 'You’re on the list. We’ll be in touch.',
    posterCaption: 'Standard · paper and ink',
  },
  footer: {
    tagline: 'Order, and shift',
    copyright: '© 2026 Cue · 顺场',
    marquee: 'ORDER, AND SHIFT · LET TODAY HAPPEN IN ORDER · CUE · SHUNCHANG · ',
  },
};

export const COPY: Record<Lang, Copy> = { zh: ZH, en: EN };
