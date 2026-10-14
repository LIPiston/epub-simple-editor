/**
 * 真实浏览器回归测试：「记住上次阅读位置」功能。
 *
 * 功能约定（用户需求原文）：「制作可选的记住上次阅读到的位置，方便长篇的修改」。
 *   - 开关是**可选**的，默认关闭；关闭时不写入、不恢复。
 *   - 开启后：切换章节 / 刷新页面回到该章上次的滚动位置与光标位置。
 *   - 刷新页面后还应打开上次编辑的那一章（而不是总是第一章）。
 *
 * 两个被测对象：
 *   A. TextEditor + useReadingMemory —— 章节内的滚动/光标恢复与保存。
 *   B. useProject —— 刷新后打开上次编辑的章节。
 *
 * 关键回归点（容易写错、且用户一定会遇到）：
 *   1. 编辑器滚动容器带 CSS `scroll-behavior: smooth`。恢复时若直接给
 *      scrollTop 赋值，会变成一段平滑动画：既停不到准确位置，动画期间还会
 *      持续派发 scroll 事件、被当成「用户自己滚动」，把恢复结果又写回去。
 *      这里显式注入 scroll-behavior:smooth 来复现该环境。
 *   2. 恢复光标不能夺走焦点（否则页面一打开就有个看不见的光标）。
 *   3. 关闭开关后必须清空记录，避免再次开启跳到陈旧位置。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

/**
 * 测试用书籍 id。位置按书籍隔离（v2 结构为 books[bookId].positions[chapterId]），
 * 因此断言里要带上 bookId。此处与 harness 内的常量必须一致。
 */
const TEST_BOOK_ID = 'book_test_1';

const tmp = path.resolve('scripts/.tmp-reading');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// ─── 1. 生成测试页面（复用真实组件） ───
const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import localforage from 'localforage';
import TextEditor from '../../components/text-editor/TextEditor';
import { useProject } from '../../hooks/useProject';

// 供测试脚本在页面上下文里直接播种 IndexedDB
window.__localforage = localforage;

const PARAGRAPHS = Array.from({ length: 60 }, (_, i) =>
  '<p>第 ' + (i + 1) + ' 段正文内容，刻意写长一些，让正文高度足以产生可滚动的空间，' +
  '从而验证滚动位置能否被准确保存与恢复。</p>'
).join('');

const project = (chapters) => ({
  metadata: {
    title: '位置测试', creator: '测试', language: 'zh', description: '',
    publisher: '', date: '2026-01-01', series: '', subjects: [],
  },
  chapters,
  images: [], extraFiles: [], cover: null, coverId: null,
  coverCustomCSS: '', activeStyleId: 'classic', isPresetStyleActive: true,
  customCSS: '', coverGeneratorState: {
    selectedBgImageId: null, activeTemplateIndex: 0, showTextOnCover: true, aiCoverPrompt: '',
  },
});

// ─── A. TextEditor 挂载/卸载探针 ───
let rootA = null;
let rootB = null;

/** 测试用书籍 id（位置按书籍隔离，见 utils/readingPosition.ts） */
const TEST_BOOK_ID = 'book_test_1';

window.__mountEditor = (chapterId, onUpdateProject) => {
  const host = document.getElementById('editorHost');
  host.innerHTML = '';
  const div = document.createElement('div');
  div.style.height = '100vh';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  host.appendChild(div);

  rootA = createRoot(div);
  // 必须包 StrictMode：真实入口 index.tsx 就是这么渲染的，而它会在挂载后
  // 立刻跑一遍 effect 的清理函数（模拟卸载）。阅读位置的「卸载收尾落盘」
  // 曾因此在首帧前把真实位置覆盖成 0（切章 / 刷新后总是从头开始），
  // 而不带 StrictMode 的测试环境复现不出来 —— 这里保持与生产一致。
  const App = () => (
    <React.StrictMode>
      <TextEditor
        chapterId={chapterId}
        bookId={TEST_BOOK_ID}
        content={PARAGRAPHS}
        onContentChange={() => {}}
        onSplitChapter={() => {}}
        project={project([{ id: chapterId, title: '测试章节', content: PARAGRAPHS, level: 1, subItems: [] }])}
        onUpdateProject={onUpdateProject || (() => {})}
        activeChapter={{ title: '测试章节' }}
      />
    </React.StrictMode>
  );
  rootA.render(<App />);
};

