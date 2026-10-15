/**
 * 真实浏览器回归测试：工具栏在窄屏下的可达性与分割线入口。
 *
 * 需求约定（用户需求原文）：「我的目的就是为了让窄屏用分割线」。
 *
 * 背景（修之前实测到的真实情况）：
 *   - 工具栏上的「分割线」按钮是 `hidden sm:block`，640px 以下根本不渲染；
 *   - 窄屏唯一的入口是「更多工具」菜单，但它放在可横向滚动的那一条里，
 *     而 320px 手机上工具栏内容比可视宽度多出 80px，按钮被推到屏幕右缘之外；
 *   - 即使点开，「更多工具」里的「分割线」只能插默认那一种，6 种样式拿不到。
 *
 * 要钉住的回归：
 *   1. 320px 下「更多工具」按钮在屏幕内，且真实可点（elementFromPoint 命中自己）；
 *   2. 打开后菜单里列出全部 6 种分割线样式；
 *   3. 点其中一种，编辑器里真的插入对应 class 的 <hr>（JS 行为，与样式无关）；
 *   4. 菜单不横向溢出视口（宽度从 w-48 加到 w-64 后需要夹紧）；
 *   5. 桌面端（≥640px）工具栏上的分割线按钮照旧存在，未被这次改动影响。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-toolbar');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// 真实的编辑器实例，这样「点分割线 → 正文里出现 <hr>」是端到端验证。
writeFileSync(path.join(tmp, 'harness.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from '../../components/text-editor/EditorToolbar';
import { CustomHorizontalRule } from '../../components/text-editor/extensions/CustomHorizontalRule';

const Harness = () => {
  const editor = useEditor({
    // 与 TextEditor.tsx 保持一致：关掉 StarterKit 自带的 horizontalRule，换成能带 class 的扩展。
    // 少了它，insertContent('<hr .../>') 不会被解析成节点，只能当转义文本塞进段落里。
    extensions: [StarterKit.configure({ heading: false, horizontalRule: false }), CustomHorizontalRule],
    content: '<p>正文</p>',
  });
  window.__editorHtml = () => (editor ? editor.getHTML() : '');
  if (!editor) return null;
  return (
    <EditorToolbar
      editor={editor}
      onSplit={() => {}}
      onOpenImagePicker={() => {}}
      showFindBar={false}
      onToggleFindBar={() => {}}
    />
  );
};
createRoot(document.getElementById('root')).render(<Harness />);
`);

await build({
  entryPoints: [path.join(tmp, 'harness.tsx')],
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome120',
  outfile: path.join(tmp, 'harness.js'), logLevel: 'error', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

/**
 * 手写够用的 Tailwind 子集（生产用 CDN，测试不联网）。
 * 只写决定本用例布局的规则：flex 布局、横向滚动容器、以及工具栏依赖的
 * sm/md/lg 断点与 w-64 / max-h-[70vh] / grid-cols-3。
 */
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; background: none; border: none; font: inherit; color: inherit; padding: 0; }
    .flex { display: flex; } .grid { display: grid; }
    .items-center { align-items: center; } .justify-between { justify-content: space-between; }
    .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; } .flex-shrink-0 { flex-shrink: 0; }
    .min-w-0 { min-width: 0; } .hidden { display: none; }
    .relative { position: relative; } .absolute { position: absolute; }
    .overflow-x-auto { overflow-x: auto; } .overflow-y-auto { overflow-y: auto; }
    .whitespace-nowrap { white-space: nowrap; }
    .z-50 { z-index: 50; } .z-\\[120\\] { z-index: 120; }
    .gap-1 { gap: 0.25rem; } .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .w-64 { width: 16rem; } .max-h-\\[70vh\\] { max-height: 70vh; }
    .min-h-12 { min-height: 3rem; }
    .border-b { border-bottom: 1px solid #e5e5e5; }
    .border-l { border-left: 1px solid #e5e5e5; }
    .rounded-md { border-radius: 0.375rem; } .rounded-lg { border-radius: 0.5rem; }
    .p-0\\.5 { padding: 2px; } .p-1\\.5 { padding: 0.375rem; } .p-3 { padding: 0.75rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
    .ProseMirror { outline: none; min-height: 200px; }
    /* 断点：sm=640 md=768 lg=1024，与项目一致 */
    @media (min-width: 640px) {
      .sm\\:hidden { display: none; }
      .sm\\:block { display: block; }
      .hidden.sm\\:block { display: block; }
    }
    @media (min-width: 768px) {
      .md\\:hidden { display: none; }
      .md\\:inline { display: inline; }
    }
    @media (min-width: 1024px) {
      .lg\\:inline { display: inline; }
      .lg\\:mr-1 { margin-right: 0.25rem; }
    }
  </style></head><body>
    <div id="root"></div>
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

/**
 * 开一个页面并等工具栏挂载。
 * 注意别拿「更多工具」当等待条件：它是 sm:hidden，桌面宽度下根本不显示，
 * waitForSelector 默认只认可见元素，会一直超时。工具栏上的「插入图片」
 * 没有断点隐藏，各个宽度都在，用它当挂载信号。
 */
const newPage = async (width, waitFor = 'button[title="插入图片"]') => {
  const ctx = await browser.newContext({ viewport: { width, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
  await page.waitForSelector(waitFor, { timeout: 20000 });
  await page.waitForTimeout(300);
  return { ctx, page };
};

/** 「更多工具」按钮是否在屏幕内且真实可点 */
const moreButtonState = (page) =>
  page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[title="更多工具"]'));
    const btn = btns.find((b) => b.getBoundingClientRect().width > 0);
    if (!btn) return { present: false };
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      present: true,
      left: Math.round(r.left),
      right: Math.round(r.right),
      innerW: window.innerWidth,
      onScreen: r.left >= 0 && r.right <= window.innerWidth,
      hitIsSelf: !!(hit && (hit === btn || btn.contains(hit))),
    };
  });

/** 菜单里的分割线选项 */
const menuState = (page) =>
  page.evaluate(() => {
    const menu = document.getElementById('editor-more-menu');
    if (!menu) return null;
    const r = menu.getBoundingClientRect();
    const opts = Array.from(menu.querySelectorAll('[data-divider-option]'));
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      innerW: window.innerWidth,
      overflowRight: Math.round(r.right - window.innerWidth),
      optionCount: opts.length,
      options: opts.map((o) => o.getAttribute('data-divider-option')),
    };
  });

// ─── 1. 320px：入口在屏幕内且可点 ───
console.log('1. 320px 窄屏：「更多工具」入口可达');
{
  const { ctx, page } = await newPage(320);
  const state = await moreButtonState(page);

  record(
    '320px 下「更多工具」按钮存在且完整落在屏幕内',
    state.present && state.onScreen,
    state.present
      ? `  按钮 x=${state.left}..${state.right}；视口宽=${state.innerW}`
      : '  找不到按钮',
  );
  record(
    '该按钮在 320px 下真实可点（elementFromPoint 命中它自己，没有被推出屏幕）',
    !!state.hitIsSelf,
    `  命中自身=${state.hitIsSelf}`,
  );
  await ctx.close();
}

// ─── 2. 菜单列出全部 6 种分割线样式 ───
console.log('\n2. 窄屏菜单里能选到全部 6 种分割线样式');
{
  const { ctx, page } = await newPage(320);
  await page.click('button[title="更多工具"]');
  await page.waitForTimeout(400);
  const menu = await menuState(page);

  record(
    '菜单里分割线选项有 6 个（默认 + 5 种样式）',
    !!menu && menu.optionCount === 6,
    menu ? `  选项数=${menu.optionCount}：${JSON.stringify(menu.options)}` : '  菜单没打开',
  );
  record(
    '6 种样式齐全（default 与 divider-1..5）',
    !!menu && ['default', 'divider-1', 'divider-2', 'divider-3', 'divider-4', 'divider-5']
      .every((k) => menu.options.includes(k)),
    menu ? `  选项=${JSON.stringify(menu.options)}` : '  菜单没打开',
  );
  await ctx.close();
}

// ─── 3. 点某个样式，正文里真的插入对应 <hr> ───
console.log('\n3. 点选样式后正文真的插入对应分割线');
{
  const { ctx, page } = await newPage(320);
  await page.click('button[title="更多工具"]');
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => window.__editorHtml());
  await page.click('[data-divider-option="divider-3"]');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__editorHtml());

  record(
    '点击后正文新增了分割线',
    !before.includes('<hr') && after.includes('<hr'),
    `  点击前含 <hr>=${before.includes('<hr')}；点击后含 <hr>=${after.includes('<hr')}`,
  );
  record(
    '插入的分割线带的是所选样式的 class（divider-3）',
    after.includes('divider-3'),
    `  正文 HTML=${after.slice(0, 160)}`,
  );
  record(
    '插入后菜单自动关闭',
    !(await page.$('#editor-more-menu')),
    `  菜单仍在=${!!(await page.$('#editor-more-menu'))}`,
  );
  await ctx.close();
}

