/**
 * 真实浏览器回归测试：深/浅色主题开关 + 悬浮提示层。
 *
 * 需求约定（用户需求原文）：
 *   1. 「鼠标悬浮在图标上的浮动文字说明失效，纯黑框，需要修复」
 *      —— 原生 title 提示由系统绘制，深色模式下会变成看不清的黑框，
 *         因此改为自绘提示层，跟随主题配色。
 *   2. 「制作深色浅色切换的开关放到左下角（导出 的那块地方），然后可记录用户的选项。
 *      首次进入跟随系统，后续跟随用户选项，单击进行切换。」
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 *
 * 注意：本测试用手写的 Tailwind 子集（不联网），因此只验证「行为」——
 *       dark class 是否落到 <html>、是否写进 localStorage、提示层是否出现等；
 *       「深色下颜色是否真的变暗」属于视觉范畴，这里不做断言。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-theme');
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

const htmlPath = path.join(tmp, 'index.html');
// 手写的 Tailwind 子集负责布局；再叠加 index.html 里的自定义样式段，
// 这样 `html.dark .editor-paper` 这类规则测的就是生产里的同一份 CSS，不会各写一份而跑偏。
const realHtml = readFileSync(path.resolve('index.html'), 'utf8');
const realStyleBlock = (realHtml.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8">
  <script>
    (function () {
      try {
        var stored = localStorage.getItem('epub-simple-editor-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var isDark = stored === 'dark' || stored === 'light' ? stored === 'dark' : prefersDark;
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      } catch (e) {}
    })();
  </script>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; }
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; }
    .flex-col { flex-direction: column; } .hidden { display: none; }
    /* mt-auto 是活动栏把底部那簇（主题/导出/重置）压到左下角的关键，
       少了它活动栏就会把按钮顶到上方，测量结果失真。 */
    .mt-auto { margin-top: auto; } .gap-px { gap: 1px; } .pt-2 { padding-top: 0.5rem; }
    .h-full { height: 100%; } .h-screen { height: 100vh; }
    .h-9 { height: 2.25rem; } .w-9 { width: 2.25rem; }
    .w-full { width: 100%; } .min-w-0 { min-width: 0; }
    .w-12 { width: 3rem; } .w-56 { width: 14rem; }
    .h-10 { height: 2.5rem; } .h-7 { height: 1.75rem; }
    .relative { position: relative; } .absolute { position: absolute; }
    .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
    .items-center { align-items: center; } .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .border-r { border-right: 1px solid #e5e7eb; } .border-b { border-bottom: 1px solid #e5e7eb; }
    .ProseMirror { outline: none; min-height: 400px; }
    /* 第 6 组要量纸张底色：浅色纸张用的是 bg-white，这里补上以免量到透明 */
    .bg-white { background-color: #fff; }
    .bg-slate-50 { background-color: #f8fafc; }
  </style>
  ${realStyleBlock}
  </head><body class="h-screen overflow-hidden">
    <div id="root" class="h-full"></div>
    <script src="./harness.js"></script>
  </body></html>`
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

/** 每个用例用独立 context，可指定系统配色（colorScheme），并清空存储 */
const newPage = async (colorScheme) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme });
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

const readTheme = (page) =>
  page.evaluate(() => ({
    htmlDark: document.documentElement.classList.contains('dark'),
    colorScheme: document.documentElement.style.colorScheme,
    stored: localStorage.getItem('epub-simple-editor-theme'),
  }));

// ─── 1. 开关位置：在左下角（活动栏底部，与「导出」同一簇）───
console.log('1. 主题开关位于左下角、与导出同处活动栏底部');
{
  const { ctx, page } = await newPage('light');
  await bootApp(page);

  const layout = await page.evaluate(() => {
    const toggle = document.querySelector('[data-theme-toggle="true"]');
    const exportBtn = document.querySelector('button[title="导出 EPUB"]');
    const bar = document.querySelector('nav[aria-label="一级导航"]');
    if (!toggle || !exportBtn || !bar) return null;
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, left: b.left, bottom: b.bottom, cx: b.left + b.width / 2 }; };
    return { toggle: r(toggle), exportBtn: r(exportBtn), bar: r(bar), viewportH: window.innerHeight };
  });

  record(
    '活动栏底部存在主题开关（data-theme-toggle）',
    !!layout,
    layout ? `  开关 top=${layout.toggle.top} 活动栏底=${layout.bar.bottom} 视口高=${layout.viewportH}` : '  未找到开关',
  );
  record(
    '开关与「导出」在同一列（左下角那块地方）',
    !!layout && Math.abs(layout.toggle.cx - layout.exportBtn.cx) < 2,
    layout ? `  开关中心x=${layout.toggle.cx} 导出中心x=${layout.exportBtn.cx}` : '',
  );
  record(
    '开关位于活动栏下半部（不是顶部）',
    !!layout && layout.toggle.top > layout.viewportH / 2,
    layout ? `  开关 top=${layout.toggle.top}（视口中线=${layout.viewportH / 2}）` : '',
  );
  await ctx.close();
}

// ─── 2. 首次进入跟随系统 ───
console.log('\n2. 首次进入（无历史选择）跟随系统');
{
  const dark = await newPage('dark');
  await bootApp(dark.page);
  const darkState = await readTheme(dark.page);
  record(
    '系统深色 → 首次进入即为深色',
    darkState.htmlDark === true && darkState.stored === null,
    `  html.dark=${darkState.htmlDark} color-scheme=${darkState.colorScheme} 存储=${JSON.stringify(darkState.stored)}`,
  );
  await dark.ctx.close();

  const light = await newPage('light');
  await bootApp(light.page);
  const lightState = await readTheme(light.page);
  record(
    '系统浅色 → 首次进入保持浅色',
    lightState.htmlDark === false && lightState.stored === null,
    `  html.dark=${lightState.htmlDark} color-scheme=${lightState.colorScheme} 存储=${JSON.stringify(lightState.stored)}`,
  );
  const lightToggle = await light.page.evaluate(() => {
    const button = document.querySelector('[data-theme-toggle="true"]');
    const icon = button?.querySelector('svg');
    return { title: button?.getAttribute('title'), aria: button?.getAttribute('aria-label'), iconClass: icon?.getAttribute('class') || '' };
  });
  record(
    '浅色状态按钮显示当前主题（太阳图标）',
    lightToggle.title === '当前浅色主题，点击切换到深色主题'
      && lightToggle.aria === '当前浅色主题，点击切换到深色主题'
      && /lucide-sun/.test(lightToggle.iconClass),
    `  title=${JSON.stringify(lightToggle.title)} aria=${JSON.stringify(lightToggle.aria)} icon=${lightToggle.iconClass}`,
  );
  await light.ctx.close();
}

// ─── 3. 单击切换 + 记录选择 ───
console.log('\n3. 单击切换，且选择被记录');
{
  const { ctx, page } = await newPage('light');
  await bootApp(page);

  const before = await readTheme(page);
  await page.click('[data-theme-toggle="true"]');
  await page.waitForTimeout(400);
  const darkAfterToggle = await page.evaluate(() => {
    const button = document.querySelector('[data-theme-toggle="true"]');
    const icon = button?.querySelector('svg');
    return { title: button?.getAttribute('title'), aria: button?.getAttribute('aria-label'), iconClass: icon?.getAttribute('class') || '' };
  });
  record(
    '深色状态按钮显示当前主题（月亮图标）',
    (darkAfterToggle.title === null || darkAfterToggle.title === '当前深色主题，点击切换到浅色主题')
      && darkAfterToggle.aria === '当前深色主题，点击切换到浅色主题'
      && /lucide-moon/.test(darkAfterToggle.iconClass),
    `  title=${JSON.stringify(darkAfterToggle.title)} aria=${JSON.stringify(darkAfterToggle.aria)} icon=${darkAfterToggle.iconClass}`,
  );
  const afterFirst = await readTheme(page);
  record(
    '单击一次：浅色 → 深色',
    before.htmlDark === false && afterFirst.htmlDark === true,
    `  切换前=${before.htmlDark}；切换后=${afterFirst.htmlDark}`,
  );
  record(
    '选择写进 localStorage',
    afterFirst.stored === 'dark',
    `  epub-simple-editor-theme=${JSON.stringify(afterFirst.stored)}`,
  );
  record(
    '同步了 color-scheme（原生控件/提示跟随主题）',
    afterFirst.colorScheme === 'dark',
    `  color-scheme=${afterFirst.colorScheme}`,
  );

  await page.click('[data-theme-toggle="true"]');
  await page.waitForTimeout(400);
  const afterSecond = await readTheme(page);
  record(
    '再单击一次：深色 → 浅色',
    afterSecond.htmlDark === false && afterSecond.stored === 'light',
    `  切换后 html.dark=${afterSecond.htmlDark} 存储=${JSON.stringify(afterSecond.stored)}`,
  );
  await ctx.close();
}

// ─── 4. 用户选择优先于系统（刷新后仍跟随用户）───
console.log('\n4. 用户选过之后不再被系统覆盖（刷新后仍生效）');
{
  const { ctx, page } = await newPage('light');
  await bootApp(page);
  record('起点：系统浅色、尚未选择', (await readTheme(page)).stored === null, '');

  // 用户主动切到深色
  await page.click('[data-theme-toggle="true"]');
  await page.waitForTimeout(400);

  // 重新挂载（相当于刷新）——系统仍是浅色，但用户选的是深色
  await bootApp(page);
  const afterReload = await readTheme(page);
  record(
    '刷新后仍是用户选的深色（系统浅色不再覆盖）',
    afterReload.htmlDark === true && afterReload.stored === 'dark',
    `  重载后 html.dark=${afterReload.htmlDark} 存储=${JSON.stringify(afterReload.stored)}`,
  );
  await ctx.close();
}

// ─── 5. 悬浮提示：自绘层替代系统黑框 ───
console.log('\n5. 悬浮提示改为自绘层（修复系统黑框）');
{
  const { ctx, page } = await newPage('light');
  await bootApp(page);

  const target = await page.$('button[title="导出 EPUB"]');
  record('测试目标（带 title 的图标按钮）存在', !!target, '  title="导出 EPUB"');
  if (target) {
    await target.hover();
    await page.waitForTimeout(800);

    const shown = await page.evaluate(() => {
      const tip = document.querySelector('[role="tooltip"]');
      return {
        present: !!tip,
        text: tip ? tip.textContent.trim() : null,
        // 悬浮期间原生 title 应被临时收起，避免系统黑框同时出现
        nativeTitleCount: document.querySelectorAll('[title="导出 EPUB"]').length,
        stashedCount: document.querySelectorAll('[data-tooltip-stash]').length,
      };
    });
    record(
      '悬浮后出现自绘提示层，文案取自 title',
      shown.present && shown.text === '导出 EPUB',
      `  提示层=${shown.present} 文案=${JSON.stringify(shown.text)}`,
    );
    record(
      '悬浮期间原生 title 被临时收起（不会再叠一个系统黑框）',
      shown.nativeTitleCount === 0 && shown.stashedCount === 1,
      `  title 元素数=${shown.nativeTitleCount}（期望 0）暂存数=${shown.stashedCount}（期望 1）`,
    );

    // 移开后还原
    await page.mouse.move(700, 400);
    await page.waitForTimeout(800);
    const restored = await page.evaluate(() => ({
      tipGone: !document.querySelector('[role="tooltip"]'),
      titleBack: document.querySelectorAll('[title="导出 EPUB"]').length,
    }));
    record(
      '移开后提示消失、title 原样还原（无障碍与既有选择器不受影响）',
      restored.tipGone && restored.titleBack === 1,
      `  提示已消失=${restored.tipGone} title 还原数=${restored.titleBack}（期望 1）`,
    );

    // 延迟未到就移开：不应冒出「迟到」的提示
    await target.hover();
    await page.waitForTimeout(80);
    await page.mouse.move(700, 400);
    await page.waitForTimeout(800);
    const late = await page.evaluate(() => ({
      tipPresent: !!document.querySelector('[role="tooltip"]'),
      stashed: document.querySelectorAll('[data-tooltip-stash]').length,
    }));
    record(
      '延迟未到就移开，不会冒出「迟到」的提示',
      !late.tipPresent && late.stashed === 0,
      `  提示存在=${late.tipPresent} 暂存数=${late.stashed}（均期望 0/false）`,
    );
  }
  await ctx.close();
}

// ─── 6. 深色下书写纸张必须可读 ───
// 背景：书稿自身的主题 CSS 会以 `.editor-paper { … }` 设置纸张底色，
// 深色模式下若不覆盖，就会出现「深色外壳 + 刺眼白纸」或「深底配深字」。
// 这类问题纯逻辑测试抓不到，必须量实际计算出的颜色。
console.log('\n6. 深色模式下编辑器纸张与正文对比度');
{
  const luminance = (rgb) => {
    const m = (rgb || '').match(/\d+/g) || [255, 255, 255];
    return 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2];
  };

  const openEditor = async (page) => {
    // 播种一本带章节的书（空白书没有章节，编辑器不会出现）
    await page.evaluate(async () => {
      const lf = window.__localforage;
      const id = 'seed_paper';
      const now = Date.now();
      await lf.setItem('epub_simple_editor_book_' + id, {
        metadata: { title: '纸张测试书', creator: '作者', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
        chapters: [{ id: id + '_c1', title: '第一章', level: 1, subItems: [], content: '<h1>第一章</h1><h2>第一节</h2><p>正文内容，用来测量纸张与文字的对比度。</p>' }],
        images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
        // 用 minimal：它给 h1 写死了纯黑（#000），而 h2 不写 color、继承纸张文字色。
        // 深色下若不把标题颜色拉回来，就会出现「一级标题黑、二级标题白」的割裂，
        // 正是这条断言要钉住的回归。
        activeStyleId: 'minimal', isPresetStyleActive: true, customCSS: '',
      });
      await lf.setItem('epub_simple_editor_library_index_v1', {
        books: [{ id, title: '纸张测试书', author: '作者', chapterCount: 1, imageCount: 0, sizeBytes: 1024, createdAt: now, updatedAt: now }],
        activeBookId: id,
      });
    });
    await bootApp(page);
    // 进入「内容 / 目录管理」，再点开那一章
    await page.click('[data-nav-level="1"][data-nav-views*="chapters"]');
    await page.waitForSelector('[data-nav-level="2"][data-nav-id="chapters"]', { timeout: 8000 });
    await page.click('[data-nav-level="2"][data-nav-id="chapters"]');
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('*')).find(
        (e) => e.children.length === 0 && e.textContent.trim() === '第一章',
      );
      if (row) row.closest('div[draggable], div').click();
    });
    await page.waitForSelector('.editor-paper', { timeout: 20000 });
    await page.waitForTimeout(1200);
    return page.evaluate(() => {
      // 纸张底色可能画在 .editor-paper 自身上（深色下由 html.dark 规则设定），
      // 也可能来自外层带 bg-white 的纸张容器（浅色下）。向上找到第一个不透明的背景，
      // 才是用户实际看到的那层底色。
      let el = document.querySelector('.editor-paper');
      const paper = el;
      let bg = null;
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
        el = el.parentElement;
      }
      const colorOf = (sel) => {
        const node = paper.querySelector(sel);
        return node ? getComputedStyle(node).color : null;
      };
      return { bg, color: getComputedStyle(paper).color, h1: colorOf('h1'), h2: colorOf('h2') };
    });
  };

  const dark = await newPage('dark');
  try {
    const paper = await openEditor(dark.page);
    const bgLum = luminance(paper.bg);
    const textLum = luminance(paper.color);
    record(
      '深色下纸张底色变暗（不是刺眼白纸）',
      bgLum < 80,
      `  纸张背景=${paper.bg} 亮度=${bgLum.toFixed(0)}（要求 <80）`,
    );
    record(
      '深色下正文颜色够亮（深底上读得清）',
      textLum > 150,
      `  正文颜色=${paper.color} 亮度=${textLum.toFixed(0)}（要求 >150）`,
    );
    // 标题必须与正文同色：主题照白纸写死的一级标题色（minimal 是纯黑）
    // 在深色纸张上会读不清，而二级标题继承纸张色显示为白，形成割裂。
    record(
      '深色下一级标题颜色够亮（不再照主题写死的深色）',
      luminance(paper.h1) > 150,
      `  一级标题颜色=${paper.h1} 亮度=${luminance(paper.h1).toFixed(0)}（要求 >150）`,
    );
    record(
      '深色下一级与二级标题同色',
      paper.h1 === paper.h2,
      `  一级=${paper.h1} 二级=${paper.h2}`,
    );
  } catch (e) {
    record('深色下纸张可读性可测量', false, `  ${e.message.split('\n')[0]}`);
  }
  await dark.ctx.close();

  // 反向确认：浅色下纸张仍应是浅的，说明不是「一律强制深色」
  const light = await newPage('light');
  try {
    const paper = await openEditor(light.page);
    const bgLum = luminance(paper.bg);
    record(
      '浅色下纸张仍是浅色（未把深色写死）',
      bgLum > 200,
      `  纸张背景=${paper.bg} 亮度=${bgLum.toFixed(0)}（要求 >200）`,
    );
  } catch (e) {
    record('浅色下纸张底色可测量', false, `  ${e.message.split('\n')[0]}`);
  }
  await light.ctx.close();
}

// ─── 7. 应用界面装饰色约束：只允许灰阶、橙色、红色 ───
console.log('\n7. 应用界面装饰色只保留灰阶、橙色和红色');
{
  const sourceRoots = ['components', 'App.tsx', 'hooks'];
  const forbidden = /(?:blue|indigo|violet|purple|sky|cyan|teal|fuchsia|pink|green|emerald|yellow|amber)/;
  const { readdirSync, statSync, readFileSync } = await import('node:fs');
  const { join, extname } = await import('node:path');
  const files = [];
  const walk = (entry) => {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      for (const child of readdirSync(entry)) walk(join(entry, child));
    } else if (['.tsx', '.ts'].includes(extname(entry))) files.push(entry);
  };
  sourceRoots.forEach(walk);
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (forbidden.test(line)) hits.push(`${file}:${index + 1}`);
    });
  }
  record(
    '组件与应用源码不再使用蓝紫青绿等装饰色',
    hits.length === 0,
    hits.length ? `  残留 ${hits.length} 行：\n${hits.slice(0, 20).join('\n')}` : '  仅保留灰阶、橙色、红色',
  );
}

// ─── 8. 深色配色不得偏蓝 ───
// 背景：Tailwind 默认的 gray 是「冷灰」，gray-900 是 #111827、gray-800 是 #1f2937，
// 蓝通道明显高于红通道，所以把彩色换成 gray 之后深色界面依然发蓝。
// blue 系（含 slate 冷灰、以及写死的偏蓝十六进制）必须彻底清掉，
// 灰阶一律用中性灰 R≈G≈B。
console.log('\n8. 深色配色为中性灰（不带蓝）');
{
  const { readFileSync } = await import('node:fs');
  const NEUTRAL_TOLERANCE = 6; // 允许的通道差（中性灰应为 0）

  const hexToRgb = (hex) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const blueShift = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    return Math.max(Math.abs(b - r), Math.abs(g - r));
  };

  // (a) index.html 里的十六进制色：调色板、深色纸张、滚动条、网格背景都要中性
  const html = readFileSync('index.html', 'utf8');
  const htmlHexes = [...new Set((html.match(/#[0-9a-fA-F]{3,8}\b/g) || []))]
    // 书稿示例/注释里引用的白色与说明性色值不算界面配色
    .filter((hex) => hexToRgb(hex).length === 3);
  const blueHexes = htmlHexes.filter((hex) => blueShift(hex) > NEUTRAL_TOLERANCE);
  record(
    'index.html 的配色（调色板 / 纸张 / 滚动条）均为中性灰',
    blueHexes.length === 0,
    blueHexes.length
      ? `  偏蓝 ${blueHexes.length} 处：\n${blueHexes.map((h) => `    ${h}`).join('\n')}`
      : `  检查 ${htmlHexes.length} 个色值，均为中性灰`,
  );

  // (b) 组件层：slate 本身就是蓝灰，必须换成中性灰
  const sourceRoots = ['components', 'App.tsx', 'hooks'];
  const { readdirSync, statSync } = await import('node:fs');
  const { join, extname } = await import('node:path');
  const files = [];
  const walk = (entry) => {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      for (const child of readdirSync(entry)) walk(join(entry, child));
    } else if (['.tsx', '.ts'].includes(extname(entry))) files.push(entry);
  };
  sourceRoots.forEach(walk);

  const slateHits = [];
  const arbitraryHits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\bslate-\d{2,3}\b/.test(line)) slateHits.push(`${file}:${index + 1}`);
      for (const m of line.matchAll(/\[#[0-9a-fA-F]{3,8}\]/g)) {
        const hex = m[0].slice(1, -1);
        if (hex.length !== 4 && hex.length !== 7) continue;
        if (blueShift(hex) > NEUTRAL_TOLERANCE) arbitraryHits.push(`${file}:${index + 1} ${m[0]}`);
      }
    });
  }
  record(
    '组件不再使用 slate 冷灰',
    slateHits.length === 0,
    slateHits.length ? `  残留 ${slateHits.length} 行：\n${slateHits.slice(0, 10).join('\n')}` : '  已统一为中性灰',
  );
  record(
    '组件内写死的任意色值不带蓝',
    arbitraryHits.length === 0,
    arbitraryHits.length
      ? `  偏蓝 ${arbitraryHits.length} 处：\n${arbitraryHits.slice(0, 10).join('\n')}`
      : '  未发现偏蓝的任意色值',
  );
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