window.__unmountEditor = () => {
  if (rootA) { rootA.unmount(); rootA = null; }
};

// 暴露滚动容器 / 编辑器实例，供断言使用
window.__scrollEl = () => document.querySelector('#editorHost .overflow-y-auto');

// ─── B. useProject 探针（验证装载书籍时打开上次编辑的章节） ───
// 重构后 useProject 不再自己读存储：由上层（书库）读出书稿再调用 loadProject。
// 这里复刻这个流程，验证「选择哪一章」的逻辑。
const ProjectProbe = ({ chapters }) => {
  const { activeChapterId, isLoaded, loadProject } = useProject(TEST_BOOK_ID);
  React.useEffect(() => {
    // 装载一次即可，模拟书库读出数据后交给 useProject
    loadProject({
      metadata: { title: 'T', creator: 'A', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
      chapters,
      images: [], extraFiles: [], cover: null, activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    window.__probe = { activeChapterId, isLoaded };
  }, [activeChapterId, isLoaded]);
  return null;
};

window.__mountProjectProbe = (chapters) => {
  const host = document.getElementById('probeHost');
  host.innerHTML = '<div id="probeRoot"></div>';
  rootB = createRoot(document.getElementById('probeRoot'));
  rootB.render(<ProjectProbe chapters={chapters} />);
};

window.__unmountProjectProbe = () => {
  if (rootB) { rootB.unmount(); rootB = null; }
  document.getElementById('probeHost').innerHTML = '';
  window.__probe = null;
};
`;

const harnessPath = path.join(tmp, 'harness.tsx');
writeFileSync(harnessPath, HARNESS);

const jsPath = path.join(tmp, 'harness.js');
await build({
  entryPoints: [harnessPath],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: jsPath,
  logLevel: 'error',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

/**
 * 手写布局 CSS（生产环境用 Tailwind CDN，测试里不联网）。
 * 只保留决定几何的规则：纵向 flex + 有界高度的滚动容器 + 复现
 * scroll-behavior:smooth（这是本功能最容易踩的坑）。
 */
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; font-family: system-ui, sans-serif; height: 100%; overflow: hidden; }
    #probeHost { display: none; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .h-full { height: 100%; }
    .flex-1 { flex: 1 1 0%; min-height: 0; }
    .flex-none { flex: none; }
    .min-w-0 { min-width: 0; }
    .w-full { width: 100%; }
    .relative { position: relative; }
    .overflow-hidden { overflow: hidden; }
    .overflow-y-auto { overflow-y: auto; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    /* 复现真实应用的平滑滚动，用于验证恢复是否被动画干扰 */
    .scroll-smooth { scroll-behavior: smooth; }
    .min-h-screen { min-height: 100vh; }
    .editor-paper { outline: none; }
    .ProseMirror { outline: none; }
    .ProseMirror p { margin: 0 0 12.8px; line-height: 1.8; font-size: 16px; }
  </style></head><body>
    <div id="editorHost"></div>
    <div id="probeHost"></div>
    <script src="./harness.js"></script>
  </body></html>`
);

// ─── 2. 找一个可用的 Chromium ───
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
        .toString()
        .split('\n')
        .filter((d) => d.startsWith('chromium-'));
    } catch {
      continue;
    }
    for (const d of dirs) {
      for (const rel of [
        'chrome-win64/chrome.exe',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ]) {
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
await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
await page.waitForFunction(() => typeof window.__mountEditor === 'function', null, { timeout: 20000 });

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

/** 清空所有与位置记忆相关的存储 */
const resetStorage = () =>
  page.evaluate(() => {
    localStorage.clear();
  });

const setEnabled = (enabled) =>
  page.evaluate((v) => {
    localStorage.setItem('epub-maker-reading-position-enabled', String(v));
  }, enabled);

const mountEditor = (chapterId) =>
  page.evaluate((id) => window.__mountEditor(id), chapterId);

const unmountEditor = () => page.evaluate(() => window.__unmountEditor());

/** 等编辑器就绪且内容有可滚动空间 */
const waitEditorReady = async () => {
  await page.waitForFunction(
    () => {
      const el = window.__scrollEl();
      return el && el.scrollHeight > el.clientHeight + 200;
    },
    null,
    { timeout: 20000 },
  );
  // 给 useEditorContent 的初始化统计等留一点时间
  await page.waitForTimeout(300);
};

const readScroll = () => page.evaluate(() => window.__scrollEl().scrollTop);

/** 模拟用户滚动（触发真实 scroll 事件） */
const userScrollTo = async (top) => {
  await page.evaluate((t) => window.__scrollEl().scrollTo({ top: t, behavior: 'instant' }), top);
  await page.waitForTimeout(80);
};

const readReadingState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('epub-maker-reading-position') || 'null'));

// ─── 3. A. 开启后：滚动位置被记住并在重新挂载时恢复 ───
console.log('A. 章节内滚动位置的保存与恢复');
{
  await resetStorage();
  await setEnabled(true);
  await mountEditor('ch1');
  await waitEditorReady();

  await userScrollTo(1200);
  // 防抖 500ms，且 selectionUpdate 也会重置定时器，留足余量
  await page.waitForTimeout(1200);
  const saved = await readReadingState();
  const savedTop = saved?.books?.[TEST_BOOK_ID]?.positions?.ch1?.scrollTop ?? null;
  record(
    '开启后滚动，位置写入 localStorage',
    savedTop !== null && Math.abs(savedTop - 1200) < 2,
    `  记录 scrollTop=${savedTop}（期望 ≈1200）；lastChapterId=${saved?.books?.[TEST_BOOK_ID]?.lastChapterId}`,
  );

  await unmountEditor();
  await mountEditor('ch1');
  await waitEditorReady();
  await page.waitForTimeout(1200); // 等第二次校正跑完

  const restored = await readScroll();
  record(
    '重新挂载后恢复到上次滚动位置',
    Math.abs(restored - 1200) < 2,
    `  恢复 scrollTop=${restored}（期望 ≈1200，容差 2px）`,
  );

  // 直接盯住机制：挂载瞬间不能把记录覆盖掉。
  // StrictMode 会在挂载后立刻执行一次 effect 清理（模拟卸载），那一刻正文
  // 尚未排版，scrollHeight 是假值；若清理逻辑照着它写盘，记录就会变成
  // scrollTop=0，紧接着的恢复只能读回 0（即「切章/刷新后总是从头开始」）。
  const recAfterRemount = (await readReadingState())?.books?.[TEST_BOOK_ID]?.positions?.ch1;
  record(
    '重新挂载不会把记录覆盖成 0（StrictMode 挂载清理）',
    !!recAfterRemount && Math.abs(recAfterRemount.scrollTop - 1200) < 2,
    `  挂载后记录 scrollTop=${recAfterRemount?.scrollTop}（期望仍 ≈1200）`,
  );

  // 恢复光标不应抢焦点
  const focusInfo = await page.evaluate(() => {
    const pm = document.querySelector('#editorHost .ProseMirror');
    return {
      activeInsideEditor: !!(pm && pm.contains(document.activeElement)),
      activeTag: document.activeElement ? document.activeElement.tagName : null,
    };
  });
  record(
    '恢复位置时不抢占焦点（不出现看不见的光标）',
    focusInfo.activeInsideEditor === false,
    `  activeElement=${focusInfo.activeTag}`,
  );
}

// ─── 4. B. 关闭后：不保存、不恢复 ───
console.log('\nB. 关闭开关时不做任何记忆');
{
  await resetStorage();
  await setEnabled(false);
  await mountEditor('ch1');
  await waitEditorReady();

  await userScrollTo(1000);
  await page.waitForTimeout(1200);
  const saved = await readReadingState();
  record(
    '关闭时滚动不写入 localStorage',
    saved === null,
    `  存储内容=${JSON.stringify(saved)}`,
  );

  await unmountEditor();
  await mountEditor('ch1');
  await waitEditorReady();
  await page.waitForTimeout(1200);
  const restored = await readScroll();
  record('关闭时重新挂载不恢复位置', restored === 0, `  scrollTop=${restored}（期望 0）`);
}

// ─── 5. C. 关闭开关会清空已有记录 ───
console.log('\nC. 关闭开关清空已有记录');
{
  await resetStorage();
  await setEnabled(true);
  await mountEditor('ch1');
  await waitEditorReady();
  await userScrollTo(900);
  await page.waitForTimeout(1200);
  const before = await readReadingState();
  const hadPosition = !!before?.books?.[TEST_BOOK_ID]?.positions?.ch1;

  // 点击状态栏的开关按钮（真实 UI 交互）
  await page.click('#editorHost button[title^="已开启"]');
  await page.waitForTimeout(150);
  const after = await readReadingState();
  const enabledFlag = await page.evaluate(() =>
    localStorage.getItem('epub-maker-reading-position-enabled'),
  );

  record(
    '点击开关关闭后清空记录',
    hadPosition && after === null && enabledFlag === 'false',
    `  关闭前有记录=${hadPosition}；关闭后存储=${JSON.stringify(after)}；enabled=${enabledFlag}`,
  );
}

// ─── 6. D. 装载书籍时打开上次编辑的章节（useProject.loadProject） ───
console.log('\nD. 装载书籍时打开上次编辑的章节');

const makeChapters = (ids) =>
  ids.map((id, i) => ({ id, title: '第' + (i + 1) + '章', content: '<p>x</p>', level: 1, subItems: [] }));

/** 写入某本书「上次查看的章节」记录（v2 结构） */
const seedResume = (chapterId) =>
  page.evaluate(
    ([bid, cid]) => {
      localStorage.setItem(
        'epub-maker-reading-position',
        JSON.stringify({ version: 2, books: { [bid]: { lastChapterId: cid, positions: {} } } }),
      );
    },
    [TEST_BOOK_ID, chapterId],
  );

/** 挂载探针并等装载完成，返回当前激活章节 */
const runProjectProbe = async (chapterIds) => {
  await page.evaluate(() => window.__unmountProjectProbe());
  await page.evaluate((chapters) => window.__mountProjectProbe(chapters), makeChapters(chapterIds));
  await page.waitForFunction(() => window.__probe && window.__probe.isLoaded === true, null, { timeout: 20000 });
  return page.evaluate(() => window.__probe.activeChapterId);
};

{
  // 开启：应回到记录的章节
  await resetStorage();
  await setEnabled(true);
  await seedResume('c2');
  const active = await runProjectProbe(['c1', 'c2', 'c3']);
  record('开启时打开上次记录的章节（c2）', active === 'c2', `  activeChapterId=${active}`);
}

{
  // 关闭：应回到第一章
  await resetStorage();
  await setEnabled(false);
  await seedResume('c2');
  const active = await runProjectProbe(['c1', 'c2', 'c3']);
  record('关闭时仍打开第一章（c1）', active === 'c1', `  activeChapterId=${active}`);
}

{
  // 记录的章节已被删除：回退到第一章而不是报错
  await resetStorage();
  await setEnabled(true);
  await seedResume('deleted-chapter');
  const active = await runProjectProbe(['c1', 'c2']);
  record('记录的章节不存在时回退到第一章', active === 'c1', `  activeChapterId=${active}`);
}

// ─── 7. E. 防抖窗口内刷新也不丢位置（pagehide 兜底） ───
console.log('\nE. 滚动后立刻刷新（未等防抖到期）也不丢位置');
{
  await resetStorage();
  await setEnabled(true);
  await mountEditor('ch1');
  await waitEditorReady();

  // 滚动后**不等**防抖到期就刷新
  await page.evaluate(() => window.__scrollEl().scrollTo({ top: 1400, behavior: 'instant' }));
  await page.waitForTimeout(80);
  await page.reload();
  await page.waitForFunction(() => typeof window.__mountProjectProbe === 'function', null, { timeout: 20000 });

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('epub-maker-reading-position');
    return raw ? JSON.parse(raw) : null;
  });
  const savedTop = saved?.books?.[TEST_BOOK_ID]?.positions?.ch1?.scrollTop ?? null;
  record(
    'pagehide 兜底：防抖未到期也能落盘',
    savedTop !== null && Math.abs(savedTop - 1400) < 2,
    `  记录 scrollTop=${savedTop}（期望 ≈1400）`,
  );
}

