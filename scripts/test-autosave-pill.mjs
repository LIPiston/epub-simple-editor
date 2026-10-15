/**
 * 真实浏览器回归测试：自动保存胶囊不遮挡编辑器底栏。
 *
 * 缺陷：胶囊固定在 `bottom-4`（16px），而编辑器底栏（EditorStatusBar）
 * 高 40px，两者在纵向重叠 —— 胶囊会盖住底栏右侧的「记忆位置」开关和
 * 字体控件，用户点不到。
 *
 * 期望：在编辑器视图（且已打开章节）下，胶囊的底边位于底栏顶边之上，
 *       两者不重叠；其他视图没有底栏，胶囊仍贴底即可。
 *
 * 判据用真实 getBoundingClientRect 测重叠，而不是断言某个 Tailwind 类名 ——
 * 类名只能证明「写了什么」，rect 才能证明「屏幕上的位置对不对」。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-pill');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import localforage from 'localforage';
import App from '../../App';

const CONTENT = Array.from({ length: 40 }, (_, i) =>
  '<p>第 ' + (i + 1) + ' 段正文内容，写长一些让编辑器产生滚动空间。</p>'
).join('');

window.__seed = async () => {
  await localforage.setItem('epub_maker_project_v1', {
    metadata: { title: 'T', creator: 'A', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
    chapters: [{ id: 'ch1', title: '第一章', content: CONTENT, level: 1, subItems: [] }],
    images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
    activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    coverGeneratorState: { selectedBgImageId: null, activeTemplateIndex: 0, showTextOnCover: true },
  });
};

window.__mount = () => {
  const host = document.getElementById('root');
  host.innerHTML = '';
  // 与真实入口 index.tsx 一致：包 StrictMode，避免只在非 StrictMode 下才成立的假象
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

// 手写一份够用的 Tailwind 子集：只保留决定几何的布局类。
// App/EditorStatusBar 用到的定位与尺寸类都在这里，保证测量的是真实布局。
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui; }
    *, *::before, *::after { box-sizing: border-box; }

    /* 布局 */
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; }
    .flex-col { flex-direction: column; }
    .h-full { height: 100%; } .h-screen { height: 100vh; } .h-10 { height: 2.5rem; }
    .h-14 { height: 3.5rem; } .h-9 { height: 2.25rem; }
    .min-w-0 { min-width: 0; } .w-full { width: 100%; }
    .relative { position: relative; } .absolute { position: absolute; }
    .hidden { display: none; }
    .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
    .items-center { align-items: center; } .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }

    /* 间距 */
    .bottom-4 { bottom: 1rem; } .bottom-14 { bottom: 3.5rem; }
    .right-4 { right: 1rem; } .left-0 { left: 0; }
    .top-0 { top: 0; } .inset-y-0 { top: 0; bottom: 0; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .p-2 { padding: 0.5rem; } .p-4 { padding: 1rem; } .p-6 { padding: 1.5rem; }
    .mr-2 { margin-right: 0.5rem; } .ml-1\\.5 { margin-left: 0.375rem; }
    .space-x-2 > * + * { margin-left: 0.5rem; } .space-x-3 > * + * { margin-left: 0.75rem; }
    .space-x-6 > * + * { margin-left: 1.5rem; }
    .gap-1 > * + * { margin-left: 0.25rem; }

    /* 字号/border/rounded（影响胶囊与底栏的盒子高度） */
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .font-medium { font-weight: 500; } .font-bold { font-weight: 700; }
    .rounded-full { border-radius: 9999px; } .rounded-lg { border-radius: 0.5rem; }
    .border { border-width: 1px; border-style: solid; } .border-t { border-top-width: 1px; border-top-style: solid; }
    .bg-white { background: #fff; }
    .text-gray-500 { color: #6b7280; } .text-gray-400 { color: #9ca3af; }

    /* 编辑器正文排版 */
    .ProseMirror { outline: none; }
    .ProseMirror p { margin: 0 0 12.8px; line-height: 1.8; font-size: 16px; }
  </style></head><body class="h-screen overflow-hidden">
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
await page.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

// ─── 播种项目并挂载 App，进入编辑器视图 ───
await page.evaluate(() => window.__seed());
await page.evaluate(() => window.__mount());
await page.waitForFunction(() => !document.body.innerText.includes('正在恢复上次的项目'), null, { timeout: 20000 });

// 切到「目录管理」（编辑器视图）。
// 两级导航下「目录管理」在「内容」分组里，需先展开该一级分组再点二级项。
await page.evaluate(() => {
  const item = document.querySelector('[data-nav-level="2"][data-nav-id="chapters"]');
  if (item) return item.click();
  const group = Array.from(document.querySelectorAll('[data-nav-level="1"]')).find((b) =>
    (b.getAttribute('data-nav-views') || '').split(',').includes('chapters'),
  );
  if (!group) throw new Error('找不到含「目录管理」的一级分组');
  group.click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const item = document.querySelector('[data-nav-level="2"][data-nav-id="chapters"]');
  if (!item) throw new Error('找不到二级菜单项 chapters');
  item.click();
});
await page.waitForFunction(() => document.querySelector('.ProseMirror'), null, { timeout: 20000 });
await page.waitForTimeout(800);

/**
 * 用文本内容定位两个元素：
 *   - 自动保存胶囊：唯一 title 以「自动保存」结尾的按钮
 *   - 编辑器底栏：包含「字数」文字的那一条
 * 不依赖 class 名，避免把「类名写对了」当成「位置对了」。
 */
const geo = await page.evaluate(() => {
  const pill = Array.from(document.querySelectorAll('button')).find((b) =>
    (b.getAttribute('title') || '').includes('自动保存'),
  );
  const statusBar = Array.from(document.querySelectorAll('div')).find(
    (d) => d.className.includes('border-t') && /字数/.test(d.textContent || '') && d.children.length >= 2,
  );
  const memoryBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    (b.getAttribute('title') || '').includes('记忆') || /记忆位置/.test(b.textContent || ''),
  );
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), h: +b.height.toFixed(1) };
  };
  return {
    pill: r(pill),
    statusBar: r(statusBar),
    memoryBtn: r(memoryBtn),
    viewportH: window.innerHeight,
  };
});

