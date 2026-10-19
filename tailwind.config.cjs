/**
 * Tailwind 配置（构建期编译）
 *
 * 之前用的是 `cdn.tailwindcss.com`：样式在浏览器里现算，首次打开要多等一次
 * 外部请求，离线时还会整个掉样式 —— 而本应用要做成可离线使用的 PWA，
 * 外壳样式不能依赖网络。这里改为在构建时生成 CSS，随 assets 一起被 Service Worker 缓存。
 *
 * 内容必须与 index.html 里原来的 Play CDN 配置保持一致（深色用 class、中性灰阶、
 * spin-slow 动画），否则已发布界面的配色会变。
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  // 主题由 <html class="dark"> 控制，而不是跟随系统媒体查询：
  // 用户显式选择后必须能覆盖系统偏好。
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /*
          整个 gray 刻度替换成中性灰（R=G=B）。
          Tailwind 自带的 gray 其实是「冷灰」——灰阶越高蓝越明显，
          所以深色界面即使全是灰阶也仍然发蓝。这里按中性值重定义，
          顺便保留项目已用的 750 / 850 / 950 三档。
        */
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          750: '#333333',
          800: '#262626',
          850: '#1c1c1c',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
};
