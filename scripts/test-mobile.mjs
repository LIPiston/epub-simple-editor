/**
 * 真实浏览器回归测试：移动端适配（参考 Obsidian 手机端的三段式操作）。
 *
 * 需求约定（用户需求原文）：「参考 obsidian 的手机端操作逻辑制作移动端适配，
 * 左中右边结构」。
 *
 * Obsidian 手机端的行为，也就是这里要验证的：
 *   1. 顶栏左侧的按钮拉出「左抽屉」（在这是两级导航），顶栏右侧的按钮拉出
 *      「右抽屉」（在这是当前章节的大纲）；
 *   2. 两个抽屉互斥，同时只能有一个；
 *   3. 从屏幕左边缘右滑 → 开左抽屉；从右边缘左滑 → 开右抽屉；
 *      抽屉打开时，朝关闭方向滑 → 收起；
 *   4. 点大纲里的条目前往对应小节，并自动收起抽屉（否则挡住刚定位的正文）；
 *   5. 大纲只在该有的地方出现：不在编辑章节时，顶栏没有大纲入口；
 *   6. 触摸设备没有悬停，目录行的操作按钮必须常显，否则永远点不到。
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
 * 种子：一本书，正文够长，中段埋一个带 id 的小标题 —— 这样「跳到大纲条目」
 * 会让滚动条真的移动，而不是原地不动也能假装成功。
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
      chapters: [{ id: id + '_ch0', title: '第一章', content, level: 1, subItems: [] }],
      images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
      activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    index.books = [
      { id, title: '移动端样书', author: '作者', chapterCount: 1, imageCount: 0, sizeBytes: 2048, createdAt: now, updatedAt: now },
      ...index.books,
    ];
    if (!index.activeBookId) index.activeBookId = id;
    await lf.setItem('epub_simple_editor_library_index_v1', index);
  });

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

// ─── 3. 点大纲条目：跳转过去，并收起抽屉 ───
console.log('\n3. 点大纲条目跳转到对应小节，并自动收起抽屉');
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

// ─── 4. 两个抽屉互斥 ───
console.log('\n4. 左右抽屉互斥');
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

// ─── 5. 边缘滑动手势 ───
console.log('\n5. 屏幕边缘滑动开关抽屉');
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

// ─── 6. 触摸设备：悬停才出现的操作必须常显 ───
console.log('\n6. 触摸设备上「悬停才出现」的操作改为常显');
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
