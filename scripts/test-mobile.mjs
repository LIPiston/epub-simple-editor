/**
 * 真实浏览器回归测试：移动端适配（参考 Obsidian 手机端的三段式操作）。
 *
 * 需求约定（用户需求原文）：「参考 obsidian 的手机端操作逻辑制作移动端适配，
 * 左中右边结构」。
 *
 * Obsidian 手机端的行为，也就是这里要验证的：
 *   1. 顶栏左侧的按钮拉出「左抽屉」（在这是两级导航），顶栏右侧的按钮拉出
 *      「右抽屉」（在这是当前章节的大纲 + 全书目录）；
 *   2. 两个抽屉互斥，同时只能有一个；
 *   3. 从屏幕左边缘右滑 → 开左抽屉；从右边缘左滑 → 开右抽屉；
 *      抽屉打开时，朝关闭方向滑 → 收起；
 *   4. 点大纲里的条目前往对应小节，并自动收起抽屉（否则挡住刚定位的正文）；
 *   5. 大纲只在该有的地方出现：不在编辑章节时，顶栏没有大纲入口；
 *   6. 触摸设备没有悬停，目录行的操作按钮必须常显，否则永远点不到；
 *   7. 右抽屉从中间切成上下两块：上「大纲」（章内定位）、下「目录」
 *      （全书章节快捷切换），各占一半、各自滚动，点目录一行即换章并收起抽屉；
 *      章节多时打开抽屉会把当前章滚进视野。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-mobile');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import localforage from 'localforage';
import App from '../../App';

window.__localforage = localforage;
window.__mount = () => {
  const host = document.getElementById('root');
  host.innerHTML = '';
  // 与真实入口 index.tsx 一致：包 StrictMode
  createRoot(host).render(<React.StrictMode><App /></React.StrictMode>);
};
`;

writeFileSync(path.join(tmp, 'harness.tsx'), HARNESS);
await build({
  entryPoints: [path.join(tmp, 'harness.tsx')],
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome120',
  outfile: path.join(tmp, 'harness.js'), logLevel: 'error', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

/**
 * 测试页样式由两部分组成：
 *   1. index.html 里真正发布的 <style>（主题变量、安全区、.hover-reveal 等）——
 *      直接抽出来注入，这样「触摸设备操作常显」这条断言检验的是线上那套规则本身，
 *      而不是测试自己另写一份；
 *   2. 一份够用的 Tailwind 子集（生产用 CDN，测试不联网），只写决定布局的规则，
 *      并带上本项目真正依赖的 md 断点。
 */
const realStyles = Array.from(
  readFileSync(path.resolve('index.html'), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g),
).map((m) => m[1]).join('\n');

const TAILWIND_SUBSET = `
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
  *, *::before, *::after { box-sizing: border-box; }
  button { cursor: pointer; background: none; border: none; font: inherit; color: inherit; padding: 0; }
  .flex { display: flex; } .inline-flex { display: inline-flex; }
  .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; } .shrink-0 { flex-shrink: 0; }
  .flex-col { flex-direction: column; } .hidden { display: none; }
  .items-center { align-items: center; } .items-start { align-items: flex-start; }
  .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
  .h-full { height: 100%; } .h-screen { height: 100vh; }
  .w-full { width: 100%; } .min-w-0 { min-width: 0; } .min-h-0 { min-height: 0; }
  .relative { position: relative; } .absolute { position: absolute; } .fixed { position: fixed; }
  .inset-0 { inset: 0; } .inset-y-0 { top: 0; bottom: 0; } .left-0 { left: 0; } .right-0 { right: 0; }
  .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
  .z-30 { z-index: 30; } .z-40 { z-index: 40; } .z-50 { z-index: 50; }
  /* 顶栏用的任意值类，Tailwind 会生成同样的规则 */
  .z-\\[45\\] { z-index: 45; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .translate-x-0 { transform: translateX(0); }
  .-translate-x-full { transform: translateX(-100%); }
  .translate-x-full { transform: translateX(100%); }
  .w-11 { width: 2.75rem; } .w-52 { width: 13rem; } .w-72 { width: 18rem; }
  .h-12 { height: 3rem; } .h-10 { height: 2.5rem; }
  /* 右抽屉两个分区用到的：序号窄列 + 计数靠右 */
  .w-5 { width: 1.25rem; } .w-7 { width: 1.75rem; } .h-7 { height: 1.75rem; }
  .text-right { text-align: right; } .ml-auto { margin-left: auto; }
  .gap-1\\.5 { gap: 0.375rem; } .gap-2 { gap: 0.5rem; }
  .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
  .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
  /* 自动保存胶囊是 absolute 定位的；缺了这两条它就退回文档流、盖到顶栏按钮上，
     让「点导航入口」之类的操作被它挡下。真实页面由 CDN 生成这些类。 */
  .right-4 { right: 1rem; } .bottom-4 { bottom: 1rem; } .bottom-14 { bottom: 3.5rem; }
  .ProseMirror { outline: none; min-height: 400px; }
  /* md 断点（768px）：与项目里的断点一致 */
  @media (min-width: 768px) {
    .md\\:hidden { display: none; }
    .md\\:flex { display: flex; }
    .md\\:w-72 { width: 18rem; }
  }
`;