// ─── 4. 菜单不横向溢出视口 ───
console.log('\n4. 菜单宽度加到 w-64 后仍不溢出视口');
{
  for (const width of [320, 360, 390]) {
    const { ctx, page } = await newPage(width);
    await page.click('button[title="更多工具"]');
    await page.waitForTimeout(400);
    const menu = await menuState(page);

    record(
      `${width}px 下菜单完整落在视口内（左右都不越界）`,
      !!menu && menu.left >= 0 && menu.overflowRight <= 0,
      menu ? `  菜单 x=${menu.left}..${menu.right}；视口宽=${menu.innerW}` : '  菜单没打开',
    );
    await ctx.close();
  }
}

// ─── 5. 桌面端行为不变：工具栏上的分割线按钮仍在 ───
console.log('\n5. 桌面端工具栏的分割线按钮照旧存在');
{
  const { ctx, page } = await newPage(900);
  const desktop = await page.evaluate(() => {
    const btn = document.querySelector('button[title="插入分割线"]');
    const more = Array.from(document.querySelectorAll('button[title="更多工具"]'))
      .find((b) => b.getBoundingClientRect().width > 0);
    return {
      dividerVisible: !!btn && btn.getBoundingClientRect().width > 0,
      moreVisible: !!more,
    };
  });

  record(
    '900px 下工具栏上仍有「插入分割线」按钮',
    desktop.dividerVisible,
    `  可见=${desktop.dividerVisible}`,
  );
  record(
    '900px 下不再显示「更多工具」按钮（sm 以上这些工具已平铺）',
    !desktop.moreVisible,
    `  可见=${desktop.moreVisible}`,
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