// ─── 7. F. 聚焦不被旧光标带跑（以滚动位置为准） ───
console.log('\nF. 聚焦不把视口拽回旧光标，也不污染记录');
{
  await resetStorage();
  await setEnabled(true);
  await mountEditor('ch1');
  await waitEditorReady();

  // 1) 滚到底部，在底部落一个光标
  await page.evaluate(() => window.__scrollEl().scrollTo({ top: 999999, behavior: 'instant' }));
  await page.waitForTimeout(200);
  const bottomPoint = await page.evaluate(() => {
    const r = window.__scrollEl().getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height - 40 };
  });
  await page.mouse.click(bottomPoint.x, bottomPoint.y);
  await page.waitForTimeout(300);

  // 2) 再滚回顶部继续阅读 —— 光标与视口由此分离
  await userScrollTo(0);
  await page.waitForTimeout(1200);

  const savedRec = (await readReadingState())?.books?.[TEST_BOOK_ID]?.positions?.ch1;
  record(
    '记录中光标在底部、视口在顶部（两者分离）',
    !!savedRec && savedRec.scrollTop < 2 && savedRec.caretFrom > 500,
    `  scrollTop=${savedRec?.scrollTop} caretFrom=${savedRec?.caretFrom}`,
  );

  // 3) 重挂载，恢复阅读位置
  await unmountEditor();
  await mountEditor('ch1');
  await waitEditorReady();
  await page.waitForTimeout(1200);
  const restored = await readScroll();
  record(
    '恢复后停在阅读位置（顶部）',
    Math.abs(restored) < 2,
    `  scrollTop=${restored}（期望 ≈0）`,
  );

  // 4) 走真实路径：点工具栏「加粗」。其内部是 editor.chain().focus()，
  //    而 Tiptap 的 focus 默认 scrollIntoView:true，会把视口滚到当前选区 ——
  //    修复前这里会跳到旧光标处（文档底部）。
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#editorHost button')).find((b) =>
      (b.getAttribute('title') || '').startsWith('加粗'),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(900);
  const afterFocus = await readScroll();
  record(
    '点工具栏聚焦后视口不被旧光标拽走',
    clicked && Math.abs(afterFocus - restored) < 2,
    `  点击成功=${clicked}；聚焦后 scrollTop=${afterFocus}（期望仍 ≈${restored}）`,
  );

  // 5) 这次聚焦不能把「被带跑的位置」写回记录
  await page.waitForTimeout(1200);
  const afterRec = (await readReadingState())?.books?.[TEST_BOOK_ID]?.positions?.ch1;
  record(
    '聚焦没有把被带跑的位置写回记录',
    !!afterRec && afterRec.scrollTop < 2,
    `  记录 scrollTop=${afterRec?.scrollTop}（期望仍 ≈0）`,
  );
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });

// ─── 8. 汇总 ───
const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length === 0) {
  console.log(`✅ 全部通过：${results.length}/${results.length}`);
  process.exit(0);
}
console.log(`❌ 失败 ${failed.length}/${results.length}：`);
for (const f of failed) console.log(`   - ${f.name}`);
process.exit(1);
