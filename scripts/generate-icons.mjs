/**
 * 把 public/icons 下的 SVG 图标栅格化成 PWA 用的 PNG。
 *
 * 为什么要有这一步：manifest 里的 icons 与 iOS 的 apple-touch-icon
 * 都需要位图（SVG 在部分 Android / iOS 上不被接受），而仓库不想多存
 * 一份二进制源文件 —— SVG 是可读的真实来源，PNG 由本脚本生成。
 *
 * 用法：npm run icons
 * 依赖：playwright-core + 本机 Chromium/Chrome（与其它浏览器测试一致）。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const OUT_DIR = path.resolve('public/icons');
mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  // iOS 主屏图标：180×180，且系统会自己加圆角，所以用非 maskable 版本
  { src: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
];

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
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p));
};

const exe = findBrowser();
if (!exe) {
  console.error('未找到 Chromium/Chrome，无法生成 PNG 图标。');
  process.exit(1);
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const { src, out, size } of TARGETS) {
  const svgPath = path.join(OUT_DIR, src);
  await page.setViewportSize({ width: size, height: size });
  // 直接以 SVG 为文档加载、设成视口大小，再整屏截图：得到边缘无留白的方图
  await page.goto('file://' + svgPath.replace(/\\/g, '/'));
  await page.evaluate((s) => {
    // 直接打开 SVG 时文档根节点就是 <svg>，没有 <body>，只调整根元素即可
    const svg = document.documentElement;
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
    svg.style.cssText = 'display:block;width:100vw;height:100vh;background:transparent';
  }, size);
  await page.screenshot({ path: path.join(OUT_DIR, out), omitBackground: true });
  console.log(`✅ ${out} (${size}×${size})`);
}

await browser.close();