console.log('几何测量（视口高 ' + geo.viewportH + '）');
console.log('  自动保存胶囊:', JSON.stringify(geo.pill));
console.log('  编辑器底栏  :', JSON.stringify(geo.statusBar));
console.log('  记忆位置开关:', JSON.stringify(geo.memoryBtn));

record(
  '编辑器视图下能找到胶囊与底栏',
  !!(geo.pill && geo.statusBar),
  `  胶囊=${!!geo.pill} 底栏=${!!geo.statusBar}`,
);

// 核心判据：胶囊底边必须不低于底栏顶边
const overlap = geo.pill && geo.statusBar ? geo.pill.bottom - geo.statusBar.top : null;
record(
  '胶囊不遮挡编辑器底栏（底边在底栏顶边之上）',
  overlap !== null && overlap <= 0,
  overlap === null
    ? '  无法测量'
    : `  胶囊底边=${geo.pill.bottom} 底栏顶边=${geo.statusBar.top}；重叠量=${overlap.toFixed(1)}px（要求 ≤0）`,
);

// 胶囊不能跑出视口上方
record(
  '胶囊仍在视口内',
  !!geo.pill && geo.pill.top >= 0 && geo.pill.bottom <= geo.viewportH,
  geo.pill ? `  top=${geo.pill.top} bottom=${geo.pill.bottom} viewportH=${geo.viewportH}` : '  无胶囊',
);

// 底栏上的开关应真实可点（不被胶囊覆盖）：用 elementFromPoint 验证命中
const hit = await page.evaluate(() => {
  const memoryBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    (b.getAttribute('title') || '').includes('记忆') || /记忆位置/.test(b.textContent || ''),
  );
  if (!memoryBtn) return { found: false };
  const b = memoryBtn.getBoundingClientRect();
  const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    found: true,
    hitIsButtonOrChild: !!(el && (el === memoryBtn || memoryBtn.contains(el))),
    hitClass: el ? (el.className || el.tagName) : null,
  };
});
record(
  '底栏「记忆位置」开关可被点击命中（未被胶囊覆盖）',
  hit.found && hit.hitIsButtonOrChild,
  `  命中元素=${hit.found ? String(hit.hitClass).slice(0, 60) : '找不到开关'}`,
);

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