const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${realStyles}</style>
    <style>${TAILWIND_SUBSET}</style>
  </head><body class="h-screen overflow-hidden">
    <div id="root" class="h-full"></div>
    <script src="./harness.js"></script>
  </body></html>`,
);

const findBrowser = () => {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'AppData/Local/ms-playwright'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let dirs = [];
    try {
      dirs = execFileSync('node', ['-e', `console.log(require('fs').readdirSync(${JSON.stringify(root)}).join('\\n'))`])
        .toString().split('\n').filter((d) => d.startsWith('chromium-'));
    } catch { continue; }
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => existsSync(p));
};

const exe = findBrowser();
if (!exe) {
  console.log('跳过：本机没有找到 Chromium/Chrome/Edge。');
  process.exit(0);
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe, headless: true });

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

/** 手机视口 + 触摸能力（hasTouch 会让 media query 报 hover: none，与真机一致）*/
const PHONE = { width: 390, height: 844 };
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
  await page.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__localforage.clear();
  });
  return { ctx, page };
};

const bootApp = async (page) => {
  await page.evaluate(() => window.__mount());
  await page.waitForSelector('text=书籍管理', { timeout: 20000 });
  await page.waitForTimeout(600);
};

/**
 * 种子：一本书，共三章。
 *   第一章：正文够长，中段埋一个带 id 的小标题 —— 这样「跳到大纲条目」
 *   会让滚动条真的移动，而不是原地不动也能假装成功；
 *   其余两章各有一行正文，用来验证右抽屉下半的目录能换章。
 */
const seedBook = (page) =>
  page.evaluate(async () => {
    const lf = window.__localforage;
    const paragraphs = (n, tag) => Array.from({ length: n }, (_, i) => `<p>${tag} ${i + 1} 行。</p>`).join('');
    const content =
      `<h1 id="ch-top">第一章</h1>` +
      paragraphs(70, '开头') +
      `<h2 id="ch-mid">中段小节</h2>` +
      paragraphs(70, '结尾');

    const index = (await lf.getItem('epub_simple_editor_library_index_v1')) || { books: [], activeBookId: null };
    const id = 'seed_mobile';
    const now = Date.now();
    await lf.setItem('epub_simple_editor_book_' + id, {
      metadata: { title: '移动端样书', creator: '作者', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
      chapters: [
        { id: id + '_ch0', title: '第一章', content, level: 1, subItems: [] },
        { id: id + '_ch1', title: '第二章', content: '<h1 id="ch2-top">第二章</h1><p>第二章的正文。</p>', level: 1, subItems: [] },
        { id: id + '_ch2', title: '第三章', content: '<h1 id="ch3-top">第三章</h1><p>第三章的正文。</p>', level: 1, subItems: [] },
      ],
      images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
      activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    index.books = [
      { id, title: '移动端样书', author: '作者', chapterCount: 3, imageCount: 0, sizeBytes: 2048, createdAt: now, updatedAt: now },
      ...index.books,
    ];
    if (!index.activeBookId) index.activeBookId = id;
    await lf.setItem('epub_simple_editor_library_index_v1', index);
  });

/**
 * 种子（长书）：30 章，用来验证下半的目录「打开时把当前章滚进视野」——
 * 章节行数远超抽屉下半的可视高度，当前章若在末尾，不滚就看不到。
 * activeChapterIndex 指定进入编辑器时停在第几章。
 */
const seedLongBook = (page, activeChapterIndex) =>
  page.evaluate(async (activeIndex) => {
    const lf = window.__localforage;
    const id = 'seed_long';
    const chapters = Array.from({ length: 30 }, (_, i) => ({
      id: `${id}_ch${i}`,
      title: `第 ${i + 1} 章`,
      content: `<h1 id="${id}_anchor${i}">第 ${i + 1} 章</h1><p>第 ${i + 1} 章的正文。</p>`,
      level: 1,
      subItems: [],
    }));

    const index = (await lf.getItem('epub_simple_editor_library_index_v1')) || { books: [], activeBookId: null };
    const now = Date.now();
    await lf.setItem('epub_simple_editor_book_' + id, {
      metadata: { title: '长书', creator: '作者', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
      chapters,
      images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
      activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    index.books = [
      { id, title: '长书', author: '作者', chapterCount: chapters.length, imageCount: 0, sizeBytes: 2048, createdAt: now, updatedAt: now },
      ...index.books,
    ];
    index.activeBookId = id;
    await lf.setItem('epub_simple_editor_library_index_v1', index);

    // 指定当前章：useProject 装载时会读「最近查看的章节」，但这条路径
    // 受「记忆阅读位置」开关控制，因此开关也要一并打开。
    localStorage.setItem('epub-simple-editor-reading-position-enabled', 'true');
    localStorage.setItem('epub-simple-editor-reading-position', JSON.stringify({
      version: 2,
      books: { [id]: { lastChapterId: chapters[activeIndex].id, positions: {} } },
    }));
  }, activeChapterIndex);

/** 从书库「打开」当前书，进入编辑章节 */
const openChapter = async (page) => {
  await page.evaluate(() => {
    const card = document.querySelector('[data-book-card]');
    if (!card) throw new Error('书库里找不到书籍卡片');
    const btn = Array.from(card.querySelectorAll('button')).find((b) => (b.textContent || '').includes('打开'));
    btn.click();
  });
  await page.waitForFunction(() => document.querySelector('.ProseMirror'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
};

/** 抽屉状态：只在 DOM 里，开合看 transform 类 */
const drawerState = (page) =>
  page.evaluate(() => {
    const left = document.querySelector('[data-drawer="left"]');
    const right = document.querySelector('[data-drawer="right"]');
    const open = (el) => !!el && el.className.includes('translate-x-0') && !el.className.includes('-translate-x-full') && !el.className.includes('translate-x-full');
    return {
      hasLeft: !!left,
      leftOpen: open(left),
      hasRight: !!right,
      rightOpen: open(right),
      outlineItems: Array.from(document.querySelectorAll('[data-outline-item]')).map((b) => ({
        id: b.getAttribute('data-outline-item'),
        disabled: b.hasAttribute('disabled'),
      })),
      hasOutlineToggle: !!document.querySelector('[data-outline-toggle="true"]'),
      rightText: right ? (right.textContent || '').slice(0, 80) : '',
      chapterRows: Array.from(document.querySelectorAll('[data-drawer-chapter]')).map((b) => ({
        id: b.getAttribute('data-drawer-chapter'),
        active: b.getAttribute('data-active') === 'true',
        text: (b.textContent || '').trim(),
      })),
    };
  });

/**
 * 右抽屉两个分区的几何关系：上「大纲」、下「目录」，各自占一半高度。
 * 返回的是像素信息，用来验证「从中间分割」这件事真的发生了，
 * 而不是只检查两个 div 都存在（都存在但叠在一起也能骗过存在性断言）。
 */
const drawerPanes = (page) =>
  page.evaluate(() => {
    const drawer = document.querySelector('[data-drawer="right"]');
    const outline = document.querySelector('[data-outline-pane="true"]');
    const toc = document.querySelector('[data-chapter-pane="true"]');
    if (!drawer || !outline || !toc) {
      return { hasDrawer: !!drawer, hasOutline: !!outline, hasToc: !!toc };
    }
    const d = drawer.getBoundingClientRect();
    const o = outline.getBoundingClientRect();
    const t = toc.getBoundingClientRect();
    return {
      hasDrawer: true,
      hasOutline: true,
      hasToc: true,
      // 上下相邻：大纲的底边就是目录的顶边（容 1px 的亚像素误差）
      stacked: Math.abs(o.bottom - t.top) <= 1 && o.top < t.top,
      outlineTop: Math.round(o.top - d.top),
      outlineBottom: Math.round(o.bottom - d.top),
      tocTop: Math.round(t.top - d.top),
      tocBottom: Math.round(t.bottom - d.top),
      drawerHeight: Math.round(d.height),
      outlineHeight: Math.round(o.height),
      tocHeight: Math.round(t.height),
      // 各占一半：两边高度差不超过抽屉高度的 10%
      balanced: d.height > 0 && Math.abs(o.height - t.height) / d.height < 0.1,
    };
  });

/**
 * 合成触摸滑动。
 * 手势监听挂在 document 的捕获阶段，因此带上 bubbles 派发即可命中。
 */
const swipe = async (page, { from, to, selector }) => {
  await page.evaluate(({ from, to, selector }) => {
    const el = selector ? document.querySelector(selector) : (document.elementFromPoint(from.x, from.y) || document.body);
    if (!el) throw new Error('滑动目标不存在: ' + selector);

    const makeTouch = (x, y) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
    const fire = (type, x, y, active) => {
      const t = makeTouch(x, y);
      el.dispatchEvent(new TouchEvent(type, {
        touches: active ? [t] : [],
        targetTouches: active ? [t] : [],
        changedTouches: [t],
        bubbles: true,
        cancelable: true,
      }));
    };

    // 分几步移动，模拟真实手势（一步到位的位移也能过，但多步更接近真机）
    fire('touchstart', from.x, from.y, true);
    const steps = 6;
    for (let i = 1; i <= steps; i += 1) {
      fire('touchmove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, true);
    }
    fire('touchend', to.x, to.y, false);
  }, { from, to, selector });
  await page.waitForTimeout(400);
};

// ─── 1. 顶栏：左侧菜单入口 + （编辑章节时的）右侧大纲入口 ───
console.log('1. 移动端顶栏提供左右两个入口');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);

  const before = await drawerState(page);
  record(
    '顶栏有左侧菜单入口，且此时没有大纲入口（还没进编辑章节）',
    !before.hasOutlineToggle && !before.rightOpen,
    `  大纲入口=${before.hasOutlineToggle}；右抽屉开=${before.rightOpen}`,
  );

  await openChapter(page);
  const editing = await drawerState(page);
  record(
    '进入章节编辑后，顶栏出现大纲入口（右抽屉默认关闭）',
    editing.hasOutlineToggle && editing.hasRight && !editing.rightOpen,
    `  大纲入口=${editing.hasOutlineToggle}；右抽屉存在=${editing.hasRight}；开=${editing.rightOpen}`,
  );
  await ctx.close();
}

// ─── 2. 点大纲入口：右抽屉滑出并列出章节内的小标题 ───
console.log('\n2. 大纲抽屉内容来自当前章节');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(400);
  const opened = await drawerState(page);

  record(
    '点大纲入口后，右抽屉滑出',
    opened.rightOpen,
    `  右抽屉开=${opened.rightOpen}`,
  );
  record(
    '抽屉里列出章节的标题（含锚点 id）',
    opened.outlineItems.some((i) => i.id === 'ch-mid') && opened.outlineItems.some((i) => i.id === 'ch-top'),
    `  条目=${JSON.stringify(opened.outlineItems)}`,
  );
  record(
    '这些条目可点击（有 id，未被禁用）',
    opened.outlineItems.filter((i) => i.id).every((i) => !i.disabled),
    `  条目=${JSON.stringify(opened.outlineItems)}`,
  );
  await ctx.close();
}

// ─── 3. 右抽屉从中间一分为二：上大纲 / 下目录 ───
console.log('\n3. 右抽屉从中间分割：上半大纲、下半目录');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(400);

  const panes = await drawerPanes(page);
  record(
    '右抽屉里同时存在「大纲」和「目录」两个分区',
    panes.hasDrawer && panes.hasOutline && panes.hasToc,
    `  抽屉=${panes.hasDrawer}；大纲分区=${panes.hasOutline}；目录分区=${panes.hasToc}`,
  );
  record(
    '大纲在上、目录在下，两块上下相接（不重叠、不留空档）',
    panes.stacked === true,
    `  大纲 ${panes.outlineTop}~${panes.outlineBottom}px；目录 ${panes.tocTop}~${panes.tocBottom}px` +
    `；相接=${panes.stacked}`,
  );
  record(
    '两块各占抽屉一半高度（从中间分割）',
    panes.balanced === true,
    `  抽屉高=${panes.drawerHeight}px；大纲高=${panes.outlineHeight}px；目录高=${panes.tocHeight}px`,
  );

  const state = await drawerState(page);
  record(
    '下半的目录列出全书章节，且标出当前章',
    state.chapterRows.length === 3 &&
      state.chapterRows.filter((r) => r.active).length === 1 &&
      state.chapterRows.find((r) => r.active)?.text.includes('第一章'),
    `  章节行=${JSON.stringify(state.chapterRows)}`,
  );
  await ctx.close();
}

// ─── 4. 点下半的目录换章：切过去并收起抽屉 ───
console.log('\n4. 点右抽屉下半的目录可快捷切换章节');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  // 确认起点确实是第一章（否则「切过去了」这条断言没有意义）
  const before = await page.evaluate(() => (document.querySelector('.ProseMirror')?.textContent || '').slice(0, 30));

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(400);
  await page.click('[data-drawer-chapter="seed_mobile_ch2"]');
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => ({
    text: (document.querySelector('.ProseMirror')?.textContent || '').slice(0, 30),
    // 编辑器工具栏里的标题栏 / 正文首行会体现当前章
    activeRow: Array.from(document.querySelectorAll('[data-drawer-chapter]'))
      .filter((b) => b.getAttribute('data-active') === 'true')
      .map((b) => b.getAttribute('data-drawer-chapter')),
  }));
  const state = await drawerState(page);

  record(
    '点目录里的「第三章」后，编辑器换到该章正文',
    after.text.includes('第三章') && !after.text.includes('第一章'),
    `  切换前正文开头=${JSON.stringify(before)}；切换后=${JSON.stringify(after.text)}`,
  );
  record(
    '切换后目录里的高亮跟着移到新章节',
    after.activeRow.length === 1 && after.activeRow[0] === 'seed_mobile_ch2',
    `  高亮行=${JSON.stringify(after.activeRow)}`,
  );
  record(
    '换章后抽屉自动收起（不挡住刚切到的正文）',
    !state.rightOpen,
    `  右抽屉开=${state.rightOpen}`,
  );
  await ctx.close();
}

// ─── 5. 长书：打开抽屉时当前章自动滚进视野 ───
console.log('\n5. 章节很多时，打开抽屉就把当前章滚进视野');
{
  const { ctx, page } = await newPage();
  // 停在最后一章：它在列表里排第 30 行，不滚就落在下半可视区之外
  await seedLongBook(page, 29);
  await bootApp(page);
  await openChapter(page);
  await page.waitForTimeout(400);

  const current = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-drawer-chapter]'));
    const active = rows.find((b) => b.getAttribute('data-active') === 'true');
    return { total: rows.length, activeId: active ? active.getAttribute('data-drawer-chapter') : null };
  });
  record(
    '长书里当前章确实是最后一章（后面那条断言才有意义）',
    current.total === 30 && current.activeId === 'seed_long_ch29',
    `  章节行数=${current.total}；当前章=${current.activeId}`,
  );

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(500);

  const visibility = await page.evaluate(() => {
    const list = document.querySelector('[data-drawer-chapter-list="true"]');
    const active = Array.from(document.querySelectorAll('[data-drawer-chapter]'))
      .find((b) => b.getAttribute('data-active') === 'true');
    if (!list || !active) return { found: false };

    const l = list.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    return {
      found: true,
      // 当前章行的中线落在列表可视区内 → 真的滚到了它那里
      inView: a.top >= l.top - 1 && a.bottom <= l.bottom + 1,
      listTop: Math.round(l.top), listBottom: Math.round(l.bottom),
      rowTop: Math.round(a.top), rowBottom: Math.round(a.bottom),
      scrollTop: list.scrollTop,
    };
  });

  record(
    '打开抽屉后，当前章那一行落在下半列表的可视区内',
    visibility.found && visibility.inView,
    `  列表可视区 ${visibility.listTop}~${visibility.listBottom}px；当前章行 ${visibility.rowTop}~${visibility.rowBottom}px` +
    `；列表 scrollTop=${visibility.scrollTop}`,
  );
  await ctx.close();
}

// ─── 6. 点大纲条目：跳转过去，并收起抽屉 ───
console.log('\n6. 点大纲条目跳转到对应小节，并自动收起抽屉');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  const scrollBefore = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('overflow-y-auto') && d.querySelector('.ProseMirror'));
    return el ? el.scrollTop : -1;
  });

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(400);
  await page.click('[data-outline-item="ch-mid"]');
  await page.waitForTimeout(600);

  // 平滑滚动需要一点时间，等滚动条真的动起来
  let scrolled = false;
  try {
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('overflow-y-auto') && d.querySelector('.ProseMirror'));
      return !!el && el.scrollTop > 100;
    }, null, { timeout: 5000 });
    scrolled = true;
  } catch { /* 下面按实测值报告 */ }

  const after = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('overflow-y-auto') && d.querySelector('.ProseMirror'));
    return el ? el.scrollTop : -1;
  });
  const state = await drawerState(page);

  record(
    '点击后正文滚动到该小节位置（滚动条真的移动了）',
    scrolled && after > 100,
    `  点击前 scrollTop=${scrollBefore}；点击后 scrollTop=${after}`,
  );
  record(
    '跳转后抽屉自动收起（不再挡住定位到的正文）',
    !state.rightOpen,
    `  右抽屉开=${state.rightOpen}`,
  );
  await ctx.close();
}

// ─── 7. 两个抽屉互斥 ───
console.log('\n7. 左右抽屉互斥');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  // 先开导航，再开大纲：导航应自动收起
  // （抽屉本体只占左侧约 264px，顶栏右侧的大纲入口仍可点到）
  await page.click('button[title="打开导航"]');
  await page.waitForTimeout(350);
  const navOnly = await drawerState(page);
  record(
    '点顶栏左侧入口拉出导航抽屉',
    navOnly.leftOpen && !navOnly.rightOpen,
    `  左开=${navOnly.leftOpen}；右开=${navOnly.rightOpen}`,
  );

  await page.click('[data-outline-toggle="true"]');
  await page.waitForTimeout(350);
  const afterOutline = await drawerState(page);
  record(
    '导航开着时点大纲入口：导航自动收起（两个不同时铺屏）',
    afterOutline.rightOpen && !afterOutline.leftOpen,
    `  左开=${afterOutline.leftOpen}；右开=${afterOutline.rightOpen}`,
  );

  // 点遮罩关掉大纲，再用导航入口反向验证一次
  await page.click('[data-drawer-scrim="right"]', { force: true });
  await page.waitForTimeout(300);
  await page.click('button[title="打开导航"]');
  await page.waitForTimeout(350);
  const backToNav = await drawerState(page);
  record(
    '反之亦然：大纲开着时改用导航，大纲收起且导航展开',
    backToNav.leftOpen && !backToNav.rightOpen,
    `  左开=${backToNav.leftOpen}；右开=${backToNav.rightOpen}`,
  );
  await ctx.close();
}

// ─── 8. 边缘滑动手势 ───
console.log('\n8. 屏幕边缘滑动开关抽屉');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  // 左边缘向右滑 → 开左抽屉
  await swipe(page, { from: { x: 4, y: 400 }, to: { x: 200, y: 410 } });
  const leftOpened = await drawerState(page);
  record(
    '从左边缘右滑拉出左侧导航抽屉',
    leftOpened.leftOpen,
    `  左抽屉开=${leftOpened.leftOpen}`,
  );

  // 抽屉已开：在抽屉上向左滑 → 收起
  await swipe(page, { from: { x: 200, y: 400 }, to: { x: 20, y: 410 }, selector: '[data-drawer="left"]' });
  const leftClosed = await drawerState(page);
  record(
    '抽屉打开时，在抽屉上朝关闭方向滑可收起',
    !leftClosed.leftOpen,
    `  左抽屉开=${leftClosed.leftOpen}`,
  );

  // 右边缘向左滑 → 开右抽屉
  await swipe(page, { from: { x: PHONE.width - 4, y: 400 }, to: { x: PHONE.width - 200, y: 410 } });
  const rightOpened = await drawerState(page);
  record(
    '从右边缘左滑拉出章节大纲抽屉',
    rightOpened.rightOpen,
    `  右抽屉开=${rightOpened.rightOpen}`,
  );

  // 先收起大纲，回到「两个抽屉都关着」的干净状态
  await swipe(page, { from: { x: PHONE.width - 100, y: 400 }, to: { x: PHONE.width - 20, y: 410 }, selector: '[data-drawer="right"]' });
  const clean = await drawerState(page);
  record(
    '在右侧抽屉上向右滑可收起该抽屉',
    !clean.rightOpen,
    `  右抽屉开=${clean.rightOpen}`,
  );

  // 纵向为主的滑动（从左边缘起手但主要往下走）不该被当成拉抽屉
  await swipe(page, { from: { x: 4, y: 300 }, to: { x: 30, y: 700 } });
  const afterVertical = await drawerState(page);
  record(
    '纵向为主的滑动不展开任何抽屉（留给页面滚动）',
    !afterVertical.leftOpen && !afterVertical.rightOpen,
    `  左抽屉开=${afterVertical.leftOpen}；右抽屉开=${afterVertical.rightOpen}`,
  );

  // 从屏幕中间横向滑也不该展开（不是边缘起手）
  await swipe(page, { from: { x: 195, y: 400 }, to: { x: 60, y: 410 } });
  const afterMiddle = await drawerState(page);
  record(
    '从屏幕中间滑动不展开抽屉（只认边缘起手）',
    !afterMiddle.leftOpen && !afterMiddle.rightOpen,
    `  左抽屉开=${afterMiddle.leftOpen}；右抽屉开=${afterMiddle.rightOpen}`,
  );
  await ctx.close();
}

// ─── 9. 触摸设备：悬停才出现的操作必须常显 ───
console.log('\n9. 触摸设备上「悬停才出现」的操作改为常显');
{
  const realIndex = readFileSync(path.resolve('index.html'), 'utf8');
  record(
    'index.html 里有针对无悬停设备的 .hover-reveal 规则',
    /@media\s*\(hover:\s*none\)[\s\S]*?\.hover-reveal\s*\{[\s\S]*?opacity:\s*1/.test(realIndex),
    '  检查 @media (hover: none) { .hover-reveal { opacity: 1 } }',
  );

  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  // 回到目录列表（移动端「返回目录」），检查章节行的操作区
  await page.evaluate(() => {
    const back = document.querySelector('button[title="返回目录"]');
    if (back) back.click();
  });
  await page.waitForTimeout(400);

  const touchCap = await page.evaluate(() => window.matchMedia('(hover: none)').matches);
  const rowAction = await page.evaluate(() => {
    const row = document.querySelector('div[draggable="true"]');
    if (!row) return null;
    const bar = Array.from(row.querySelectorAll('div')).find((d) => d.className.includes('hover-reveal'));
    if (!bar) return { found: false };
    const style = getComputedStyle(bar);
    return { found: true, opacity: style.opacity, hasClass: bar.className.includes('hover-reveal') };
  });

  record(
    '运行环境确实是「无悬停」设备（hasTouch 下 hover: none）',
    touchCap === true,
    `  matchMedia('(hover: none)') = ${touchCap}`,
  );
  record(
    '目录行的操作区带 hover-reveal 标记',
    !!rowAction?.found && rowAction.hasClass,
    rowAction ? `  找到=${rowAction.found}；class 含 hover-reveal=${rowAction.hasClass}` : '  没找到章节行',
  );
  record(
    '在触摸设备上该操作区实际可见（opacity=1，不再等悬停）',
    !!rowAction?.found && Number(rowAction.opacity) === 1,
    rowAction ? `  opacity=${rowAction.opacity}` : '  没找到章节行',
  );
  await ctx.close();
}

// ─── 10. 左侧抽屉打开时不能被内容区（编辑器工具栏）压住 ───
console.log('\n10. 抽屉层级：开着时不被编辑器工具栏遮挡');
{
  const { ctx, page } = await newPage();
  await seedBook(page);
  await bootApp(page);
  await openChapter(page);

  // 先确认工具栏确实存在（否则这条断言没有意义）
  const hasToolbar = await page.evaluate(() => !!document.querySelector('[data-editor-toolbar="true"]'));
  record('编辑器工具栏带 data-editor-toolbar 钩子', hasToolbar, `  找到=${hasToolbar}`);

  // 打开左侧导航抽屉
  await page.click('button[title="打开导航"]');
  await page.waitForTimeout(400);

  const hit = await page.evaluate(() => {
    const drawer = document.querySelector('[data-drawer="left"]');
    const toolbar = document.querySelector('[data-editor-toolbar="true"]');
    if (!drawer || !toolbar) return { drawer: !!drawer, toolbar: !!toolbar };

    const dRect = drawer.getBoundingClientRect();
    const tRect = toolbar.getBoundingClientRect();
    // 取抽屉与工具栏的几何交集中心，问浏览器「这个点最上层是谁」
    const cx = (Math.max(dRect.left, tRect.left) + Math.min(dRect.right, tRect.right)) / 2;
    const cy = (Math.max(dRect.top, tRect.top) + Math.min(dRect.bottom, tRect.bottom)) / 2;
    const top = document.elementFromPoint(cx, cy);

    const dZ = getComputedStyle(drawer).zIndex;
    const tZ = getComputedStyle(toolbar).zIndex;
    const overlaps = dRect.left < tRect.right && tRect.left < dRect.right
      && dRect.top < tRect.bottom && tRect.top < dRect.bottom;

    return {
      drawer: true,
      toolbar: true,
      overlaps,
      cx: Math.round(cx),
      cy: Math.round(cy),
      topInDrawer: !!top && (drawer === top || drawer.contains(top)),
      topInToolbar: !!top && (toolbar === top || toolbar.contains(top)),
      topTag: top ? top.tagName : null,
      drawerZ: dZ,
      toolbarZ: tZ,
      drawerRight: Math.round(dRect.right),
      toolbarLeft: Math.round(tRect.left),
    };
  });

  record(
    '抽屉与工具栏在几何上确有重叠（否则这条用例测不到东西）',
    hit.overlaps === true,
    `  重叠=${hit.overlaps}；抽屉右边界=${hit.drawerRight}；工具栏左边界=${hit.toolbarLeft}`,
  );
  record(
    '重叠处最上层属于抽屉，而不是编辑器工具栏',
    hit.topInDrawer === true && hit.topInToolbar === false,
    `  (${hit.cx},${hit.cy}) 命中=${hit.topTag}；在抽屉内=${hit.topInDrawer}；在工具栏内=${hit.topInToolbar}` +
    `；抽屉 z=${hit.drawerZ}；工具栏 z=${hit.toolbarZ}`,
  );
  await ctx.close();
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length === 0) {
  console.log(`✅ 全部通过：${results.length}/${results.length}`);
  process.exit(0);
}
console.log(`❌ 失败 ${failed.length}/${results.length}：`);
for (const f of failed) console.log(`   - ${f.name}`);
process.exit(1);
